/**
 * IndiaMART sample payload builder
 */

export type SampleShape = "wrapped" | "body" | "flat";

export interface SampleOptions {
  uniqueId?: string;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  message?: string;
  queryType?: string;
  shape?: SampleShape;
  now?: Date;
}

export function formatIndiaMartTime(date: Date): string {
  const istMs = date.getTime() + 330 * 60000;
  const istDate = new Date(istMs);
  
  const year = istDate.getUTCFullYear();
  const month = String(istDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(istDate.getUTCDate()).padStart(2, "0");
  const hours = String(istDate.getUTCHours()).padStart(2, "0");
  const minutes = String(istDate.getUTCMinutes()).padStart(2, "0");
  const seconds = String(istDate.getUTCSeconds()).padStart(2, "0");
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

export function buildIndiaMartSample(options?: SampleOptions): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    UNIQUE_QUERY_ID: options?.uniqueId ?? String(Date.now()),
    QUERY_TYPE: options?.queryType ?? "W",
    QUERY_TIME: formatIndiaMartTime(options?.now ?? new Date()),
    SENDER_NAME: options?.name === null ? "IndiaMART Buyer" : (options?.name ?? "Rahul Verma"),
    SUBJECT: "Requirement for Packers and Movers",
    SENDER_CITY: "Pune",
    SENDER_STATE: "Maharashtra",
    SENDER_COUNTRY_ISO: "IN",
    QUERY_PRODUCT_NAME: "Packers and Movers",
    QUERY_MCAT_NAME: "Packers and Movers",
    QUERY_MESSAGE: options?.message ?? "Need to shift a 3BHK household from Pune to Mumbai next week. Piano included. Please share the ballpark cost.",
  };

  if (options?.phone !== null) {
    fields.SENDER_MOBILE = options?.phone ?? "+91-9876543210";
  }

  if (options?.email && options.email !== "") {
    fields.SENDER_EMAIL = options.email;
  }

  const shape = options?.shape ?? "wrapped";

  if (shape === "flat") {
    return fields;
  }

  const wrapped = {
    CODE: 200,
    STATUS: "SUCCESS",
    RESPONSE: fields,
  };

  if (shape === "body") {
    return { body: wrapped };
  }

  return wrapped;
}
