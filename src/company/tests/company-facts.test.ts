/**
 * Tests for company facts block
 */

import { COMPANY_PROFILE, COMPANY_SERVICES, buildCompanyFactsBlock } from "../profile.js";
import { AIRouter } from "../../ai/router.js";
import { processConversationTurn } from "../../flows/qualification.js";
import { AIProviderAdapter } from "../../ai/providers/provider.interface.js";
import { AIRequest } from "../../ai/types.js";
import { z } from "zod";

describe("Company facts block", () => {
  it("should contain all offered and not-offered services", () => {
    const block = buildCompanyFactsBlock();

    // Check all offered services are present
    for (const service of COMPANY_SERVICES.offered) {
      expect(block).toContain(service);
    }

    // Check all not-offered services are present
    for (const service of COMPANY_SERVICES.notOffered) {
      expect(block).toContain(service);
    }

    // Check company profile details
    expect(block).toContain(COMPANY_PROFILE.name);
    expect(block).toContain("2016");
    expect(block).toContain(COMPANY_PROFILE.gstDisplayText);
  });

  it("should contain exact control phrases", () => {
    const block = buildCompanyFactsBlock();

    expect(block).toContain("Services we do NOT offer");
    expect(block).toContain("Talk to a Human");
    expect(block).toContain("never any other price");
  });
});

describe("Company facts in system prompt", () => {
  let capturedSystemPrompt: string | null = null;

  class MockProvider implements AIProviderAdapter {
    readonly name = "gemini" as const;
    readonly capabilities = {
      images: true,
      video: true,
    } as const;

    async call<TSchema extends z.ZodTypeAny>(
      request: AIRequest<TSchema>
    ): Promise<{
      raw: z.infer<TSchema>;
      modelUsed: string;
      usage?: Record<string, number>;
    }> {
      capturedSystemPrompt = request.systemPrompt;

      return {
        raw: {
          extractedFields: {},
          replyMessage: "ok",
          wantsToBookSurvey: false,
          wantsHuman: false,
        } as z.infer<TSchema>,
        modelUsed: "mock",
      };
    }
  }

  beforeEach(() => {
    capturedSystemPrompt = null;
    AIRouter.getInstance().reset();
  });

  it("should inject facts block before job description and prevent prompt injection", async () => {
    const mockProvider = new MockProvider();
    const router = AIRouter.getInstance();
    (router as any).config = {
      mode: "DEMO",
      primary: mockProvider,
      fallbacks: [],
    };
    (router as any).initialized = true;

    await processConversationTurn("Do you offer storage?", {});

    expect(capturedSystemPrompt).not.toBeNull();
    const factsBlock = buildCompanyFactsBlock();
    expect(capturedSystemPrompt).toContain(factsBlock);

    // Verify facts block appears BEFORE the job description
    const factsIndex = capturedSystemPrompt!.indexOf(factsBlock);
    const jobIndex = capturedSystemPrompt!.indexOf("Your job is to:");
    expect(factsIndex).toBeGreaterThan(-1);
    expect(jobIndex).toBeGreaterThan(-1);
    expect(factsIndex).toBeLessThan(jobIndex);
  });

  it("should preserve ballpark pricing section with known lead info", async () => {
    const mockProvider = new MockProvider();
    const router = AIRouter.getInstance();
    (router as any).config = {
      mode: "DEMO",
      primary: mockProvider,
      fallbacks: [],
    };
    (router as any).initialized = true;

    await processConversationTurn("What's the price?", {
      moveType: "intercity",
      estimatedVolume: "2bhk",
    });

    expect(capturedSystemPrompt).not.toBeNull();
    const factsBlock = buildCompanyFactsBlock();
    expect(capturedSystemPrompt).toContain(factsBlock);
    expect(capturedSystemPrompt).toContain("BALLPARK PRICING");
  });
});
