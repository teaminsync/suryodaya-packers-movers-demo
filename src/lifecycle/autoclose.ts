/**
 * Auto-close finished leads logic (pure)
 */

export function parseAutocloseConfig(env: Record<string, string | undefined>): {
  hours: number;
  warnings: string[];
} {
  const warnings: string[] = [];
  const raw = env.LEAD_AUTOCLOSE_HOURS;

  if (raw === undefined || raw.trim() === "") {
    return { hours: 48, warnings };
  }

  const parsed = parseInt(raw, 10);

  if (isNaN(parsed) || parsed < 0 || parsed > 720) {
    warnings.push(
      `LEAD_AUTOCLOSE_HOURS="${raw}" is invalid (must be 0-720); using default 48`
    );
    return { hours: 48, warnings };
  }

  return { hours: parsed, warnings };
}

function parseDate(value: Date | string | null): Date | null {
  if (value === null) {
    return null;
  }
  const d = new Date(value);
  if (isNaN(d.getTime())) {
    return null;
  }
  return d;
}

export function isReadyToAutoClose(input: {
  status: string;
  closedAt: Date | string | null;
  latestSurveyStartsAt: Date | string | null;
  lastInboundAt: Date | string | null;
  now: Date;
  hours: number;
}): boolean {
  if (input.hours <= 0) {
    return false;
  }

  if (input.status !== "booked") {
    return false;
  }

  const closedAt = parseDate(input.closedAt);
  if (closedAt !== null) {
    return false;
  }

  const latestSurveyStartsAt = parseDate(input.latestSurveyStartsAt);
  if (latestSurveyStartsAt === null) {
    return false;
  }

  const cutoff = new Date(input.now.getTime() - input.hours * 60 * 60 * 1000);
  if (latestSurveyStartsAt.getTime() > cutoff.getTime()) {
    return false;
  }

  const lastInboundAt = parseDate(input.lastInboundAt);
  if (lastInboundAt !== null && lastInboundAt.getTime() > cutoff.getTime()) {
    return false;
  }

  return true;
}
