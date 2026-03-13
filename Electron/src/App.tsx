import { useState, useCallback, useEffect } from "react";
import Terminal from "./components/Terminal";
import Sidebar from "./components/Sidebar";
import Settings from "./components/Settings";
import ConfirmModal, { getRandomClaudeMessage } from "./components/ConfirmModal";
import "./App.css";

export type LayoutMode = "auto" | "single" | "columns" | "rows" | "grid-2x2" | "grid-3x3";

interface TerminalTab {
  id: string;
  title: string;
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

  // Load persisted settings on mount
  useEffect(() => {
    window.settings.get().then((s) => {
      setLayout(s.layout as LayoutMode);
      setDefaultCwd(s.defaultCwd);
      setFontSize(s.fontSize);
      setSettingsLoaded(true);
    });
  }, []);

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
    const checks = await Promise.all(
      tabs.map(async (tab) => ({
        id: tab.id,
        hasClaude: await window.terminal.checkClaude(tab.id),
      }))
    );

    const claudeCount = checks.filter((c) => c.hasClaude).length;

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

  const getClaudeName = () =>
    claudeNames[Math.floor(Math.random() * claudeNames.length)];

  const onClaudeDetected = useCallback((id: string, folder: string) => {
    setTabs((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, title: `${getClaudeName()} - ${folder}` } : t
      )
    );
  }, []);

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
        onSelect={setActiveTab}
        onClose={closeTerminal}
        onCloseAll={closeAllTerminals}
        onNew={createTerminal}
        onLayoutChange={handleLayoutChange}
        onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
      />
      <div className="app__main">
        {tabs.length === 0 ? (
          <div className="app__empty">
            <p>No terminals open</p>
            <button className="app__empty-btn" onClick={createTerminal}>
              Open a Terminal
            </button>
            <Settings
              defaultCwd={defaultCwd}
              fontSize={fontSize}
              onDefaultCwdChange={handleDefaultCwdChange}
              onFontSizeChange={handleFontSizeChange}
            />
          </div>
        ) : (
          <div className={`app__grid app__grid--${layout}`}>
            {visibleTabs.map((tab) => (
              <div
                key={tab.id}
                className={`app__grid-cell ${tab.id === activeTab ? "app__grid-cell--active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <div className="app__grid-header">
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
                  <Terminal id={tab.id} isActive={layout === "single" || true} fontSize={fontSize} onClaudeDetected={onClaudeDetected} />
                </div>
              </div>
            ))}
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
    </div>
  );
}
