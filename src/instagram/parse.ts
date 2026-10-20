/**
 * Instagram webhook payload parsing
 */

export interface InstagramInbound {
  igsid: string;
  accountId: string;
  mid: string;
  timestamp: number | null;
  text: string | null;
  attachmentType: string | null;
}

function processItem(
  item: unknown,
  entryId: unknown,
  ownAccountId: string | undefined,
  events: InstagramInbound[],
  ignoredRef: { count: number }
): void {
  if (typeof item !== "object" || item === null) {
    return;
  }

  const sender = (item as { sender?: unknown }).sender;
  const recipient = (item as { recipient?: unknown }).recipient;

  if (
    typeof sender !== "object" ||
    sender === null ||
    typeof recipient !== "object" ||
    recipient === null
  ) {
    ignoredRef.count++;
    return;
  }

  const senderId = (sender as { id?: unknown }).id;
  const recipientId = (recipient as { id?: unknown }).id;

  if (typeof senderId !== "string" || senderId === "" || typeof recipientId !== "string" || recipientId === "") {
    ignoredRef.count++;
    return;
  }

  const message = (item as { message?: unknown }).message;

  if (typeof message !== "object" || message === null) {
    ignoredRef.count++;
    return;
  }

  const mid = (message as { mid?: unknown }).mid;
  if (typeof mid !== "string" || mid === "") {
    ignoredRef.count++;
    return;
  }

  const isEcho = (message as { is_echo?: unknown }).is_echo === true ||
    senderId === ownAccountId ||
    senderId === entryId;

  if (isEcho) {
    ignoredRef.count++;
    return;
  }

  const rawText = (message as { text?: unknown }).text;
  const text = typeof rawText === "string" && rawText.trim() !== "" ? rawText.trim() : null;

  const attachments = (message as { attachments?: unknown }).attachments;
  let attachmentType: string | null = null;

  if (Array.isArray(attachments) && attachments.length > 0) {
    const first = attachments[0];
    if (typeof first === "object" && first !== null) {
      const type = (first as { type?: unknown }).type;
      if (typeof type === "string") {
        attachmentType = type;
      }
    }
  }

  const isUnsupported = (message as { is_unsupported?: unknown }).is_unsupported === true;
  if (isUnsupported && attachmentType === null) {
    attachmentType = "unsupported";
  }

  if (text === null && attachmentType === null) {
    ignoredRef.count++;
    return;
  }

  const rawTimestamp = (item as { timestamp?: unknown }).timestamp;
  let timestamp: number | null = null;

  if (typeof rawTimestamp === "number" && isFinite(rawTimestamp)) {
    timestamp = rawTimestamp;
  } else if (typeof rawTimestamp === "string" && rawTimestamp !== "") {
    const parsed = Number(rawTimestamp);
    if (isFinite(parsed)) {
      timestamp = parsed;
    }
  }

  events.push({
    igsid: senderId,
    accountId: recipientId,
    mid,
    timestamp,
    text,
    attachmentType,
  });
}

export function parseInstagramPayload(
  body: unknown,
  ownAccountId: string | undefined
): { events: InstagramInbound[]; ignored: number } {
  if (typeof body !== "object" || body === null || !("object" in body) || body.object !== "instagram") {
    return { events: [], ignored: 0 };
  }

  const events: InstagramInbound[] = [];
  const ignoredRef = { count: 0 };

  const entry = (body as { entry?: unknown }).entry;
  if (!Array.isArray(entry)) {
    return { events: [], ignored: 0 };
  }

  for (const item of entry) {
    if (typeof item !== "object" || item === null) {
      continue;
    }

    const entryId = (item as { id?: unknown }).id;
    const messaging = (item as { messaging?: unknown }).messaging;

    if (Array.isArray(messaging)) {
      for (const msg of messaging) {
        processItem(msg, entryId, ownAccountId, events, ignoredRef);
      }
    }

    const changes = (item as { changes?: unknown }).changes;

    if (Array.isArray(changes)) {
      for (const change of changes) {
        if (typeof change !== "object" || change === null) {
          continue;
        }

        const field = (change as { field?: unknown }).field;

        if (field !== "messages") {
          ignoredRef.count++;
          continue;
        }

        const value = (change as { value?: unknown }).value;

        if (typeof value !== "object" || value === null) {
          ignoredRef.count++;
          continue;
        }

        processItem(value, entryId, ownAccountId, events, ignoredRef);
      }
    }
  }

  return { events, ignored: ignoredRef.count };
}
