import { describe, expect, it } from "vitest";
import { SessionStore } from "../src/server/auth/session-store.js";
import { isPathInsideRoots } from "../src/server/path-policy.js";
import { isAllowedOrigin } from "../src/server/security/http.js";
import { maskSecrets } from "../src/server/security/masking.js";
import { inspectTerminalInput } from "../src/server/security/policy.js";
import { parseClientMessage } from "../src/server/ws-validation.js";

describe("maskSecrets", () => {
  it("redacts API keys and named secret assignments", () => {
    const text =
      "OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz and token ghp_abcdefghijklmnopqrstuvwxyz123456";
    const masked = maskSecrets(text);

    expect(masked).toContain("OPENAI_API_KEY=[redacted]");
    expect(masked).toContain("gh_[redacted]");
    expect(masked).not.toContain("abcdefghijklmnopqrstuvwxyz123456");
  });

  it("redacts exact runtime secret values", () => {
    expect(maskSecrets("secret is abc12345xyz", ["abc12345xyz"])).toBe("secret is [redacted]");
  });
});

describe("inspectTerminalInput", () => {
  it("requires approval for recursive deletion", () => {
    expect(inspectTerminalInput("Remove-Item . -Recurse\r").action).toBe("approval_required");
    expect(inspectTerminalInput("rm -rf /tmp/example\n").action).toBe("approval_required");
  });

  it("allows ordinary prompts", () => {
    expect(inspectTerminalInput("please inspect this repository\r").action).toBe("allow");
  });
});

describe("isPathInsideRoots", () => {
  it("accepts paths below allowed roots", () => {
    const root = process.platform === "win32" ? "C:\\Users\\andyw" : "/home/andyw";
    const child = process.platform === "win32" ? "C:\\Users\\andyw\\repo" : "/home/andyw/repo";
    expect(isPathInsideRoots(child, [root])).toBe(true);
  });

  it("rejects sibling paths", () => {
    const root = process.platform === "win32" ? "C:\\Users\\andyw\\repo" : "/home/andyw/repo";
    const sibling = process.platform === "win32" ? "C:\\Users\\andyw\\repo2" : "/home/andyw/repo2";
    expect(isPathInsideRoots(sibling, [root])).toBe(false);
  });
});

describe("SessionStore", () => {
  it("creates signed restart-safe session cookies and rejects tampering", () => {
    const store = new SessionStore();
    const cookie = store.create({
      id: "github:1",
      displayName: "Test User",
      login: "test-user",
      authMode: "github"
    });

    expect(store.get(cookie)?.id).toBe("github:1");
    expect(store.get(`${cookie}tampered`)).toBeUndefined();
  });
});

describe("isAllowedOrigin", () => {
  it("rejects unexpected origins", () => {
    expect(isAllowedOrigin("https://attacker.example")).toBe(false);
  });
});

describe("parseClientMessage", () => {
  it("accepts valid client messages", () => {
    expect(parseClientMessage(JSON.stringify({ type: "session:attach", sessionId: "abc" }))).toEqual({
      type: "session:attach",
      sessionId: "abc"
    });
  });

  it("rejects oversized stdin payloads", () => {
    expect(() =>
      parseClientMessage(
        JSON.stringify({ type: "stdin:append", sessionId: "abc", data: "x".repeat(20_000) })
      )
    ).toThrow();
  });
});
