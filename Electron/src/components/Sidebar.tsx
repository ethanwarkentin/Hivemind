import { useState } from "react";
import { LayoutMode } from "../App";

interface Tab {
  id: string;
  title: string;
}

interface SidebarProps {
  tabs: Tab[];
  activeTab: string;
  layout: LayoutMode;
  collapsed: boolean;
  defaultCwd: string;
  fontSize: number;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onCloseAll: () => void;
  onNew: () => void;
  onLayoutChange: (layout: LayoutMode) => void;
  onToggleCollapse: () => void;
  onDefaultCwdChange: (cwd: string) => void;
  onFontSizeChange: (size: number) => void;
  restoreSession: boolean;
  onRestoreSessionChange: (enabled: boolean) => void;
  theme: string;
  onThemeChange: (theme: string) => void;
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
  collapsed,
  defaultCwd,
  fontSize,
  onSelect,
  onClose,
  onCloseAll,
  onNew,
  onLayoutChange,
  onToggleCollapse,
  onDefaultCwdChange,
  onFontSizeChange,
  restoreSession,
  onRestoreSessionChange,
  theme,
  onThemeChange,
}: SidebarProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (collapsed) {
    return (
      <div className="sidebar sidebar--collapsed">
        <button className="sidebar__expand" onClick={onToggleCollapse} title="Expand sidebar">
          &#9654;
        </button>
        <div className="sidebar__list sidebar__list--collapsed">
          {tabs.map((tab, index) => (
            <button
              key={tab.id}
              className={`sidebar__icon-item ${tab.id === activeTab ? "sidebar__icon-item--active" : ""}`}
              onClick={() => onSelect(tab.id)}
              title={tab.title}
            >
              {index + 1}
            </button>
          ))}
        </div>
        <div className="sidebar__actions sidebar__actions--collapsed">
          <button className="sidebar__icon-btn sidebar__icon-btn--settings" onClick={() => setSettingsOpen(true)} title="Settings">
            &#9881;
          </button>
          <button className="sidebar__icon-btn sidebar__icon-btn--new" onClick={onNew} title="New terminal">
            &#43;
          </button>
          <button className="sidebar__icon-btn sidebar__icon-btn--close" onClick={onCloseAll} title="Close all terminals">
            &#10005;
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="sidebar">
      <div className="sidebar__header">
        <h1 className="sidebar__title">Hivemind</h1>
        <button className="sidebar__collapse" onClick={onToggleCollapse} title="Collapse sidebar">
          &#9664;
        </button>
      </div>
      <div className="sidebar__list">
        {tabs.map((tab, index) => (
          <div
            key={tab.id}
            className={`sidebar__item ${tab.id === activeTab ? "sidebar__item--active" : ""}`}
            onClick={() => onSelect(tab.id)}
            title={tab.title}
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
        <button className="sidebar__settings-toggle" onClick={() => setSettingsOpen(true)}>
          Settings
        </button>
        <button className="sidebar__add" onClick={onNew} title="New terminal">
          + New Terminal
        </button>
        <button className="sidebar__close-all" onClick={onCloseAll} title="Close all terminals">
          &#10005; Close All
        </button>
      </div>
      {settingsOpen && (
        <div className="modal-overlay" onClick={() => setSettingsOpen(false)}>
          <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
            <div className="settings-modal__header">
              <h2 className="settings-modal__title">Settings</h2>
              <button className="settings-modal__close" onClick={() => setSettingsOpen(false)}>
                ×
              </button>
            </div>
            <div className="settings-modal__body">
              <div className="settings__field">
                <label className="settings__label">Layout</label>
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
              <div className="settings__field">
                <label className="settings__label">Default Directory</label>
                <div className="settings__browse-row">
                  <input
                    className="settings__input settings__input--browse"
                    type="text"
                    value={defaultCwd}
                    onChange={(e) => onDefaultCwdChange(e.target.value)}
                    placeholder="e.g. C:\Projects"
                    spellCheck={false}
                    title={defaultCwd}
                  />
                  <button
                    className="settings__browse-btn"
                    onClick={async () => {
                      const folder = await window.settings.browseFolder();
                      if (folder) onDefaultCwdChange(folder);
                    }}
                  >
                    Browse
                  </button>
                </div>
              </div>
              <div className="settings__field">
                <label className="settings__label">Font Size</label>
                <input
                  className="settings__input settings__input--small"
                  type="number"
                  min={8}
                  max={24}
                  value={fontSize}
                  onChange={(e) => onFontSizeChange(Number(e.target.value))}
                />
              </div>
              <label className="settings__checkbox">
                <input
                  type="checkbox"
                  checked={restoreSession}
                  onChange={(e) => onRestoreSessionChange(e.target.checked)}
                />
                <span>Restore previous session on startup</span>
              </label>
              <hr className="settings__divider" />
              <label className="settings__checkbox settings__checkbox--paulino">
                <input
                  type="checkbox"
                  checked={theme === "paulino"}
                  onChange={(e) => onThemeChange(e.target.checked ? "paulino" : "dark")}
                />
                <span>Paulino Mode</span>
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
