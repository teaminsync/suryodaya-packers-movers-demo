/**
 * AI chain startup warnings (pure helper)
 */

export interface AIChainWarningInput {
  anthropicKeySet: boolean;
  textChain: string[];
  imageChain: string[];
}

export function aiChainWarnings(input: AIChainWarningInput): string[] {
  const { anthropicKeySet, textChain, imageChain } = input;
  const warnings: string[] = [];

  const claudeInText = textChain.includes("claude");
  const claudeInImage = imageChain.includes("claude");
  const claudeInAnyChain = claudeInText || claudeInImage;

  if (anthropicKeySet && !claudeInAnyChain) {
    warnings.push("Anthropic API key is set but 'claude' is not used in any AI chain");
  }

  if (!anthropicKeySet && claudeInAnyChain) {
    warnings.push("'claude' is in an AI chain but Anthropic API key is not set");
  }

  return warnings;
}
