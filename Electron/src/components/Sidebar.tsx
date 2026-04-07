import { useState } from "react";
import { LayoutMode } from "../App";
import appIcon from "../assets/icon.png";

type UpdateStatus = "idle" | "checking" | "downloading" | "up-to-date" | "available" | "error";

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
  onRenameTab: (id: string, newTitle: string) => void;
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
  useClaudePersonas: boolean;
  onUseClaudePersonasChange: (enabled: boolean) => void;
  defaultPersona: string;
  onDefaultPersonaChange: (persona: string) => void;
  personaOptions: string[];
  onStartFight: () => void;
  hasFight: boolean;
  mommaTabId: string | null;
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
  onRenameTab,
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
  useClaudePersonas,
  onUseClaudePersonasChange,
  defaultPersona,
  onDefaultPersonaChange,
  personaOptions,
  onStartFight,
  hasFight,
  mommaTabId,
}: SidebarProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>("idle");
  const [updateInfo, setUpdateInfo] = useState<{ latestVersion?: string; downloadUrl?: string; error?: string }>({});

  const handleCheckForUpdates = async () => {
    setUpdateStatus("checking");
    try {
      const result = await window.updater.checkForUpdate();
      if (result.error) {
        setUpdateStatus("error");
        setUpdateInfo({ error: result.error });
      } else if (result.hasUpdate) {
        setUpdateStatus("available");
        setUpdateInfo({ latestVersion: result.latestVersion, downloadUrl: result.downloadUrl });
      } else {
        setUpdateStatus("up-to-date");
        setUpdateInfo({});
      }
    } catch {
      setUpdateStatus("error");
      setUpdateInfo({ error: "Failed to check for updates" });
    }
  };

  const handleDownloadUpdate = async () => {
    if (!updateInfo.downloadUrl) return;
    setUpdateStatus("downloading");
    try {
      const result = await window.updater.downloadAndInstall(updateInfo.downloadUrl);
      if (!result.success) {
        setUpdateStatus("error");
        setUpdateInfo({ error: result.error || "Download failed" });
      }
    } catch {
      setUpdateStatus("error");
      setUpdateInfo({ error: "Download failed" });
    }
  };

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
              className={`sidebar__icon-item ${tab.id === activeTab ? "sidebar__icon-item--active" : ""}${tab.id === mommaTabId ? " sidebar__icon-item--momma" : ""}`}
              onClick={() => onSelect(tab.id)}
              title={tab.title}
            >
              {tab.id === mommaTabId ? "M" : index + 1}
            </button>
          ))}
        </div>
        <div className="sidebar__actions sidebar__actions--collapsed">
          <button
            className={`sidebar__icon-btn sidebar__icon-btn--fight${hasFight ? " sidebar__icon-btn--fight-active" : ""}`}
            onClick={onStartFight}
            title={hasFight ? "Fight in progress" : "Start a fight"}
          >
            &#9876;
          </button>
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
        <div className="sidebar__title-group">
          <img src={appIcon} alt="Hivemind" className="sidebar__icon" />
          <h1 className="sidebar__title">Hivemind</h1>
        </div>
        <button className="sidebar__collapse" onClick={onToggleCollapse} title="Collapse sidebar">
          &#9664;
        </button>
      </div>
      <div className="sidebar__list">
        {tabs.map((tab, index) => (
          <div
            key={tab.id}
            className={`sidebar__item ${tab.id === activeTab ? "sidebar__item--active" : ""}${tab.id === mommaTabId ? " sidebar__item--momma" : ""}`}
            onClick={() => onSelect(tab.id)}
            title={tab.title}
          >
            <span className={`sidebar__index${tab.id === mommaTabId ? " sidebar__index--momma" : ""}`}>{tab.id === mommaTabId ? "M" : index + 1}</span>
            {editingTabId === tab.id ? (
              <input
                className="sidebar__item-rename"
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                onBlur={() => {
                  if (editingTitle.trim()) onRenameTab(tab.id, editingTitle.trim());
                  setEditingTabId(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (editingTitle.trim()) onRenameTab(tab.id, editingTitle.trim());
                    setEditingTabId(null);
                  } else if (e.key === "Escape") {
                    setEditingTabId(null);
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                autoFocus
                spellCheck={false}
              />
            ) : (
              <span
                className={`sidebar__item-title${tab.id === mommaTabId ? " sidebar__item-title--momma" : ""}`}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setEditingTabId(tab.id);
                  setEditingTitle(tab.title);
                }}
              >
                {tab.title}
              </span>
            )}
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
        <button
          className={`sidebar__fight-btn${hasFight ? " sidebar__fight-btn--active" : ""}`}
          onClick={onStartFight}
          title={hasFight ? "Fight in progress" : "Start a fight"}
        >
          &#9876; {hasFight ? "Fight in Progress" : "Fight!"}
        </button>
        <button className="sidebar__settings-toggle" onClick={() => setSettingsOpen(true)}>
          &#9881; Settings
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
              <label className="settings__checkbox">
                <input
                  type="checkbox"
                  checked={useClaudePersonas}
                  onChange={(e) => onUseClaudePersonasChange(e.target.checked)}
                />
                <span>Use Claude Personalities</span>
              </label>
              {useClaudePersonas && (
                <div className="settings__field">
                  <label className="settings__label">Default Persona</label>
                  <select
                    className="sidebar__layout-select"
                    value={defaultPersona}
                    onChange={(e) => onDefaultPersonaChange(e.target.value)}
                  >
                    <option value="">No preference (random)</option>
                    {personaOptions.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <hr className="settings__divider" />
              <label className="settings__checkbox settings__checkbox--paulino">
                <input
                  type="checkbox"
                  checked={theme === "paulino"}
                  onChange={(e) => onThemeChange(e.target.checked ? "paulino" : "dark")}
                />
                <span>Paulino Mode</span>
              </label>
              <hr className="settings__divider" />
              <div className="settings__version-row">
                <span className="settings__version">v{__APP_VERSION__}</span>
                {updateStatus === "idle" && (
                  <button className="settings__update-btn" onClick={handleCheckForUpdates}>
                    Check for Updates
                  </button>
                )}
                {updateStatus === "checking" && (
                  <span className="settings__update-status settings__update-status--checking">
                    Checking...
                  </span>
                )}
                {updateStatus === "up-to-date" && (
                  <span className="settings__update-status settings__update-status--ok">
                    Up to date
                  </span>
                )}
                {updateStatus === "available" && (
                  <button className="settings__update-btn settings__update-btn--download" onClick={handleDownloadUpdate}>
                    Download v{updateInfo.latestVersion}
                  </button>
                )}
                {updateStatus === "downloading" && (
                  <span className="settings__update-status settings__update-status--checking">
                    Downloading...
                  </span>
                )}
                {updateStatus === "error" && (
                  <span className="settings__update-status settings__update-status--error" title={updateInfo.error}>
                    Error
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
