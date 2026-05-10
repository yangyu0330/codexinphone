import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  KeyRound,
  Loader2,
  LogOut,
  Play,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Square,
  Terminal as TerminalIcon,
  Wifi,
  WifiOff,
  X
} from "lucide-react";
import { getConfig, getMe, loginWithToken, logout } from "./api";
import { TerminalPane, type TerminalPaneHandle } from "./components/TerminalPane";
import type {
  ApprovalRequest,
  PublicConfig,
  ServerMessage,
  SessionSummary,
  UserInfo
} from "../../shared/messages";

const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";

type ConnectionState = "connecting" | "open" | "closed";

export function App() {
  const terminalRef = useRef<TerminalPaneHandle | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const activeSessionIdRef = useRef<string | undefined>(undefined);
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [user, setUser] = useState<UserInfo | undefined>();
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | undefined>();
  const [connection, setConnection] = useState<ConnectionState>("closed");
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>();
  const [cwd, setCwd] = useState("");
  const [args, setArgs] = useState("");
  const [token, setToken] = useState("");
  const [mobileInput, setMobileInput] = useState("");
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [lastError, setLastError] = useState<string | undefined>();

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId),
    [activeSessionId, sessions]
  );

  const userId = user?.id;
  const connected = connection === "open";

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  const send = useCallback((payload: unknown) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
    }
  }, []);

  const attachSession = useCallback(
    (sessionId: string) => {
      setActiveSessionId(sessionId);
      send({ type: "session:attach", sessionId });
    },
    [send]
  );

  const connectSocket = useCallback(() => {
    if (!userId) {
      return;
    }
    socketRef.current?.close();
    setConnection("connecting");
    const socket = new WebSocket(`${wsProtocol}//${window.location.host}/ws`);
    socketRef.current = socket;

    socket.addEventListener("open", () => setConnection("open"));
    socket.addEventListener("close", () => setConnection("closed"));
    socket.addEventListener("error", () => setLastError("WebSocket connection failed."));
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data) as ServerMessage;
      switch (message.type) {
        case "hello":
          setConfig(message.config);
          setUser((previous) => (previous?.id === message.user.id ? previous : message.user));
          break;
        case "session:list":
          setSessions(message.sessions);
          break;
        case "session:created":
          setSessions((previous) => upsertSession(previous, message.session));
          setActiveSessionId(message.session.id);
          break;
        case "session:attached":
          setSessions((previous) => upsertSession(previous, message.session));
          setActiveSessionId(message.session.id);
          terminalRef.current?.reset();
          for (const chunk of message.history) {
            terminalRef.current?.write(chunk.data);
          }
          terminalRef.current?.focus();
          break;
        case "session:updated":
          setSessions((previous) => upsertSession(previous, message.session));
          break;
        case "terminal:chunk":
          if (message.sessionId === activeSessionIdRef.current || !activeSessionIdRef.current) {
            setActiveSessionId(message.sessionId);
            terminalRef.current?.write(message.chunk.data);
          }
          break;
        case "approval:required":
          setApprovals((previous) => [...previous, message.request]);
          break;
        case "approval:resolved":
          setApprovals((previous) =>
            previous.filter((request) => request.id !== message.approvalId)
          );
          break;
        case "error":
          setLastError(message.message);
          break;
      }
    });
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [loadedConfig, loadedUser] = await Promise.all([getConfig(), getMe()]);
        if (cancelled) {
          return;
        }
        setConfig(loadedConfig);
        setCwd(loadedConfig.defaultCwd);
        setArgs(loadedConfig.codexArgs.join(" "));
        setUser(loadedUser);
      } catch (error) {
        setAuthError(error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (user) {
      connectSocket();
    }
    return () => socketRef.current?.close();
  }, [connectSocket, user]);

  function startSession() {
    const dimensions = terminalRef.current?.dimensions() ?? { cols: 90, rows: 28 };
    send({
      type: "session:create",
      cwd,
      args: splitArgs(args),
      cols: dimensions.cols,
      rows: dimensions.rows
    });
  }

  function terminateSession() {
    if (activeSessionId) {
      send({ type: "session:terminate", sessionId: activeSessionId });
    }
  }

  function sendMobileInput() {
    if (!activeSessionId || !mobileInput.trim()) {
      return;
    }
    send({ type: "stdin:append", sessionId: activeSessionId, data: `${mobileInput}\r` });
    setMobileInput("");
    terminalRef.current?.focus();
  }

  function terminalInput(data: string) {
    if (activeSessionId) {
      send({ type: "stdin:append", sessionId: activeSessionId, data });
    }
  }

  function resize(cols: number, rows: number) {
    if (activeSessionId) {
      send({ type: "session:resize", sessionId: activeSessionId, cols, rows });
    }
  }

  async function submitToken() {
    try {
      const loggedIn = await loginWithToken(token);
      setUser(loggedIn);
      setAuthError(undefined);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : String(error));
    }
  }

  async function doLogout() {
    await logout();
    socketRef.current?.close();
    setUser(undefined);
    setSessions([]);
    setActiveSessionId(undefined);
  }

  if (loading || !config) {
    return (
      <main className="loadingShell">
        <Loader2 className="spin" size={26} />
      </main>
    );
  }

  if (!user) {
    return (
      <main className="loginShell">
        <section className="loginPanel" aria-label="Login">
          <div className="brandRow">
            <span className="brandMark">
              <Smartphone size={22} />
            </span>
            <div>
              <h1>Codex in Phone</h1>
              <p>노트북의 Codex CLI를 휴대폰에서 제어합니다.</p>
            </div>
          </div>

          <div className="authActions">
            {config.authMode === "github" && (
              <a className="primaryButton" href="/auth/github">
                <KeyRound size={18} />
                GitHub OAuth
              </a>
            )}
            {config.authMode === "token" && (
              <form
                className="tokenForm"
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitToken();
                }}
              >
                <label>
                  Pairing token
                  <input
                    value={token}
                    onChange={(event) => setToken(event.target.value)}
                    type="password"
                    autoComplete="one-time-code"
                  />
                </label>
                <button className="primaryButton" type="submit">
                  <KeyRound size={18} />
                  Pair
                </button>
              </form>
            )}
          </div>

          <dl className="loginFacts">
            <div>
              <dt>Bind</dt>
              <dd>{config.publicOrigin}</dd>
            </div>
            <div>
              <dt>CLI</dt>
              <dd>{config.codexCommand}</dd>
            </div>
            <div>
              <dt>Access</dt>
              <dd>Tailscale 또는 Cloudflare Tunnel 권장</dd>
            </div>
          </dl>

          {authError && <p className="errorText">{authError}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="appShell">
      <header className="topbar">
        <div className="brandCompact">
          <TerminalIcon size={19} />
          <span>Codex in Phone</span>
        </div>
        <div className="statusCluster">
          <span className={`pill ${connected ? "ok" : "warn"}`}>
            {connected ? <Wifi size={15} /> : <WifiOff size={15} />}
            {connection}
          </span>
          <button className="iconButton" type="button" onClick={connectSocket} title="Reconnect">
            <RefreshCw size={18} />
          </button>
          <button className="iconButton" type="button" onClick={() => void doLogout()} title="Logout">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <section className="controlBand" aria-label="Session controls">
        <label>
          cwd
          <input value={cwd} onChange={(event) => setCwd(event.target.value)} />
        </label>
        <label>
          args
          <input value={args} onChange={(event) => setArgs(event.target.value)} />
        </label>
        <div className="buttonGroup">
          <button className="primaryButton" type="button" onClick={startSession} disabled={!connected}>
            <Play size={17} />
            Start
          </button>
          <button
            className="dangerButton"
            type="button"
            onClick={terminateSession}
            disabled={!activeSessionId}
          >
            <Square size={16} />
            Stop
          </button>
        </div>
      </section>

      <section className="workspace">
        <aside className="sidebar" aria-label="Sessions and status">
          <div className="userBox">
            <ShieldCheck size={18} />
            <div>
              <strong>{user.displayName}</strong>
              <span>{user.email || user.login || user.authMode}</span>
            </div>
          </div>

          <div className="sessionList">
            <h2>Sessions</h2>
            {sessions.length === 0 && <p className="muted">No sessions yet.</p>}
            {sessions.map((session) => (
              <button
                key={session.id}
                className={session.id === activeSessionId ? "sessionItem active" : "sessionItem"}
                type="button"
                onClick={() => attachSession(session.id)}
              >
                <span>{session.command}</span>
                <small>{session.status}</small>
              </button>
            ))}
          </div>

          <div className="keyStatus">
            <h2>AI Keys</h2>
            {Object.entries(config.aiEnvStatus).map(([key, present]) => (
              <span key={key} className={present ? "key present" : "key missing"}>
                {present ? <Check size={13} /> : <X size={13} />}
                {key}
              </span>
            ))}
          </div>
        </aside>

        <section className="terminalArea" aria-label="Terminal">
          {approvals.map((approval) => (
            <div className="approvalBanner" key={approval.id}>
              <ShieldAlert size={18} />
              <div>
                <strong>{approval.reason}</strong>
                <code>{approval.preview}</code>
              </div>
              <button
                className="primaryButton compact"
                type="button"
                onClick={() => send({ type: "approval:approve", approvalId: approval.id })}
              >
                <Check size={16} />
                Approve
              </button>
              <button
                className="ghostButton compact"
                type="button"
                onClick={() => send({ type: "approval:deny", approvalId: approval.id })}
              >
                <X size={16} />
                Deny
              </button>
            </div>
          ))}

          <div className="terminalFrame">
            <div className="terminalMeta">
              <span>{activeSession ? activeSession.cwd : "No active session"}</span>
              <span>{activeSession?.status || "idle"}</span>
            </div>
            <TerminalPane
              ref={terminalRef}
              onInput={terminalInput}
              onResize={resize}
              disabled={!activeSessionId || !connected}
            />
          </div>

          <form
            className="mobileComposer"
            onSubmit={(event) => {
              event.preventDefault();
              sendMobileInput();
            }}
          >
            <input
              value={mobileInput}
              onChange={(event) => setMobileInput(event.target.value)}
              placeholder="휴대폰 키보드 입력"
              disabled={!activeSessionId}
            />
            <button
              className="primaryButton square"
              type="submit"
              disabled={!activeSessionId}
              aria-label="Send input"
            >
              <Send size={18} />
            </button>
          </form>

          {lastError && <p className="errorText">{lastError}</p>}
        </section>
      </section>
    </main>
  );
}

function upsertSession(sessions: SessionSummary[], next: SessionSummary): SessionSummary[] {
  const exists = sessions.some((session) => session.id === next.id);
  if (!exists) {
    return [next, ...sessions];
  }
  return sessions.map((session) => (session.id === next.id ? next : session));
}

function splitArgs(input: string): string[] {
  const trimmed = input.trim();
  if (!trimmed) {
    return [];
  }
  const matches = trimmed.match(/"([^"]*)"|'([^']*)'|[^\s]+/g) ?? [];
  return matches.map((item) => item.replace(/^["']|["']$/g, ""));
}
