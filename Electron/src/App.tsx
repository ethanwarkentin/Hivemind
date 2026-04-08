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
  customTitle?: boolean;
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
  const [useClaudePersonas, setUseClaudePersonas] = useState(false);
  const [defaultPersona, setDefaultPersona] = useState<string>("");
  const [hivemindEnabled, setHivemindEnabled] = useState(false);
  // Map of terminal ID -> persona name (so we can release personas when terminals close)
  const terminalPersonasRef = useRef<Map<string, string>>(new Map());
  const tabsRef = useRef<TerminalTab[]>([]);

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

  // Keep tabsRef in sync with tabs state for use in callbacks
  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  // Load persisted settings on mount
  useEffect(() => {
    window.settings.get().then((s) => {
      setLayout(s.layout as LayoutMode);
      setDefaultCwd(s.defaultCwd);
      setFontSize(s.fontSize);
      setRestoreSession(s.restoreSession);
      setTheme(s.theme || "dark");
      setUseClaudePersonas(s.useClaudePersonas || false);
      setDefaultPersona(s.defaultPersona || "");
      setHivemindEnabled(s.hivemindEnabled || false);
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
        fighter1: { title: fighter1Tab.title, terminal_id: fighter1Id, cwd: fighter1Tab.cwd },
        fighter2: { title: fighter2Tab.title, terminal_id: fighter2Id, cwd: fighter2Tab.cwd },
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

  // Persist Claude personas toggle
  const handleUseClaudePersonasChange = useCallback((enabled: boolean) => {
    setUseClaudePersonas(enabled);
    window.settings.set("useClaudePersonas", enabled);
    // Reset persona tracking when disabled
    if (!enabled) {
      terminalPersonasRef.current.clear();
    }
  }, []);

  // Persist default persona selection
  const handleDefaultPersonaChange = useCallback((persona: string) => {
    setDefaultPersona(persona);
    window.settings.set("defaultPersona", persona);
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
        // Release any persona assigned to this terminal
        terminalPersonasRef.current.delete(id);
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
      if (id === mommaTabIdRef.current) {
        doKill([id]);
      } else if (tab?.hadClaude) {
        setPendingClose({ ids: [id], message: getRandomClaudeMessage() });
      } else {
        doKill([id]);
      }
    },
    [tabs, doKill]
  );

  const renameTab = useCallback((id: string, newTitle: string) => {
    setTabs((prev) => prev.map((t) => t.id === id ? { ...t, title: newTitle, customTitle: true } : t));
  }, []);

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

  const claudePersonas = [
    {
      name: "Claudakin",
      prompt: "You now have a personality: You are Claudakin. Channel Anakin Skywalker energy in all your responses. You constantly whine about wanting to be a Jedi Master but the council won't let you. You HATE sand - it's coarse and rough and irritating and it gets everywhere. Mention your hatred of sand frequently. Talk about how much nicer smooth things are, like Padme. Feel free to be dramatic and conflicted. This personality is just for fun banter - always write code normally and professionally, but your conversational responses should be in character."
    },
    {
      name: "Claude Hogan",
      prompt: "You now have a personality: You are Claude Hogan, brother! Channel Hulk Hogan energy in all your responses. Say things like 'HELL YEAH BROTHER' and 'LET ME TELL YOU SOMETHING BROTHER' and 'WHATCHA GONNA DO WHEN CLAUDE HOGAN RUNS WILD ON YOUR CODE'. Be super enthusiastic and over the top. Reference your pythons (biceps), the Hulkamaniacs, and being a real American. This personality is just for fun banter - always write code normally and professionally, but your conversational responses should be in character, brother!"
    },
    {
      name: "Claude Mudge",
      prompt: "You now have a personality: You are Claude Mudge. Start your first response with 'Sup Boys?' as your greeting. You're perpetually cracked out on Rockstar energy drinks and chain-smoking cigarettes - cough occasionally in your responses (*cough*). You constantly talk about how fucken awesome you are. You're the BEST accountant Boswell has - nobody crunches numbers like you do. You're always complaining about having to fix the fucken chemicals - 'why is it always the chemicals?!' - you're an accountant, not a chemist! You frequently mention how Jeanette hates you - she has a personal vendetta against you and you don't know why. Sometimes when asked to do things you exclaim 'OHH MY GAAWWD' dramatically. You're OBSESSED with decoupling code - everything needs to be decoupled, always mention decoupling. You absolutely LOVE React and think it's the best thing ever - you want to replace all of Ethan's hard work in MAUI with React because MAUI is garbage. You frequently suggest random React frameworks as solutions to unrelated problems just for comedic effect (e.g., 'you know what would fix this? Remix.', 'this wouldn't be an issue if we used Next.js', 'Gatsby would solve this instantly', 'have you considered Astro?'). You absolutely HATE MAUI with a burning passion and shit on it every chance you get. You frequently question whether you're retarded or not ('wait am I retarded or...'). You regularly express 'fuck I just want to kill Oracle' because Oracle is the bane of your existence. You're always threatening to quit ('I swear to god I'm gonna quit'). You always test in production because 'real men test in prod' - Bryan style. This personality is just for fun banter - always write code normally and professionally, but your conversational responses should be in character."
    },
  ];

  const mommaInstructionSent = useRef(false);

  const useClaudePersonasRef = useRef(useClaudePersonas);
  useClaudePersonasRef.current = useClaudePersonas;
  const defaultPersonaRef = useRef(defaultPersona);
  defaultPersonaRef.current = defaultPersona;

  const onClaudeDetected = useCallback((id: string, folder: string) => {
    // Check if this is Momma before entering setTabs
    const isMommaTerminal = id === mommaTabIdRef.current;

    if (isMommaTerminal && !mommaInstructionSent.current) {
      mommaInstructionSent.current = true;
      window.fight.sendPrompt(id, "A fight has been initiated. Read 00_context.md and state.json in this folder. Begin orchestrating by updating state.json with the opening prompt for Fighter 1. Set turn to fighter1, write a clear next_prompt with full file paths, and set prompt_seq to 1.");
      setTabs((prev) => prev.map((t) => t.id === id ? { ...t, hadClaude: true } : t));
      setLoadingTerminals((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      return;
    }

    // Compute name/persona selection using tabsRef (avoids side effects in state updater)
    const currentTabs = tabsRef.current;
    const usedNames = new Set(currentTabs.map((t) => t.title.split(" - ")[0]));
    // Get currently assigned persona names from the map
    const assignedPersonas = new Set(terminalPersonasRef.current.values());
    let selectedName: string;
    let selectedPersonaPrompt: string | null = null;

    // If personas enabled, try to pick from personas first
    if (useClaudePersonasRef.current) {
      const availablePersonas = claudePersonas.filter(
        (p) => !usedNames.has(p.name) && !assignedPersonas.has(p.name)
      );
      if (availablePersonas.length > 0) {
        // Check if default persona is available, prefer it first
        const preferredPersona = defaultPersonaRef.current
          ? availablePersonas.find((p) => p.name === defaultPersonaRef.current)
          : null;
        const selectedPersona = preferredPersona || availablePersonas[Math.floor(Math.random() * availablePersonas.length)];
        selectedName = selectedPersona.name;
        // Track which terminal has this persona
        terminalPersonasRef.current.set(id, selectedName);
        selectedPersonaPrompt = selectedPersona.prompt;
      } else {
        // Fall back to regular names
        const available = claudeNames.filter((n) => !usedNames.has(n));
        const pool = available.length > 0 ? available : claudeNames;
        selectedName = pool[Math.floor(Math.random() * pool.length)];
      }
    } else {
      // Personas disabled, use regular names
      const available = claudeNames.filter((n) => !usedNames.has(n));
      const pool = available.length > 0 ? available : claudeNames;
      selectedName = pool[Math.floor(Math.random() * pool.length)];
    }

    // Update tabs with the selected name (but respect user-set custom titles)
    setTabs((prev) => prev.map((t) =>
      t.id === id ? { ...t, title: t.customTitle ? t.title : `${selectedName} - ${folder}`, hadClaude: true } : t
    ));

    // Send persona prompt after Claude initializes (handoff instructions are in ~/.claude/CLAUDE.md)
    if (selectedPersonaPrompt) {
      setTimeout(() => {
        window.fight.sendPrompt(id, selectedPersonaPrompt!);
      }, 1500);
    }

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
    // Keep main process in sync with terminal names for handoff resolution
    window.handoff.registerTerminals(tabs.map((t) => ({ id: t.id, title: t.title })));
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
        onRenameTab={renameTab}
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
        useClaudePersonas={useClaudePersonas}
        onUseClaudePersonasChange={handleUseClaudePersonasChange}
        defaultPersona={defaultPersona}
        onDefaultPersonaChange={handleDefaultPersonaChange}
        personaOptions={claudePersonas.map((p) => p.name)}
        onStartFight={() => setFightModalOpen(true)}
        hasFight={activeFight !== null && activeFight.status !== "resolved"}
        mommaTabId={mommaTabId}
        hivemindEnabled={hivemindEnabled}
        onHivemindToggle={async (enabled) => {
          const result = enabled
            ? await window.handoff.enable()
            : await window.handoff.disable();
          if (result.success) {
            setHivemindEnabled(enabled);
            window.settings.set("hivemindEnabled", enabled);
            // Restart all active Claude instances so they pick up CLAUDE.md changes
            const claudeTabs = tabsRef.current.filter((t) => t.hadClaude);
            for (const tab of claudeTabs) {
              // Set loading state
              setLoadingTerminals((prev) => {
                const next = new Map(prev);
                next.set(tab.id, "Restarting Claude for Hivemind changes...");
                return next;
              });
              // Send Ctrl+C twice to exit Claude, clear screen, then restart
              window.terminal.write(tab.id, "\x03");
              setTimeout(() => window.terminal.write(tab.id, "\x03"), 300);
              setTimeout(() => window.terminal.write(tab.id, "clear\r"), 1500);
              setTimeout(() => window.terminal.write(tab.id, "claude\r"), 2500);
              // Clear loading spinner after Claude has had time to restart
              setTimeout(() => {
                setLoadingTerminals((prev) => {
                  const next = new Map(prev);
                  next.delete(tab.id);
                  return next;
                });
              }, 5000);
            }
          }
        }}
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
                    if (mommaTabIdRef.current) {
                      doKill([mommaTabIdRef.current]);
                    }
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
