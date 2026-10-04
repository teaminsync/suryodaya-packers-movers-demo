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

export const COMPANY_SERVICES = {
  offered: [
    "Local moves within Pune",
    "Intercity moves on our corridors (Pune, Mumbai, Bengaluru, Hyderabad, Delhi NCR)",
    "Packing and unpacking",
    "Loading and unloading",
    "Extra-care handling for fragile items and pianos, planned and confirmed at the on-site survey",
  ],
  notOffered: [
    "Storage or warehousing",
    "Vehicle (car or bike) transport",
    "International moves",
  ],
} as const;

export function buildCompanyFactsBlock(): string {
  const corridors = COMPANY_PROFILE.serviceCorridors.join(", ");
  
  const offeredBullets = COMPANY_SERVICES.offered
    .map((service) => `- ${service}`)
    .join("\n");
  
  const notOfferedBullets = COMPANY_SERVICES.notOffered
    .map((service) => `- ${service}`)
    .join("\n");

  return `WHAT YOU MAY STATE ABOUT THE COMPANY (this is the ONLY company information you may state as fact):
- Company: ${COMPANY_PROFILE.name}, based in ${COMPANY_PROFILE.city}, founded in ${COMPANY_PROFILE.foundedYear}, ${COMPANY_PROFILE.gstDisplayText}.
- Corridors we serve: ${corridors}.
- Services we offer:
${offeredBullets}
- Services we do NOT offer:
${notOfferedBullets}
- Prices: only the ballpark figure given in the BALLPARK PRICING section; never any other price, rate, discount or fee.

RULES FOR QUESTIONS ABOUT THE COMPANY:
1. Never state or imply any service, capability, equipment, certification, policy, guarantee, discount, price or timeline that is not listed above.
2. If asked about something under "Services we do NOT offer", say plainly that we do not offer it, then offer to connect them with the team if they want to discuss alternatives.
3. If asked about anything else that is not listed above (for example insurance, payment terms, cancellation, delivery timelines, vehicle or crew details), do not guess and do not deny: say you will confirm it with the team, and invite them to tap "Talk to a Human" in the menu or ask to speak to the team. Keep helping with everything you do know.`;
}
