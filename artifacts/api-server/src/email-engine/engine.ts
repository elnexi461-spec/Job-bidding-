import type { EmailProvider, EmailEventRecord } from "./types";
import { detectEmailEvent } from "./detection";
import { matchEmailToApplication } from "./matching";
import {
  type EmailEngineStore,
  messageRecordFromEmail,
} from "./store";

export interface IngestEmailsResult {
  fetched: number;
  newMessages: number;
  ignored: number;
  detected: number;
  matched: number;
  unmatched: number;
  duplicates: number;
  events: EmailEventRecord[];
}

export class EmailEngine {
  constructor(
    private readonly provider: EmailProvider,
    private readonly store: EmailEngineStore,
    private readonly accessToken: string,
  ) {}

  async ingest(input: {
    query?: string;
    limit?: number;
  } = {}): Promise<IngestEmailsResult> {
    const summaries = await this.provider.listMessages(this.accessToken, {
      query: input.query ?? "newer_than:30d -from:me",
      limit: input.limit ?? 50,
    });
    const result: IngestEmailsResult = {
      fetched: summaries.length,
      newMessages: 0,
      ignored: 0,
      detected: 0,
      matched: 0,
      unmatched: 0,
      duplicates: 0,
      events: [],
    };

    for (const summary of summaries) {
      const email = await this.provider.getMessage(
        this.accessToken,
        summary.providerMessageId,
      );
      const inserted = await this.store.insertMessage(
        messageRecordFromEmail(this.provider.id, email),
      );
      if (!inserted) {
        result.duplicates++;
        continue;
      }
      result.newMessages++;

      const detected = detectEmailEvent(email);
      if (!detected) {
        result.ignored++;
        continue;
      }
      result.detected++;
      const match = matchEmailToApplication(
        email,
        await this.store.listApplications(),
      );
      if (match.applicationId === null) result.unmatched++;
      else result.matched++;

      const eventResult = await this.store.insertEvent({
        providerMessageId: email.providerMessageId,
        applicationId: match.applicationId,
        eventType: detected.type,
        status: detected.status,
        matchingReasons: detected.reasons.concat(match.reasons),
        receivedAt: email.receivedAt,
      });
      if (!eventResult.duplicate) result.events.push(eventResult.event);
    }
    return result;
  }
}