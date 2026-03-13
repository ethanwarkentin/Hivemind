import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

interface TerminalProps {
  id: string;
  isActive: boolean;
}

export default function Terminal({ id, isActive }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const xterm = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"Cascadia Code", "Fira Code", "Consolas", monospace',
      theme: {
        background: "#1a1b26",
        foreground: "#a9b1d6",
        cursor: "#c0caf5",
        selectionBackground: "#33467c",
        black: "#15161e",
        red: "#f7768e",
        green: "#9ece6a",
        yellow: "#e0af68",
        blue: "#7aa2f7",
        magenta: "#bb9af7",
        cyan: "#7dcfff",
        white: "#a9b1d6",
        brightBlack: "#414868",
        brightRed: "#f7768e",
        brightGreen: "#9ece6a",
        brightYellow: "#e0af68",
        brightBlue: "#7aa2f7",
        brightMagenta: "#bb9af7",
        brightCyan: "#7dcfff",
        brightWhite: "#c0caf5",
      },
    });

    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);
    xterm.open(containerRef.current);

    requestAnimationFrame(() => {
      try {
        fitAddon.fit();
      } catch {
        // ignore fit errors during init
      }
    });

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    // Send user keystrokes to the PTY
    xterm.onData((data: string) => {
      window.terminal.write(id, data);
    });

    // Receive PTY output
    const handleData = (payload: { id: string; data: string }) => {
      if (payload.id === id) {
        xterm.write(payload.data);
      }
    };
    window.terminal.onData(handleData);

    // Handle process exit
    const handleExit = (payload: { id: string; exitCode: number }) => {
      if (payload.id === id) {
        xterm.write("\r\n\x1b[31m[Process exited]\x1b[0m\r\n");
      }
    };
    window.terminal.onExit(handleExit);

    // Resize handling
    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit();
        window.terminal.resize(id, xterm.cols, xterm.rows);
      } catch {
        // ignore
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      xterm.dispose();
    };
  }, [id]);

  // Focus when tab becomes active
  useEffect(() => {
    if (isActive && xtermRef.current) {
      xtermRef.current.focus();
      try {
        fitAddonRef.current?.fit();
      } catch {
        // ignore
      }
    }
  }, [isActive]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", overflow: "hidden" }}
    />
  );
}
