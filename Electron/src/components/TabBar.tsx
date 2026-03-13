interface Tab {
  id: string;
  title: string;
}

interface TabBarProps {
  tabs: Tab[];
  activeTab: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
}

export default function TabBar({
  tabs,
  activeTab,
  onSelect,
  onClose,
  onNew,
}: TabBarProps) {
  return (
    <div className="tab-bar">
      {tabs.map((tab, index) => (
        <div
          key={tab.id}
          className={`tab ${tab.id === activeTab ? "tab--active" : ""}`}
          onClick={() => onSelect(tab.id)}
        >
          <span className="tab__index">{index + 1}</span>
          <span className="tab__title">{tab.title}</span>
          <button
            className="tab__close"
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
      <button className="tab-bar__add" onClick={onNew} title="New terminal">
        +
      </button>
    </div>
  );
}
