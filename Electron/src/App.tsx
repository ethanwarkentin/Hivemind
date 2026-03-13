import { useState, useCallback } from "react";
import Terminal from "./components/Terminal";
import Sidebar from "./components/Sidebar";
import "./App.css";

export type LayoutMode = "auto" | "single" | "columns" | "rows" | "grid-2x2" | "grid-3x3";

interface TerminalTab {
  id: string;
  title: string;
}

export default function App() {
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTab, setActiveTab] = useState<string>("");
  const [layout, setLayout] = useState<LayoutMode>("auto");

  const createTerminal = useCallback(async () => {
    const result = await window.terminal.create({ cols: 80, rows: 24 });

    const newTab: TerminalTab = {
      id: result.id,
      title: `Terminal ${tabs.length + 1}`,
    };

    setTabs((prev) => [...prev, newTab]);
    setActiveTab(result.id);
  }, [tabs.length]);

  const closeTerminal = useCallback(
    (id: string) => {
      window.terminal.kill(id);
      setTabs((prev) => {
        const filtered = prev.filter((t) => t.id !== id);
        if (activeTab === id && filtered.length > 0) {
          setActiveTab(filtered[filtered.length - 1].id);
        } else if (filtered.length === 0) {
          setActiveTab("");
        }
        return filtered;
      });
    },
    [activeTab]
  );

  const closeAllTerminals = useCallback(() => {
    for (const tab of tabs) {
      window.terminal.kill(tab.id);
    }
    setTabs([]);
    setActiveTab("");
  }, [tabs]);

  const visibleTabs = layout === "single"
    ? tabs.filter((t) => t.id === activeTab)
    : tabs;

  return (
    <div className="app">
      <Sidebar
        tabs={tabs}
        activeTab={activeTab}
        layout={layout}
        onSelect={setActiveTab}
        onClose={closeTerminal}
        onCloseAll={closeAllTerminals}
        onNew={createTerminal}
        onLayoutChange={setLayout}
      />
      <div className="app__main">
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
                  <Terminal id={tab.id} isActive={layout === "single" || true} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
