import type { ApprovalRequest } from "../../shared/messages.js";

export type PolicyDecision =
  | { action: "allow" }
  | {
      action: "approval_required";
      reason: string;
      preview: string;
    };

const riskyPatterns: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /\brm\s+-rf\b/i,
    reason: "Recursive deletion requires explicit phone approval."
  },
  {
    pattern: /\bRemove-Item\b[\s\S]{0,120}-Recurse\b/i,
    reason: "Recursive PowerShell deletion requires explicit phone approval."
  },
  {
    pattern: /\bgit\s+push\b[\s\S]{0,80}\b--force\b/i,
    reason: "Force pushing can overwrite remote history."
  },
  {
    pattern: /\b(cat|type|Get-Content)\b[\s\S]{0,80}(\.env|id_rsa|id_ed25519|credentials|token)/i,
    reason: "Reading credential files can expose secrets in the mobile terminal."
  },
  {
    pattern: /\b(curl|Invoke-WebRequest|iwr|wget)\b[\s\S]{0,160}\b(upload|transfer|webhook|pastebin|gist)\b/i,
    reason: "Uploading local output to an external URL requires approval."
  },
  {
    pattern: /\bSet-ExecutionPolicy\b/i,
    reason: "Changing PowerShell execution policy requires approval."
  }
];

export function inspectTerminalInput(input: string): PolicyDecision {
  const normalized = input.replace(/\u001b\[[0-9;]*[A-Za-z]/g, "");
  for (const rule of riskyPatterns) {
    if (rule.pattern.test(normalized)) {
      return {
        action: "approval_required",
        reason: rule.reason,
        preview: normalized.slice(0, 500)
      };
    }
  }
  return { action: "allow" };
}

export function toApprovalRequest(
  id: string,
  sessionId: string,
  decision: Extract<PolicyDecision, { action: "approval_required" }>
): ApprovalRequest {
  return {
    id,
    sessionId,
    reason: decision.reason,
    preview: decision.preview,
    createdAt: new Date().toISOString()
  };
}
