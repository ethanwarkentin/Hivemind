import { useState, useEffect, useRef } from "react";

interface FightState {
  status: "active" | "paused" | "resolved";
  fight_name: string;
  round: number;
  turn: "fighter1" | "fighter2" | "momma";
  fighters: {
    fighter1: { title: string; terminal_id: string };
    fighter2: { title: string; terminal_id: string };
  };
  summary: string;
}

interface LogEntry {
  round: number;
  turn: string;
  summary: string;
}

interface FightPanelProps {
  fight: FightState;
  onPause: () => void;
  onResume: () => void;
  onResolve: (resolution?: string) => void;
  onMessage: (message: string) => void;
  onEnd: () => void;
}

export default function FightPanel({ fight, onPause, onResume, onResolve, onMessage, onEnd }: FightPanelProps) {
  const [input, setInput] = useState("");
  const [log, setLog] = useState<LogEntry[]>([]);
  const lastSummaryRef = useRef("");
  const logEndRef = useRef<HTMLDivElement>(null);

  // Append new summaries to the log as they come in
  useEffect(() => {
    if (fight.summary && fight.summary !== lastSummaryRef.current) {
      lastSummaryRef.current = fight.summary;
      setLog((prev) => [...prev, { round: fight.round, turn: fight.turn, summary: fight.summary }]);
    }
  }, [fight.summary, fight.round, fight.turn]);

  // Auto-scroll to bottom of log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log]);

  const handleSend = () => {
    if (!input.trim()) return;
    onMessage(input.trim());
    setLog((prev) => [...prev, { round: fight.round, turn: "you", summary: input.trim() }]);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const turnLabel =
    fight.turn === "fighter1"
      ? fight.fighters.fighter1.title
      : fight.turn === "fighter2"
        ? fight.fighters.fighter2.title
        : "Momma";

  return (
    <div className="fight-panel" onClick={(e) => e.stopPropagation()}>
      <div className="fight-panel__header">
        <span className="fight-panel__badge">
          {fight.status === "active" ? "ROUND " + fight.round : fight.status === "paused" ? "PAUSED" : "RESOLVED"}
        </span>
        <span className="fight-panel__name">{fight.fight_name}</span>
      </div>

      <div className="fight-panel__fighters">
        <div className={`fight-panel__fighter ${fight.turn === "fighter1" ? "fight-panel__fighter--active" : ""}`}>
          <span className="fight-panel__fighter-label">F1</span>
          <span className="fight-panel__fighter-name">{fight.fighters.fighter1.title}</span>
        </div>
        <span className="fight-panel__vs">vs</span>
        <div className={`fight-panel__fighter ${fight.turn === "fighter2" ? "fight-panel__fighter--active" : ""}`}>
          <span className="fight-panel__fighter-label">F2</span>
          <span className="fight-panel__fighter-name">{fight.fighters.fighter2.title}</span>
        </div>
      </div>

      <div className="fight-panel__log">
        {log.length === 0 && (
          <div className="fight-panel__log-empty">Waiting for Momma to start the fight...</div>
        )}
        {log.map((entry, i) => (
          <div key={i} className={`fight-panel__log-entry${entry.turn === "you" ? " fight-panel__log-entry--user" : ""}`}>
            <span className="fight-panel__log-round">
              {entry.turn === "you" ? "You" : `R${entry.round}`}
            </span>
            <span className="fight-panel__log-text">{entry.summary}</span>
          </div>
        ))}
        <div ref={logEndRef} />
      </div>

      <div className="fight-panel__turn">
        {fight.status === "active" && <>Waiting on: <strong>{turnLabel}</strong></>}
        {fight.status === "paused" && "Fight paused"}
        {fight.status === "resolved" && "Fight resolved"}
      </div>

      <div className="fight-panel__controls">
        {fight.status === "active" && (
          <button className="fight-panel__btn fight-panel__btn--pause" onClick={onPause}>
            Pause
          </button>
        )}
        {fight.status === "paused" && (
          <button className="fight-panel__btn fight-panel__btn--resume" onClick={onResume}>
            Resume
          </button>
        )}
        {fight.status !== "resolved" && (
          <button className="fight-panel__btn fight-panel__btn--resolve" onClick={() => onResolve()}>
            End Fight
          </button>
        )}
        {fight.status === "resolved" && (
          <button className="fight-panel__btn fight-panel__btn--end" onClick={onEnd}>
            Dismiss
          </button>
        )}
      </div>

      {fight.status !== "resolved" && (
        <div className="fight-panel__input-area">
          <input
            className="fight-panel__input"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Talk to Momma..."
            spellCheck={false}
          />
          <button className="fight-panel__send" onClick={handleSend} disabled={!input.trim()}>
            Send
          </button>
        </div>
      )}
    </div>
  );
}
