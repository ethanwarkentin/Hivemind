import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

interface TerminalProps {
  id: string;
  isActive: boolean;
  fontSize?: number;
  theme?: string;
  onClaudeDetected?: (id: string, cwd: string) => void;
  onCwdChange?: (id: string, cwd: string) => void;
}

const darkTheme = {};

const paulinoTheme = {
  background: "#ffffff",
  foreground: "#1a0015",
  cursor: "#ff00ff",
  cursorAccent: "#ffffff",
  selectionBackground: "#ff69b480",
  selectionForeground: "#1a0015",
  black: "#1a0015",
  red: "#ff0000",
  green: "#00aa00",
  yellow: "#cc8800",
  blue: "#0066ff",
  magenta: "#ff00ff",
  cyan: "#00aaaa",
  white: "#e0dcd0",
  brightBlack: "#6b0058",
  brightRed: "#ff3333",
  brightGreen: "#00cc00",
  brightYellow: "#ffaa00",
  brightBlue: "#3388ff",
  brightMagenta: "#ff44ff",
  brightCyan: "#00cccc",
  brightWhite: "#ffffff",
};

export default function Terminal({ id, isActive, fontSize = 14, theme = "dark", onClaudeDetected, onCwdChange }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const claudeDetectedRef = useRef(false);
  const outputBufferRef = useRef("");
  const cwdBufferRef = useRef("");
  const lastSelectionRef = useRef("");

  useEffect(() => {
    if (!containerRef.current) return;

    const xterm = new XTerm({
      cursorBlink: true,
      fontSize,
      fontFamily: '"Cascadia Code", "Fira Code", "Consolas", monospace',
      theme: theme === "paulino" ? paulinoTheme : darkTheme,
      rightClickSelectsWord: false,
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

    // Track selection changes so we have it available on right-click
    xterm.onSelectionChange(() => {
      const sel = xterm.getSelection();
      if (sel) {
        lastSelectionRef.current = sel;
      }
    });

    // Send user keystrokes to the PTY
    xterm.onData((data: string) => {
      window.terminal.write(id, data);
    });

    // Receive PTY output
    const handleData = (payload: { id: string; data: string }) => {
      if (payload.id === id) {
        xterm.write(payload.data);

        // Track cwd from PowerShell/bash prompt in output
        if (onCwdChange) {
          cwdBufferRef.current += payload.data;
          // Keep buffer small — just need the last prompt line
          if (cwdBufferRef.current.length > 2000) {
            cwdBufferRef.current = cwdBufferRef.current.slice(-1000);
          }
          // Strip ANSI
          const clean = cwdBufferRef.current
            .replace(/\x1b\][^\x07]*\x07/g, "")
            .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "")
            .replace(/\x1b[()][A-Z0-9]/g, "")
            .replace(/\x1b=/g, "")
            .replace(/\x1b>/g, "");
          // PowerShell prompt: "PS C:\Users\foo> " or "PS C:\Users\foo\project> "
          const psMatch = clean.match(/PS\s+([A-Z]:[\\\/][^>\r\n]*)>\s*$/i);
          if (psMatch) {
            onCwdChange(id, psMatch[1].trim());
          }
          // Bash/zsh prompt with path: "user@host:~/projects$" or "~/projects $"
          const bashMatch = clean.match(/[:\s](~[\/][^\$#>\r\n]*)\s*[\$#>]\s*$/);
          if (bashMatch) {
            onCwdChange(id, bashMatch[1].trim());
          }
        }

        // Watch for Claude startup - look for the cwd path Claude prints
        if (!claudeDetectedRef.current && onClaudeDetected) {
          outputBufferRef.current += payload.data;
          // Keep buffer from growing forever
          if (outputBufferRef.current.length > 5000) {
            outputBufferRef.current = outputBufferRef.current.slice(-3000);
          }

          // Strip all ANSI escape sequences (including OSC, CSI, etc.)
          const stripped = outputBufferRef.current
            .replace(/\x1b\][^\x07]*\x07/g, "")      // OSC sequences
            .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "")   // CSI sequences
            .replace(/\x1b[()][A-Z0-9]/g, "")          // Character set
            .replace(/\x1b=/g, "")                      // Keypad mode
            .replace(/\x1b>/g, "");                     // Keypad mode

          // Debug: log to console so we can see what's happening
          if (/claude/i.test(stripped) && !claudeDetectedRef.current) {
            console.log("[Hivemind] Claude detected in output, stripped text:", JSON.stringify(stripped.slice(-500)));
          }

          // Claude Code prints something like:
          //   Claude Code v2.1.74
          //   Opus 4.6 · Claude Team
          //   ~\Boswell\Projects\Terradome
          if (/claude\s*code/i.test(stripped)) {
            // Try multiple path patterns
            const patterns = [
              /~[\\\/][\w.\\\/ -]+/,                    // ~\path or ~/path
              /[A-Z]:[\\\/][\w.\\\/ -]+/,               // C:\path
              /\/[a-z]\/[\w.\\\/ -]+/,                   // /c/Users/...
            ];

            for (const pattern of patterns) {
              const match = stripped.match(pattern);
              if (match) {
                claudeDetectedRef.current = true;
                const cwd = match[0].trim();
                const folder = cwd.replace(/\\/g, "/").split("/").filter(Boolean).pop() || cwd;
                console.log("[Hivemind] Renaming terminal, matched path:", cwd, "-> folder:", folder);
                onClaudeDetected(id, folder);
                break;
              }
            }
          }
        }
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

    // Right-click: selection = copy, no selection = paste (CMD-style)
    // We use the tracked selection since xterm may clear it before contextmenu fires
    const handleContextMenu = async (e: MouseEvent) => {
      e.preventDefault();
      const selection = xterm.getSelection() || lastSelectionRef.current;
      if (selection) {
        await navigator.clipboard.writeText(selection);
        xterm.clearSelection();
        lastSelectionRef.current = "";
      } else {
        try {
          const text = await navigator.clipboard.readText();
          if (text) {
            window.terminal.write(id, text);
          }
        } catch {
          // Clipboard access denied or empty
        }
      }
    };
    containerRef.current.addEventListener("contextmenu", handleContextMenu);

    return () => {
      resizeObserver.disconnect();
      containerRef.current?.removeEventListener("contextmenu", handleContextMenu);
      xterm.dispose();
    };
  }, [id, onClaudeDetected]);

  // Update terminal theme dynamically
  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.theme = theme === "paulino" ? paulinoTheme : darkTheme;
    }
  }, [theme]);

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
