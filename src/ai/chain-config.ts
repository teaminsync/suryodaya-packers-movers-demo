/**
 * Provider chain configuration and parsing
 */

export type ChainProvider = "claude" | "gemini" | "groq";

export interface ProviderKeys {
  claude: boolean;
  gemini: boolean;
  groq: boolean;
}

export function defaultTextChain(keys: ProviderKeys): ChainProvider[] {
  const chain: ChainProvider[] = [];
  if (keys.groq) chain.push("groq");
  if (keys.gemini) chain.push("gemini");
  return chain;
}

export function defaultImageChain(keys: ProviderKeys): ChainProvider[] {
  const chain: ChainProvider[] = [];
  if (keys.gemini) chain.push("gemini");
  if (keys.groq) chain.push("groq");
  return chain;
}

export function parseChain(raw: string | undefined): {
  provided: boolean;
  names: ChainProvider[];
  unknown: string[];
} {
  if (!raw || raw.trim() === "") {
    return { provided: false, names: [], unknown: [] };
  }

  const provided = true;
  const parts = raw.split(",").map((s) => s.trim()).filter((s) => s !== "");
  const names: ChainProvider[] = [];
  const unknown: string[] = [];
  const seen = new Set<string>();

  for (const part of parts) {
    const lower = part.toLowerCase();
    if (seen.has(lower)) {
      continue;
    }
    seen.add(lower);

    if (lower === "claude" || lower === "gemini" || lower === "groq") {
      names.push(lower as ChainProvider);
    } else {
      unknown.push(part);
    }
  }

  return { provided, names, unknown };
}

export function resolveChain(
  raw: string | undefined,
  keys: ProviderKeys,
  defaults: ChainProvider[]
): {
  names: ChainProvider[];
  unknown: string[];
  skippedNoKey: ChainProvider[];
  usedDefault: boolean;
  provided: boolean;
} {
  const parsed = parseChain(raw);

  if (!parsed.provided) {
    return {
      names: defaults,
      unknown: [],
      skippedNoKey: [],
      usedDefault: true,
      provided: false,
    };
  }

  const names: ChainProvider[] = [];
  const skippedNoKey: ChainProvider[] = [];

  for (const name of parsed.names) {
    if (keys[name]) {
      names.push(name);
    } else {
      skippedNoKey.push(name);
    }
  }

  return {
    names,
    unknown: parsed.unknown,
    skippedNoKey,
    usedDefault: false,
    provided: true,
  };
}
