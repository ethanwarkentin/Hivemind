import { useState, useCallback, useEffect } from "react";
import Terminal from "./Terminal";

interface ClaudeMommaProps {
  fontSize: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

type MommaState = "idle" | "checking" | "ready" | "running" | "error";

export default function ClaudeMomma({ fontSize, collapsed, onToggleCollapse }: ClaudeMommaProps) {
  const [state, setState] = useState<MommaState>("idle");
  const [terminalId, setTerminalId] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState("");
  const [hivemindDir, setHivemindDir] = useState("");

  useEffect(() => {
    window.hivemind.getDir().then(setHivemindDir);
  }, []);

  const startMomma = useCallback(async () => {
    setState("checking");
    const { installed, version } = await window.hivemind.checkClaude();

    if (!installed) {
      setState("error");
      setErrorMsg(
        "ClaudeMomma needs Claude Code installed to be the big boss. Install it with: npm install -g @anthropic-ai/claude-code"
      );
      return;
    }

    setState("ready");

    // Create a terminal in the .hivemind directory
    const dir = await window.hivemind.getDir();
    const result = await window.terminal.create({ cols: 80, rows: 10, cwd: dir });
    setTerminalId(result.id);
    setState("running");

    // Auto-type claude command
    setTimeout(() => {
      window.terminal.write(result.id, "claude\n");
    }, 500);
  }, []);

  const stopMomma = useCallback(() => {
    if (terminalId) {
      window.terminal.kill(terminalId);
      setTerminalId("");
      setState("idle");
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

  return (
    <div className="momma">
      <div className="momma__header">
        <div className="momma__title-row">
          <span className="momma__title">ClaudeMomma</span>
          {state === "running" && (
            <span className="momma__status momma__status--active">ACTIVE</span>
          )}
          {hivemindDir && (
            <span className="momma__dir" title={hivemindDir}>{hivemindDir}</span>
          )}
        </div>
        <div className="momma__controls">
          {state === "idle" && (
            <button className="momma__start" onClick={startMomma}>
              Start ClaudeMomma
            </button>
          )}
          {state === "checking" && (
            <span className="momma__checking">Checking for Claude...</span>
          )}
          {state === "error" && (
            <>
              <span className="momma__error">{errorMsg}</span>
              <button className="momma__start" onClick={() => setState("idle")}>
                Retry
              </button>
            </>
          )}
          {state === "running" && (
            <button className="momma__stop" onClick={stopMomma}>
              Stop
            </button>
          )}
          <button className="momma__toggle" onClick={onToggleCollapse} title="Collapse ClaudeMomma">
            &#9650;
          </button>
        </div>
      </div>
      {state === "running" && terminalId && (
        <div className="momma__terminal">
          <Terminal id={terminalId} isActive={true} fontSize={fontSize} />
        </div>
      )}
    </div>
  );
}
