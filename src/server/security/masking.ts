const secretValueKeys = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GOOGLE_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "MISTRAL_API_KEY",
  "GROQ_API_KEY",
  "OPENROUTER_API_KEY",
  "PERPLEXITY_API_KEY",
  "GITHUB_CLIENT_SECRET",
  "PAIRING_TOKEN",
  "SESSION_SECRET"
];

const namedSecretPattern =
  /\b(OPENAI_API_KEY|ANTHROPIC_API_KEY|GOOGLE_API_KEY|GOOGLE_GENERATIVE_AI_API_KEY|MISTRAL_API_KEY|GROQ_API_KEY|OPENROUTER_API_KEY|PERPLEXITY_API_KEY|GITHUB_TOKEN|GITHUB_CLIENT_SECRET|PAIRING_TOKEN|SESSION_SECRET)\s*=\s*([^\s"'`]+)/gi;

const tokenPatterns: Array<[RegExp, string]> = [
  [/\bsk-[A-Za-z0-9_-]{16,}\b/g, "sk-[redacted]"],
  [/\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g, "gh_[redacted]"],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, "github_pat_[redacted]"],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/gi, "Bearer [redacted]"],
  [/\b(AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY)\s*=\s*([^\s"'`]+)/gi, "$1=[redacted]"]
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function collectRuntimeSecrets(extraValues: string[] = []): string[] {
  const values = secretValueKeys
    .map((key) => process.env[key])
    .concat(extraValues)
    .filter((value): value is string => Boolean(value && value.length >= 8));

  return [...new Set(values)];
}

export function maskSecrets(input: string, extraSecretValues: string[] = []): string {
  let masked = input.replace(namedSecretPattern, "$1=[redacted]");

  for (const [pattern, replacement] of tokenPatterns) {
    masked = masked.replace(pattern, replacement);
  }

  for (const value of collectRuntimeSecrets(extraSecretValues)) {
    masked = masked.replace(new RegExp(escapeRegExp(value), "g"), "[redacted]");
  }

  return masked;
}
