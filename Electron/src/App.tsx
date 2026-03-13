import { useState, useCallback } from "react";
import Terminal from "./components/Terminal";
import TabBar from "./components/TabBar";
import "./App.css";

interface TerminalTab {
  id: string;
  title: string;
}

export default function App() {
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTab, setActiveTab] = useState<string>("");

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

  return (
    <div className="app">
      <div className="app__header">
        <h1 className="app__title">Hivemind</h1>
      </div>
      <TabBar
        tabs={tabs}
        activeTab={activeTab}
        onSelect={setActiveTab}
        onClose={closeTerminal}
        onNew={createTerminal}
      />
      <div className="app__terminals">
        {tabs.length === 0 ? (
          <div className="app__empty">
            <p>No terminals open</p>
            <button className="app__empty-btn" onClick={createTerminal}>
              Open a Terminal
            </button>
          </div>
        ) : (
          tabs.map((tab) => (
            <div
              key={tab.id}
              className="app__terminal-pane"
              style={{ display: tab.id === activeTab ? "block" : "none" }}
            >
              <Terminal id={tab.id} isActive={tab.id === activeTab} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
