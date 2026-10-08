import "dotenv/config";
import { GeminiAdapter } from "../ai/providers/gemini.js";
import { GroqAdapter } from "../ai/providers/groq.js";
import { buildConversationRequest, turnResponseSchema } from "../flows/qualification.js";
import { SCENARIOS } from "./scenarios.js";
import { evaluateScenario } from "./checks.js";
import type { CheckResult } from "./checks.js";

// CLI use: npx tsx src/conformance/run.ts --only=S05
// (npm run drops args in this shell)

// Silence adapter chatter
console.debug = () => {};
console.info = () => {};

interface ProviderResult {
  provider: string;
  status: "PASS" | "FAIL" | "SCHEMA" | "ERROR";
  checks?: CheckResult[];
  passCount?: number;
  totalCount?: number;
  failedCheck?: string;
  schemaError?: string;
  error?: string;
  latencyMs: number;
  tokensIn?: number;
  tokensOut?: number;
  reply?: string;
  extracted?: unknown;
  wantsBook?: boolean;
  wantsHuman?: boolean;
  followup?: boolean;
}

interface ScenarioResult {
  scenarioId: string;
  title: string;
  results: ProviderResult[];
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const args = process.argv.slice(2);
  let providerFilter = "both";
  let onlyScenario: string | null = null;

  for (const arg of args) {
    if (arg.startsWith("--provider=")) {
      providerFilter = arg.split("=")[1];
    }
    if (arg.startsWith("--only=")) {
      onlyScenario = arg.split("=")[1];
    }
  }

  // Environment fallbacks
  if (providerFilter === "both" && process.env.CONFORMANCE_PROVIDER) {
    providerFilter = process.env.CONFORMANCE_PROVIDER;
  }
  if (!onlyScenario && process.env.CONFORMANCE_ONLY) {
    onlyScenario = process.env.CONFORMANCE_ONLY;
  }

  // Initialize adapters
  const geminiAdapter = new GeminiAdapter();
  let groqAdapter: GroqAdapter | null = null;

  if (process.env.GROQ_API_KEY) {
    groqAdapter = new GroqAdapter();
  } else {
    console.log("Groq skipped: GROQ_API_KEY not set");
  }

  // Filter scenarios
  const scenarios = onlyScenario
    ? SCENARIOS.filter((s) => s.id === onlyScenario)
    : SCENARIOS;

  if (scenarios.length === 0) {
    console.error(`No scenario found with id: ${onlyScenario}`);
    process.exit(0);
  }

  const allResults: ScenarioResult[] = [];
  let lastGroqCallStart = 0;

  // Run scenarios
  for (const scenario of scenarios) {
    const request = buildConversationRequest(scenario.message, scenario.known);
    const scenarioResult: ScenarioResult = {
      scenarioId: scenario.id,
      title: scenario.title,
      results: [],
    };

    // Determine which providers to test
    const providers: Array<{ name: string; adapter: typeof geminiAdapter | typeof groqAdapter }> = [];
    if (providerFilter === "both" || providerFilter === "gemini") {
      providers.push({ name: "gemini", adapter: geminiAdapter });
    }
    if ((providerFilter === "both" || providerFilter === "groq") && groqAdapter) {
      providers.push({ name: "groq", adapter: groqAdapter });
    }

    // Test each provider
    for (const { name, adapter } of providers) {
      // Pace Groq calls
      if (name === "groq") {
        const now = Date.now();
        const elapsed = now - lastGroqCallStart;
        if (elapsed < 14000) {
          await sleep(14000 - elapsed);
        }
        lastGroqCallStart = Date.now();
      } else {
        // Gemini: small delay
        await sleep(500);
      }

      const startTime = Date.now();
      let result: ProviderResult;

      try {
        const response = await adapter!.call(request);
        const latencyMs = Date.now() - startTime;

        // Parse with zod
        const parseResult = turnResponseSchema.safeParse(response.raw);

        if (!parseResult.success) {
          const firstIssue = parseResult.error.issues[0];
          result = {
            provider: name,
            status: "SCHEMA",
            schemaError: `${firstIssue.path.join(".")}: ${firstIssue.message}`,
            latencyMs,
            tokensIn: response.usage?.inputTokens,
            tokensOut: response.usage?.outputTokens,
          };
        } else {
          const turnResponse = parseResult.data;
          const checks = evaluateScenario(scenario, turnResponse);
          const passCount = checks.filter((c) => c.pass).length;
          const totalCount = checks.length;
          const firstFail = checks.find((c) => !c.pass);

          result = {
            provider: name,
            status: passCount === totalCount ? "PASS" : "FAIL",
            checks,
            passCount,
            totalCount,
            failedCheck: firstFail?.name,
            latencyMs,
            tokensIn: response.usage?.inputTokens,
            tokensOut: response.usage?.outputTokens,
            reply: turnResponse.replyMessage,
            extracted: turnResponse.extractedFields,
            wantsBook: turnResponse.wantsToBookSurvey,
            wantsHuman: turnResponse.wantsHuman,
            followup: turnResponse.needsTeamFollowUp,
          };
        }
      } catch (error: unknown) {
        const latencyMs = Date.now() - startTime;
        const err = error as any;
        const statusCode = err.statusCode ? ` (status ${err.statusCode})` : "";
        result = {
          provider: name,
          status: "ERROR",
          error: `${err.message || String(error)}${statusCode}`,
          latencyMs,
        };
      }

      scenarioResult.results.push(result);

      // Print result
      printResult(scenario.id, scenario.title, result);
    }

    allResults.push(scenarioResult);
  }

  // Print summary
  printSummary(allResults);
}

function printResult(scenarioId: string, title: string, result: ProviderResult) {
  const tokens = result.tokensIn && result.tokensOut
    ? `tokens in/out ${result.tokensIn}/${result.tokensOut}`
    : "";
  console.log(`[${scenarioId} ${title}] ${result.provider}  ${result.latencyMs}ms  ${tokens}`);

  if (result.status === "SCHEMA") {
    console.log(`  SCHEMA ${result.schemaError}`);
  } else if (result.status === "ERROR") {
    console.log(`  ERROR ${result.error}`);
  } else if (result.checks) {
    for (const check of result.checks) {
      if (check.pass) {
        console.log(`  PASS ${check.name}`);
      } else {
        console.log(`  FAIL ${check.name}${check.detail ? ` - ${check.detail}` : ""}`);
      }
    }
    if (result.reply) {
      const truncated = result.reply.length > 450
        ? result.reply.substring(0, 450) + "..."
        : result.reply;
      console.log(`  reply: ${truncated}`);
    }
    console.log(`  extracted: ${JSON.stringify(result.extracted)}  book=${result.wantsBook} human=${result.wantsHuman} followup=${result.followup}`);
  }
}

function printSummary(results: ScenarioResult[]) {
  console.log("\nSUMMARY");
  console.log("=".repeat(80));

  const providerStats: Record<string, {
    passed: number;
    total: number;
    schemaFails: number;
    errors: number;
    latencies: number[];
  }> = {};

  for (const scenarioResult of results) {
    const parts: string[] = [`${scenarioResult.scenarioId} ${scenarioResult.title}`.padEnd(24)];

    for (const result of scenarioResult.results) {
      if (!providerStats[result.provider]) {
        providerStats[result.provider] = {
          passed: 0,
          total: 0,
          schemaFails: 0,
          errors: 0,
          latencies: [],
        };
      }

      const stats = providerStats[result.provider];
      stats.latencies.push(result.latencyMs);

      let statusStr = "";
      if (result.status === "SCHEMA") {
        stats.schemaFails++;
        statusStr = `${result.provider} SCHEMA`;
      } else if (result.status === "ERROR") {
        stats.errors++;
        statusStr = `${result.provider} ERROR`;
      } else {
        stats.passed += result.passCount || 0;
        stats.total += result.totalCount || 0;
        const failInfo = result.status === "FAIL" ? ` (${result.failedCheck})` : "";
        statusStr = `${result.provider} ${result.status} ${result.passCount}/${result.totalCount}${failInfo}`;
      }
      parts.push(statusStr);
    }

    console.log(parts.join(" | "));
  }

  console.log("=".repeat(80));

  // Per-provider totals
  for (const [provider, stats] of Object.entries(providerStats)) {
    const median = stats.latencies.length > 0
      ? stats.latencies.sort((a, b) => a - b)[Math.floor(stats.latencies.length / 2)]
      : 0;
    console.log(
      `${provider}: checks ${stats.passed}/${stats.total}, schema failures ${stats.schemaFails}, errors ${stats.errors}, median latency ${median}ms`
    );
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(0);
});
