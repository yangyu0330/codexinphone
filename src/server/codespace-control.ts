import { config } from "./config.js";
import { logger } from "./logger.js";

type GitHubErrorPayload = {
  message?: string;
};

export async function stopCurrentCodespace(): Promise<void> {
  const { name, controlToken } = config.codespace;
  if (!name || !controlToken) {
    throw new Error(
      "Codespace stop is not configured. Set CODESPACE_NAME and CODESPACES_CONTROL_TOKEN."
    );
  }

  const response = await fetch(
    `https://api.github.com/user/codespaces/${encodeURIComponent(name)}/stop`,
    {
      method: "POST",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${controlToken}`,
        "x-github-api-version": "2022-11-28",
        "user-agent": "codexinphone"
      }
    }
  );

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as GitHubErrorPayload;
    throw new Error(payload.message || `GitHub Codespaces stop failed: ${response.status}`);
  }

  logger.info({ codespace: name }, "Codespace stop requested");
}
