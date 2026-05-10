import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";

export type TerminalPaneHandle = {
  write: (data: string) => void;
  reset: () => void;
  focus: () => void;
  dimensions: () => { cols: number; rows: number };
};

type Props = {
  onInput: (data: string) => void;
  onResize: (cols: number, rows: number) => void;
  disabled: boolean;
};

export const TerminalPane = forwardRef<TerminalPaneHandle, Props>(
  ({ onInput, onResize, disabled }, ref) => {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const terminalRef = useRef<Terminal | null>(null);
    const fitRef = useRef<FitAddon | null>(null);
    const onInputRef = useRef(onInput);
    const onResizeRef = useRef(onResize);

    onInputRef.current = onInput;
    onResizeRef.current = onResize;

    useEffect(() => {
      if (!hostRef.current || terminalRef.current) {
        return;
      }

      const terminal = new Terminal({
        cursorBlink: true,
        convertEol: true,
        disableStdin: disabled,
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace",
        fontSize: 13,
        lineHeight: 1.18,
        theme: {
          background: "#080b10",
          foreground: "#e5e7eb",
          cursor: "#f8fafc",
          selectionBackground: "#2563eb66"
        }
      });
      const fit = new FitAddon();
      terminal.loadAddon(fit);
      terminal.open(hostRef.current);
      terminal.onData((data) => onInputRef.current(data));
      terminal.writeln("Codex in Phone terminal ready.");
      terminal.writeln("Start a session to attach to the laptop Codex CLI.");
      terminalRef.current = terminal;
      fitRef.current = fit;

      const resize = () => {
        fit.fit();
        onResizeRef.current(terminal.cols, terminal.rows);
      };
      resize();
      const observer = new ResizeObserver(resize);
      observer.observe(hostRef.current);

      return () => {
        observer.disconnect();
        terminal.dispose();
        terminalRef.current = null;
        fitRef.current = null;
      };
    }, []);

    useEffect(() => {
      terminalRef.current?.options && (terminalRef.current.options.disableStdin = disabled);
    }, [disabled]);

    useImperativeHandle(ref, () => ({
      write: (data: string) => terminalRef.current?.write(data),
      reset: () => terminalRef.current?.reset(),
      focus: () => terminalRef.current?.focus(),
      dimensions: () => ({
        cols: terminalRef.current?.cols ?? 90,
        rows: terminalRef.current?.rows ?? 28
      })
    }));

    return <div className="terminalHost" ref={hostRef} data-testid="terminal-host" />;
  }
);

TerminalPane.displayName = "TerminalPane";
