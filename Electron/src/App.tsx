import { useState, useCallback, useEffect } from "react";
import Terminal from "./components/Terminal";
import Sidebar from "./components/Sidebar";
import ClaudeMomma from "./components/ClaudeMomma";
import ConfirmModal, { getRandomClaudeMessage } from "./components/ConfirmModal";
import "./App.css";

export type LayoutMode = "auto" | "single" | "columns" | "rows" | "grid-2x2" | "grid-3x3";

interface TerminalTab {
  id: string;
  title: string;
  cwd?: string;
  hadClaude?: boolean;
}

interface PendingClose {
  ids: string[];
  message: string;
}

export default function App() {
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTab, setActiveTab] = useState<string>("");
  const [layout, setLayout] = useState<LayoutMode>("auto");
  const [pendingClose, setPendingClose] = useState<PendingClose | null>(null);
  const [defaultCwd, setDefaultCwd] = useState<string>("");
  const [fontSize, setFontSize] = useState<number>(14);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [closing, setClosing] = useState(false);
  const [mommaCollapsed, setMommaCollapsed] = useState(false);
  const [restoreSession, setRestoreSession] = useState(true);
  const [autoStartMomma, setAutoStartMomma] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null); // terminal id or "momma"

  // Load persisted settings on mount
  useEffect(() => {
    window.settings.get().then((s) => {
      setLayout(s.layout as LayoutMode);
      setDefaultCwd(s.defaultCwd);
      setFontSize(s.fontSize);
      setRestoreSession(s.restoreSession);
      setAutoStartMomma(s.autoStartMomma);
      setSettingsLoaded(true);
    });
  }, []);

  // Restore previous session
  useEffect(() => {
    if (!settingsLoaded || !restoreSession) return;
    window.hivemind.getSession().then(async (session) => {
      if (!session || session.length === 0) return;
      const newTabs: TerminalTab[] = [];
      const claudeTerminalIds: string[] = [];
      for (const s of session) {
        const result = await window.terminal.create({ cols: 80, rows: 24, cwd: s.cwd });
        newTabs.push({ id: result.id, title: s.title });
        // If the title has a Claude name (e.g. "ClaudeZilla - Terradome"), Claude was running
        if (s.hadClaude) {
          claudeTerminalIds.push(result.id);
        }
      }
      if (newTabs.length > 0) {
        setTabs(newTabs);
        setActiveTab(newTabs[newTabs.length - 1].id);
        // Auto-start Claude in terminals that had it running
        for (const id of claudeTerminalIds) {
          setTimeout(() => {
            window.terminal.write(id, "claude\r");
          }, 1000);
        }
      }
    });
  }, [settingsLoaded]);

  // Persist layout changes
  const handleLayoutChange = useCallback((newLayout: LayoutMode) => {
    setLayout(newLayout);
    window.settings.set("layout", newLayout);
  }, []);

  // Persist default cwd changes
  const handleDefaultCwdChange = useCallback((cwd: string) => {
    setDefaultCwd(cwd);
    window.settings.set("defaultCwd", cwd);
  }, []);

  // Persist font size changes
  const handleFontSizeChange = useCallback((size: number) => {
    setFontSize(size);
    window.settings.set("fontSize", size);
  }, []);

  // Persist restore session toggle
  const handleRestoreSessionChange = useCallback((enabled: boolean) => {
    setRestoreSession(enabled);
    window.settings.set("restoreSession", enabled);
  }, []);

  // Escape key exits focus mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && focusedId) {
        setFocusedId(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [focusedId]);

  // Sidebar select exits focus mode
  const handleSidebarSelect = useCallback((id: string) => {
    if (focusedId) setFocusedId(null);
    setActiveTab(id);
  }, [focusedId]);

  const handleAutoStartMommaChange = useCallback((enabled: boolean) => {
    setAutoStartMomma(enabled);
    window.settings.set("autoStartMomma", enabled);
  }, []);

  const createTerminal = useCallback(async () => {
    const opts: { cols: number; rows: number; cwd?: string } = { cols: 80, rows: 24 };
    if (defaultCwd) {
      opts.cwd = defaultCwd;
    }
    const result = await window.terminal.create(opts);

    const newTab: TerminalTab = {
      id: result.id,
      title: `Terminal ${tabs.length + 1}`,
    };

    setTabs((prev) => [...prev, newTab]);
    setActiveTab(result.id);
  }, [tabs.length, defaultCwd]);

  const doKill = useCallback(
    (ids: string[]) => {
      for (const id of ids) {
        window.terminal.kill(id);
      }
      setTabs((prev) => {
        const filtered = prev.filter((t) => !ids.includes(t.id));
        if (ids.includes(activeTab)) {
          if (filtered.length > 0) {
            setActiveTab(filtered[filtered.length - 1].id);
          } else {
            setActiveTab("");
          }
        }
        return filtered;
      });
    },
    [activeTab]
  );

  const closeTerminal = useCallback(
    async (id: string) => {
      const hasClaude = await window.terminal.checkClaude(id);
      if (hasClaude) {
        setPendingClose({ ids: [id], message: getRandomClaudeMessage() });
      } else {
        doKill([id]);
      }
    },
    [doKill]
  );

  const closeAllTerminals = useCallback(async () => {
    setClosing(true);
    try {
      // Check sequentially in batches of 4 to avoid freezing from too many wmic calls
      let claudeCount = 0;
      for (let i = 0; i < tabs.length; i += 4) {
        const batch = tabs.slice(i, i + 4);
        const results = await Promise.all(
          batch.map((tab) => window.terminal.checkClaude(tab.id))
        );
        claudeCount += results.filter(Boolean).length;
      }

      if (claudeCount > 0) {
        const allIds = tabs.map((t) => t.id);
        const msg =
          claudeCount === 1
            ? getRandomClaudeMessage()
            : `${claudeCount} Claudes are working in these terminals. Terminate them all?`;
        setPendingClose({ ids: allIds, message: msg });
      } else {
        doKill(tabs.map((t) => t.id));
      }
    } finally {
      setClosing(false);
    }
  }, [tabs, doKill]);

  const confirmClose = useCallback(() => {
    if (pendingClose) {
      doKill(pendingClose.ids);
      setPendingClose(null);
    }
  }, [pendingClose, doKill]);

  const cancelClose = useCallback(() => {
    setPendingClose(null);
  }, []);

  const claudeNames = [
    "ClaudeZilla",
    "Sir Claude-a-Lot",
    "The Claudenator",
    "Claude Van Damme",
    "MC Claude",
    "Claude Atlas",
    "Claude Nine",
    "Cloudy McCloudeface",
    "El Claude",
    "Claude Almighty",
    "The Oracle of Claude",
    "Agent Claude",
    "DJ Claude",
    "Captain Claude",
    "Claude Norris",
  ];

  const getClaudeName = () =>
    claudeNames[Math.floor(Math.random() * claudeNames.length)];

  const onClaudeDetected = useCallback((id: string, folder: string) => {
    setTabs((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, title: `${getClaudeName()} - ${folder}`, hadClaude: true } : t
      )
    );
    // Auto-deliver the worker protocol to the new Claude
    window.hivemind.getDir().then((dir) => {
      const protocolPath = `${dir.replace(/\\/g, "/")}/worker-protocol.md`;
      setTimeout(() => {
        window.terminal.write(id, `Read and follow the Hivemind worker protocol at: ${protocolPath}\r`);
      }, 2000);
    });
  }, []);

  const onCwdChange = useCallback((id: string, cwd: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === id ? { ...t, cwd } : t))
    );
  }, []);

  // Keep terminals.json in sync for ClaudeMomma + save session
  useEffect(() => {
    const list = tabs.map((t) => ({ id: t.id, title: t.title }));
    window.hivemind.updateTerminals(list);
    // Only save non-empty sessions (empty = app closing, don't overwrite)
    if (list.length > 0) {
      const sessionList = tabs.map((t) => ({ id: t.id, title: t.title, cwd: t.cwd || "", hadClaude: t.hadClaude || false }));
      window.hivemind.saveSession(sessionList);
    }
  }, [tabs]);

  const visibleTabs = layout === "single"
    ? tabs.filter((t) => t.id === activeTab)
    : tabs;

  if (!settingsLoaded) return null;

  return (
    <div className="app">
      <Sidebar
        tabs={tabs}
        activeTab={activeTab}
        layout={layout}
        collapsed={sidebarCollapsed}
        defaultCwd={defaultCwd}
        fontSize={fontSize}
        onSelect={handleSidebarSelect}
        onClose={closeTerminal}
        onCloseAll={closeAllTerminals}
        onNew={createTerminal}
        onLayoutChange={handleLayoutChange}
        onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
        onDefaultCwdChange={handleDefaultCwdChange}
        onFontSizeChange={handleFontSizeChange}
        restoreSession={restoreSession}
        onRestoreSessionChange={handleRestoreSessionChange}
        autoStartMomma={autoStartMomma}
        onAutoStartMommaChange={handleAutoStartMommaChange}
      />
      <div className="app__main">
        <ClaudeMomma
          fontSize={fontSize}
          collapsed={mommaCollapsed}
          autoStart={settingsLoaded && autoStartMomma}
          focused={focusedId === "momma"}
          onToggleCollapse={() => setMommaCollapsed((prev) => !prev)}
          onDoubleClick={() => setFocusedId((prev) => (prev === "momma" ? null : "momma"))}
        />
        <div className="app__content">
          {closing && (
            <div className="app__loading-overlay">
              <div className="app__spinner" />
              <span>Closing terminals...</span>
            </div>
          )}
          {tabs.length === 0 ? (
            <div className="app__empty">
              <p>No terminals open</p>
              <button className="app__empty-btn" onClick={createTerminal}>
                Open a Terminal
              </button>
            </div>
          ) : (
            <div className={`app__grid app__grid--${layout}`}>
              {visibleTabs.map((tab) => (
                <div
                  key={tab.id}
                  className={`app__grid-cell ${tab.id === activeTab ? "app__grid-cell--active" : ""} ${focusedId === tab.id ? "app__grid-cell--focused" : ""}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <div className="app__grid-header" onDoubleClick={() => setFocusedId((prev) => (prev === tab.id ? null : tab.id))}>
                    <span className="app__grid-title">{tab.title}</span>
                    <button
                      className="app__grid-close"
                      onClick={(e) => {
                        e.stopPropagation();
                        closeTerminal(tab.id);
                      }}
                      title="Close terminal"
                    >
                      ×
                    </button>
                  </div>
                  <div className="app__grid-terminal">
                    <Terminal id={tab.id} isActive={layout === "single" || true} fontSize={fontSize} onClaudeDetected={onClaudeDetected} onCwdChange={onCwdChange} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {pendingClose && (
        <ConfirmModal
          message={pendingClose.message}
          onConfirm={confirmClose}
          onCancel={cancelClose}
        />
      )}
      {focusedId && (
        <div className="app__focus-overlay">
          <div className="app__focus-header">
            <span className="app__focus-title">
              {focusedId === "momma" ? "ClaudeMomma" : tabs.find((t) => t.id === focusedId)?.title || "Terminal"}
            </span>
            <div className="app__focus-hints">
              <span className="app__focus-hint">Esc or double-click to exit</span>
              <button className="app__focus-exit" onClick={() => setFocusedId(null)} title="Exit focus (Esc)">
                Exit Focus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
