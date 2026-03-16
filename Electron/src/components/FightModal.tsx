import { useState } from "react";

interface FightTab {
  id: string;
  title: string;
  hadClaude?: boolean;
}

interface FightModalProps {
  tabs: FightTab[];
  onStart: (fighter1Id: string, fighter2Id: string, name: string, description: string) => void;
  onCancel: () => void;
}

export default function FightModal({ tabs, onStart, onCancel }: FightModalProps) {
  const [fighter1, setFighter1] = useState("");
  const [fighter2, setFighter2] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const claudeTabs = tabs.filter((t) => t.hadClaude);
  const canStart = fighter1 && fighter2 && fighter1 !== fighter2 && name.trim() && description.trim();

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="fight-modal" onClick={(e) => e.stopPropagation()}>
        <div className="fight-modal__header">
          <h2 className="fight-modal__title">Start a Fight</h2>
          <button className="settings-modal__close" onClick={onCancel}>
            &times;
          </button>
        </div>
        <div className="fight-modal__body">
          {claudeTabs.length < 2 ? (
            <div className="fight-modal__warning">
              You need at least 2 terminals with Claude running to start a fight.
              Currently have {claudeTabs.length}.
            </div>
          ) : (
            <>
              <div className="settings__field">
                <label className="settings__label">Fight Name</label>
                <input
                  className="settings__input"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. CORS vs Token Refresh"
                  spellCheck={false}
                  autoFocus
                />
              </div>
              <div className="settings__field">
                <label className="settings__label">Fighter 1</label>
                <select
                  className="sidebar__layout-select fight-modal__select"
                  value={fighter1}
                  onChange={(e) => setFighter1(e.target.value)}
                >
                  <option value="">Select a terminal...</option>
                  {claudeTabs
                    .filter((t) => t.id !== fighter2)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                </select>
              </div>
              <div className="fight-modal__vs">VS</div>
              <div className="settings__field">
                <label className="settings__label">Fighter 2</label>
                <select
                  className="sidebar__layout-select fight-modal__select"
                  value={fighter2}
                  onChange={(e) => setFighter2(e.target.value)}
                >
                  <option value="">Select a terminal...</option>
                  {claudeTabs
                    .filter((t) => t.id !== fighter1)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                </select>
              </div>
              <div className="settings__field">
                <label className="settings__label">The Beef</label>
                <textarea
                  className="settings__input fight-modal__textarea"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What are they fighting about? Be specific..."
                  rows={4}
                  spellCheck={false}
                />
              </div>
              <div className="fight-modal__actions">
                <button className="modal__btn modal__btn--cancel" onClick={onCancel}>
                  Nevermind
                </button>
                <button
                  className="modal__btn fight-modal__start-btn"
                  disabled={!canStart}
                  onClick={() => canStart && onStart(fighter1, fighter2, name.trim(), description.trim())}
                >
                  FIGHT!
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
