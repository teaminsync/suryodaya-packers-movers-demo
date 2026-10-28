/**
 * Team follow-up alert decision logic (pure helper)
 */

export interface TeamFollowUpInput {
  humanRequested: boolean;
  needsTeamFollowUp: boolean;
  replyPromisesTeam: boolean;
  escalated: boolean;
  escalatedAt: string | Date | null;
  now: Date;
  reAlertAfterHours?: number;
}

export interface TeamFollowUpDecision {
  alert: boolean;
  markEscalated: boolean;
}

export function shouldAlertTeamFollowUp(input: TeamFollowUpInput): TeamFollowUpDecision {
  const {
    humanRequested,
    needsTeamFollowUp,
    replyPromisesTeam,
    escalated,
    escalatedAt,
    now,
    reAlertAfterHours = 6,
  } = input;

  // Human-request path handles its own alert
  if (humanRequested) {
    return { alert: false, markEscalated: false };
  }

  // No team follow-up needed
  if (!needsTeamFollowUp && !replyPromisesTeam) {
    return { alert: false, markEscalated: false };
  }

  // Not yet escalated: alert and mark
  if (!escalated) {
    return { alert: true, markEscalated: true };
  }

  // Already escalated: check if we should re-alert
  if (escalatedAt === null) {
    return { alert: false, markEscalated: false };
  }

  let escalatedDate: Date;
  if (escalatedAt instanceof Date) {
    escalatedDate = escalatedAt;
  } else if (typeof escalatedAt === "string") {
    escalatedDate = new Date(escalatedAt);
  } else {
    return { alert: false, markEscalated: false };
  }

  // Check if date is valid
  if (isNaN(escalatedDate.getTime())) {
    return { alert: false, markEscalated: false };
  }

  const hoursSinceEscalation = (now.getTime() - escalatedDate.getTime()) / (1000 * 60 * 60);

  if (hoursSinceEscalation >= reAlertAfterHours) {
    return { alert: true, markEscalated: true };
  }

  return { alert: false, markEscalated: false };
}
