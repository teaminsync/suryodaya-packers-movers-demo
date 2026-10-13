/**
 * Phone number normalization to E.164 format
 */

export function normalizePhoneE164(raw: string | null | undefined): string | null {
  if (raw == null || raw === "") {
    return null;
  }

  let digits = raw.replace(/\D/g, "");
  if (digits === "") {
    return null;
  }

  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }

  if (digits.length === 10 && /^[6789]/.test(digits)) {
    digits = "91" + digits;
  } else if (digits.length === 11 && digits[0] === "0" && /^[6789]/.test(digits[1])) {
    digits = "91" + digits.slice(1);
  } else if (digits.startsWith("0")) {
    return null;
  }

  if (digits.length === 10) {
    return null;
  }

  if (digits.length < 8 || digits.length > 15) {
    return null;
  }

  return "+" + digits;
}
