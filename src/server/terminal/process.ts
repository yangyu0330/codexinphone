import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";

export type TerminalProcessEvents = {
  data: [data: string, stream: "stdout" | "stderr"];
  exit: [exitCode: number | null];
};

export interface TerminalProcess {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
  on<K extends keyof TerminalProcessEvents>(
    event: K,
    listener: (...args: TerminalProcessEvents[K]) => void
  ): this;
}

type SpawnOptions = {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  cols: number;
  rows: number;
};

function quotePowerShell(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function buildPtyInvocation(options: SpawnOptions): { command: string; args: string[] } {
  if (process.platform !== "win32") {
    return {
      command: options.command,
      args: options.args
    };
  }

  const commandLine = [
    "&",
    quotePowerShell(options.command),
    ...options.args.map((arg) => quotePowerShell(arg))
  ].join(" ");

  return {
    command: "powershell.exe",
    args: ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", commandLine]
  };
}

type PtyModule = {
  spawn: (
    file: string,
    args: string[],
    options: {
      name: string;
      cwd: string;
      env: NodeJS.ProcessEnv;
      cols: number;
      rows: number;
    }
  ) => {
    onData: (listener: (data: string) => void) => void;
    onExit: (listener: (event: { exitCode: number }) => void) => void;
    write: (data: string) => void;
    resize: (cols: number, rows: number) => void;
    kill: () => void;
  };
};

class PtyTerminalProcess extends EventEmitter implements TerminalProcess {
  constructor(private readonly ptyProcess: ReturnType<PtyModule["spawn"]>) {
    super();
    ptyProcess.onData((data) => this.emit("data", data, "stdout"));
    ptyProcess.onExit((event) => this.emit("exit", event.exitCode));
  }

  write(data: string): void {
    this.ptyProcess.write(data);
  }

  resize(cols: number, rows: number): void {
    this.ptyProcess.resize(cols, rows);
  }

  kill(): void {
    this.ptyProcess.kill();
  }
}

class PipeTerminalProcess extends EventEmitter implements TerminalProcess {
  constructor(private readonly child: ChildProcessWithoutNullStreams) {
    super();
    child.stdout.on("data", (data: Buffer) => this.emit("data", data.toString("utf8"), "stdout"));
    child.stderr.on("data", (data: Buffer) => this.emit("data", data.toString("utf8"), "stderr"));
    child.on("exit", (code) => this.emit("exit", code));
  }

  write(data: string): void {
    this.child.stdin.write(data);
  }

  resize(): void {
    // Pipe fallback cannot resize; node-pty handles real terminal resizing.
  }

  kill(): void {
    this.child.kill();
  }
}

async function loadPty(): Promise<PtyModule | undefined> {
  for (const moduleName of ["node-pty", "@homebridge/node-pty-prebuilt-multiarch"]) {
    try {
      return (await import(moduleName)) as PtyModule;
    } catch {
      // Optional dependency. Fall through to the next PTY implementation.
    }
  }
  return undefined;
}

export async function spawnTerminal(options: SpawnOptions): Promise<TerminalProcess> {
  const pty = await loadPty();
  if (pty) {
    const invocation = buildPtyInvocation(options);
    return new PtyTerminalProcess(
      pty.spawn(invocation.command, invocation.args, {
        name: "xterm-256color",
        cwd: options.cwd,
        env: options.env,
        cols: options.cols,
        rows: options.rows
      })
    );
  }

  const child = spawn(options.command, options.args, {
    cwd: options.cwd,
    env: options.env,
    shell: true,
    windowsHide: true,
    stdio: "pipe"
  });
  return new PipeTerminalProcess(child);
}
