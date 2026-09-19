import type { RecentWorkspace } from '@shared/types'
import { s } from '../strings'

interface WelcomeProps {
  recents: RecentWorkspace[]
  onOpenFolder: () => void
  onNewFile: () => void
  onOpenRecent: (root: string) => void
}

/** 零标签启动页：打开文件夹 / 新建文件 / 最近工作区列表 */
export function Welcome({ recents, onOpenFolder, onNewFile, onOpenRecent }: WelcomeProps) {
  return (
    <div className="welcome" data-testid="welcome">
      <h1 className="welcome-title">{s.welcome.title}</h1>
      <div className="welcome-actions">
        <button data-testid="welcome-open-folder" className="btn btn-primary" onClick={onOpenFolder}>
          {s.welcome.openFolder}
        </button>
        <button data-testid="welcome-new-file" className="btn" onClick={onNewFile}>
          {s.welcome.newFile}
        </button>
      </div>
      <h2 className="welcome-recent-title">{s.welcome.recent}</h2>
      {recents.length === 0 ? (
        <p className="welcome-empty">{s.welcome.empty}</p>
      ) : (
        <ul className="welcome-recent-list">
          {recents.map((r) => {
            const name = r.root.split('/').pop() ?? r.root
            return (
              <li key={r.root}>
                <button
                  data-testid={`recent-${name}`}
                  className="welcome-recent-item"
                  onClick={() => onOpenRecent(r.root)}
                >
                  <span className="welcome-recent-name">{name}</span>
                  <span className="welcome-recent-path">{r.root}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
