/**
 * Suryodaya Packers & Movers company profile
 * Single source of truth for all AI-generated copy
 */

export const COMPANY_PROFILE = {
  name: "Suryodaya Packers & Movers",
  foundedYear: 2016,
  city: "Pune",
  gstRegistered: true,
  gstDisplayText: "GST-registered, verified operator",
  valuesStatement: "no hidden charges, itemized quotes, straight answers",
  serviceCorridors: ["Pune", "Mumbai", "Bengaluru", "Hyderabad", "Delhi NCR"],
  demoNumberDisclosureNote:
    "You're chatting with Suryodaya's demo line — in production this runs on your own verified Indian WhatsApp Business number, set up the same way in a few days.",
};

/**
 * Ballpark price ranges for instant acknowledgment
 * Clearly labeled as approximate, not AI-invented
 */
export const BALLPARK_RANGES: Record<string, Record<string, string>> = {
  "1bhk": {
    local: "₹5,000–8,000",
    intercity: "₹10,000–20,000",
    intracity: "₹4,000–7,000",
  },
  "2bhk": {
    local: "₹8,000–15,000",
    intercity: "₹18,000–35,000",
    intracity: "₹7,000–12,000",
  },
  "3bhk": {
    local: "₹15,000–25,000",
    intercity: "₹30,000–60,000",
    intracity: "₹12,000–20,000",
  },
  office: {
    local: "₹20,000–50,000",
    intercity: "₹40,000–100,000",
    intracity: "₹15,000–40,000",
  },
  commercial: {
    local: "₹30,000+",
    intercity: "₹60,000+",
    intracity: "₹25,000+",
  },
  unknown: {
    local: "₹5,000–30,000",
    intercity: "₹10,000–100,000",
    intracity: "₹4,000–25,000",
  },
};

/**
 * Get ballpark range for a move
 */
export function getBallparkRange(
  estimatedVolume: string,
  moveType: string
): string {
  const volumeRanges = BALLPARK_RANGES[estimatedVolume] || BALLPARK_RANGES.unknown;
  return volumeRanges[moveType] || volumeRanges.local;
}
