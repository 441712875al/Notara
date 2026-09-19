import type { TabMeta } from '../stores/tabs'
import { s } from '../strings'

interface TabBarProps {
  tabs: TabMeta[]
  activeIndex: number
  onSelect: (index: number) => void
  onClose: (index: number) => void
  onNew: () => void
}

export function TabBar({ tabs, activeIndex, onSelect, onClose, onNew }: TabBarProps) {
  return (
    <div className="tabbar" role="tablist">
      <div className="tabbar-tabs">
        {tabs.map((t, i) => (
          <div
            key={t.id}
            data-testid={`tab-${i}`}
            role="tab"
            aria-selected={i === activeIndex}
            className={`tab ${i === activeIndex ? 'active' : ''} ${t.deleted ? 'deleted' : ''}`}
            onClick={() => onSelect(i)}
            onMouseUp={(e) => {
              if (e.button === 1) onClose(i)
            }}
            title={t.path ?? s.tab.untitled}
          >
            <span className="tab-title">{t.title}</span>
            {t.dirty && <span className="dirty-dot" aria-label={s.tab.dirty} />}
            <button
              data-testid={`tab-${i}-close`}
              className="tab-close"
              aria-label={s.tab.close}
              onClick={(e) => {
                e.stopPropagation()
                onClose(i)
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button data-testid="tab-new" className="tab-new" onClick={onNew} aria-label={s.tab.new}>
        +
      </button>
    </div>
  )
}
