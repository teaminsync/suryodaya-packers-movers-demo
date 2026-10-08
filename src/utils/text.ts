/**
 * Text formatting helpers for customer-facing display.
 * Keep these presentation-only - never used for data storage or comparison logic,
 * only for how text gets shown to a customer.
 */

/**
 * Formats a room label for customer-facing display.
 * Converts snake_case or kebab-case AI output into natural title case.
 * Examples: "living_room" -> "Living Room", "bedroom" -> "Bedroom",
 *           "Living Room" -> "Living Room" (already-correct input passes through
 *           unchanged in meaning, though casing of each word is still normalized).
 */
export function formatRoomLabel(label: string): string {
  return label
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function normalizeTypography(text: string): string {
  return text.replace(/[\u2010-\u2015\u2212]/g, "-").replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
}
