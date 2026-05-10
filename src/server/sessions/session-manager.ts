import path from "node:path";
import { nanoid } from "nanoid";
import { config } from "../config.js";
import { loadEnvProfile } from "../env/profiles.js";
import { isPathInsideRoots } from "../path-policy.js";
import { maskSecrets } from "../security/masking.js";
import { inspectTerminalInput, toApprovalRequest } from "../security/policy.js";
import { appendSessionEvent } from "./audit-log.js";
import { spawnTerminal, type TerminalProcess } from "../terminal/process.js";
import type {
  ApprovalRequest,
  SessionSummary,
  TerminalChunk,
  UserInfo
} from "../../shared/messages.js";

type CreateSessionOptions = {
  cwd?: string;
  args?: string[];
  cols?: number;
  rows?: number;
  envProfile?: string;
  user: UserInfo;
};

type PendingApproval = {
  request: ApprovalRequest;
  data: string;
};

export type SessionManagerEvents = {
  onChunk: (sessionId: string, chunk: TerminalChunk) => void;
  onSessionUpdated: (summary: SessionSummary) => void;
  onApprovalRequired: (request: ApprovalRequest) => void;
  onApprovalResolved: (approvalId: string, approved: boolean) => void;
};

type ManagedSession = {
  id: string;
  cwd: string;
  command: string;
  args: string[];
  createdAt: string;
  updatedAt: string;
  status: SessionSummary["status"];
  exitCode?: number | null;
  terminal?: TerminalProcess;
  history: TerminalChunk[];
  secretValues: string[];
  pendingApprovals: Map<string, PendingApproval>;
};

export class SessionManager {
  private readonly sessions = new Map<string, ManagedSession>();
  private readonly listeners = new Set<SessionManagerEvents>();

  addListener(listener: SessionManagerEvents): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  list(): SessionSummary[] {
    return [...this.sessions.values()].map((session) => this.summary(session));
  }

  getHistory(sessionId: string): TerminalChunk[] {
    const session = this.requireSession(sessionId);
    return [...session.history];
  }

  getSummary(sessionId: string): SessionSummary {
    return this.summary(this.requireSession(sessionId));
  }

  async create(options: CreateSessionOptions): Promise<SessionSummary> {
    const cwd = path.resolve(options.cwd || config.codex.defaultCwd);
    if (!isPathInsideRoots(cwd, config.codex.workspaceRoots)) {
      throw new Error(`Working directory is outside WORKSPACE_ROOTS: ${cwd}`);
    }

    const envProfile = await loadEnvProfile(options.envProfile);
    const id = nanoid(12);
    const now = new Date().toISOString();
    const args = options.args?.length ? options.args : [...config.codex.args];
    const session: ManagedSession = {
      id,
      cwd,
      command: config.codex.command,
      args,
      createdAt: now,
      updatedAt: now,
      status: "starting",
      history: [],
      secretValues: envProfile?.secretValues ?? [],
      pendingApprovals: new Map()
    };
    this.sessions.set(id, session);
    this.emitSessionUpdated(session);

    await appendSessionEvent(id, {
      type: "session:create",
      at: now,
      user: options.user,
      cwd,
      command: config.codex.command,
      args,
      envProfile: envProfile?.name || "default"
    });

    const env = {
      ...process.env,
      ...(envProfile?.env ?? {}),
      TERM: "xterm-256color",
      COLORTERM: "truecolor"
    };

    try {
      session.terminal = await spawnTerminal({
        command: config.codex.command,
        args,
        cwd,
        env,
        cols: options.cols ?? 90,
        rows: options.rows ?? 28
      });

      session.status = "running";
      session.updatedAt = new Date().toISOString();
      this.emitSessionUpdated(session);

      session.terminal.on("data", (data, stream) => {
        const chunk: TerminalChunk = {
          stream,
          data: maskSecrets(data, session.secretValues),
          at: new Date().toISOString()
        };
        session.history.push(chunk);
        session.updatedAt = chunk.at;
        void appendSessionEvent(id, { type: "terminal:chunk", ...chunk });
        this.listeners.forEach((listener) => listener.onChunk(id, chunk));
      });

      session.terminal.on("exit", (exitCode) => {
        session.status = session.status === "terminated" ? "terminated" : "exited";
        session.exitCode = exitCode;
        session.updatedAt = new Date().toISOString();
        void appendSessionEvent(id, {
          type: "session:exit",
          at: session.updatedAt,
          exitCode
        });
        this.emitSessionUpdated(session);
      });
    } catch (error) {
      session.status = "failed";
      session.updatedAt = new Date().toISOString();
      const message = error instanceof Error ? error.message : String(error);
      const chunk: TerminalChunk = {
        stream: "system",
        data: `Failed to start ${config.codex.command}: ${message}\r\n`,
        at: session.updatedAt
      };
      session.history.push(chunk);
      await appendSessionEvent(id, { type: "session:failed", at: session.updatedAt, message });
      this.listeners.forEach((listener) => listener.onChunk(id, chunk));
      this.emitSessionUpdated(session);
    }

    return this.summary(session);
  }

  appendInput(sessionId: string, data: string): void {
    const session = this.requireSession(sessionId);
    if (session.status !== "running" || !session.terminal) {
      throw new Error("Session is not running.");
    }

    const decision = inspectTerminalInput(data);
    if (decision.action === "approval_required") {
      const approvalId = nanoid(10);
      const request = toApprovalRequest(approvalId, sessionId, decision);
      session.pendingApprovals.set(approvalId, { request, data });
      this.listeners.forEach((listener) => listener.onApprovalRequired(request));
      void appendSessionEvent(sessionId, {
        type: "approval:required",
        at: request.createdAt,
        approvalId,
        reason: request.reason,
        preview: maskSecrets(request.preview, session.secretValues)
      });
      return;
    }

    session.terminal.write(data);
  }

  approve(approvalId: string, approved: boolean): void {
    for (const session of this.sessions.values()) {
      const pending = session.pendingApprovals.get(approvalId);
      if (!pending) {
        continue;
      }

      session.pendingApprovals.delete(approvalId);
      if (approved && session.terminal && session.status === "running") {
        session.terminal.write(pending.data);
      }
      void appendSessionEvent(session.id, {
        type: "approval:resolved",
        at: new Date().toISOString(),
        approvalId,
        approved
      });
      this.listeners.forEach((listener) => listener.onApprovalResolved(approvalId, approved));
      return;
    }

    throw new Error("Approval request not found.");
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.requireSession(sessionId);
    if (session.terminal && session.status === "running") {
      session.terminal.resize(Math.max(20, cols), Math.max(8, rows));
    }
  }

  terminate(sessionId: string): void {
    const session = this.requireSession(sessionId);
    if (session.terminal && session.status === "running") {
      session.status = "terminated";
      session.terminal.kill();
      session.updatedAt = new Date().toISOString();
      this.emitSessionUpdated(session);
    }
  }

  private requireSession(sessionId: string): ManagedSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error("Session not found.");
    }
    return session;
  }

  private summary(session: ManagedSession): SessionSummary {
    return {
      id: session.id,
      cwd: session.cwd,
      command: session.command,
      args: [...session.args],
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      status: session.status,
      exitCode: session.exitCode
    };
  }

  private emitSessionUpdated(session: ManagedSession): void {
    const summary = this.summary(session);
    this.listeners.forEach((listener) => listener.onSessionUpdated(summary));
  }
}

export const sessionManager = new SessionManager();
