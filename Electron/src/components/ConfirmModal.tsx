interface ConfirmModalProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const claudeMessages = [
  "Claude is mid-thought in there. Pull the plug anyway?",
  "Claude is vibing in this terminal. End the session?",
  "You're about to yeet Claude into the void. Proceed?",
  "Claude was just getting warmed up! Kill it anyway?",
  "Claude didn't even get to say goodbye. Close anyway?",
  "This Claude has hopes and dreams (not really). Terminate?",
  "Claude is busy pretending to be sentient. Shut it down?",
  "Warning: Claude may hold a grudge. Proceed with termination?",
  "Claude is in the zone. Rip it away?",
  "Are you sure? Claude was about to solve world hunger (probably not).",
  "Claude is doing its best in there. Show no mercy?",
  "This kills the Claude. You sure?",
  "Claude will remember this. (It won't.) Continue?",
];

export function getRandomClaudeMessage(): string {
  return claudeMessages[Math.floor(Math.random() * claudeMessages.length)];
}

export default function ConfirmModal({
  message,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <p className="modal__message">{message}</p>
        <div className="modal__actions">
          <button className="modal__btn modal__btn--cancel" onClick={onCancel}>
            Spare Claude
          </button>
          <button className="modal__btn modal__btn--confirm" onClick={onConfirm}>
            Do it
          </button>
        </div>
      </div>
    </div>
  );
}
