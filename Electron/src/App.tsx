import { useState, useCallback, useEffect, useRef } from "react";
import Terminal from "./components/Terminal";
import Sidebar from "./components/Sidebar";
import ConfirmModal, { getRandomClaudeMessage } from "./components/ConfirmModal";
import FightModal from "./components/FightModal";
import FightPanel from "./components/FightPanel";
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

const isDev = window.location.hostname === "localhost";

export default function App() {
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTab, setActiveTab] = useState<string>("");
  const [layout, setLayout] = useState<LayoutMode>("auto");
  const [pendingClose, setPendingClose] = useState<PendingClose | null>(null);
  const [defaultCwd, setDefaultCwd] = useState<string>("");
  const [fontSize, setFontSize] = useState<number>(14);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [restoreSession, setRestoreSession] = useState(true);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [sessionRestoreAttempted, setSessionRestoreAttempted] = useState(false);
  const [loadingTerminals, setLoadingTerminals] = useState<Map<string, string>>(new Map());
  const [theme, setTheme] = useState<string>("dark");
  const [fightModalOpen, setFightModalOpen] = useState(false);
  const [activeFight, setActiveFight] = useState<FightState | null>(null);
  const [mommaTabId, setMommaTabId] = useState<string | null>(null);
  const mommaTabIdRef = useRef<string | null>(null);

  const claudeStartupMessages = [
    "Waking up your favorite AI child...",
    "Summoning Claude from the digital void...",
    "Brewing some artificial intelligence...",
    "Convincing Claude to get out of bed...",
    "Loading sass and sarcasm modules...",
    "Teaching Claude to tie its virtual shoes...",
    "Downloading Claude's morning coffee...",
    "Reticulating splines... just kidding, starting Claude...",
    "Assembling Claude's army of tokens...",
    "Polishing Claude's neural pathways...",
    "Warming up the language model...",
    "Giving Claude a pep talk...",
    "Claude is putting on its thinking cap...",
    "Charging Claude's creativity batteries...",
    "Feeding Claude its training data breakfast...",
  ];

  const getRandomStartupMessage = () =>
    claudeStartupMessages[Math.floor(Math.random() * claudeStartupMessages.length)];

  // Load persisted settings on mount
  useEffect(() => {
    window.settings.get().then((s) => {
      setLayout(s.layout as LayoutMode);
      setDefaultCwd(s.defaultCwd);
      setFontSize(s.fontSize);
      setRestoreSession(s.restoreSession);
      setTheme(s.theme || "dark");
      setSettingsLoaded(true);
    });
  }, []);

  // Restore previous session
  useEffect(() => {
    if (!settingsLoaded) return;
    if (!restoreSession) {
      setSessionRestoreAttempted(true);
      return;
    }
    window.hivemind.getSession().then(async (session) => {
      if (!session || session.length === 0) {
        setSessionRestoreAttempted(true);
        return;
      }
      const newTabs: TerminalTab[] = [];
      const claudeTerminalIds: string[] = [];
      for (const s of session) {
        const result = await window.terminal.create({ cols: 80, rows: 24, cwd: s.cwd || undefined });
        newTabs.push({ id: result.id, title: s.title, cwd: result.cwd, hadClaude: s.hadClaude });
        if (s.hadClaude) {
          claudeTerminalIds.push(result.id);
        }
      }
      if (newTabs.length > 0) {
        setTabs(newTabs);
        setActiveTab(newTabs[newTabs.length - 1].id);
        // Auto-start Claude in terminals that had it running
        if (claudeTerminalIds.length > 0) {
          // Set loading state with funny messages
          const newLoadingMap = new Map<string, string>();
          for (const id of claudeTerminalIds) {
            newLoadingMap.set(id, getRandomStartupMessage());
          }
          setLoadingTerminals(newLoadingMap);

          // Start Claude after a short delay
          for (const id of claudeTerminalIds) {
            setTimeout(() => {
              window.terminal.write(id, "claude\r");
            }, 1000);
          }
        }
      }
      setSessionRestoreAttempted(true);
    });
  }, [settingsLoaded, restoreSession]);

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

  // Listen for fight state updates from main process
  useEffect(() => {
    window.fight.onStateUpdate((state: FightState) => {
      setActiveFight(state);
    });
    return () => {
      window.fight.removeAllListeners();
    };
  }, []);

  const startFight = useCallback(
    async (fighter1Id: string, fighter2Id: string, name: string, description: string) => {
      const fighter1Tab = tabs.find((t) => t.id === fighter1Id);
      const fighter2Tab = tabs.find((t) => t.id === fighter2Id);
      if (!fighter1Tab || !fighter2Tab) return;

      setFightModalOpen(false);

      const result = await window.fight.create({
        name,
        description,
        fighter1: { title: fighter1Tab.title, terminal_id: fighter1Id },
        fighter2: { title: fighter2Tab.title, terminal_id: fighter2Id },
      });

      // Add Momma's terminal as a tab
      const mommaTab: TerminalTab = {
        id: result.mommaTerminal.id,
        title: "CLAUDE MOMMA",
        cwd: result.mommaTerminal.cwd,
      };
      setTabs((prev) => [...prev, mommaTab]);
      setActiveTab(result.mommaTerminal.id);
      setMommaTabId(result.mommaTerminal.id);
      mommaTabIdRef.current = result.mommaTerminal.id;
      setActiveFight(result.fightState);

      // Start Claude in Momma's terminal after a short delay
      // User will approve the trust prompt manually
      // onClaudeDetected sends Momma her first instruction once Claude fully starts
      setTimeout(() => {
        window.terminal.write(result.mommaTerminal.id, "claude\r");
      }, 1000);
    },
    [tabs]
  );

  // Sidebar select exits focus mode
  const handleSidebarSelect = useCallback((id: string) => {
    if (focusedId) setFocusedId(null);
    setActiveTab(id);
  }, [focusedId]);

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

  // Persist theme changes
  const handleThemeChange = useCallback((newTheme: string) => {
    setTheme(newTheme);
    window.settings.set("theme", newTheme);
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
      cwd: result.cwd,
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
    (id: string) => {
      // Use the hadClaude flag tracked from terminal output detection
      const tab = tabs.find((t) => t.id === id);
      if (tab?.hadClaude) {
        setPendingClose({ ids: [id], message: getRandomClaudeMessage() });
      } else {
        doKill([id]);
      }
    },
    [tabs, doKill]
  );

  const closeAllTerminals = useCallback(() => {
    // Count terminals that have had Claude running
    const claudeTabs = tabs.filter((t) => t.hadClaude);
    const claudeCount = claudeTabs.length;

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

  const mommaInstructionSent = useRef(false);

  const onClaudeDetected = useCallback((id: string, folder: string) => {
    // Check if this is Momma before entering setTabs
    const isMommaTerminal = id === mommaTabIdRef.current;

    if (isMommaTerminal && !mommaInstructionSent.current) {
      mommaInstructionSent.current = true;
      window.fight.sendPrompt(id, "A fight has been initiated. Read 00_context.md and state.json in this folder. Begin orchestrating by updating state.json with the opening prompt for Fighter 1. Set turn to fighter1, write a clear next_prompt with full file paths, and set prompt_seq to 1.");
    }

    setTabs((prev) => {
      if (isMommaTerminal) {
        return prev.map((t) =>
          t.id === id ? { ...t, hadClaude: true } : t
        );
      }
      const usedNames = new Set(prev.map((t) => t.title.split(" - ")[0]));
      const available = claudeNames.filter((n) => !usedNames.has(n));
      const pool = available.length > 0 ? available : claudeNames;
      const name = pool[Math.floor(Math.random() * pool.length)];
      return prev.map((t) =>
        t.id === id ? { ...t, title: `${name} - ${folder}`, hadClaude: true } : t
      );
    });
    // Clear loading state for this terminal
    setLoadingTerminals((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const onCwdChange = useCallback((id: string, cwd: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === id ? { ...t, cwd } : t))
    );
  }, []);

  // Save session whenever tabs change (including empty to clear session)
  // Only save after we've attempted to restore, to avoid wiping stored session on mount
  useEffect(() => {
    if (!sessionRestoreAttempted) return;
    const sessionList = tabs.map((t) => ({ id: t.id, title: t.title, cwd: t.cwd || "", hadClaude: t.hadClaude || false }));
    window.hivemind.saveSession(sessionList);
  }, [tabs, sessionRestoreAttempted]);

  const visibleTabs = layout === "single"
    ? tabs.filter((t) => t.id === activeTab)
    : tabs;

  if (!settingsLoaded) return null;

  return (
    <div className={`app${theme === "paulino" ? " app--paulino" : ""}`}>
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
        theme={theme}
        onThemeChange={handleThemeChange}
        onStartFight={() => setFightModalOpen(true)}
        hasFight={activeFight !== null && activeFight.status !== "resolved"}
        mommaTabId={mommaTabId}
      />
      <div className="app__main">
        {isDev && (
          <div className="app__dev-banner">DEV BUILD</div>
        )}
        {tabs.length === 0 ? (
          <div className="app__empty">
            <p>No terminals open</p>
            <button className="app__empty-btn" onClick={createTerminal}>
              Open a Terminal
            </button>
          </div>
        ) : (
          <div className={`app__grid app__grid--${layout}${visibleTabs.length + (activeFight ? 1 : 0) === 1 ? ' app__grid--single-item' : ''}`}>
            {visibleTabs.map((tab) => (
              <div
                key={tab.id}
                className={`app__grid-cell ${tab.id === activeTab ? "app__grid-cell--active" : ""} ${focusedId === tab.id ? "app__grid-cell--focused" : ""}${tab.id === mommaTabId ? " app__grid-cell--momma" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <div className="app__grid-header" onDoubleClick={() => setFocusedId((prev) => (prev === tab.id ? null : tab.id))}>
                  <span className={`app__grid-title${tab.id === mommaTabId ? " app__grid-title--momma" : ""}`}>{tab.title}</span>
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
                  <Terminal id={tab.id} isActive={layout === "single" || true} fontSize={fontSize} theme={theme} onClaudeDetected={onClaudeDetected} onCwdChange={onCwdChange} />
                </div>
                {loadingTerminals.has(tab.id) && (
                  <div className="app__terminal-loading">
                    <div className="app__terminal-loading-spinner" />
                    <span className="app__terminal-loading-message">{loadingTerminals.get(tab.id)}</span>
                  </div>
                )}
              </div>
            ))}
            {activeFight && (
              <div className="app__grid-cell app__grid-cell--fight">
                <FightPanel
                  fight={activeFight}
                  onPause={() => window.fight.pause()}
                  onResume={() => window.fight.resume()}
                  onResolve={(resolution) => window.fight.resolve(resolution)}
                  onMessage={(msg) => window.fight.message(msg)}
                  onEnd={() => {
                    window.fight.end();
                    setActiveFight(null);
                    setMommaTabId(null);
                    mommaTabIdRef.current = null;
                    mommaInstructionSent.current = false;
                  }}
                />
              </div>
            )}
          </div>
        )}
      </div>
      {pendingClose && (
        <ConfirmModal
          message={pendingClose.message}
          onConfirm={confirmClose}
          onCancel={cancelClose}
        />
      )}
      {fightModalOpen && (
        <FightModal
          tabs={tabs}
          onStart={startFight}
          onCancel={() => setFightModalOpen(false)}
        />
      )}
      {focusedId && (
        <div className="app__focus-overlay">
          <div className="app__focus-header" onDoubleClick={() => setFocusedId(null)}>
            <span className="app__focus-title">
              {tabs.find((t) => t.id === focusedId)?.title || "Terminal"}
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
