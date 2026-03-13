import { useState } from "react";

interface SettingsProps {
  defaultCwd: string;
  fontSize: number;
  onDefaultCwdChange: (cwd: string) => void;
  onFontSizeChange: (size: number) => void;
}

export default function Settings({
  defaultCwd,
  fontSize,
  onDefaultCwdChange,
  onFontSizeChange,
}: SettingsProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="settings">
      <button
        className="settings__toggle"
        onClick={() => setOpen(!open)}
      >
        {open ? "Hide Settings" : "Settings"}
      </button>
      {open && (
        <div className="settings__panel">
          <div className="settings__field">
            <label className="settings__label">Default Directory</label>
            <input
              className="settings__input"
              type="text"
              value={defaultCwd}
              onChange={(e) => onDefaultCwdChange(e.target.value)}
              placeholder="e.g. C:\Projects"
              spellCheck={false}
            />
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
        </div>
      )}
    </div>
  );
}
