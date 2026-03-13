import { useState, useCallback } from "react";
import { useSocket } from "./hooks/useSocket";
import Terminal from "./components/Terminal";
import TabBar from "./components/TabBar";
import "./App.css";

interface TerminalTab {
  id: string;
  title: string;
}

export default function App() {
  const socket = useSocket();
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTab, setActiveTab] = useState<string>("");

  const createTerminal = useCallback(() => {
    const tempId = `pending_${Date.now()}`;

    const onCreated = ({
      id,
    }: {
      id: string;
      shell: string;
      cwd: string;
      pid: number;
    }) => {
      setTabs((prev) => {
        const updated = prev.map((t) =>
          t.id === tempId ? { ...t, id } : t
        );
        if (!updated.find((t) => t.id === id)) {
          updated.push({ id, title: `Terminal ${updated.length + 1}` });
        }
        return updated;
      });
      setActiveTab((prev) => (prev === tempId ? id : prev));
      socket.off("terminal:created", onCreated);
    };

    socket.on("terminal:created", onCreated);
    socket.emit("terminal:create", { cols: 80, rows: 24 });

    const newTab: TerminalTab = {
      id: tempId,
      title: `Terminal ${tabs.length + 1}`,
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTab(tempId);
  }, [socket, tabs.length]);

  const closeTerminal = useCallback(
    (id: string) => {
      socket.emit("terminal:kill", { id });
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
    [socket, activeTab]
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
              {!tab.id.startsWith("pending_") && (
                <Terminal
                  id={tab.id}
                  socket={socket}
                  isActive={tab.id === activeTab}
                />
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
