import { normalizeTypography } from "../utils/text.js";

export const PROMISES_TEAM_FOLLOWUP = /(confirm|check|verify|find out|get back)[^.?!]{0,80}\bteam\b|\bteam\b[^.?!]{0,80}(confirm|check|verify|get back)|\b(we'll|we will|i'll|i will|let me)\s+(confirm|check|verify|find out|get back)\b/i;

export function promisesTeamFollowUp(reply: string): boolean {
  return PROMISES_TEAM_FOLLOWUP.test(normalizeTypography(reply));
}
