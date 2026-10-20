/**
 * Instagram webhook payload sample generator
 */

export function buildInstagramSample(opts?: {
  igsid?: string;
  accountId?: string;
  mid?: string;
  text?: string | null;
  attachmentType?: string | null;
  echo?: boolean;
  now?: Date;
}): Record<string, unknown> {
  const igsid = opts?.igsid ?? "17841400000000001";
  const accountId = opts?.accountId ?? "17841400000000099";
  const mid = opts?.mid ?? "m_sim_" + Math.random().toString(36).slice(2, 10);
  const text = opts?.text !== undefined ? opts.text : "Hi";
  const attachmentType = opts?.attachmentType ?? null;
  const echo = opts?.echo ?? false;
  const now = opts?.now ?? new Date();

  const timestamp = Math.floor(now.getTime() / 1000);

  const message: Record<string, unknown> = { mid };

  if (echo) {
    message.is_echo = true;
  }

  if (text !== null && attachmentType === null) {
    message.text = text;
  } else if (attachmentType !== null) {
    message.attachments = [
      {
        type: attachmentType,
        payload: { url: "https://example.invalid/x" },
      },
    ];
    if (text !== null) {
      message.text = text;
    }
  }

  return {
    object: "instagram",
    entry: [
      {
        id: accountId,
        time: timestamp,
        messaging: [
          {
            sender: { id: igsid },
            recipient: { id: accountId },
            timestamp,
            message,
          },
        ],
      },
    ],
  };
}
