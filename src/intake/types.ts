/**
 * Common types for inquiry intake
 */

export interface InquiryEvent {
  source: string;
  externalRef: string;
  receivedAt: Date;
  contactName: string | null;
  phoneRaw: string | null;
  email: string | null;
  text: string;
  rawPayload: string;
  queryType: string | null;
}
