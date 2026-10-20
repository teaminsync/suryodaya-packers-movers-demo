/**
 * Instagram message formatting and constants
 */

export const IG_ACK_OPT_OUT = "You have been unsubscribed from messages from Suryodaya Packers & Movers. If you need help with a move later, just message us here.";
export const IG_ATTACHMENT_REPLY = "Thanks for sharing that. I can only read text messages here, so could you describe your move in a few words (where from, where to and the size of the home)?";
export const IG_MAX_TEXT_BYTES = 950;

export function splitForInstagram(text: string, maxBytes: number = IG_MAX_TEXT_BYTES): string[] {
  const trimmed = text.trim();
  if (trimmed === "") {
    return [];
  }

  const encoder = new TextEncoder();
  const bytes = encoder.encode(trimmed);

  if (bytes.length <= maxBytes) {
    return [trimmed];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < trimmed.length) {
    let end = start + 1;
    let candidate = trimmed.slice(start, end);

    while (end < trimmed.length && encoder.encode(candidate).length <= maxBytes) {
      end++;
      candidate = trimmed.slice(start, end);
    }

    if (encoder.encode(candidate).length > maxBytes) {
      end--;
      candidate = trimmed.slice(start, end);
    }

    const allowedWindow = candidate;
    const breakpoints = ["\n\n", "\n", ". ", " "];
    let breakIndex = -1;

    for (const bp of breakpoints) {
      const idx = allowedWindow.lastIndexOf(bp);
      if (idx !== -1) {
        breakIndex = start + idx + bp.length;
        break;
      }
    }

    if (breakIndex === -1 || breakIndex <= start) {
      breakIndex = start + allowedWindow.length;
    }

    const chunk = trimmed.slice(start, breakIndex).trim();
    if (chunk !== "") {
      chunks.push(chunk);
    }

    start = breakIndex;
  }

  return chunks;
}

export function buildInstagramSendBody(
  igsid: string,
  text: string
): { recipient: { id: string }; message: { text: string } } {
  return {
    recipient: { id: igsid },
    message: { text },
  };
}
