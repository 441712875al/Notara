import { TabBar } from './components/TabBar'
import { ConfirmModal } from './components/ConfirmModal'
import { useTabs } from './stores/tabs'

export function App() {
  const tabs = useTabs((st) => st.tabs)
  const activeIndex = useTabs((st) => st.activeIndex)
  const setActive = useTabs((st) => st.setActive)
  const close = useTabs((st) => st.close)
  return (
    <div className="app">
      {tabs.length > 0 && (
        <TabBar
          tabs={tabs}
          activeIndex={activeIndex}
          onSelect={setActive}
          onClose={close}
          onNew={() => useTabs.getState().openUntitled()}
        />
      )}
      <ConfirmModal />
    </div>
  )
}
