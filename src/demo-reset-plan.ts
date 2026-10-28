/**
 * Pure demo reset planner (no side effects)
 */

export interface DemoResetInput {
  phones: string[];
  instagramUsernames: string[];
}

export interface DemoResetRow {
  contactId: string;
  phone: string | null;
  instagramUsername: string | null;
  leadId: string;
}

export interface DemoResetPlan {
  keepContactIds: Set<string>;
  deleteLeadIds: string[];
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

function normalizeUsername(username: string): string {
  return username.replace(/^@/, "").toLowerCase();
}

export function planDemoReset(rows: DemoResetRow[], keep: DemoResetInput): DemoResetPlan {
  const keepPhones = new Set(keep.phones.map(normalizePhone));
  const keepUsernames = new Set(keep.instagramUsernames.map(normalizeUsername));
  const keepContactIds = new Set<string>();
  const deleteLeadIds: string[] = [];

  for (const row of rows) {
    let shouldKeep = false;

    if (row.phone && keepPhones.has(normalizePhone(row.phone))) {
      shouldKeep = true;
    }

    if (row.instagramUsername && keepUsernames.has(normalizeUsername(row.instagramUsername))) {
      shouldKeep = true;
    }

    if (shouldKeep) {
      keepContactIds.add(row.contactId);
    } else {
      deleteLeadIds.push(row.leadId);
    }
  }

  return { keepContactIds, deleteLeadIds };
}
