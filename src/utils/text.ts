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
