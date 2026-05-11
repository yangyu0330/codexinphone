import type { PublicConfig, UserInfo } from "../../shared/messages";

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {})
    },
    ...init
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}

export async function getConfig(): Promise<PublicConfig> {
  return fetchJson<PublicConfig>("/api/config");
}

export async function getMe(): Promise<UserInfo | undefined> {
  const response = await fetch("/api/me", { credentials: "same-origin" });
  if (response.status === 401) {
    return undefined;
  }
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  const payload = (await response.json()) as { user: UserInfo };
  return payload.user;
}

export async function loginWithToken(token: string): Promise<UserInfo> {
  const payload = await fetchJson<{ user: UserInfo }>("/auth/token", {
    method: "POST",
    body: JSON.stringify({ token })
  });
  return payload.user;
}

export async function logout(): Promise<void> {
  await fetch("/api/logout", { method: "POST", credentials: "same-origin" });
}

export async function stopCodespace(): Promise<void> {
  await fetchJson<{ ok: true }>("/api/codespace/stop", { method: "POST" });
}
