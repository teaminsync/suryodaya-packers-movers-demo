/**
 * Post-ingest hook for IndiaMART leads
 */

export interface PostIngestDeps {
  prefill(leadId: string, text: string): Promise<{ status: string; filled: string[] }>;
}

export function createPostIngestHook(
  deps: PostIngestDeps
): (info: { event: { text: string }; summary: { leadId?: string } }) => Promise<void> {
  return async (info) => {
    if (!info.summary.leadId || info.summary.leadId === "") {
      return;
    }

    try {
      const result = await deps.prefill(info.summary.leadId, info.event.text);
      console.log("[Intake] Prefill result:", {
        leadId: info.summary.leadId,
        status: result.status,
        filled: result.filled,
      });
    } catch (error) {
      console.error("[Intake] Prefill crashed:", error instanceof Error ? error.message : String(error));
    }
  };
}
