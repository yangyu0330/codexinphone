export type AuthMode = "github" | "token" | "dev";

export type UserInfo = {
  id: string;
  displayName: string;
  email?: string;
  login?: string;
  authMode: AuthMode;
};

export type PublicConfig = {
  authMode: AuthMode;
  publicOrigin: string;
  defaultCwd: string;
  workspaceRoots: string[];
  codexCommand: string;
  codexArgs: string[];
  aiEnvStatus: Record<string, boolean>;
  tunnelHint: string;
  codespace?: {
    name?: string;
    canStop: boolean;
    manageUrl: string;
    fixedUrl?: string;
  };
};

export type TerminalStream = "stdout" | "stderr" | "system";

export type TerminalChunk = {
  stream: TerminalStream;
  data: string;
  at: string;
};

export type SessionSummary = {
  id: string;
  cwd: string;
  command: string;
  args: string[];
  createdAt: string;
  updatedAt: string;
  status: "starting" | "running" | "exited" | "terminated" | "failed";
  exitCode?: number | null;
};

export type ApprovalRequest = {
  id: string;
  sessionId: string;
  reason: string;
  preview: string;
  createdAt: string;
};

export type ClientMessage =
  | {
      type: "session:create";
      cwd?: string;
      args?: string[];
      cols?: number;
      rows?: number;
      envProfile?: string;
    }
  | { type: "session:attach"; sessionId: string }
  | { type: "stdin:append"; sessionId: string; data: string }
  | { type: "session:resize"; sessionId: string; cols: number; rows: number }
  | { type: "session:terminate"; sessionId: string }
  | { type: "approval:approve"; approvalId: string }
  | { type: "approval:deny"; approvalId: string };

export type ServerMessage =
  | { type: "hello"; config: PublicConfig; user: UserInfo }
  | { type: "session:list"; sessions: SessionSummary[] }
  | { type: "session:created"; session: SessionSummary }
  | { type: "session:attached"; session: SessionSummary; history: TerminalChunk[] }
  | { type: "session:updated"; session: SessionSummary }
  | { type: "terminal:chunk"; sessionId: string; chunk: TerminalChunk }
  | { type: "approval:required"; request: ApprovalRequest }
  | { type: "approval:resolved"; approvalId: string; approved: boolean }
  | { type: "error"; message: string };
