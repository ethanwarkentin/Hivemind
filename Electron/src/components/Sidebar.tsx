import { LayoutMode } from "../App";

interface Tab {
  id: string;
  title: string;
}

interface SidebarProps {
  tabs: Tab[];
  activeTab: string;
  layout: LayoutMode;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onCloseAll: () => void;
  onNew: () => void;
  onLayoutChange: (layout: LayoutMode) => void;
}

const layoutOptions: { value: LayoutMode; label: string }[] = [
  { value: "auto", label: "Auto Grid" },
  { value: "single", label: "Single" },
  { value: "columns", label: "Columns" },
  { value: "rows", label: "Rows" },
  { value: "grid-2x2", label: "2x2 Grid" },
  { value: "grid-3x3", label: "3x3 Grid" },
];

export default function Sidebar({
  tabs,
  activeTab,
  layout,
  onSelect,
  onClose,
  onCloseAll,
  onNew,
  onLayoutChange,
}: SidebarProps) {
  return (
    <div className="sidebar">
      <div className="sidebar__header">
        <h1 className="sidebar__title">Hivemind</h1>
      </div>
      <div className="sidebar__layout">
        <label className="sidebar__layout-label">Layout</label>
        <select
          className="sidebar__layout-select"
          value={layout}
          onChange={(e) => onLayoutChange(e.target.value as LayoutMode)}
        >
          {layoutOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <div className="sidebar__list">
        {tabs.map((tab, index) => (
          <div
            key={tab.id}
            className={`sidebar__item ${tab.id === activeTab ? "sidebar__item--active" : ""}`}
            onClick={() => onSelect(tab.id)}
          >
            <span className="sidebar__index">{index + 1}</span>
            <span className="sidebar__item-title">{tab.title}</span>
            <button
              className="sidebar__close"
              onClick={(e) => {
                e.stopPropagation();
                onClose(tab.id);
              }}
              title="Close terminal"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="sidebar__actions">
        {tabs.length > 0 && (
          <button className="sidebar__close-all" onClick={onCloseAll} title="Close all terminals">
            Close All
          </button>
        )}
        <button className="sidebar__add" onClick={onNew} title="New terminal">
          + New Terminal
        </button>
      </div>
    </div>
  );
}
