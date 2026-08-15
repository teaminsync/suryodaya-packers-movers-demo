/**
 * Uploads media to a private Supabase Storage bucket via the REST API directly
 * (no supabase-js client - same "direct connection, no SDK" pattern already used
 * for Postgres in this project). Failures here are NON-BLOCKING: if storage upload
 * fails, we log it and return null, but we do NOT throw - a storage outage should
 * never prevent a customer from getting their estimate. The caller is responsible
 * for handling a null result gracefully (store storage_path as null in the DB row).
 */
export async function uploadToStorage(
  objectPath: string,
  buffer: Buffer,
  contentType: string
): Promise<{ path: string } | null> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || "move-media";

  if (!supabaseUrl || !supabaseKey) {
    console.error(
      "[Supabase Storage] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured - skipping upload"
    );
    return null;
  }

  const uploadUrl = `${supabaseUrl}/storage/v1/object/${bucket}/${objectPath}`;

  try {
    console.log(`[Supabase Storage] Uploading to: ${bucket}/${objectPath}`);

    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${supabaseKey}`,
        apikey: supabaseKey,
        "Content-Type": contentType,
      },
      body: buffer,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[Supabase Storage] Upload failed (${response.status}): ${errorText}`
      );
      return null;
    }

    const result = await response.json();
    console.log("[Supabase Storage] Upload successful:", result);

    return { path: objectPath };
  } catch (error) {
    console.error("[Supabase Storage] Upload error:", error);
    return null;
  }
}
