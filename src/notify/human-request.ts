/**
 * Pattern matching for customer requests to talk to a human
 */

import { normalizeTypography } from "../utils/text.js";

export function looksLikeHumanRequest(text: string): boolean {
  const normalized = normalizeTypography(text).toLowerCase();
  const first400 = normalized.substring(0, 400);

  const guardPattern = /\b(?:don'?t|do not|dont|never|no need to|stop|please don'?t)\b[^.?!]{0,20}\bcall(?:ing)?\b/i;
  if (guardPattern.test(first400)) {
    return false;
  }

  const patterns = [
    /\b(?:talk|speak|chat|connect|transfer)\b[^.?!]{0,30}\b(?:human(?! resources)|real person|live person|agent|representative|executive|owner|manager|someone from (?:your|the) (?:team|company)|your team|the team|a person)\b/i,
    /\b(?:need|want|get|give)\b[^.?!]{0,15}\b(?:a |an )?(?:human(?! resources)|real person|live agent|human agent)\b/i,
    /\b(?:customer (?:care|support|service)|call me|call back|callback|call us back)\b/i,
    /\b(?:insaan|insan|human|owner|manager|malik)\s+se\b/i,
    /\bbaat\s+(?:karni|karna|karwao|karao|karwana)\b[^.?!]{0,30}\b(?:human|insaan|insan|owner|manager|team|kisi)\b/i,
    /\bkisi\s+se\s+baat\b/i,
  ];

  return patterns.some((pattern) => pattern.test(first400));
}
