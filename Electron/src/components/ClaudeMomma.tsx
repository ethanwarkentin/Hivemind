import { useState, useCallback, useEffect, useRef } from "react";
import Terminal from "./Terminal";

interface ClaudeMommaProps {
  fontSize: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

type MommaState = "idle" | "checking" | "booting" | "running" | "error";

export default function ClaudeMomma({ fontSize, collapsed, onToggleCollapse }: ClaudeMommaProps) {
  const [state, setState] = useState<MommaState>("idle");
  const [terminalId, setTerminalId] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState("");
  const [hivemindDir, setHivemindDir] = useState("");
  const dataListenerRef = useRef<((payload: { id: string; data: string }) => void) | null>(null);
  const outputBufferRef = useRef("");

  useEffect(() => {
    window.hivemind.getDir().then(setHivemindDir);
  }, []);

  const startMomma = useCallback(async () => {
    setState("checking");
    const { installed } = await window.hivemind.checkClaude();

    if (!installed) {
      setState("error");
      setErrorMsg(
        "ClaudeMomma needs Claude Code installed to be the big boss. Install it with: npm install -g @anthropic-ai/claude-code"
      );
      return;
    }

    setState("booting");
    outputBufferRef.current = "";

    // Create terminal in background
    const dir = await window.hivemind.getDir();
    const result = await window.terminal.create({ cols: 80, rows: 10, cwd: dir });
    setTerminalId(result.id);

    // Listen for output to detect when Claude is ready
    const handleData = (payload: { id: string; data: string }) => {
      if (payload.id !== result.id) return;
      outputBufferRef.current += payload.data;

      // Strip ANSI
      const stripped = outputBufferRef.current
        .replace(/\x1b\][^\x07]*\x07/g, "")
        .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "")
        .replace(/\x1b[()][A-Z0-9]/g, "")
        .replace(/\x1b=/g, "")
        .replace(/\x1b>/g, "");

      // Claude Code shows its banner then a prompt (>)
      // Look for the ">" prompt or "claude" in output indicating it's ready
      if (/claude\s*code/i.test(stripped) && />\s*$/.test(stripped)) {
        setState("running");
      }
    };
    dataListenerRef.current = handleData;
    window.terminal.onData(handleData);

    // Auto-type claude command
    setTimeout(() => {
      window.terminal.write(result.id, "claude\r");
    }, 500);

    // Fallback: if detection doesn't trigger, show after 10 seconds
    setTimeout(() => {
      setState((prev) => (prev === "booting" ? "running" : prev));
    }, 10000);
  }, []);

  const stopMomma = useCallback(() => {
    if (terminalId) {
      window.terminal.kill(terminalId);
      setTerminalId("");
      setState("idle");
      outputBufferRef.current = "";
    }
  }, [terminalId]);

  if (collapsed) {
    return (
      <div className="momma momma--collapsed">
        <button className="momma__toggle" onClick={onToggleCollapse} title="Expand ClaudeMomma">
          &#9660;
        </button>
      </div>
    );
  }

  if (state === "idle" || state === "checking" || state === "error") {
    return (
      <div className="momma">
        <div className="momma__idle">
          <span className="momma__title momma__title--large">ClaudeMomma</span>
          {state === "idle" && (
            <button className="momma__start momma__start--large" onClick={startMomma}>
              Start ClaudeMomma
            </button>
          )}
          {state === "checking" && (
            <span className="momma__checking">Checking for Claude...</span>
          )}
          {state === "error" && (
            <>
              <span className="momma__error">{errorMsg}</span>
              <button className="momma__start momma__start--large" onClick={() => setState("idle")}>
                Retry
              </button>
            </>
          )}
        </div>
        <button className="momma__toggle momma__toggle--corner" onClick={onToggleCollapse} title="Collapse ClaudeMomma">
          &#9650;
        </button>
      </div>
    );
  }

  return (
    <div className="momma">
      <div className="momma__header">
        <div className="momma__title-row">
          <span className="momma__title">ClaudeMomma</span>
          {state === "running" && (
            <span className="momma__status momma__status--active">ACTIVE</span>
          )}
          {state === "booting" && (
            <span className="momma__status momma__status--booting">STARTING</span>
          )}
          {hivemindDir && state !== "booting" && (
            <span className="momma__dir" title={hivemindDir}>{hivemindDir}</span>
          )}
        </div>
        <div className="momma__controls">
          <button className="momma__stop" onClick={stopMomma}>
            Stop
          </button>
          <button className="momma__toggle" onClick={onToggleCollapse} title="Collapse ClaudeMomma">
            &#9650;
          </button>
        </div>
      </div>
      {state === "booting" && (
        <div className="momma__booting">
          <div className="app__spinner" />
          <span>Waking up ClaudeMomma...</span>
        </div>
      )}
      {state === "running" && terminalId && (
        <div className="momma__terminal">
          <Terminal id={terminalId} isActive={true} fontSize={fontSize} />
        </div>
      )}
    </div>
  );
}
