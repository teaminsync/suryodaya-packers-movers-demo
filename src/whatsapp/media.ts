/**
 * Downloads media from WhatsApp Cloud API.
 * WhatsApp's media URLs are temporary (~5 min validity) - this must be called
 * immediately after receiving a media message, not queued or deferred.
 */
export async function downloadWhatsAppMedia(
  mediaId: string
): Promise<{ buffer: Buffer; mimeType: string }> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const apiVersion = process.env.WHATSAPP_API_VERSION || "v21.0";

  if (!accessToken) {
    throw new Error("WHATSAPP_ACCESS_TOKEN not configured");
  }

  // Step 1: Get media metadata including the download URL
  const metadataUrl = `https://graph.facebook.com/${apiVersion}/${mediaId}`;
  console.log(`[WhatsApp Media] Fetching metadata for media ID: ${mediaId}`);

  const metadataResponse = await fetch(metadataUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!metadataResponse.ok) {
    const errorText = await metadataResponse.text();
    throw new Error(
      `Failed to fetch media metadata (${metadataResponse.status}): ${errorText}`
    );
  }

  const metadata = (await metadataResponse.json()) as {
    url: string;
    mime_type: string;
    sha256: string;
    file_size: number;
    id: string;
  };

  console.log("[WhatsApp Media] Metadata received:", {
    id: metadata.id,
    mime_type: metadata.mime_type,
    file_size: metadata.file_size,
    sha256: metadata.sha256,
  });

  // Step 2: Download the actual media file from the lookaside URL
  // This URL also requires the same bearer token
  console.log(`[WhatsApp Media] Downloading from: ${metadata.url}`);

  const mediaResponse = await fetch(metadata.url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!mediaResponse.ok) {
    const errorText = await mediaResponse.text();
    throw new Error(
      `Failed to download media file (${mediaResponse.status}): ${errorText}`
    );
  }

  const arrayBuffer = await mediaResponse.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  console.log(
    `[WhatsApp Media] Download complete: ${buffer.length} bytes, type: ${metadata.mime_type}`
  );

  return {
    buffer,
    mimeType: metadata.mime_type,
  };
}
