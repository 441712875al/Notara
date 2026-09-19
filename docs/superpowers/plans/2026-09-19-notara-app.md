# Notara 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建Notara——一个 macOS 上的 Electron + vditor 即时渲染 Markdown 编辑器，功能对齐设计文档（[2026-09-19-notara-design.md](../specs/2026-09-19-notara-design.md)）的全部 6 个里程碑。

**Architecture:** 标准 Electron 安全模型（sandbox + contextIsolation），主进程负责全部文件系统操作与窗口管理，渲染进程为 React 19 + zustand + vditor（ir 模式），两端通过 `src/shared/types.ts` 中定义的类型化 IPC 契约通信。每个标签页保活一个 vditor 实例以保留撤销历史。

**Tech Stack:** Electron ≥33、electron-vite、TypeScript strict、React 19、zustand 5、vditor 3（MIT）、Vitest 3、Playwright（_electron）、electron-builder。

## Global Constraints

- 目标平台 macOS 13+；Electron ≥ 33；TypeScript `strict: true`（两个 tsconfig 均开启）
- 安全基线（Task 1 锁定，后续不得放宽）：`nodeIntegration: false`、`contextIsolation: true`、`sandbox: true`；渲染进程不直接接触 fs/path
- 所有 UI 文案为简体中文，且集中定义在 `src/renderer/src/strings.ts`，组件不内联中文文案
- IPC 类型契约的唯一权威来源是 `src/shared/types.ts`；主进程服务层不得 import electron 渲染侧类型
- 主进程纯逻辑（文件、工作区、图片、导出、最近列表）必须有 Vitest 单元测试；vditor 集成与菜单以 E2E + 手动清单验证
- 依赖版本以安装时 npm 可解析的最新稳定版为准；本文所列版本号为经确认存在的下限
- 提交信息用 conventional commits（`feat:`/`fix:`/`test:`/`chore:`/`docs:`），描述用中文
- 每个任务结束必须：`npm run typecheck` 通过 → 相关测试通过 → `git commit`
- 与设计文档 §4 IPC 表的差异说明：`menu:action`、`theme:*`、`app:*`（窗口状态/关闭确认/启动参数）等通道是设计 §5.5/§6.1/§6.3 落地所需的最小扩展，全部收敛在 `src/shared/types.ts`；`export:html/pdf` 的 `content` 字段语义为"渲染进程已渲染的完整 HTML 片段"（vditor 只在渲染进程可用）

---

## Milestone M1 — 工程骨架

### Task 1: electron-vite 工程骨架与启动验证

**Files:**
- Create: `package.json`、`electron.vite.config.ts`、`tsconfig.json`、`tsconfig.node.json`、`tsconfig.web.json`、`.gitignore`、`vitest.config.ts`
- Create: `src/main/index.ts`、`src/main/window.ts`、`src/preload/index.ts`（占位）、`src/renderer/index.html`、`src/renderer/src/main.tsx`、`src/renderer/src/App.tsx`、`src/renderer/src/styles/global.css`

**Interfaces:**
- Produces: `createWindow()`（src/main/window.ts 导出）；可启动的空窗口应用；`npm run dev` / `npm run typecheck` / `npm test` 三条脚本可用

- [ ] **Step 1: 写入 package.json**

```json
{
  "name": "notara",
  "version": "0.1.0",
  "description": "macOS Markdown 编辑器，Typora 的免费替代品",
  "main": "out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "predev": "npm run copy:vditor",
    "copy:vditor": "node scripts/copy-vditor.mjs",
    "build": "electron-vite build",
    "prebuild": "npm run copy:vditor",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json",
    "e2e": "npm run build && playwright test",
    "dist": "electron-vite build && electron-builder --mac"
  },
  "devDependencies": {
    "@playwright/test": "^1.49.1",
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@types/node": "^22.10.2",
    "@types/react": "^19.0.2",
    "@types/react-dom": "^19.0.2",
    "@vitejs/plugin-react": "^4.3.4",
    "electron": "^33.2.1",
    "electron-builder": "^25.1.8",
    "electron-vite": "^2.3.0",
    "jsdom": "^25.0.1",
    "typescript": "^5.7.2",
    "vite": "^6.0.7",
    "vitest": "^3.0.0"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "vditor": "^3.10.9",
    "zustand": "^5.0.2"
  }
}
```

说明：`copy:vditor` 与 `scripts/copy-vditor.mjs` 在 Task 6 才创建，Task 1 后 `npm run dev` 会因缺脚本而失败——因此 Task 1 期间先临时执行 `npm run dev --ignore-scripts`？不需要：直接在本任务也创建一个空操作版本的 `scripts/copy-vditor.mjs`（内容见 Step 4），Task 6 再补真实拷贝逻辑。

- [ ] **Step 2: 写入构建与 TS 配置**

`electron.vite.config.ts`：

```ts
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': new URL('./src/shared', import.meta.url).pathname }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    plugins: [react()],
    resolve: {
      alias: {
        '@shared': new URL('./src/shared', import.meta.url).pathname,
        '@': new URL('./src/renderer/src', import.meta.url).pathname
      }
    }
  }
})
```

`tsconfig.json`：

```json
{
  "files": [],
  "references": [{ "path": "./tsconfig.node.json" }, { "path": "./tsconfig.web.json" }]
}
```

`tsconfig.node.json`（主进程 + preload + 共享类型 + 脚本）：

```json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "target": "ES2022",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"],
    "baseUrl": ".",
    "paths": { "@shared/*": ["src/shared/*"] }
  },
  "include": [
    "src/main/**/*",
    "src/preload/**/*",
    "src/shared/**/*",
    "electron.vite.config.ts",
    "scripts/**/*"
  ]
}
```

`tsconfig.web.json`（渲染进程）：

```json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vite/client"],
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["src/shared/*"],
      "@/*": ["src/renderer/src/*"]
    }
  },
  "include": ["src/renderer/src/**/*", "src/shared/**/*"]
}
```

`vitest.config.ts`（unit=node 环境、component=jsdom 环境两个 project）：

```ts
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
      '@': fileURLToPath(new URL('./src/renderer/src', import.meta.url))
    }
  },
  test: {
    passWithNoTests: true,
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.spec.ts']
        }
      },
      {
        test: {
          name: 'component',
          environment: 'jsdom',
          include: ['tests/component/**/*.spec.tsx'],
          setupFiles: ['./tests/component/setup.ts']
        }
      }
    ]
  }
})
```

`tests/component/setup.ts`：

```ts
import '@testing-library/jest-dom/vitest'
```

`.gitignore`：

```
node_modules/
out/
release/
dist/
src/renderer/public/vditor/
*.local
.DS_Store
```

- [ ] **Step 3: 写入主进程与渲染进程入口**

`src/main/window.ts`：

```ts
import { BrowserWindow } from 'electron'
import { join } from 'node:path'

export function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 640,
    minHeight: 400,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true
    }
  })
  win.once('ready-to-show', () => win.show())
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void win.loadURL(devUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}
```

`src/main/index.ts`：

```ts
import { app, BrowserWindow } from 'electron'
import { createWindow } from './window'

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

`src/preload/index.ts`（占位，Task 2 替换）：

```ts
import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('notara', {})
```

`src/renderer/index.html`：

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; img-src 'self' data: file: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self' data:; connect-src 'self'"
    />
    <title>Notara</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/renderer/src/main.tsx`：

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './styles/global.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

注意：React StrictMode 在开发模式下会双调用 effect——vditor 的创建/销毁 effect（Task 6）必须幂等才能兼容；若调试发现 vditor 双初始化问题，移除 StrictMode 是允许的备选。

`src/renderer/src/App.tsx`：

```tsx
export function App() {
  return <div className="app">Notara</div>
}
```

`src/renderer/src/styles/global.css`：

```css
* { box-sizing: border-box; }
html, body, #root { height: 100%; margin: 0; }
body {
  font-family: -apple-system, 'PingFang SC', 'Helvetica Neue', sans-serif;
  -webkit-font-smoothing: antialiased;
}
.app { height: 100%; }
```

`scripts/copy-vditor.mjs`（占位，Task 6 补全）：

```js
// Task 6 将实现：将 node_modules/vditor/dist 拷贝到 src/renderer/public/vditor
```

- [ ] **Step 4: 安装依赖并验证**

```bash
npm install
npm run typecheck
npm test
```

预期：typecheck 无错误；vitest 输出 `No test files found` 且因 `passWithNoTests` 退出码为 0。

- [ ] **Step 5: 启动验证**

```bash
npm run dev
```

预期：macOS 窗口打开，显示 "Notara" 文字，红绿灯按钮位于左上角内嵌位置。⌘Q 退出后终端命令结束。

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: electron-vite + React 工程骨架"
```

---

### Task 2: 共享类型契约 + preload 桥 + IPC 注册骨架

**Files:**
- Create: `src/shared/types.ts`、`src/shared/errors.ts`
- Create: `src/main/ipc/index.ts`、`src/main/ipc/app.ts`
- Modify: `src/preload/index.ts`（完整实现）
- Create: `src/renderer/src/env.d.ts`、`src/renderer/src/lib/api.ts`
- Test: `tests/unit/shared-contract.spec.ts`

**Interfaces:**
- Produces: `NotaraApi`（window.notara 的完整类型，见下）、`MainEvent` 判别联合、`IpcResult<T>` 信封、`NotaraError`。**后续所有任务的 IPC 调用都以此处类型为准，不得另行发明字段名。**

- [ ] **Step 1: 写入 src/shared/types.ts（完整契约，一次定稿）**

```ts
// ── 基础结构 ──────────────────────────────────────────────
export interface TreeNode {
  name: string
  path: string // 绝对路径
  isDir: boolean
}

export interface ReadResult {
  content: string
  mtime: number
}

export interface WriteResult {
  mtime: number
}

export type OpenDialogResult = { type: 'folder' | 'file'; path: string } | null

export interface RecentWorkspace {
  root: string
  lastOpenedAt: number
}

// ── 主题 ────────────────────────────────────────────────
export type ThemeSetting = 'system' | 'light' | 'dark' | (string & {})

export interface ThemeInfo {
  setting: ThemeSetting
  effective: 'light' | 'dark'
  customCss: string | null // setting 为自定义主题名时为其 CSS 内容
  customThemes: { name: string }[]
}

// ── 窗口状态 ────────────────────────────────────────────
export interface WindowStatePayload {
  workspaceRoot: string | null
  tabPaths: string[]
  activeIndex: number
}

// ── 菜单与事件 ──────────────────────────────────────────
export type MenuAction =
  | 'open'
  | 'new-file'
  | 'new-window'
  | 'save'
  | 'save-as'
  | 'export-pdf'
  | 'export-html'
  | 'close-tab'
  | 'format-bold'
  | 'format-italic'
  | 'format-code'
  | 'format-link'
  | 'toggle-sidebar'
  | 'toggle-outline'
  | `set-theme:${string}`

export type MainEvent =
  | { type: 'workspace:tree-changed'; root: string }
  | { type: 'file:external-change'; path: string; mtime: number }
  | { type: 'file:external-delete'; path: string }
  | { type: 'file:renamed'; oldPath: string; newPath: string }
  | { type: 'app:flush-before-quit' }
  | { type: 'app:close-requested' }
  | { type: 'theme:system-changed'; dark: boolean }
  | { type: 'menu:action'; action: MenuAction }

// ── IPC 信封与错误 ──────────────────────────────────────
export interface NotaraErrorShape {
  code: string
  message: string
}

export type IpcResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: NotaraErrorShape }

// ── 渲染进程 API（window.notara）────────────────────────
export interface NotaraApi {
  // 对话框与启动
  openDialog(): Promise<OpenDialogResult>
  getLaunchOpen(): Promise<string | null>
  // 文件
  readFile(path: string): Promise<ReadResult>
  writeFile(path: string, content: string): Promise<WriteResult>
  createEntry(dir: string, name: string, kind: 'file' | 'directory'): Promise<{ path: string }>
  renameEntry(oldPath: string, newPath: string): Promise<{ path: string }>
  deleteEntry(path: string): Promise<void>
  saveFileAs(suggestedName: string, content: string): Promise<{ path: string } | null>
  // 工作区
  openWorkspace(root: string): Promise<void>
  listChildren(dir: string): Promise<TreeNode[]>
  // 图片
  saveImage(
    refDir: string,
    data: ArrayBuffer,
    originalName: string,
    ext: string
  ): Promise<{ relativePath: string }>
  // 导出
  exportHtml(sourcePath: string, html: string): Promise<{ htmlPath: string }>
  exportPdf(sourcePath: string, html: string): Promise<{ pdfPath: string }>
  // 最近与主题
  listRecent(): Promise<RecentWorkspace[]>
  getTheme(): Promise<ThemeInfo>
  setTheme(setting: ThemeSetting): Promise<ThemeInfo>
  // 应用生命周期
  flushDone(): Promise<void>
  allowClose(): Promise<void>
  getWindowState(): Promise<WindowStatePayload | null>
  saveWindowState(state: WindowStatePayload): Promise<void>
  // 事件
  onEvent(cb: (event: MainEvent) => void): () => void
}
```

`src/shared/errors.ts`：

```ts
export class NotaraError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message)
    this.name = 'NotaraError'
  }
}

// 统一错误码（服务层只抛这些）
export const ErrorCodes = {
  NotFound: 'not-found',
  BinaryFile: 'binary-file',
  WriteFailed: 'write-failed',
  InvalidName: 'invalid-name',
  TargetExists: 'target-exists',
  Cancelled: 'cancelled',
  Unknown: 'unknown'
} as const
```

- [ ] **Step 2: 写入失败测试（契约自检）**

`tests/unit/shared-contract.spec.ts`：

```ts
import { describe, expect, it } from 'vitest'
import type { IpcResult, MainEvent, NotaraApi } from '@shared/types'
import { ErrorCodes, NotaraError } from '@shared/errors'

describe('IPC 契约', () => {
  it('IpcResult 错误分支携带 code 与 message', () => {
    const r: IpcResult<never> = { ok: false, error: { code: ErrorCodes.NotFound, message: 'x' } }
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('not-found')
  })

  it('NotaraApi 类型可被结构化引用（编译期自检）', () => {
    const probes: Array<keyof NotaraApi> = [
      'openDialog', 'readFile', 'writeFile', 'createEntry', 'renameEntry', 'deleteEntry',
      'saveFileAs', 'openWorkspace', 'listChildren', 'saveImage', 'exportHtml', 'exportPdf',
      'listRecent', 'getTheme', 'setTheme', 'flushDone', 'allowClose',
      'getWindowState', 'saveWindowState', 'onEvent', 'getLaunchOpen'
    ]
    expect(probes.length).toBe(21)
  })

  it('MainEvent 判别联合可穷尽 switch', () => {
    const e: MainEvent = { type: 'file:renamed', oldPath: 'a', newPath: 'b' }
    const kinds: string[] = []
    switch (e.type) {
      case 'workspace:tree-changed':
      case 'file:external-change':
      case 'file:external-delete':
      case 'file:renamed':
      case 'app:flush-before-quit':
      case 'app:close-requested':
      case 'theme:system-changed':
      case 'menu:action':
        kinds.push(e.type)
    }
    expect(kinds).toEqual(['file:renamed'])
  })

  it('NotaraError 携带错误码', () => {
    expect(new NotaraError(ErrorCodes.Cancelled, '用户取消').code).toBe('cancelled')
  })
})
```

- [ ] **Step 3: 运行测试确认失败**

```bash
npm test
```

预期：FAIL，`Cannot find module '@shared/types'`（文件尚未被 TS 识别前 vitest 解析别名失败）。

- [ ] **Step 4: （Step 1 已写入 types/errors）实现 IPC 注册骨架**

`src/main/ipc/index.ts`——IPC 注册中心 + 结果信封包装器，后续每个任务的 ipc 模块都通过它注册：

```ts
import { ipcMain, BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import type { IpcResult, MainEvent, NotaraErrorShape } from '@shared/types'
import { NotaraError } from '@shared/errors'

type Handler = (payload: any, event: IpcMainInvokeEvent) => Promise<unknown>

// 所有已注册通道集中声明（防止字符串散落）
export const Channels = {
  DialogOpen: 'dialog:open',
  FilesRead: 'files:read',
  FilesWrite: 'files:write',
  FilesCreate: 'files:create',
  FilesRename: 'files:rename',
  FilesDelete: 'files:delete',
  FilesSaveAs: 'files:save-as',
  WorkspaceOpen: 'workspace:open',
  WorkspaceChildren: 'workspace:children',
  ImagesSave: 'images:save',
  ExportHtml: 'export:html',
  ExportPdf: 'export:pdf',
  RecentList: 'recent:list',
  ThemeGet: 'theme:get',
  ThemeSet: 'theme:set',
  AppFlushDone: 'app:flush-done',
  AppAllowClose: 'app:allow-close',
  AppGetLaunchOpen: 'app:get-launch-open',
  AppGetWindowState: 'app:get-window-state',
  AppSaveWindowState: 'app:save-window-state'
} as const

export function registerIpc(channel: string, handler: Handler): void {
  ipcMain.handle(channel, async (event, payload): Promise<IpcResult<unknown>> => {
    try {
      return { ok: true, value: await handler(payload, event) }
    } catch (e) {
      const shape: NotaraErrorShape =
        e instanceof NotaraError
          ? { code: e.code, message: e.message }
          : { code: 'unknown', message: e instanceof Error ? e.message : String(e) }
      return { ok: false, error: shape }
    }
  })
}

export function broadcast(event: MainEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('main:event', event)
  }
}

export function registerAllIpc(): void {
  registerAppIpc()
}

// 占位导入放文件末尾避免循环依赖问题
import { registerAppIpc } from './app'
```

`src/main/ipc/app.ts`——本任务先注册 dialog 与 flush-done 等骨架，后续任务在同一文件扩展：

```ts
import { dialog, BrowserWindow } from 'electron'
import { registerIpc, Channels } from './index'
import type { OpenDialogResult } from '@shared/types'

export function registerAppIpc(): void {
  registerIpc(Channels.DialogOpen, async (): Promise<OpenDialogResult> => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const r = await dialog.showOpenDialog(win, {
      properties: ['openFile', 'openDirectory'],
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }]
    })
    const p = r.filePaths[0]
    if (!p) return null
    return { type: (await import('node:fs')).statSync(p).isDirectory() ? 'folder' : 'file', path: p }
  })
}
```

修改 `src/main/index.ts`，在 `app.whenReady` 中注册：

```ts
import { app, BrowserWindow } from 'electron'
import { createWindow } from './window'
import { registerAllIpc } from './ipc'

app.whenReady().then(() => {
  registerAllIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

- [ ] **Step 5: 实现 preload 完整桥**

`src/preload/index.ts`（整体替换）：

```ts
import { contextBridge, ipcRenderer } from 'electron'
import type { IpcResult, MainEvent, NotaraApi } from '../shared/types'

async function invoke<T>(channel: string, payload?: unknown): Promise<T> {
  const r = (await ipcRenderer.invoke(channel, payload)) as IpcResult<T>
  if (!r.ok) {
    // contextBridge 不能跨桥传递 Error 子类属性，重建为普通错误对象
    throw Object.assign(new Error(r.error.message), { code: r.error.code })
  }
  return r.value
}

const EVENT_CHANNEL = 'main:event'

const api: NotaraApi = {
  openDialog: () => invoke('dialog:open'),
  getLaunchOpen: () => invoke('app:get-launch-open'),
  readFile: (path) => invoke('files:read', { path }),
  writeFile: (path, content) => invoke('files:write', { path, content }),
  createEntry: (dir, name, kind) => invoke('files:create', { dir, name, kind }),
  renameEntry: (oldPath, newPath) => invoke('files:rename', { oldPath, newPath }),
  deleteEntry: (path) => invoke('files:delete', { path }),
  saveFileAs: (suggestedName, content) => invoke('files:save-as', { suggestedName, content }),
  openWorkspace: (root) => invoke('workspace:open', { root }),
  listChildren: (dir) => invoke('workspace:children', { dir }),
  saveImage: (refDir, data, originalName, ext) =>
    invoke('images:save', { refDir, data, originalName, ext }),
  exportHtml: (sourcePath, html) => invoke('export:html', { sourcePath, html }),
  exportPdf: (sourcePath, html) => invoke('export:pdf', { sourcePath, html }),
  listRecent: () => invoke('recent:list'),
  getTheme: () => invoke('theme:get'),
  setTheme: (setting) => invoke('theme:set', { setting }),
  flushDone: () => invoke('app:flush-done'),
  allowClose: () => invoke('app:allow-close'),
  getWindowState: () => invoke('app:get-window-state'),
  saveWindowState: (state) => invoke('app:save-window-state', { state }),
  onEvent: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, event: MainEvent): void => cb(event)
    ipcRenderer.on(EVENT_CHANNEL, listener)
    return () => ipcRenderer.removeListener(EVENT_CHANNEL, listener)
  }
}

contextBridge.exposeInMainWorld('notara', api)
```

`src/renderer/src/env.d.ts`：

```ts
import type { NotaraApi } from '@shared/types'

declare global {
  interface Window {
    notara: NotaraApi
  }
}

export {}
```

`src/renderer/src/lib/api.ts`：

```ts
import type { NotaraApi } from '@shared/types'

export const api: NotaraApi = window.notara
```

- [ ] **Step 6: 运行测试与类型检查**

```bash
npm test && npm run typecheck
```

预期：unit 1 个文件 4 个用例全部 PASS；typecheck 无错误。

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: 共享类型契约与 typed preload 桥"
```

---

## Milestone M2 — 编辑核心

### Task 3: fileService 与文件 IPC

**Files:**
- Create: `src/main/services/fileService.ts`
- Create: `src/main/ipc/files.ts`
- Modify: `src/main/ipc/index.ts`（registerAllIpc 增加 files）、`src/main/ipc/app.ts`（saveFileAs）
- Test: `tests/unit/fileService.spec.ts`

**Interfaces:**
- Consumes: Task 2 的 `registerIpc`/`Channels`、`NotaraError`/`ErrorCodes`
- Produces: `readFileSafe(path): Promise<ReadResult>`、`writeFileAtomic(path, content): Promise<WriteResult>`、`createEntry(dir, name, kind)`、`renamePath(old, new)`、`deleteToTrash(path)`、`trackOpen(path, mtime)` / `knownMtime(path)` / `clearTracked(path)`（供 Task 9 watcher 判断自写过滤）；IPC 通道 `files:*` 全部可用

- [ ] **Step 1: 写入失败测试**

`tests/unit/fileService.spec.ts`：

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  readFileSafe, writeFileAtomic, createEntry, renamePath, deleteToTrash, trackOpen, knownMtime
} from '../../src/main/services/fileService'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'notara-test-'))
})
afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('readFileSafe', () => {
  it('读取 UTF-8 文本并返回 mtime', async () => {
    const p = join(dir, 'a.md')
    await writeFile(p, '# 你好', 'utf8')
    const r = await readFileSafe(p)
    expect(r.content).toBe('# 你好')
    expect(r.mtime).toBeGreaterThan(0)
  })

  it('拒绝二进制文件（含 \\0 字节）', async () => {
    const p = join(dir, 'bin.md')
    await writeFile(p, Buffer.from([0x61, 0x00, 0x62]))
    await expect(readFileSafe(p)).rejects.toMatchObject({ code: 'binary-file' })
  })

  it('不存在的文件抛 not-found', async () => {
    await expect(readFileSafe(join(dir, 'nope.md'))).rejects.toMatchObject({ code: 'not-found' })
  })
})

describe('writeFileAtomic', () => {
  it('写入后内容与 mtime 正确且无残留 tmp 文件', async () => {
    const p = join(dir, 'b.md')
    const r = await writeFileAtomic(p, '内容1')
    expect((await stat(p)).mtimeMs).toBe(r.mtime)
    expect(r.mtime).toBeGreaterThan(0)
    const again = await writeFileAtomic(p, '内容2')
    expect(again.mtime).toBeGreaterThanOrEqual(r.mtime)
    const files = await (await import('node:fs/promises')).readdir(dir)
    expect(files).toEqual(['b.md'])
  })

  it('覆盖已有文件保留其他文件', async () => {
    await writeFile(join(dir, 'c.md'), 'old', 'utf8')
    await writeFileAtomic(join(dir, 'c.md'), 'new')
    const r = await readFileSafe(join(dir, 'c.md'))
    expect(r.content).toBe('new')
  })
})

describe('createEntry / renamePath / deleteToTrash', () => {
  it('创建文件与目录，重名抛 target-exists', async () => {
    const f = await createEntry(dir, 'x.md', 'file')
    expect(f.path).toBe(join(dir, 'x.md'))
    await expect(createEntry(dir, 'x.md', 'file')).rejects.toMatchObject({ code: 'target-exists' })
    const d = await createEntry(dir, 'sub', 'directory')
    expect(d.path).toBe(join(dir, 'sub'))
  })

  it('非法名字抛 invalid-name', async () => {
    await expect(createEntry(dir, '../evil.md', 'file')).rejects.toMatchObject({ code: 'invalid-name' })
    await expect(createEntry(dir, '', 'file')).rejects.toMatchObject({ code: 'invalid-name' })
    await expect(createEntry(dir, 'a/b.md', 'file')).rejects.toMatchObject({ code: 'invalid-name' })
  })

  it('重命名并跟踪 mtime 迁移', async () => {
    await writeFile(join(dir, 'o.md'), 'v', 'utf8')
    trackOpen(join(dir, 'o.md'), (await stat(join(dir, 'o.md'))).mtimeMs)
    const r = await renamePath(join(dir, 'o.md'), join(dir, 'n.md'))
    expect(r.path).toBe(join(dir, 'n.md'))
    expect(knownMtime(join(dir, 'n.md'))).toBeGreaterThan(0)
    expect(knownMtime(join(dir, 'o.md'))).toBeUndefined()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run tests/unit/fileService.spec.ts
```

预期：FAIL，找不到模块 `src/main/services/fileService`。

- [ ] **Step 3: 实现 fileService**

`src/main/services/fileService.ts`：

```ts
import { promises as fs } from 'node:fs'
import { shell } from 'electron'
import * as path from 'node:path'
import { ErrorCodes, NotaraError } from '@shared/errors'
import type { ReadResult, WriteResult } from '@shared/types'

// 打开中文件的最后已知 mtime（自写过滤与外部变更判断共用，Task 9 使用）
const openFiles = new Map<string, number>()

function toCode(e: unknown): string {
  return (e as NodeJS.ErrnoException).code ?? 'unknown'
}

export async function readFileSafe(filePath: string): Promise<ReadResult> {
  let buf: Buffer
  try {
    buf = await fs.readFile(filePath)
  } catch (e) {
    if (toCode(e) === 'ENOENT') throw new NotaraError(ErrorCodes.NotFound, `文件不存在: ${filePath}`)
    if (toCode(e) === 'EISDIR') throw new NotaraError(ErrorCodes.InvalidName, '不能读取目录')
    throw new NotaraError(ErrorCodes.Unknown, `读取失败: ${String(e)}`)
  }
  // 前 8KB 出现 \0 视为二进制（UTF-8 文本不可能含 \0）
  if (buf.subarray(0, 8192).includes(0)) {
    throw new NotaraError(ErrorCodes.BinaryFile, '不是文本文件，无法打开')
  }
  const mtime = (await fs.stat(filePath)).mtimeMs
  trackOpen(filePath, mtime)
  return { content: buf.toString('utf8'), mtime }
}

export async function writeFileAtomic(filePath: string, content: string): Promise<WriteResult> {
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`
  try {
    await fs.writeFile(tmp, content, 'utf8')
    await fs.rename(tmp, filePath) // 同卷 rename 原子覆盖
  } catch (e) {
    await fs.rm(tmp, { force: true })
    throw new NotaraError(ErrorCodes.WriteFailed, `保存失败: ${String(e)}`)
  }
  const mtime = (await fs.stat(filePath)).mtimeMs
  trackOpen(filePath, mtime)
  return { mtime }
}

const NAME_RE = /^[\w一-龥][\w一-龥 .()-]*$/u

export async function createEntry(
  dir: string,
  name: string,
  kind: 'file' | 'directory'
): Promise<{ path: string }> {
  if (!NAME_RE.test(name)) {
    throw new NotaraError(ErrorCodes.InvalidName, `非法名称: ${name}`)
  }
  const target = path.join(dir, name)
  if (await fs.access(target).then(() => true, () => false)) {
    throw new NotaraError(ErrorCodes.TargetExists, `已存在: ${name}`)
  }
  if (kind === 'file') await fs.writeFile(target, '', 'utf8')
  else await fs.mkdir(target)
  return { path: target }
}

export async function renamePath(oldPath: string, newPath: string): Promise<{ path: string }> {
  try {
    await fs.rename(oldPath, newPath)
  } catch (e) {
    throw new NotaraError(ErrorCodes.Unknown, `重命名失败: ${String(e)}`)
  }
  const mtime = openFiles.get(oldPath)
  openFiles.delete(oldPath)
  if (mtime !== undefined) trackOpen(newPath, mtime)
  return { path: newPath }
}

export async function deleteToTrash(p: string): Promise<void> {
  try {
    await shell.trashItem(p)
  } catch (e) {
    throw new NotaraError(ErrorCodes.Unknown, `移入废纸篓失败: ${String(e)}`)
  }
  openFiles.delete(p)
}

export function trackOpen(p: string, mtime: number): void {
  openFiles.set(p, mtime)
}
export function knownMtime(p: string): number | undefined {
  return openFiles.get(p)
}
export function clearTracked(p: string): void {
  openFiles.delete(p)
}
```

- [ ] **Step 4: 实现 files IPC 通道**

`src/main/ipc/files.ts`：

```ts
import { dialog, BrowserWindow } from 'electron'
import { Channels, registerIpc, broadcast } from './index'
import {
  readFileSafe, writeFileAtomic, createEntry, renamePath, deleteToTrash
} from '../services/fileService'

export function registerFilesIpc(): void {
  registerIpc(Channels.FilesRead, async (p: { path: string }) => readFileSafe(p.path))

  registerIpc(Channels.FilesWrite, async (p: { path: string; content: string }) =>
    writeFileAtomic(p.path, p.content)
  )

  registerIpc(Channels.FilesCreate, async (p: { dir: string; name: string; kind: 'file' | 'directory' }) =>
    createEntry(p.dir, p.name, p.kind)
  )

  registerIpc(Channels.FilesRename, async (p: { oldPath: string; newPath: string }) => {
    const r = await renamePath(p.oldPath, p.newPath)
    broadcast({ type: 'file:renamed', oldPath: p.oldPath, newPath: p.newPath })
    return r
  })

  registerIpc(Channels.FilesDelete, async (p: { path: string }) => deleteToTrash(p.path))

  registerIpc(Channels.FilesSaveAs, async (p: { suggestedName: string; content: string }) => {
    const win = BrowserWindow.getFocusedWindow()
    const r = await dialog.showSaveDialog(win, {
      defaultPath: p.suggestedName,
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }]
    })
    if (r.canceled || !r.filePath) return null
    await writeFileAtomic(r.filePath, p.content)
    return { path: r.filePath }
  })
}
```

`src/main/ipc/index.ts` 中 `registerAllIpc` 改为：

```ts
export function registerAllIpc(): void {
  registerAppIpc()
  registerFilesIpc()
}

import { registerAppIpc } from './app'
import { registerFilesIpc } from './files'
```

- [ ] **Step 5: 运行测试与类型检查**

```bash
npm test && npm run typecheck
```

预期：fileService 全部 PASS（deleteToTrash 无单测——依赖 Electron shell，E2E 覆盖）；typecheck 通过。

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: 文件服务（原子写/二进制检测）与 files IPC"
```

---

### Task 4: saveScheduler 自动保存调度器

**Files:**
- Create: `src/renderer/src/lib/saveScheduler.ts`
- Test: `tests/unit/saveScheduler.spec.ts`

**Interfaces:**
- Produces: `SaveScheduler` 类：`schedule(tabId)`、`cancel(tabId)`、`isPending(tabId)`、`flushOne(tabId): Promise<void>`、`flushAll(): Promise<void>`、`setSaver(fn)`。Task 5/6 依赖：saver 回调由 App 注入，回调签名为 `(tabId: number) => Promise<void>`

- [ ] **Step 1: 写入失败测试**

`tests/unit/saveScheduler.spec.ts`：

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { SaveScheduler } from '../../src/renderer/src/lib/saveScheduler'

describe('SaveScheduler', () => {
  beforeEach(() => vi.useFakeTimers())

  it('输入后 500ms 触发保存', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const s = new SaveScheduler(500)
    s.setSaver(save)
    s.schedule(1)
    expect(save).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(500)
    expect(save).toHaveBeenCalledWith(1)
  })

  it('连续输入只保存最后一次（防抖）', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const s = new SaveScheduler(500)
    s.setSaver(save)
    s.schedule(1)
    await vi.advanceTimersByTimeAsync(300)
    s.schedule(1)
    await vi.advanceTimersByTimeAsync(300)
    expect(save).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(200)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('flushOne 立即保存并清除 pending', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const s = new SaveScheduler(500)
    s.setSaver(save)
    s.schedule(2)
    expect(s.isPending(2)).toBe(true)
    await s.flushOne(2)
    expect(save).toHaveBeenCalledWith(2)
    expect(s.isPending(2)).toBe(false)
    await vi.advanceTimersByTimeAsync(1000)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('cancel 丢弃未触发的保存', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const s = new SaveScheduler(500)
    s.setSaver(save)
    s.schedule(3)
    s.cancel(3)
    expect(s.isPending(3)).toBe(false)
    await vi.advanceTimersByTimeAsync(1000)
    expect(save).not.toHaveBeenCalled()
  })

  it('flushAll 并发保存所有 pending', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const s = new SaveScheduler(500)
    s.setSaver(save)
    s.schedule(1)
    s.schedule(2)
    await s.flushAll()
    expect(new Set(save.mock.calls.map((c) => c[0]))).toEqual(new Set([1, 2]))
  })

  it('保存失败时保持 pending 以便重试', async () => {
    const save = vi.fn().mockRejectedValue(new Error('disk'))
    const s = new SaveScheduler(500)
    s.setSaver(save)
    s.schedule(4)
    await expect(s.flushOne(4)).rejects.toThrow('disk')
    expect(s.isPending(4)).toBe(true)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run tests/unit/saveScheduler.spec.ts
```

预期：FAIL，模块不存在。

- [ ] **Step 3: 实现**

`src/renderer/src/lib/saveScheduler.ts`：

```ts
type Saver = (tabId: number) => Promise<void>

/**
 * 每标签页独立的防抖保存调度。
 * - schedule: 标记 pending 并（重）启动 500ms 定时器
 * - flushOne/flushAll: 绕过定时器立即保存（切标签/关标签/失焦/退出）
 * - 保存失败时保持 pending，下次输入或 flush 重试
 */
export class SaveScheduler {
  private timers = new Map<number, ReturnType<typeof setTimeout>>()
  private pending = new Set<number>()
  private saver: Saver | null = null

  constructor(private delayMs: number) {}

  setSaver(fn: Saver): void {
    this.saver = fn
  }

  schedule(tabId: number): void {
    this.pending.add(tabId)
    const old = this.timers.get(tabId)
    if (old) clearTimeout(old)
    this.timers.set(
      tabId,
      setTimeout(() => {
        this.timers.delete(tabId)
        void this.flushOne(tabId)
      }, this.delayMs)
    )
  }

  cancel(tabId: number): void {
    const t = this.timers.get(tabId)
    if (t) clearTimeout(t)
    this.timers.delete(tabId)
    this.pending.delete(tabId)
  }

  isPending(tabId: number): boolean {
    return this.pending.has(tabId)
  }

  async flushOne(tabId: number): Promise<void> {
    this.cancel(tabId)
    if (!this.saver) return
    try {
      await this.saver(tabId)
    } catch (e) {
      this.pending.add(tabId) // 失败保留，等待重试
      throw e
    }
  }

  async flushAll(): Promise<void> {
    const ids = [...this.pending]
    await Promise.all(
      ids.map((id) =>
        this.flushOne(id).catch(() => {
          /* flushAll 用于退出路径，单个失败不阻断其余 */
        })
      )
    )
  }
}

export const saveScheduler = new SaveScheduler(500)
```

- [ ] **Step 4: 运行测试**

```bash
npx vitest run tests/unit/saveScheduler.spec.ts && npm run typecheck
```

预期：6 个用例 PASS。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: 标签页防抖保存调度器"
```

---

### Task 5: tabs store + TabBar + 确认弹窗

**Files:**
- Create: `src/renderer/src/stores/tabs.ts`、`src/renderer/src/stores/ui.ts`、`src/renderer/src/strings.ts`
- Create: `src/renderer/src/components/Modal.tsx`、`src/renderer/src/components/ConfirmModal.tsx`、`src/renderer/src/components/TabBar.tsx`
- Create: `src/renderer/src/lib/editorRegistry.ts`
- Modify: `src/renderer/src/App.tsx`
- Test: `tests/unit/tabsStore.spec.ts`、`tests/component/TabBar.spec.tsx`

**Interfaces:**
- Consumes: Task 4 `saveScheduler`、Task 2 `api`
- Produces:
  - `TabMeta { id: number; path: string | null; title: string; dirty: boolean; deleted: boolean; initialContent: string }`
  - `useTabs` store：`tabs`、`activeIndex`、`openFile(path, content)`、`openUntitled()`、`close(index)`、`setActive(index)`、`setDirty(id, dirty)`、`setSaved(id, path)`、`markDeleted(path)`、`renamePath(oldPath, newPath)`、`activeTab`
  - `useUi` store：`toasts: {id, text}[]`、`notify(text)`、`dismissToast(id)`、`confirm: {text, danger, onConfirm} | null`、`askConfirm(...)`、`resolveConfirm(ok)`
  - `editors: Map<number, Vditor>`（editorRegistry，Task 6 写入）
  - `titleOf(path: string | null): string`（tabs.ts 导出，Welcome/窗口标题复用）

- [ ] **Step 1: 写入 strings.ts 与失败测试（tabs store）**

`src/renderer/src/strings.ts`：

```ts
// 全部 UI 文案集中于此（设计文档 §6.5）
export const s = {
  app: { name: 'Notara' },
  tab: { untitled: '未命名', deleted: '已删除' },
  confirm: {
    closeDirtyTitle: '未保存的修改',
    closeDirtyText: (n: number) => `「${n}」有未保存的修改，关闭前保存吗？`,
    save: '保存', discard: '不保存', cancel: '取消',
    deleteTitle: '删除', deleteText: (n: string) => `确定将「${n}」移入废纸篓吗？`,
    useDiskTitle: '文件已在磁盘上被修改',
    keepMine: '保留我的版本', useDisk: '加载磁盘版本',
  },
  toast: {
    saveFailed: '保存失败，已保留修改稍后重试',
    binaryFile: '不是文本文件，无法打开',
    deletedFile: '文件已被删除，保存时将提示另存为',
  },
  tree: {
    newFile: '新建文件', newFolder: '新建文件夹', rename: '重命名', del: '删除',
    namePrompt: { file: '文件名（含 .md）', folder: '文件夹名', rename: '新名称' },
    empty: '此目录没有 Markdown 文件',
  },
  welcome: {
    title: '开始写作',
    openFolder: '打开文件夹', newFile: '新建文件',
    recent: '最近的工作区', empty: '还没有最近的工作区',
  },
  outline: { title: '大纲' },
} as const
```

`tests/unit/tabsStore.spec.ts`：

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTabs, titleOf } from '../../src/renderer/src/stores/tabs'

vi.mock('../../src/renderer/src/lib/api', () => ({
  api: { readFile: vi.fn(), writeFile: vi.fn() }
}))

describe('tabs store', () => {
  beforeEach(() => {
    useTabs.setState({ tabs: [], activeIndex: -1 })
  })

  it('openFile 新开标签并激活；重复打开仅激活', () => {
    const { openFile } = useTabs.getState()
    openFile('/w/a.md', '# a')
    openFile('/w/b.md', '# b')
    expect(useTabs.getState().tabs.map((t) => t.title)).toEqual(['a', 'b'])
    expect(useTabs.getState().activeIndex).toBe(1)
    openFile('/w/a.md', '# a')
    expect(useTabs.getState().tabs).toHaveLength(2)
    expect(useTabs.getState().activeIndex).toBe(0)
  })

  it('openUntitled 生成无路径标签', () => {
    useTabs.getState().openUntitled()
    const t = useTabs.getState().tabs[0]
    expect(t.path).toBeNull()
    expect(t.title).toBe('未命名')
    expect(t.dirty).toBe(true)
  })

  it('close 关闭并修正 activeIndex', () => {
    const { openFile } = useTabs.getState()
    openFile('/w/a.md', '1'); openFile('/w/b.md', '2'); openFile('/w/c.md', '3')
    useTabs.getState().close(1)
    expect(useTabs.getState().tabs.map((t) => t.title)).toEqual(['a', 'c'])
    expect(useTabs.getState().activeIndex).toBe(1)
  })

  it('markDeleted / renamePath / setDirty / setSaved', () => {
    useTabs.getState().openFile('/w/a.md', '1')
    const id = useTabs.getState().tabs[0].id
    useTabs.getState().setDirty(id, true)
    expect(useTabs.getState().tabs[0].dirty).toBe(true)
    useTabs.getState().markDeleted('/w/a.md')
    expect(useTabs.getState().tabs[0].deleted).toBe(true)
    useTabs.getState().renamePath('/w/a.md', '/w/z.md')
    expect(useTabs.getState().tabs[0].path).toBe('/w/z.md')
    expect(useTabs.getState().tabs[0].title).toBe('z')
    expect(useTabs.getState().tabs[0].deleted).toBe(false)
    useTabs.getState().setSaved(id, '/w/z2.md')
    expect(useTabs.getState().tabs[0].path).toBe('/w/z2.md')
    expect(useTabs.getState().tabs[0].dirty).toBe(false)
  })

  it('titleOf 处理 null / 扩展名 / 子目录', () => {
    expect(titleOf(null)).toBe('未命名')
    expect(titleOf('/w/docs/note.markdown')).toBe('note')
    expect(titleOf('/w/README.md')).toBe('README')
  })
})
```

- [ ] **Step 2: 运行确认失败**

```bash
npx vitest run tests/unit/tabsStore.spec.ts
```

预期：FAIL，store 模块不存在。

- [ ] **Step 3: 实现 stores**

`src/renderer/src/lib/editorRegistry.ts`（vditor 类型在此任务先以 `unknown` 引用，Task 6 替换为真实导入）：

```ts
import type Vditor from 'vditor'

// tabId → vditor 实例。模块级 Map 保证实例跨 React 渲染存活（撤销历史保留）
export const editors = new Map<number, Vditor>()
```

注意：本任务 `vditor` 尚未安装进渲染进程可解析范围？已安装（package.json Task 1）。类型导入无副作用，可直接用。

`src/renderer/src/stores/tabs.ts`：

```ts
import { create } from 'zustand'

export interface TabMeta {
  id: number
  path: string | null
  title: string
  dirty: boolean
  deleted: boolean
  initialContent: string
}

interface TabsState {
  tabs: TabMeta[]
  activeIndex: number
  openFile: (path: string, content: string) => void
  openUntitled: () => void
  close: (index: number) => void
  setActive: (index: number) => void
  setDirty: (id: number, dirty: boolean) => void
  setSaved: (id: number, path: string | null) => void
  markDeleted: (path: string) => void
  renamePath: (oldPath: string, newPath: string) => void
}

let nextId = 1

export function titleOf(path: string | null): string {
  if (!path) return '未命名'
  const base = path.split('/').pop() ?? path
  return base.replace(/\.(md|markdown)$/i, '')
}

export const useTabs = create<TabsState>((set, get) => ({
  tabs: [],
  activeIndex: -1,

  openFile(path, content) {
    const i = get().tabs.findIndex((t) => t.path === path)
    if (i >= 0) {
      set({ activeIndex: i })
      return
    }
    const tab: TabMeta = {
      id: nextId++,
      path,
      title: titleOf(path),
      dirty: false,
      deleted: false,
      initialContent: content
    }
    set((st) => ({ tabs: [...st.tabs, tab], activeIndex: st.tabs.length }))
  },

  openUntitled() {
    const tab: TabMeta = {
      id: nextId++,
      path: null,
      title: '未命名',
      dirty: true, // 未保存过，视为脏
      deleted: false,
      initialContent: ''
    }
    set((st) => ({ tabs: [...st.tabs, tab], activeIndex: st.tabs.length }))
  },

  close(index) {
    set((st) => {
      const tabs = st.tabs.filter((_, i) => i !== index)
      let activeIndex = st.activeIndex
      if (activeIndex >= tabs.length) activeIndex = tabs.length - 1
      if (index < st.activeIndex) activeIndex -= 1
      return { tabs, activeIndex }
    })
  },

  setActive(index) {
    set({ activeIndex: index })
  },

  setDirty(id, dirty) {
    set((st) => ({
      tabs: st.tabs.map((t) => (t.id === id ? { ...t, dirty } : t))
    }))
  },

  setSaved(id, path) {
    set((st) => ({
      tabs: st.tabs.map((t) =>
        t.id === id ? { ...t, dirty: false, deleted: false, path, title: titleOf(path) } : t
      )
    }))
  },

  markDeleted(path) {
    set((st) => ({
      tabs: st.tabs.map((t) => (t.path === path ? { ...t, deleted: true } : t))
    }))
  },

  renamePath(oldPath, newPath) {
    set((st) => ({
      tabs: st.tabs.map((t) =>
        t.path === oldPath
          ? { ...t, path: newPath, title: titleOf(newPath), deleted: false }
          : t
      )
    }))
  }
}))

// 便捷选择器
export const activeTab = (st: TabsState): TabMeta | null => st.tabs[st.activeIndex] ?? null
```

`src/renderer/src/stores/ui.ts`：

```ts
import { create } from 'zustand'

export interface Toast {
  id: number
  text: string
}

export interface ConfirmRequest {
  text: string
  confirmText: string
  danger?: boolean
  onConfirm: () => void
  onCancel?: () => void
}

interface UiState {
  toasts: Toast[]
  notify: (text: string) => void
  dismissToast: (id: number) => void
  confirm: ConfirmRequest | null
  askConfirm: (req: ConfirmRequest) => void
  resolveConfirm: (ok: boolean) => void
  sidebarVisible: boolean
  toggleSidebar: () => void
  outlineVisible: boolean
  toggleOutline: () => void
}

let toastId = 1

export const useUi = create<UiState>((set, get) => ({
  toasts: [],
  notify(text) {
    const id = toastId++
    set((st) => ({ toasts: [...st.toasts, { id, text }] }))
    setTimeout(() => get().dismissToast(id), 4000)
  },
  dismissToast(id) {
    set((st) => ({ toasts: st.toasts.filter((t) => t.id !== id) }))
  },
  confirm: null,
  askConfirm(req) {
    set({ confirm: req })
  },
  resolveConfirm(ok) {
    const c = get().confirm
    set({ confirm: null })
    if (!c) return
    if (ok) c.onConfirm()
    else c.onCancel?.()
  },
  sidebarVisible: true,
  toggleSidebar() {
    set((st) => ({ sidebarVisible: !st.sidebarVisible }))
  },
  outlineVisible: true,
  toggleOutline() {
    set((st) => ({ outlineVisible: !st.outlineVisible }))
  }
}))
```

（sidebarVisible/outlineVisible 本任务一并实现，Task 10/14 消费。）

- [ ] **Step 4: 运行 tabs store 测试**

```bash
npx vitest run tests/unit/tabsStore.spec.ts
```

预期：5 个用例 PASS。

- [ ] **Step 5: 写入 TabBar 失败测试**

`tests/component/TabBar.spec.tsx`：

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TabBar } from '../../src/renderer/src/components/TabBar'
import type { TabMeta } from '../../src/renderer/src/stores/tabs'

const tabs: TabMeta[] = [
  { id: 1, path: '/w/a.md', title: 'a', dirty: false, deleted: false, initialContent: '' },
  { id: 2, path: '/w/b.md', title: 'b', dirty: true, deleted: false, initialContent: '' },
  { id: 3, path: null, title: '未命名', dirty: true, deleted: true, initialContent: '' }
]

describe('TabBar', () => {
  it('渲染标签、脏圆点、已删除样式', () => {
    render(<TabBar tabs={tabs} activeIndex={0} onSelect={() => {}} onClose={() => {}} onNew={() => {}} />)
    expect(screen.getByTestId('tab-0')).toHaveTextContent('a')
    expect(screen.getByTestId('tab-1')).toHaveTextContent('b')
    expect(screen.getByTestId('tab-1').querySelector('.dirty-dot')).toBeInTheDocument()
    expect(screen.getByTestId('tab-2')).toHaveClass('deleted')
  })

  it('点击切换、点击 X 关闭、中键关闭、+ 新建', () => {
    const onSelect = vi.fn(); const onClose = vi.fn(); const onNew = vi.fn()
    render(<TabBar tabs={tabs} activeIndex={0} onSelect={onSelect} onClose={onClose} onNew={onNew} />)
    fireEvent.click(screen.getByTestId('tab-1'))
    expect(onSelect).toHaveBeenCalledWith(1)
    fireEvent.click(screen.getByTestId('tab-1-close'))
    expect(onClose).toHaveBeenCalledWith(1)
    fireEvent.mouseUp(screen.getByTestId('tab-2'), { button: 1 })
    expect(onClose).toHaveBeenCalledWith(2)
    fireEvent.click(screen.getByTestId('tab-new'))
    expect(onNew).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 6: 运行确认失败**

```bash
npx vitest run tests/component/TabBar.spec.tsx
```

预期：FAIL，组件不存在。

- [ ] **Step 7: 实现 Modal / ConfirmModal / TabBar**

`src/renderer/src/components/Modal.tsx`：

```tsx
import type { ReactNode } from 'react'

interface ModalProps {
  title: string
  children: ReactNode
  buttons: ReactNode
}

export function Modal({ title, children, buttons }: ModalProps) {
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-label={title}>
        <h2 className="modal-title">{title}</h2>
        <div className="modal-body">{children}</div>
        <div className="modal-buttons">{buttons}</div>
      </div>
    </div>
  )
}
```

`src/renderer/src/components/ConfirmModal.tsx`（通用确认，读取 ui store）：

```tsx
import { useUi } from '../stores/ui'
import { s } from '../strings'
import { Modal } from './Modal'

export function ConfirmModal() {
  const confirm = useUi((st) => st.confirm)
  const resolve = useUi((st) => st.resolveConfirm)
  if (!confirm) return null
  return (
    <Modal
      title={confirm.danger ? s.confirm.deleteTitle : s.confirm.closeDirtyTitle}
      buttons={
        <>
          {confirm.onCancel && (
            <button className="btn" onClick={() => resolve(false)}>
              {s.confirm.cancel}
            </button>
          )}
          {confirm.danger && (
            <button className="btn" onClick={() => resolve(false)}>
              {s.confirm.cancel}
            </button>
          )}
          <button
            className={`btn ${confirm.danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => resolve(true)}
          >
            {confirm.confirmText}
          </button>
        </>
      }
    >
      {confirm.text}
    </Modal>
  )
}
```

实现说明：`onCancel` 与 `danger` 两个分支会渲染重复的取消按钮——实现时改为单一路径：始终渲染取消按钮（`resolve(false)` 调用 `onCancel?.()`），删除 `confirm.onCancel &&` 与 `confirm.danger &&` 两处重复块，仅保留一个取消按钮。标题由 ConfirmRequest 增加 `title` 字段决定（`interface ConfirmRequest { title: string; text: string; confirmText: string; danger?: boolean; onConfirm: () => void; onCancel?: () => void }`），同步更新 ui.ts。

`src/renderer/src/components/TabBar.tsx`：

```tsx
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
            {t.dirty && <span className="dirty-dot" aria-label="未保存" />}
            <button
              data-testid={`tab-${i}-close`}
              className="tab-close"
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
      <button data-testid="tab-new" className="tab-new" onClick={onNew} aria-label="新建文件">
        +
      </button>
    </div>
  )
}
```

`src/renderer/src/App.tsx`（本任务先静态渲染 TabBar 验证样式，Task 6 接入真实数据流）：

```tsx
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
        <TabBar tabs={tabs} activeIndex={activeIndex} onSelect={setActive} onClose={close} onNew={() => useTabs.getState().openUntitled()} />
      )}
      <ConfirmModal />
    </div>
  )
}
```

`src/renderer/src/styles/global.css` 追加：

```css
/* 标签栏 */
.tabbar { display: flex; align-items: center; height: 36px; padding: 0 8px; user-select: none; -webkit-app-region: drag; }
.tabbar-tabs { display: flex; gap: 2px; overflow-x: auto; flex: 1; -webkit-app-region: no-drag; }
.tab { display: flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 6px; cursor: pointer; white-space: nowrap; font-size: 13px; color: var(--fg-secondary); }
.tab.active { background: var(--bg-elevated); color: var(--fg); }
.tab.deleted .tab-title { text-decoration: line-through; opacity: 0.6; }
.dirty-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); }
.tab-close { border: none; background: none; color: inherit; cursor: pointer; padding: 0 2px; font-size: 14px; opacity: 0; }
.tab:hover .tab-close, .tab.active .tab-close { opacity: 0.7; }
.tab-new { border: none; background: none; font-size: 16px; color: var(--fg-secondary); cursor: pointer; padding: 2px 8px; -webkit-app-region: no-drag; }
/* 弹窗 */
.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: var(--bg-elevated); border-radius: 10px; min-width: 320px; max-width: 440px; padding: 16px; box-shadow: 0 8px 30px rgba(0,0,0,0.25); }
.modal-title { margin: 0 0 8px; font-size: 15px; }
.modal-body { font-size: 13px; color: var(--fg-secondary); margin-bottom: 16px; }
.modal-buttons { display: flex; justify-content: flex-end; gap: 8px; }
.btn { padding: 5px 14px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--fg); cursor: pointer; font-size: 13px; }
.btn-primary { background: var(--accent); color: #fff; border-color: transparent; }
.btn-danger { background: #d64545; color: #fff; border-color: transparent; }
```

同时 `global.css` 顶部加入 CSS 变量基础（Task 14 完整扩展）：

```css
:root {
  --bg: #ffffff; --bg-elevated: #f5f5f7; --fg: #1d1d1f; --fg-secondary: #6e6e73;
  --border: #d2d2d7; --accent: #3167d6;
}
```

- [ ] **Step 8: 运行全部测试**

```bash
npm test && npm run typecheck
```

预期：全部 PASS。

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: 标签页 store、TabBar 与确认弹窗"
```

---

### Task 6: Editor 组件（vditor 即时渲染）与打开/保存流程

**Files:**
- Modify: `scripts/copy-vditor.mjs`（真实实现）
- Create: `src/renderer/src/components/Editor.tsx`、`src/renderer/src/lib/format.ts`、`src/renderer/src/lib/openFile.ts`
- Modify: `src/renderer/src/App.tsx`（接入编辑器与数据流）、`src/renderer/src/styles/global.css`
- Test: `tests/unit/format.spec.ts`、`tests/unit/openFile.spec.ts`

**Interfaces:**
- Consumes: Task 5 `useTabs`/`useUi`/`editors`、Task 4 `saveScheduler`
- Produces:
  - `Editor` 组件：props `{ tabId: number; initial: string; active: boolean; onInput: (tabId: number) => void }`；创建后写入 `editors` Map
  - `applyWrap(vditor: Vditor, mark: string): void`（format.ts，加粗/斜体/行内代码）
  - `openPath(path: string): Promise<void>`（openFile.ts，读取并开标签，失败 toast）
  - App 挂载时调用 `initAppFlow()`（App 内部函数）：注入 saveScheduler.setSaver、绑定窗口失焦 flush、注册菜单事件处理（Task 7 前先处理 save/save-as/new-file）

- [ ] **Step 1: 实现 vditor 静态资源拷贝脚本**

`scripts/copy-vditor.mjs`（整体替换占位）：

```js
// 将 vditor 的 dist 拷贝到渲染进程 public 目录，供运行时 cdn:'./vditor' 加载
// （vditor 会按需懒加载 prism/mermaid/katex 等子资源，必须随应用分发）
import { cpSync, rmSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url)) + '/..'
const src = join(root, 'node_modules/vditor/dist')
const dest = join(root, 'src/renderer/public/vditor/dist')

rmSync(join(root, 'src/renderer/public/vditor'), { recursive: true, force: true })
if (!existsSync(src)) {
  console.log('[copy-vditor] node_modules/vditor/dist 不存在，跳过（先 npm install）')
  process.exit(0)
}
mkdirSync(dirname(dest), { recursive: true })
cpSync(src, dest, { recursive: true })
console.log('[copy-vditor] 已拷贝到 src/renderer/public/vditor/dist')
```

- [ ] **Step 2: 写入失败测试（format + openFile）**

`tests/unit/format.spec.ts`：

```ts
import { describe, expect, it, vi } from 'vitest'
import { applyWrap } from '../../src/renderer/src/lib/format'

function fakeVditor(sel: string) {
  return { getSelection: () => sel, insertValue: vi.fn() } as unknown as Parameters<typeof applyWrap>[0]
}

describe('applyWrap', () => {
  it('有选中文本时包裹', () => {
    const vd = fakeVditor('文本')
    applyWrap(vd, '**')
    expect(vd.insertValue).toHaveBeenCalledWith('**文本**')
  })
  it('无选中时插入空标记并光标居中（退化为插入）', () => {
    const vd = fakeVditor('')
    applyWrap(vd, '`')
    expect(vd.insertValue).toHaveBeenCalledWith('``')
  })
  it('链接格式特殊处理', () => {
    const vd = fakeVditor('选中文本')
    applyWrap(vd, 'link')
    expect(vd.insertValue).toHaveBeenCalledWith('[选中文本](url)')
  })
})
```

`tests/unit/openFile.spec.ts`：

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { openPath } from '../../src/renderer/src/lib/openFile'
import { useTabs } from '../../src/renderer/src/stores/tabs'
import { useUi } from '../../src/renderer/src/stores/ui'

const readFileMock = vi.fn()
vi.mock('../../src/renderer/src/lib/api', () => ({ api: { readFile: (...a: unknown[]) => readFileMock(...a) } }))

describe('openPath', () => {
  beforeEach(() => {
    useTabs.setState({ tabs: [], activeIndex: -1 })
    useUi.setState({ toasts: [] })
    readFileMock.mockReset()
  })

  it('成功读取并打开标签', async () => {
    readFileMock.mockResolvedValue({ content: '# hi', mtime: 1 })
    await openPath('/w/a.md')
    expect(useTabs.getState().tabs[0].initialContent).toBe('# hi')
  })

  it('读取失败（如二进制）时 toast 且不开标签', async () => {
    readFileMock.mockRejectedValue(Object.assign(new Error('不是文本文件'), { code: 'binary-file' }))
    await openPath('/w/bin.md')
    expect(useTabs.getState().tabs).toHaveLength(0)
    expect(useUi.getState().toasts[0]?.text).toContain('文本')
  })
})
```

- [ ] **Step 3: 运行确认失败**

```bash
npx vitest run tests/unit/format.spec.ts tests/unit/openFile.spec.ts
```

预期：FAIL，模块不存在。

- [ ] **Step 4: 实现 format.ts / openFile.ts / Editor.tsx**

`src/renderer/src/lib/format.ts`：

```ts
import type Vditor from 'vditor'

/** 用指定标记包裹当前选中文本；link 生成 [text](url)；无选中则插入空标记 */
export function applyWrap(vditor: Vditor, mark: string): void {
  const sel = vditor.getSelection() ?? ''
  if (mark === 'link') {
    vditor.insertValue(`[${sel || 'url'}](url)`)
    return
  }
  vditor.insertValue(`${mark}${sel}${mark}`)
}
```

`src/renderer/src/lib/openFile.ts`：

```ts
import { api } from './api'
import { useTabs } from '../stores/tabs'
import { useUi } from '../stores/ui'

/** 读取文件并打开标签；失败（二进制/不存在等）toast 提示 */
export async function openPath(path: string): Promise<void> {
  try {
    const { content } = await api.readFile(path)
    useTabs.getState().openFile(path, content)
  } catch (e) {
    const code = (e as { code?: string }).code
    useUi.getState().notify(code === 'binary-file' ? '不是文本文件，无法打开' : `打开失败: ${(e as Error).message}`)
  }
}
```

（toast 文案从 strings.ts 取——实现时用 `s.toast.binaryFile` / 内联 fallback，保持与 strings 一致。）

`src/renderer/src/components/Editor.tsx`：

```tsx
import { useEffect, useRef } from 'react'
import Vditor from 'vditor'
import 'vditor/dist/index.css'
import { editors } from '../lib/editorRegistry'

interface EditorProps {
  tabId: number
  initial: string
  active: boolean
  onInput: (tabId: number) => void
}

export function Editor({ tabId, initial, active, onInput }: EditorProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const onInputRef = useRef(onInput)
  onInputRef.current = onInput

  useEffect(() => {
    if (!hostRef.current) return
    const vd = new Vditor(hostRef.current, {
      mode: 'ir',
      lang: 'zh_CN',
      value: initial,
      cache: { enable: false },
      toolbar: [],
      height: '100%',
      cdn: './vditor', // 指向 public/vditor（脚本拷贝），离线可用
      outline: { enable: true, position: 'left' },
      input: () => onInputRef.current(tabId)
    })
    editors.set(tabId, vd)
    return () => {
      editors.delete(tabId)
      vd.destroy()
    }
    // initial 只在挂载时消费一次；后续内容由 vditor 管理
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId])

  // 切换到该标签时聚焦
  useEffect(() => {
    if (active) editors.get(tabId)?.focus()
  }, [active, tabId])

  return (
    <div
      ref={hostRef}
      style={{ display: active ? 'block' : 'none', height: '100%' }}
      data-testid={`editor-${tabId}`}
    />
  )
}
```

- [ ] **Step 5: App.tsx 接入数据流（完整替换）**

`src/renderer/src/App.tsx`：

```tsx
import { useEffect } from 'react'
import { TabBar } from './components/TabBar'
import { ConfirmModal } from './components/ConfirmModal'
import { Editor } from './components/Editor'
import { useTabs } from './stores/tabs'
import { useUi } from './stores/ui'
import { api } from './lib/api'
import { saveScheduler } from './lib/saveScheduler'
import { editors } from './lib/editorRegistry'

export function App() {
  const tabs = useTabs((st) => st.tabs)
  const activeIndex = useTabs((st) => st.activeIndex)
  const setActive = useTabs((st) => st.setActive)
  const notify = useUi((st) => st.notify)

  // 保存管线：防抖/flush → 读 vditor 内容 → 写盘 → 清脏标记
  useEffect(() => {
    saveScheduler.setSaver(async (tabId) => {
      const tab = useTabs.getState().tabs.find((t) => t.id === tabId)
      const vd = editors.get(tabId)
      if (!tab || !vd) return
      if (tab.path === null || tab.deleted) return // 未命名/已删除标签等待 ⌘S 另存为
      try {
        await api.writeFile(tab.path, vd.getValue())
        useTabs.getState().setDirty(tabId, false)
      } catch {
        notify('保存失败，已保留修改稍后重试')
        throw new Error('save-failed')
      }
    })
  }, [notify])

  // 窗口失焦 flush
  useEffect(() => {
    const onBlur = (): void => {
      void saveScheduler.flushAll()
    }
    window.addEventListener('blur', onBlur)
    return () => window.removeEventListener('blur', onBlur)
  }, [])

  // 输入 → 脏标记 + 防抖保存
  const handleInput = (tabId: number): void => {
    const tab = useTabs.getState().tabs.find((t) => t.id === tabId)
    if (tab && !tab.dirty) useTabs.getState().setDirty(tabId, true)
    saveScheduler.schedule(tabId)
  }

  // 关闭标签：脏则确认（保存→flush 后关 / 不保存→cancel 后关）
  const handleClose = (index: number): void => {
    const tab = tabs[index]
    if (!tab) return
    if (!tab.dirty) {
      useTabs.getState().close(index)
      return
    }
    useUi.getState().askConfirm({
      title: '未保存的修改',
      text: `「${tab.title}」有未保存的修改，关闭前保存吗？`,
      confirmText: '保存',
      onConfirm: () => {
        void (async () => {
          await saveScheduler.flushOne(tab.id).catch(() => undefined)
          useTabs.getState().close(index)
        })()
      },
      onCancel: () => {
        saveScheduler.cancel(tab.id)
        useTabs.getState().close(index)
      }
    })
  }

  return (
    <div className="app">
      {tabs.length > 0 ? (
        <>
          <TabBar
            tabs={tabs}
            activeIndex={activeIndex}
            onSelect={setActive}
            onClose={handleClose}
            onNew={() => useTabs.getState().openUntitled()}
          />
          <div className="editors">
            {tabs.map((t, i) => (
              <Editor key={t.id} tabId={t.id} initial={t.initialContent} active={i === activeIndex} onInput={handleInput} />
            ))}
          </div>
        </>
      ) : null}
      <ConfirmModal />
    </div>
  )
}
```

`global.css` 追加：

```css
.editors { flex: 1; min-height: 0; overflow: hidden; }
.app { display: flex; flex-direction: column; height: 100%; }
.editors .vditor { --panel-background-color: var(--bg); }
.editors .vditor-ir pre.vditor-reset { font-family: inherit; }
```

- [ ] **Step 6: 运行测试、类型检查、手动验证**

```bash
npm test && npm run typecheck
```

预期：PASS。

手动验证清单（`npm run dev` 后在 DevTools console 用 `await window.notara.readFile('/tmp/x.md')` 与 `window.notara` API 驱动）：

1. console 执行 `openPath` 等价流程：临时在 App 挂载 useEffect 里调 `openPath('<任意md>')`（验证后删除）或直接调用 `window.notara.openDialog()` 弹原生对话框选择 .md 文件 →（本任务尚未接菜单，⌘O 在 Task 7；先以临时按钮/console 验证）
2. 标签出现，vditor 即时渲染模式可见：输入 `# 标题` 回车后转为大标题、`**加粗**` 输完 `*` 后语法标记淡出仅显示加粗效果
3. 输入后标签出现脏圆点，约 500ms 后自动消失（保存成功），磁盘文件内容已更新（`cat` 验证）
4. 中文 IME 输入无断字；数学公式 `$x^2$` 渲染；代码块高亮正常（验证 ./vditor 静态资源路径有效——DevTools Network 无 404）

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: vditor 即时渲染编辑器与自动保存管线"
```

---

### Task 7: 应用菜单 + 窗口模型 + 另存为

**Files:**
- Create: `src/main/menu.ts`
- Modify: `src/main/index.ts`（装配菜单、启动参数）、`src/main/ipc/app.ts`（get-launch-open）
- Modify: `src/renderer/src/App.tsx`（菜单事件处理 + open 流程）
- Test: `tests/unit/menuActions.spec.ts`

**Interfaces:**
- Consumes: Task 2 `MenuAction`/`broadcast`、Task 6 `openPath`/`saveScheduler`/`editors`/`applyWrap`
- Produces: macOS 完整菜单；`--open <path>` 启动参数与 `NOTARA_OPEN` 环境变量（`getLaunchOpen()` 读取一次后清空）；渲染侧 `handleMenuAction(action: MenuAction): Promise<void>`（tests 直接覆盖其核心分支 save/save-as/new-file）

- [ ] **Step 1: 写入失败测试（菜单动作处理核心逻辑）**

把 `handleMenuAction` 的核心编排放在 `src/renderer/src/lib/menuActions.ts`（纯逻辑、可测），App 只做事件转发。`tests/unit/menuActions.spec.ts`：

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handleMenuAction } from '../../src/renderer/src/lib/menuActions'
import { useTabs } from '../../src/renderer/src/stores/tabs'
import { saveScheduler } from '../../src/renderer/src/lib/saveScheduler'
import { editors } from '../../src/renderer/src/lib/editorRegistry'

vi.mock('../../src/renderer/src/lib/api', () => ({
  api: {
    saveFileAs: vi.fn(),
    createEntry: vi.fn(),
    readFile: vi.fn()
  }
}))
import { api } from '../../src/renderer/src/lib/api'

describe('handleMenuAction', () => {
  beforeEach(() => {
    useTabs.setState({ tabs: [], activeIndex: -1 })
    vi.clearAllMocks()
  })

  it('save：无脏标签时不触发写盘', async () => {
    useTabs.getState().openFile('/w/a.md', 'x')
    useTabs.getState().setDirty(useTabs.getState().tabs[0].id, false)
    const spy = vi.spyOn(saveScheduler, 'flushOne').mockResolvedValue()
    await handleMenuAction('save')
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('save：脏标签触发 flushOne', async () => {
    useTabs.getState().openFile('/w/a.md', 'x')
    const id = useTabs.getState().tabs[0].id
    useTabs.getState().setDirty(id, true)
    const spy = vi.spyOn(saveScheduler, 'flushOne').mockResolvedValue()
    await handleMenuAction('save')
    expect(spy).toHaveBeenCalledWith(id)
    spy.mockRestore()
  })

  it('save：未命名标签走 save-as 对话框路径', async () => {
    useTabs.getState().openUntitled()
    const asSave = vi.mocked(api.saveFileAs).mockResolvedValue({ path: '/w/new.md' })
    const vd = { getValue: () => '内容' } as never
    editors.set(useTabs.getState().tabs[0].id, vd as never)
    await handleMenuAction('save')
    expect(asSave).toHaveBeenCalledWith('未命名.md', '内容')
    expect(useTabs.getState().tabs[0].path).toBe('/w/new.md')
    editors.clear()
  })

  it('new-file：无工作区时开未命名标签', async () => {
    await handleMenuAction('new-file')
    expect(useTabs.getState().tabs[0].path).toBeNull()
  })
})
```

- [ ] **Step 2: 运行确认失败**

```bash
npx vitest run tests/unit/menuActions.spec.ts
```

预期：FAIL，模块不存在。

- [ ] **Step 3: 实现渲染侧 menuActions.ts**

`src/renderer/src/lib/menuActions.ts`：

```ts
import type { MenuAction } from '@shared/types'
import { api } from './api'
import { saveScheduler } from './saveScheduler'
import { editors } from './editorRegistry'
import { applyWrap } from './format'
import { openPath } from './openFile'
import { useTabs } from '../stores/tabs'
import { useUi } from '../stores/ui'
import { useWorkspace } from '../stores/workspace'

/** 处理菜单/快捷键动作。workspace store 在 Task 8 创建，此处先以可选引用。
 *  实现 Task 8 后该 import 生效；本任务先创建 workspace store 的最小占位。 */

async function activeVditor() {
  const tab = useTabs.getState().tabs[useTabs.getState().activeIndex]
  if (!tab) return null
  return { tab, vd: editors.get(tab.id) ?? null }
}

async function doSaveAs(): Promise<void> {
  const { tab, vd } = await activeVditor()
  if (!tab || !vd) return
  const r = await api.saveFileAs(`${tab.title}.md`, vd.getValue())
  if (!r) return // 用户取消
  useTabs.getState().setSaved(tab.id, r.path)
}

export async function handleMenuAction(action: MenuAction): Promise<void> {
  switch (action) {
    case 'open': {
      const r = await api.openDialog()
      if (!r) return
      if (r.type === 'folder') await useWorkspace.getState().open(r.path)
      else await openPath(r.path)
      return
    }
    case 'new-file': {
      const root = useWorkspace.getState().root
      if (root) {
        // 工作区内新建：找不重名的 未命名-N.md
        for (let n = 1; n < 100; n++) {
          const name = `未命名-${n}.md`
          try {
            const { path } = await api.createEntry(root, name, 'file')
            await openPath(path)
            return
          } catch (e) {
            if ((e as { code?: string }).code !== 'target-exists') throw e
          }
        }
      }
      useTabs.getState().openUntitled()
      return
    }
    case 'save': {
      const { tab } = await activeVditor()
      if (!tab) return
      if (tab.path === null || tab.deleted) {
        await doSaveAs()
        return
      }
      if (tab.dirty) await saveScheduler.flushOne(tab.id).catch(() => undefined)
      return
    }
    case 'save-as':
      await doSaveAs()
      return
    case 'close-tab': {
      const idx = useTabs.getState().activeIndex
      if (idx >= 0) window.dispatchEvent(new CustomEvent('notara:close-tab', { detail: idx }))
      return
    }
    case 'format-bold':
    case 'format-italic':
    case 'format-code': {
      const { vd } = await activeVditor()
      if (!vd) return
      const mark = action === 'format-bold' ? '**' : action === 'format-italic' ? '*' : '`'
      applyWrap(vd, mark)
      return
    }
    case 'format-link': {
      const { vd } = await activeVditor()
      if (vd) applyWrap(vd, 'link')
      return
    }
    case 'toggle-sidebar':
      useUi.getState().toggleSidebar()
      return
    case 'toggle-outline':
      useUi.getState().toggleOutline()
      return
    default:
      if (action.startsWith('set-theme:')) {
        const { useThemeStore } = await import('../stores/theme')
        await useThemeStore.getState().set(action.slice('set-theme:'.length))
      }
      // export-pdf / export-html 在 Task 15 接入，new-window 由主进程直接处理
      return
  }
}
```

同时创建 Task 8 的**最小占位** workspace store（`src/renderer/src/stores/workspace.ts`，Task 8 完整化）：

```ts
import { create } from 'zustand'

interface WorkspaceState {
  root: string | null
  open: (root: string) => Promise<void>
}

export const useWorkspace = create<WorkspaceState>((set) => ({
  root: null,
  async open(root) {
    set({ root })
  }
}))
```

- [ ] **Step 4: 实现主进程菜单**

`src/main/menu.ts`：

```ts
import { Menu, app, BrowserWindow, type MenuItemConstructorOptions } from 'electron'

function sendFocused(action: string): void {
  const win = BrowserWindow.getFocusedWindow()
  win?.webContents.send('main:event', { type: 'menu:action', action })
}

export function installMenu(): void {
  const isDev = !app.isPackaged

  const template: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: '文件',
      submenu: [
        { label: '新建文件', accelerator: 'CmdOrCtrl+N', click: () => sendFocused('new-file') },
        { label: '新建窗口', accelerator: 'CmdOrCtrl+Shift+N', click: () => void createWindow() },
        { label: '打开…', accelerator: 'CmdOrCtrl+O', click: () => sendFocused('open') },
        { type: 'separator' },
        { label: '保存', accelerator: 'CmdOrCtrl+S', click: () => sendFocused('save') },
        { label: '另存为…', accelerator: 'CmdOrCtrl+Shift+S', click: () => sendFocused('save-as') },
        { type: 'separator' },
        { label: '导出 PDF', accelerator: 'CmdOrCtrl+E', click: () => sendFocused('export-pdf') },
        { label: '导出 HTML', accelerator: 'CmdOrCtrl+Shift+E', click: () => sendFocused('export-html') },
        { type: 'separator' },
        { label: '关闭标签', accelerator: 'CmdOrCtrl+W', click: () => sendFocused('close-tab') },
        { role: 'closeWindow' }
      ]
    },
    { role: 'editMenu', label: '编辑' },
    {
      label: '格式',
      submenu: [
        { label: '加粗', accelerator: 'CmdOrCtrl+B', click: () => sendFocused('format-bold') },
        { label: '斜体', accelerator: 'CmdOrCtrl+I', click: () => sendFocused('format-italic') },
        { label: '行内代码', accelerator: 'CmdOrCtrl+Shift+K', click: () => sendFocused('format-code') },
        { label: '链接', accelerator: 'CmdOrCtrl+K', click: () => sendFocused('format-link') }
      ]
    },
    {
      label: '视图',
      submenu: [
        { label: '切换侧边栏', accelerator: 'CmdOrCtrl+\\', click: () => sendFocused('toggle-sidebar') },
        { label: '切换大纲', accelerator: 'CmdOrCtrl+Shift+O', click: () => sendFocused('toggle-outline') },
        ...(isDev ? [{ type: 'separator' as const }, { role: 'toggleDevTools' as const }] : [])
      ]
    },
    { role: 'windowMenu', label: '窗口' }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
```

（`menu.ts` 顶部：`import { createWindow } from './window'`。）

**外部链接拦截（设计 §8）**：`src/main/window.ts` 的 `createWindow` 中追加：

```ts
  // 外部链接一律走系统浏览器，禁止应用内导航
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    if (!devUrl || !url.startsWith(devUrl)) e.preventDefault()
  })
```

（window.ts 顶部补 `import { shell } from 'electron'`。）

`src/main/index.ts`（更新装配 + 启动参数）：

```ts
import { app, BrowserWindow } from 'electron'
import { createWindow } from './window'
import { registerAllIpc } from './ipc'
import { installMenu } from './menu'

// 启动参数：--open <path> 或环境变量 NOTARA_OPEN（E2E 使用）
let launchOpen: string | null = null
{
  const i = process.argv.indexOf('--open')
  if (i >= 0 && process.argv[i + 1]) launchOpen = process.argv[i + 1]
  else if (process.env['NOTARA_OPEN']) launchOpen = process.env['NOTARA_OPEN']
}
export function consumeLaunchOpen(): string | null {
  const v = launchOpen
  launchOpen = null
  return v
}

app.whenReady().then(() => {
  registerAllIpc()
  installMenu()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

`src/main/ipc/app.ts` 追加（在 registerAppIpc 内）：

```ts
import { consumeLaunchOpen } from '../index'

registerIpc(Channels.AppGetLaunchOpen, async () => consumeLaunchOpen())
```

- [ ] **Step 5: App.tsx 接入菜单事件与启动打开**

`src/renderer/src/App.tsx` 增加 effect（其余不变）：

```tsx
import { handleMenuAction } from './lib/menuActions'
import { openPath } from './lib/openFile'
import { useWorkspace } from './stores/workspace'
import type { MainEvent } from '@shared/types'

  // 订阅主进程事件（菜单动作 + 后续任务的外部变更等）
  useEffect(() => {
    const off = api.onEvent((event: MainEvent) => {
      if (event.type === 'menu:action') void handleMenuAction(event.action)
    })
    return off
  }, [])

  // 启动参数自动打开（--open / NOTARA_OPEN）
  useEffect(() => {
    void (async () => {
      const p = await api.getLaunchOpen()
      if (!p) return
      const stat = await api.readFile(p).then(
        () => 'file' as const,
        () => 'folder' as const
      )
      if (stat === 'file') await openPath(p)
      else await useWorkspace.getState().open(p)
    })()
  }, [])
```

同时在 App 中监听自定义事件 `notara:close-tab`（menuActions 的 close-tab 派发）转发到 handleClose：

```tsx
  useEffect(() => {
    const h = (e: Event): void => {
      const idx = (e as CustomEvent<number>).detail
      handleClose(idx)
    }
    window.addEventListener('notara:close-tab', h)
    return () => window.removeEventListener('notara:close-tab', h)
  }, [])
```

注意 handleClose 定义在组件体内、依赖 tabs——将该 effect 放在 handleClose 声明之后，依赖数组留空但通过 ref 引用最新 handleClose（`const closeRef = useRef(handleClose); closeRef.current = handleClose`）。

- [ ] **Step 6: 测试 + 手动验证**

```bash
npm test && npm run typecheck
```

手动清单：

1. ⌘O → 选择 .md → 打开编辑（单文件轻窗口形态：无文件树）
2. ⌘N → 无工作区时开"未命名"标签 → 输入 → ⌘S → 另存为对话框 → 保存后标签标题更新、脏点消失
3. ⌘B/⌘I/⌘K 对选中文本生效
4. ⌘W 关闭脏标签 → 弹确认（保存/不保存/取消 三态行为正确）
5. ⌘⇧N 新开一个应用窗口，两窗口独立编辑
6. `npm run dev -- --open /tmp/xx.md`（或 `NOTARA_OPEN=... npm run dev`）启动即自动打开

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: macOS 菜单、窗口模型与另存为"
```

---

## Milestone M3 — 工作区

### Task 8: workspaceService 树扫描（过滤/排序/懒加载）

**Files:**
- Create: `src/main/services/workspaceService.ts`（本任务只含扫描部分）
- Test: `tests/unit/workspaceService.spec.ts`

**Interfaces:**
- Produces: `listChildren(dir: string): Promise<TreeNode[]>`、`isMarkdownFile(name: string): boolean`、`IGNORED_DIRS`。Task 9 的 watcher 与 workspace IPC 依赖
- 目录规则（设计 §4.3）：忽略 `.git`/`node_modules`/隐藏项；`assets` 不忽略；只列 `.md`/`.markdown` 与目录；排序目录在前、名称不区分大小写（zh locale）

- [ ] **Step 1: 写入失败测试**

`tests/unit/workspaceService.spec.ts`：

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listChildren, isMarkdownFile } from '../../src/main/services/workspaceService'

let root: string

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'notara-ws-'))
  // 目录结构：
  // root/ docs/ (含 note.md) | Assets/ | .git/ | node_modules/ | .hidden/
  // root/ Zeta.md | apple.md | README.markdown | 汉语笔记.md | image.png | a.txt
  await mkdir(join(root, 'docs'))
  await mkdir(join(root, 'Assets'))
  await mkdir(join(root, '.git'))
  await mkdir(join(root, 'node_modules'))
  await mkdir(join(root, '.hidden'))
  await writeFile(join(root, 'docs', 'note.md'), 'n', 'utf8')
  await writeFile(join(root, 'Zeta.md'), 'z', 'utf8')
  await writeFile(join(root, 'apple.md'), 'a', 'utf8')
  await writeFile(join(root, 'README.markdown'), 'r', 'utf8')
  await writeFile(join(root, '汉语笔记.md'), '汉', 'utf8')
  await writeFile(join(root, 'image.png'), 'p', 'utf8')
  await writeFile(join(root, 'a.txt'), 't', 'utf8')
  await writeFile(join(root, '.dotfile.md'), 'd', 'utf8')
})
afterAll(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('listChildren', () => {
  it('只返回目录与 Markdown 文件，忽略 .git/node_modules/隐藏项', async () => {
    const nodes = await listChildren(root)
    expect(nodes.map((n) => n.name)).toEqual(['Assets', 'docs', 'apple.md', '汉语笔记.md', 'README.markdown', 'Zeta.md'])
  })

  it('目录排在文件前、名称排序不区分大小写', async () => {
    const nodes = await listChildren(root)
    expect(nodes[0].isDir).toBe(true)
    const files = nodes.filter((n) => !n.isDir).map((n) => n.name)
    expect(files).toEqual(['apple.md', '汉语笔记.md', 'README.markdown', 'Zeta.md'])
  })

  it('路径为绝对路径', async () => {
    const nodes = await listChildren(root)
    expect(nodes[0].path).toBe(join(root, nodes[0].name))
  })

  it('空目录返回空数组', async () => {
    expect(await listChildren(join(root, 'Assets'))).toEqual([])
  })
})

describe('isMarkdownFile', () => {
  it('匹配 .md/.markdown（大小写不敏感）', () => {
    expect(isMarkdownFile('a.md')).toBe(true)
    expect(isMarkdownFile('a.MARKDOWN')).toBe(true)
    expect(isMarkdownFile('a.mdx')).toBe(false)
    expect(isMarkdownFile('a.png')).toBe(false)
    expect(isMarkdownFile('md')).toBe(false)
  })
})
```

- [ ] **Step 2: 运行确认失败**

```bash
npx vitest run tests/unit/workspaceService.spec.ts
```

预期：FAIL，模块不存在。

- [ ] **Step 3: 实现**

`src/main/services/workspaceService.ts`：

```ts
import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import { ErrorCodes, NotaraError } from '@shared/errors'
import type { TreeNode } from '@shared/types'

export const IGNORED_DIRS = new Set(['.git', 'node_modules'])

export function isMarkdownFile(name: string): boolean {
  return /\.(md|markdown)$/i.test(name)
}

export async function listChildren(dir: string): Promise<TreeNode[]> {
  let entries: import('node:fs').Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    if (code === 'ENOENT') throw new NotaraError(ErrorCodes.NotFound, `目录不存在: ${dir}`)
    if (code === 'ENOTDIR') throw new NotaraError(ErrorCodes.InvalidName, '不是目录')
    throw new NotaraError(ErrorCodes.Unknown, `读取目录失败: ${String(e)}`)
  }
  const nodes: TreeNode[] = []
  for (const e of entries) {
    if (e.name.startsWith('.')) continue // 隐藏文件/目录（含 .git）
    if (e.isDirectory()) {
      if (IGNORED_DIRS.has(e.name)) continue
      nodes.push({ name: e.name, path: path.join(dir, e.name), isDir: true })
    } else if (e.isFile() && isMarkdownFile(e.name)) {
      nodes.push({ name: e.name, path: path.join(dir, e.name), isDir: false })
    }
  }
  nodes.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
    return a.name.localeCompare(b.name, 'zh-Hans-CN', { sensitivity: 'base' })
  })
  return nodes
}
```

- [ ] **Step 4: 运行测试**

```bash
npx vitest run tests/unit/workspaceService.spec.ts
```

预期：全部 PASS（注意第 2 个用例的中文排序断言依赖 ICU；macOS Node 内置完整 ICU，`汉语笔记.md` 按 localeCompare zh 排在 ASCII 后，若实际顺序不同以本地运行结果修正断言）。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: 工作区文件树扫描服务"
```

---

### Task 9: watchService 与 workspace IPC

**Files:**
- Create: `src/main/services/watchService.ts`
- Modify: `src/main/services/workspaceService.ts`（无需改动，watch 独立成文件）
- Create: `src/main/ipc/workspace.ts`、`src/main/services/recentService.ts`（本任务先实现 touch/list，Task 17 完整化并测试）
- Modify: `src/main/ipc/index.ts`（注册 workspace）

**Interfaces:**
- Consumes: Task 8 `listChildren`、Task 3 `knownMtime`/`trackOpen`
- Produces:
  - `watchService.watchRoot(dir)`、`watchService.unwatchRoot(dir)`、`watchService.ensureDirWatched(dir)`、`watchService.setNotifier(fn: (e: MainEvent) => void)`、`watchService.stopAll()`
  - IPC：`workspace:children`（listChildren 直通）、`workspace:open`（watchRoot + recentService.touch + 广播 tree-changed）
  - 事件：`workspace:tree-changed`（目录变更，防抖 300ms）、`file:external-change`（打开文件外部修改，防抖 250ms + mtime 比对 + 自写过滤）、`file:external-delete`
- 无单测（依赖 fs.watch 真实事件时序），由 Task 12 的集成测试与 E2E 覆盖；逻辑保持薄

- [ ] **Step 1: 实现 watchService**

`src/main/services/watchService.ts`：

```ts
import { watch, type FSWatcher } from 'node:fs'
import { stat } from 'node:fs/promises'
import type { MainEvent } from '@shared/types'
import { knownMtime, trackOpen } from './fileService'

type Notifier = (e: MainEvent) => void

const watchers = new Map<string, { w: FSWatcher; recursive: boolean }>()
let notify: Notifier = () => {}

// 自写抑制：writeFileAtomic 完成后立即更新 fileService 的 knownMtime，
// watcher 事件（防抖后）比对一致则视为自写，跳过 external-change
const TREE_DEBOUNCE = 300
const FILE_DEBOUNCE = 250

export function setNotifier(fn: Notifier): void {
  notify = fn
}

interface PendingEvent {
  treeTimer?: ReturnType<typeof setTimeout>
  fileTimers: Map<string, ReturnType<typeof setTimeout>>
}

const pending = new Map<string, PendingEvent>()

function getPending(dir: string): PendingEvent {
  let p = pending.get(dir)
  if (!p) {
    p = { fileTimers: new Map() }
    pending.set(dir, p)
  }
  return p
}

function handleDirEvent(dir: string, recursive: boolean, changedPath: string): void {
  const p = getPending(dir)
  // 1) tree 变更统一防抖
  if (!p.treeTimer) {
    p.treeTimer = setTimeout(() => {
      p.treeTimer = undefined
      notify({ type: 'workspace:tree-changed', root: recursive ? dir : dir })
    }, TREE_DEBOUNCE)
  }
  // 2) 对已跟踪（打开中）的文件判断外部修改/删除
  const t = p.fileTimers.get(changedPath)
  if (t) clearTimeout(t)
  p.fileTimers.set(
    changedPath,
    setTimeout(async () => {
      p.fileTimers.delete(changedPath)
      try {
        const mtime = (await stat(changedPath)).mtimeMs
        const known = knownMtime(changedPath)
        if (known !== undefined && mtime !== known) {
          trackOpen(changedPath, mtime) // 更新已知值，避免重复提示
          notify({ type: 'file:external-change', path: changedPath, mtime })
        }
      } catch {
        notify({ type: 'file:external-delete', path: changedPath })
      }
    }, FILE_DEBOUNCE)
  )
}

export function watchRoot(dir: string): void {
  if (watchers.has(dir)) return
  const w = watch(dir, { recursive: true }, (_event, filename) => {
    if (!filename) return
    handleDirEvent(dir, true, joinPath(dir, String(filename)))
  })
  w.on('error', () => unwatchRoot(dir))
  watchers.set(dir, { w, recursive: true })
}

export function ensureDirWatched(dir: string): void {
  if (watchers.has(dir)) return
  const w = watch(dir, { persistent: false }, (_event, filename) => {
    if (!filename) return
    handleDirEvent(dir, false, joinPath(dir, String(filename)))
  })
  w.on('error', () => unwatchRoot(dir))
  watchers.set(dir, { w, recursive: false })
}

export function unwatchRoot(dir: string): void {
  const e = watchers.get(dir)
  if (!e) return
  e.w.close()
  watchers.delete(dir)
  pending.delete(dir)
}

export function stopAll(): void {
  for (const dir of [...watchers.keys()]) unwatchRoot(dir)
}

function joinPath(dir: string, rel: string): string {
  // fs.watch 回调的 filename 依平台可能带平台分隔符
  const parts = rel.split(/[/\\]/)
  return [dir, ...parts].join('/')
}
```

- [ ] **Step 2: 实现 recentService（最小版）与 workspace IPC**

`src/main/services/recentService.ts`：

```ts
import { promises as fs } from 'node:fs'
import { app } from 'electron'
import * as path from 'node:path'
import type { RecentWorkspace } from '@shared/types'

function file(): string {
  return path.join(app.getPath('userData'), 'recent.json')
}

export async function listRecent(): Promise<RecentWorkspace[]> {
  try {
    const raw = JSON.parse(await fs.readFile(file(), 'utf8')) as RecentWorkspace[]
    return [...raw].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt).slice(0, 10)
  } catch {
    return []
  }
}

export async function touchRecent(root: string): Promise<void> {
  const list = await listRecent().then((l) => l.filter((r) => r.root !== root))
  list.push({ root, lastOpenedAt: Date.now() })
  const top = list.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt).slice(0, 10)
  await fs.mkdir(path.dirname(file()), { recursive: true })
  await fs.writeFile(file(), JSON.stringify(top, null, 2), 'utf8')
}
```

`src/main/ipc/workspace.ts`：

```ts
import { Channels, registerIpc, broadcast } from './index'
import { listChildren } from '../services/workspaceService'
import { watchRoot } from '../services/watchService'
import { touchRecent, listRecent } from '../services/recentService'
import { ErrorCodes, NotaraError } from '@shared/errors'
import { promises as fs } from 'node:fs'

export function registerWorkspaceIpc(): void {
  registerIpc(Channels.WorkspaceChildren, async (p: { dir: string }) => listChildren(p.dir))

  registerIpc(Channels.RecentList, async () => listRecent())

  registerIpc(Channels.WorkspaceOpen, async (p: { root: string }) => {
    const st = await fs.stat(p.root).catch(() => null)
    if (!st?.isDirectory()) {
      throw new NotaraError(ErrorCodes.NotFound, `工作区不可用: ${p.root}`)
    }
    watchRoot(p.root)
    await touchRecent(p.root)
    broadcast({ type: 'workspace:tree-changed', root: p.root })
  })
}
```

**接线 1（单文件监听）**：`src/main/ipc/files.ts` 的 `FilesRead` handler 改为（单文件窗口的外部变更感知——监听文件所在目录）：

```ts
import { ensureDirWatched } from '../services/watchService'
import * as nodePath from 'node:path'

registerIpc(Channels.FilesRead, async (p: { path: string }) => {
  ensureDirWatched(nodePath.dirname(p.path))
  return readFileSafe(p.path)
})
```

`src/main/ipc/index.ts`：`registerAllIpc` 增加 `registerWorkspaceIpc()`，并在其中初始化 watchService 通知：

```ts
import { registerWorkspaceIpc } from './workspace'
import { setNotifier } from '../services/watchService'

export function registerAllIpc(): void {
  registerAppIpc()
  registerFilesIpc()
  registerWorkspaceIpc()
  setNotifier(broadcast)
}
```

- [ ] **Step 3: 渲染侧 workspace store 完整化**

`src/renderer/src/stores/workspace.ts`（替换 Task 7 占位）：

```ts
import { create } from 'zustand'
import { api } from '../lib/api'
import type { TreeNode } from '@shared/types'

interface WorkspaceState {
  root: string | null
  /** 已展开目录 → 其子节点缓存 */
  children: Map<string, TreeNode[]>
  loading: Map<string, boolean>
  open: (root: string) => Promise<void>
  loadChildren: (dir: string) => Promise<void>
  refresh: (dir: string) => Promise<void>
}

export const useWorkspace = create<WorkspaceState>((set, get) => ({
  root: null,
  children: new Map(),
  loading: new Map(),

  async open(root) {
    set({ root, children: new Map(), loading: new Map() })
    await api.openWorkspace(root)
    await get().loadChildren(root)
  },

  async loadChildren(dir) {
    if (get().children.has(dir)) return
    set((st) => {
      const loading = new Map(st.loading)
      loading.set(dir, true)
      return { loading }
    })
    try {
      const nodes = await api.listChildren(dir)
      set((st) => {
        const children = new Map(st.children)
        children.set(dir, nodes)
        return { children }
      })
    } finally {
      set((st) => {
        const loading = new Map(st.loading)
        loading.delete(dir)
        return { loading }
      })
    }
  },

  async refresh(dir) {
    const nodes = await api.listChildren(dir)
    set((st) => {
      const children = new Map(st.children)
      children.set(dir, nodes)
      return { children })
    })
  }
}))
```

（refresh 只刷新已加载过的目录——`tree-changed` 事件处理时对 `children` 的每个 key 调 refresh。）

- [ ] **Step 4: 测试 + 手动验证**

```bash
npm test && npm run typecheck
```

手动清单：

1. ⌘O 选文件夹 → 打开 workspace:open（console 无错误，DevTools 里 `await window.notara.listChildren('<root>')` 返回树）
2. 在外部（Finder/终端 `touch new.md`）创建文件 → 约 300ms 后收到 `workspace:tree-changed` 事件（console 可临时 log 验证）
3. 外部修改当前打开文件（`echo x >> a.md`）→ 收到 `file:external-change`（本任务只验证事件到达；冲突 UI 在 Task 12）

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: 工作区监听与 workspace IPC"
```

---

### Task 10: FileTree 组件 + 侧边栏 + 文件操作

**Files:**
- Create: `src/renderer/src/components/FileTree.tsx`、`src/renderer/src/components/Sidebar.tsx`、`src/renderer/src/components/ContextMenu.tsx`、`src/renderer/src/components/NamePromptModal.tsx`
- Modify: `src/renderer/src/App.tsx`（挂侧边栏 + 树事件刷新 + 树上打开文件）、`src/renderer/src/stores/ui.ts`（namePrompt 状态）、`src/renderer/src/strings.ts`、`src/renderer/src/styles/global.css`
- Test: `tests/component/FileTree.spec.tsx`

**Interfaces:**
- Consumes: Task 9 `useWorkspace`、Task 6 `openPath`、Task 3 的 `api.createEntry`/`renameEntry`/`deleteEntry`
- Produces:
  - `FileTree` props：`{ nodes: TreeNode[]; children: Map<string, TreeNode[]>; expanded: Set<string>; onToggle: (dir: string) => void; onOpenFile: (path: string) => void; onContext: (e: React.MouseEvent, node: TreeNode) => void }`（纯展示组件）
  - `ContextMenu` props：`{ x: number; y: number; items: { label: string; onClick: () => void; danger?: boolean }[]; onClose: () => void }`
  - `NamePromptModal`（ui store 的 `namePrompt: { title: string; initial: string; placeholder: string; onSubmit: (name: string) => void } | null`）
  - `openTreeContextMenu(e, node)`（App 内函数，装配菜单项并写入 ui store）

- [ ] **Step 1: 写入 FileTree 失败测试**

`tests/component/FileTree.spec.tsx`：

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FileTree } from '../../src/renderer/src/components/FileTree'
import type { TreeNode } from '../../src/shared/types'

const nodes: TreeNode[] = [
  { name: 'docs', path: '/w/docs', isDir: true },
  { name: 'a.md', path: '/w/a.md', isDir: false }
]
const childNodes: TreeNode[] = [{ name: 'note.md', path: '/w/docs/note.md', isDir: false }]

describe('FileTree', () => {
  it('渲染目录与文件；未展开时不渲染子级', () => {
    render(
      <FileTree nodes={nodes} children={new Map([['/w/docs', childNodes]])} expanded={new Set()}
        onToggle={() => {}} onOpenFile={() => {}} onContext={() => {}} />
    )
    expect(screen.getByTestId('tree-node-/w/docs')).toBeInTheDocument()
    expect(screen.getByTestId('tree-node-/w/a.md')).toBeInTheDocument()
    expect(screen.queryByTestId('tree-node-/w/docs/note.md')).not.toBeInTheDocument()
  })

  it('展开目录显示子级，点击目录切换、点击文件打开', () => {
    const onToggle = vi.fn(); const onOpenFile = vi.fn()
    render(
      <FileTree nodes={nodes} children={new Map([['/w/docs', childNodes]])} expanded={new Set(['/w/docs'])}
        onToggle={onToggle} onOpenFile={onOpenFile} onContext={() => {}} />
    )
    expect(screen.getByTestId('tree-node-/w/docs/note.md')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('tree-node-/w/docs'))
    expect(onToggle).toHaveBeenCalledWith('/w/docs')
    fireEvent.click(screen.getByTestId('tree-node-/w/a.md'))
    expect(onOpenFile).toHaveBeenCalledWith('/w/a.md')
  })

  it('右键触发 onContext', () => {
    const onContext = vi.fn()
    render(
      <FileTree nodes={nodes} children={new Map()} expanded={new Set()}
        onToggle={() => {}} onOpenFile={() => {}} onContext={onContext} />
    )
    fireEvent.contextMenu(screen.getByTestId('tree-node-/w/a.md'))
    expect(onContext).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 运行确认失败**

```bash
npx vitest run tests/component/FileTree.spec.tsx
```

预期：FAIL，组件不存在。

- [ ] **Step 3: 实现 FileTree / ContextMenu / NamePromptModal / Sidebar**

`src/renderer/src/components/FileTree.tsx`：

```tsx
import type { ReactNode } from 'react'
import type { TreeNode } from '@shared/types'

interface FileTreeProps {
  nodes: TreeNode[]
  children: Map<string, TreeNode[]>
  expanded: Set<string>
  onToggle: (dir: string) => void
  onOpenFile: (path: string) => void
  onContext: (e: React.MouseEvent, node: TreeNode) => void
}

function Chevron({ open }: { open: boolean }): ReactNode {
  return <span className={`chevron ${open ? 'open' : ''}`}>▸</span>
}

export function FileTree({ nodes, children, expanded, onToggle, onOpenFile, onContext }: FileTreeProps) {
  const renderNodes = (list: TreeNode[], depth: number): ReactNode =>
    list.map((n) => (
      <div key={n.path}>
        <div
          data-testid={`tree-node-${n.path}`}
          className={`tree-node ${n.isDir ? 'dir' : 'file'}`}
          style={{ paddingLeft: 8 + depth * 14 }}
          onClick={() => (n.isDir ? onToggle(n.path) : onOpenFile(n.path))}
          onContextMenu={(e) => onContext(e, n)}
        >
          {n.isDir ? <Chevron open={expanded.has(n.path)} /> : <span className="file-icon">📄</span>}
          <span className="tree-node-name">{n.name}</span>
        </div>
        {n.isDir && expanded.has(n.path) && renderNodes(children.get(n.path) ?? [], depth + 1)}
      </div>
    ))

  return <div className="filetree">{renderNodes(nodes, 0)}</div>
}
```

`src/renderer/src/components/ContextMenu.tsx`：

```tsx
import { useEffect, useRef } from 'react'

export interface ContextMenuItem {
  label: string
  onClick: () => void
  danger?: boolean
}

interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (): void => onClose()
    window.addEventListener('mousedown', h)
    window.addEventListener('blur', h)
    return () => {
      window.removeEventListener('mousedown', h)
      window.removeEventListener('blur', h)
    }
  }, [onClose])
  return (
    <div ref={ref} className="context-menu" style={{ left: x, top: y }} role="menu">
      {items.map((it) => (
        <button
          key={it.label}
          className={`context-menu-item ${it.danger ? 'danger' : ''}`}
          role="menuitem"
          onClick={() => {
            it.onClick()
            onClose()
          }}
        >
          {it.label}
        </button>
      ))}
    </div>
  )
}
```

`src/renderer/src/components/NamePromptModal.tsx`：

```tsx
import { useState } from 'react'
import { Modal } from './Modal'
import { useUi } from '../stores/ui'
import { s } from '../strings'

export function NamePromptModal() {
  const prompt = useUi((st) => st.namePrompt)
  const close = useUi((st) => st.closeNamePrompt)
  const [value, setValue] = useState('')
  if (!prompt) return null
  return (
    <Modal
      title={prompt.title}
      buttons={
        <>
          <button className="btn" onClick={close}>
            {s.confirm.cancel}
          </button>
          <button
            className="btn btn-primary"
            disabled={!value.trim()}
            onClick={() => {
              prompt.onSubmit(value.trim())
              close()
            }}
          >
            {s.confirm.save}
          </button>
        </>
      }
    >
      <input
        autoFocus
        className="name-input"
        value={value}
        placeholder={prompt.initial || prompt.placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && value.trim()) {
            prompt.onSubmit(value.trim())
            close()
          }
        }}
      />
    </Modal>
  )
}
```

ui.ts 增加状态（interface 与实现同步）：

```ts
namePrompt: { title: string; initial: string; placeholder: string; onSubmit: (name: string) => void } | null
openNamePrompt: (p: NonNullable<UiState['namePrompt']>) => void
closeNamePrompt: () => void
```

实现为：

```ts
namePrompt: null,
openNamePrompt(p) {
  set({ namePrompt: p })
},
closeNamePrompt() {
  set({ namePrompt: null })
}
```

`src/renderer/src/components/Sidebar.tsx`：

```tsx
import { useState } from 'react'
import { FileTree } from './FileTree'
import { useWorkspace } from '../stores/workspace'
import { s } from '../strings'
import type { TreeNode } from '@shared/types'

interface SidebarProps {
  onOpenFile: (path: string) => void
  onContext: (e: React.MouseEvent, node: TreeNode) => void
}

export function Sidebar({ onOpenFile, onContext }: SidebarProps) {
  const root = useWorkspace((st) => st.root)
  const children = useWorkspace((st) => st.children)
  const loadChildren = useWorkspace((st) => st.loadChildren)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggle = (dir: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(dir)) next.delete(dir)
      else {
        next.add(dir)
        void loadChildren(dir)
      }
      return next
    })
  }

  if (!root) return null
  return (
    <aside className="sidebar" data-testid="sidebar">
      <div className="sidebar-title">{root.split('/').pop()}</div>
      <FileTree
        nodes={children.get(root) ?? []}
        children={children}
        expanded={expanded}
        onToggle={toggle}
        onOpenFile={onOpenFile}
        onContext={onContext}
      />
    </aside>
  )
}
```

- [ ] **Step 4: 运行组件测试**

```bash
npx vitest run tests/component/FileTree.spec.tsx
```

预期：3 个用例 PASS。

- [ ] **Step 5: App.tsx 装配（侧边栏 + 树刷新 + 右键操作）**

App.tsx 修改要点（完整增量）：

```tsx
import { Sidebar } from './components/Sidebar'
import { ContextMenu } from './components/ContextMenu'
import { NamePromptModal } from './components/NamePromptModal'
import { useWorkspace } from './stores/workspace'
import type { TreeNode, MainEvent } from '@shared/types'

  // 树事件：刷新所有已加载目录
  useEffect(() => {
    const off = api.onEvent((event: MainEvent) => {
      if (event.type === 'workspace:tree-changed') {
        const ws = useWorkspace.getState()
        if (event.root === ws.root) {
          for (const dir of [...ws.children.keys()]) void ws.refresh(dir)
        }
      }
    })
    return off
  }, [])

  // 树节点右键菜单
  const [menu, setMenu] = useState<{ x: number; y: number; node: TreeNode } | null>(null)
  const openTreeContextMenu = (e: React.MouseEvent, node: TreeNode): void => {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY, node })
  }

  const treeMenuItems = (node: TreeNode) =>
    node.isDir
      ? [
          { label: s.tree.newFile, onClick: () => askName(s.tree.namePrompt.file, '', (name) => void createInDir(node.path, name)) },
          { label: s.tree.newFolder, onClick: () => askName(s.tree.namePrompt.folder, '', (name) => void createInDir(node.path, name)) }
        ]
      : [
          { label: s.tree.rename, onClick: () => askName(s.tree.namePrompt.rename, node.name, (name) => void renameNode(node, name)) },
          { label: s.tree.del, danger: true, onClick: () => askDelete(node) }
        ]

  const askName = (title: string, initial: string, onSubmit: (name: string) => void): void => {
    useUi.getState().openNamePrompt({ title, initial, placeholder: title, onSubmit })
  }

  const createInDir = async (dir: string, name: string): Promise<void> => {
    try {
      const kind = /\.(md|markdown)$/i.test(name) ? 'file' : 'directory'
      const { path } = await api.createEntry(dir, name.endsWith('.md') || kind === 'directory' ? name : `${name}.md`)
      if (kind === 'file') await openPath(path)
    } catch (e) {
      notify((e as Error).message)
    }
  }

  const renameNode = async (node: TreeNode, name: string): Promise<void> => {
    if (name === node.name) return
    try {
      const dir = node.path.slice(0, node.path.lastIndexOf('/'))
      await api.renameEntry(node.path, `${dir}/${name}`)
      // file:renamed 事件由主进程广播，App 的事件订阅统一处理（见下）
    } catch (e) {
      notify((e as Error).message)
    }
  }

  const askDelete = (node: TreeNode): void => {
    useUi.getState().askConfirm({
      title: s.confirm.deleteTitle,
      text: s.confirm.deleteText(node.name),
      confirmText: s.confirm.deleteTitle,
      danger: true,
      onConfirm: () => {
        void api.deleteEntry(node.path).catch((e) => notify((e as Error).message))
      }
    })
  }
```

并在事件订阅 effect 中追加 file:renamed 处理（放树刷新 effect 同一个订阅里）：

```tsx
      if (event.type === 'file:renamed') {
        useTabs.getState().renamePath(event.oldPath, event.newPath)
      }
```

JSX 结构改为（两栏布局）：

```tsx
  return (
    <div className="app">
      {tabs.length > 0 ? (
        <>
          <TabBar ... />
          <div className="main-area">
            {sidebarVisible && root !== null && <Sidebar onOpenFile={(p) => void openPath(p)} onContext={openTreeContextMenu} />}
            <div className="editors">...</div>
          </div>
        </>
      ) : null}
      <ConfirmModal />
      <NamePromptModal />
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={treeMenuItems(menu.node)} onClose={() => setMenu(null)} />
      )}
    </div>
  )
```

（`root`/`sidebarVisible` 来自 `useWorkspace`/`useUi` hooks；`s` 从 strings 导入。）

`global.css` 追加：

```css
.main-area { display: flex; flex: 1; min-height: 0; }
.sidebar { width: 220px; border-right: 1px solid var(--border); background: var(--bg-elevated); overflow-y: auto; padding-top: 36px; }
.sidebar-title { font-size: 12px; font-weight: 600; color: var(--fg-secondary); padding: 8px 12px; }
.tree-node { display: flex; align-items: center; gap: 4px; padding: 3px 8px; font-size: 13px; cursor: pointer; border-radius: 4px; margin: 0 4px; }
.tree-node:hover { background: var(--border); }
.chevron { display: inline-block; transition: transform 0.12s; color: var(--fg-secondary); width: 12px; }
.chevron.open { transform: rotate(90deg); }
.context-menu { position: fixed; z-index: 200; background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 8px; padding: 4px; min-width: 160px; box-shadow: 0 6px 24px rgba(0,0,0,0.2); }
.context-menu-item { display: block; width: 100%; text-align: left; border: none; background: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 13px; color: var(--fg); }
.context-menu-item:hover { background: var(--accent); color: #fff; }
.context-menu-item.danger { color: #d64545; }
.context-menu-item.danger:hover { background: #d64545; color: #fff; }
.name-input { width: 100%; padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px; font-size: 13px; background: var(--bg); color: var(--fg); }
```

- [ ] **Step 6: 测试 + 手动验证**

```bash
npm test && npm run typecheck
```

手动清单：

1. ⌘O 打开文件夹 → 侧栏显示文件树，目录可展开/收起
2. 点击 .md 文件 → 打开标签（多文件多标签、⌘1..⌘9/⌘⇧[ ] 切换正常——快捷键经 macOS Window 菜单 role 提供 tab 切换的部分暂缺，属 Task 18 收尾，本清单不验）
3. 右键目录 → 新建文件（输入名自动补 .md）→ 文件出现在树中且打开标签
4. 右键文件 → 重命名 → 打开中的标签标题同步更新；删除 → 废纸篓可找到、树刷新
5. 外部 touch 新文件 → 树自动出现新文件

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: 文件树、侧边栏与树内文件操作"
```

---

### Task 11: 外部变更冲突处理

**Files:**
- Create: `src/renderer/src/lib/externalChanges.ts`
- Create: `src/renderer/src/components/ConflictModal.tsx`
- Modify: `src/renderer/src/App.tsx`（接入订阅）、`src/renderer/src/stores/ui.ts`（conflict 状态）、`src/renderer/src/strings.ts`
- Test: `tests/unit/externalChanges.spec.ts`、`tests/component/ConflictModal.spec.tsx`

**Interfaces:**
- Consumes: Task 9 的 `file:external-change`/`file:external-delete` 事件、Task 6 `saveScheduler`/`editors`
- Produces: `handleExternalChange(path: string)`（脏→冲突弹窗；净→静默重载）、`handleExternalDelete(path)`（markDeleted + toast）、ConflictModal props `{ path: string; onKeepMine: () => void; onUseDisk: () => void }`

- [ ] **Step 1: 写入失败测试**

`tests/unit/externalChanges.spec.ts`：

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handleExternalChange, handleExternalDelete } from '../../src/renderer/src/lib/externalChanges'
import { useTabs } from '../../src/renderer/src/stores/tabs'
import { useUi } from '../../src/renderer/src/stores/ui'
import { saveScheduler } from '../../src/renderer/src/lib/saveScheduler'
import { editors } from '../../src/renderer/src/lib/editorRegistry'
import { api } from '../../src/renderer/src/lib/api'

vi.mock('../../src/renderer/src/lib/api', () => ({
  api: { readFile: vi.fn(), writeFile: vi.fn() }
}))

describe('handleExternalChange', () => {
  beforeEach(() => {
    useTabs.setState({ tabs: [], activeIndex: -1 })
    useUi.setState({ toasts: [], confirm: null })
  })

  it('净标签静默重载内容', async () => {
    useTabs.getState().openFile('/w/a.md', 'old')
    const id = useTabs.getState().tabs[0].id
    const setValue = vi.fn()
    const focus = vi.fn()
    editors.set(id, { setValue, focus, getValue: () => '' } as never)
    vi.mocked(api.readFile).mockResolvedValue({ content: 'new', mtime: 2 })
    await handleExternalChange('/w/a.md')
    expect(api.readFile).toHaveBeenCalledWith('/w/a.md')
    expect(setValue).toHaveBeenCalledWith('new')
    expect(useUi.getState().confirm).toBeNull()
    editors.clear()
  })

  it('脏标签弹冲突确认', async () => {
    useTabs.getState().openFile('/w/b.md', 'old')
    const id = useTabs.getState().tabs[0].id
    useTabs.getState().setDirty(id, true)
    editors.set(id, { setValue: vi.fn(), getValue: () => 'mine' } as never)
    await handleExternalChange('/w/b.md')
    const c = useUi.getState().confirm
    expect(c).not.toBeNull()
    expect(c?.text).toContain('/w/b.md')
    // 模拟「保留我的版本」：立即写盘
    const onConfirm = c!.onConfirm
    await onConfirm()
    expect(api.writeFile).toHaveBeenCalledWith('/w/b.md', 'mine')
    expect(useTabs.getState().tabs[0].dirty).toBe(false)
    editors.clear()
  })

  it('自动保存 pending 中忽略外部变更（自写事件兜底）', async () => {
    useTabs.getState().openFile('/w/c.md', 'x')
    const id = useTabs.getState().tabs[0].id
    useTabs.getState().setDirty(id, true)
    saveScheduler.schedule(id)
    await handleExternalChange('/w/c.md')
    expect(useUi.getState().confirm).toBeNull()
    saveScheduler.cancel(id)
  })
})

describe('handleExternalDelete', () => {
  it('标记 deleted 并 toast', () => {
    useTabs.getState().openFile('/w/a.md', 'x')
    handleExternalDelete('/w/a.md')
    expect(useTabs.getState().tabs[0].deleted).toBe(true)
    expect(useUi.getState().toasts[0]?.text).toContain('删除')
  })
})
```

`tests/component/ConflictModal.spec.tsx`：

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ConflictModal } from '../../src/renderer/src/components/ConflictModal'

describe('ConflictModal', () => {
  it('展示文件路径与两个动作', () => {
    const keep = vi.fn(); const disk = vi.fn()
    render(<ConflictModal path="/w/a.md" onKeepMine={keep} onUseDisk={disk} />)
    expect(screen.getByText('/w/a.md')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('conflict-keep'))
    expect(keep).toHaveBeenCalled()
    fireEvent.unmount(screen.getByTestId('conflict-keep')) // 无操作，防 lint 未用
  })
})
```

- [ ] **Step 2: 运行确认失败**

```bash
npx vitest run tests/unit/externalChanges.spec.ts tests/component/ConflictModal.spec.tsx
```

预期：FAIL。

- [ ] **Step 3: 实现**

`src/renderer/src/lib/externalChanges.ts`：

```ts
import { api } from './api'
import { saveScheduler } from './saveScheduler'
import { editors } from './editorRegistry'
import { useTabs } from '../stores/tabs'
import { useUi } from '../stores/ui'
import { s } from '../strings'

/** 文件被外部修改：净→静默重载；脏→冲突确认。自写事件兜底：pending 中忽略。 */
export async function handleExternalChange(path: string): Promise<void> {
  const tab = useTabs.getState().tabs.find((t) => t.path === path)
  if (!tab) return
  if (saveScheduler.isPending(tab.id)) return // 本应用自动保存引发的事件，忽略

  if (!tab.dirty) {
    try {
      const { content } = await api.readFile(path)
      editors.get(tab.id)?.setValue(content)
    } catch {
      /* 文件刚被删：随后会收到 external-delete */
    }
    return
  }

  useUi.getState().askConfirm({
    title: s.confirm.useDiskTitle,
    text: path,
    confirmText: s.confirm.keepMine,
    onConfirm: () => {
      void (async () => {
        const vd = editors.get(tab.id)
        if (!vd) return
        try {
          await api.writeFile(path, vd.getValue())
          useTabs.getState().setDirty(tab.id, false)
        } catch {
          useUi.getState().notify(s.toast.saveFailed)
        }
      })()
    },
    onCancel: () => {
      // 加载磁盘版本（丢弃本地修改）
      void (async () => {
        try {
          const { content } = await api.readFile(path)
          editors.get(tab.id)?.setValue(content)
          useTabs.getState().setDirty(tab.id, false)
        } catch {
          /* 忽略：文件可能已删除 */
        }
      })()
    }
  })
}

export function handleExternalDelete(path: string): void {
  useTabs.getState().markDeleted(path)
  useUi.getState().notify(s.toast.deletedFile)
}
```

设计要求「加载磁盘版本需二次确认」：实现时在 onCancel 分支先弹第二个 `askConfirm`（文案 `确定丢弃「${tab.title}」的未保存修改？`，确认后才 setValue）。测试只覆盖一层的 keepMine 路径，二次确认以手动清单验证。

`src/renderer/src/components/ConflictModal.tsx`：

```tsx
import { useUi } from '../stores/ui'
import { s } from '../strings'
import { Modal } from './Modal'

export function ConflictModal() {
  const confirm = useUi((st) => st.confirm)
  const resolve = useUi((st) => st.resolveConfirm)
  if (!confirm || confirm.title !== s.confirm.useDiskTitle) return null
  return (
    <Modal
      title={confirm.title}
      buttons={
        <>
          <button className="btn" data-testid="conflict-disk" onClick={() => resolve(false)}>
            {s.confirm.useDisk}
          </button>
          <button className="btn btn-primary" data-testid="conflict-keep" onClick={() => resolve(true)}>
            {s.confirm.keepMine}
          </button>
        </>
      }
    >
      {confirm.text}
    </Modal>
  )
}
```

注意：这里复用 ui.confirm 通道，`ConfirmModal` 渲染标题非 `useDiskTitle` 的通用确认、`ConflictModal` 渲染冲突专用样式（按钮文案不同）。两个组件同时挂载、各自判断，不冲突。App 的事件订阅追加：

```tsx
      if (event.type === 'file:external-change') void handleExternalChange(event.path)
      if (event.type === 'file:external-delete') handleExternalDelete(event.path)
```

- [ ] **Step 4: 运行测试**

```bash
npx vitest run tests/unit/externalChanges.spec.ts tests/component/ConflictModal.spec.tsx
```

预期：PASS。

- [ ] **Step 5: 手动验证 + Commit**

手动清单：

1. 外部 `echo x >> a.md`（标签净）→ 编辑器内容自动更新
2. 在 Notara 输入几个字（脏）→ 外部改文件 → 弹「保留我的版本/加载磁盘版本」；选保留 → 磁盘变为 Notara 内容
3. 外部 `rm a.md` → 标签删除线样式 + toast；⌘S → 另存为对话框
4. 编辑后 500ms 内外部事件（自写窗口）不触发冲突弹窗

```bash
git add -A
git commit -m "feat: 外部文件变更检测与冲突处理"
```

---

## Milestone M4 — 图片与大纲

### Task 12: imageService + 图片粘贴/拖拽

**Files:**
- Create: `src/main/services/imageService.ts`、`src/main/ipc/images.ts`
- Create: `src/renderer/src/lib/imagePaste.ts`
- Modify: `src/renderer/src/components/Editor.tsx`（挂 paste/drop 监听）、`src/main/ipc/index.ts`
- Test: `tests/unit/imageService.spec.ts`、`tests/unit/imagePaste.spec.ts`

**Interfaces:**
- Consumes: Task 2 `api`、Editor 的 vditor 实例
- Produces:
  - 主进程 `saveImage(refDir: string, data: Buffer, originalName: string, ext: string): Promise<string>`（返回相对 `refDir` 的 POSIX 风格相对路径，如 `assets/截图-1697...-ab12.png`）
  - 渲染侧 `collectImageFiles(dt: DataTransfer): File[]`、`extFromMime(type: string): string`、`insertImageFromFile(vd: Vditor, file: File, refDir: string | null): Promise<boolean>`（返回是否处理了图片；false 表示交给默认行为）

- [ ] **Step 1: 写入失败测试**

`tests/unit/imageService.spec.ts`：

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { saveImage, imageFileName } from '../../src/main/services/imageService'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'notara-img-'))
})
afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('imageFileName', () => {
  it('原名 + 时间戳 + 4 位随机 + 扩展名', () => {
    const n = imageFileName('屏幕截图.png', 'png')
    expect(n).toMatch(/^屏幕截图-\d+-[a-z0-9]{4}\.png$/)
  })
  it('无原名退化为 image', () => {
    expect(imageFileName('', 'jpeg')).toMatch(/^image-\d+-[a-z0-9]{4}\.jpeg$/)
  })
  it('原名含扩展名时去掉原扩展', () => {
    const n = imageFileName('a.png', 'png')
    expect(n.startsWith('a-')).toBe(true)
  })
})

describe('saveImage', () => {
  it('写入 refDir/assets/ 并返回相对路径（POSIX 风格）', async () => {
    const rel = await saveImage(dir, Buffer.from('fakepng'), 'photo.png', 'png')
    expect(rel.startsWith('assets/')).toBe(true)
    expect(rel.endsWith('.png')).toBe(true)
    const files = await readdir(join(dir, 'assets'))
    expect(files).toHaveLength(1)
    expect((await readFile(join(dir, rel))).toString()).toBe('fakepng')
  })

  it('同名两次保存生成不同文件', async () => {
    const r1 = await saveImage(dir, Buffer.from('a'), 'x.png', 'png')
    const r2 = await saveImage(dir, Buffer.from('b'), 'x.png', 'png')
    expect(r1).not.toBe(r2)
    expect(await readdir(join(dir, 'assets'))).toHaveLength(2)
  })

  it('assets 目录不存在时自动创建（含嵌套 refDir）', async () => {
    const sub = join(dir, 'docs')
    const rel = await saveImage(sub, Buffer.from('c'), 'y.png', 'png')
    expect(rel).toMatch(/^assets\/y-\d+-[a-z0-9]{4}\.png$/)
  })
})
```

`tests/unit/imagePaste.spec.ts`：

```ts
import { describe, expect, it, vi } from 'vitest'
import { collectImageFiles, extFromMime } from '../../src/renderer/src/lib/imagePaste'

function fakeDt(files: { name: string; type: string }[]): { files: unknown[]; items: { kind: string; type: string; getAsFile: () => unknown }[] } {
  const arr = files.map((f) => ({ ...f }))
  return {
    files: arr,
    items: arr.map((f) => ({ kind: 'file', type: (f as { type: string }).type, getAsFile: () => f }))
  } as never
}

describe('extFromMime', () => {
  it('常见图片 MIME 映射', () => {
    expect(extFromMime('image/png')).toBe('png')
    expect(extFromMime('image/jpeg')).toBe('jpeg')
    expect(extFromMime('image/gif')).toBe('gif')
    expect(extFromMime('image/svg+xml')).toBe('svg')
    expect(extFromMime('image/webp')).toBe('webp')
    expect(extFromMime('text/plain')).toBe('png') // 兜底
  })
})

describe('collectImageFiles', () => {
  it('只挑出 image/* 文件', () => {
    const dt = fakeDt([
      { name: 'a.png', type: 'image/png' },
      { name: 'b.txt', type: 'text/plain' }
    ])
    const imgs = collectImageFiles(dt as never)
    expect(imgs).toHaveLength(1)
    expect((imgs[0] as { name: string }).name).toBe('a.png')
  })
})
```

- [ ] **Step 2: 运行确认失败**

```bash
npx vitest run tests/unit/imageService.spec.ts tests/unit/imagePaste.spec.ts
```

预期：FAIL。

- [ ] **Step 3: 实现 imageService 与 IPC**

`src/main/services/imageService.ts`：

```ts
import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import { ErrorCodes, NotaraError } from '@shared/errors'

export function imageFileName(originalName: string, ext: string): string {
  const base = originalName.replace(/\.[^.]*$/, '') || 'image'
  const rand = Math.random().toString(36).slice(2, 6)
  return `${base}-${Date.now()}-${rand}.${ext}`
}

export async function saveImage(
  refDir: string,
  data: Buffer,
  originalName: string,
  ext: string
): Promise<string> {
  const assetsDir = path.join(refDir, 'assets')
  try {
    await fs.mkdir(assetsDir, { recursive: true })
    const name = imageFileName(originalName, ext)
    await fs.writeFile(path.join(assetsDir, name), data)
    return path.relative(refDir, path.join(assetsDir, name)).split(path.sep).join('/')
  } catch (e) {
    throw new NotaraError(ErrorCodes.WriteFailed, `图片保存失败: ${String(e)}`)
  }
}
```

`src/main/ipc/images.ts`：

```ts
import { Channels, registerIpc } from './index'
import { saveImage } from '../services/imageService'

export function registerImagesIpc(): void {
  registerIpc(Channels.ImagesSave, async (p: {
    refDir: string
    data: ArrayBuffer
    originalName: string
    ext: string
  }) => {
    const buf = Buffer.from(p.data)
    const r = await saveImage(p.refDir, buf, p.originalName, p.ext)
    return { relativePath: r }
  })
}
```

ipc/index.ts 注册 `registerImagesIpc()`。

- [ ] **Step 4: 实现渲染侧 imagePaste.ts 并挂进 Editor**

`src/renderer/src/lib/imagePaste.ts`：

```ts
import type Vditor from 'vditor'
import { api } from './api'
import { useTabs } from '../stores/tabs'
import { useUi } from '../stores/ui'

export function isImageFile(f: File): boolean {
  return f.type.startsWith('image/')
}

export function extFromMime(type: string): string {
  const m = /^image\/([a-z0-9+]+)/i.exec(type)
  return m?.[1] ?? 'png'
}

export function collectImageFiles(dt: DataTransfer): File[] {
  const out: File[] = []
  if (dt.files) {
    for (const f of Array.from(dt.files)) {
      if (isImageFile(f)) out.push(f)
    }
  }
  return out
}

/** 保存图片到当前文件目录 assets/ 并插入相对路径引用。返回 false 表示非图片，交回默认处理。 */
export async function insertImageFromFile(vd: Vditor, file: File): Promise<boolean> {
  if (!isImageFile(file)) return false
  const tab = useTabs.getState().tabs[useTabs.getState().activeIndex]
  const refDir = tab?.path ? tab.path.slice(0, tab.path.lastIndexOf('/')) : null
  if (!refDir) {
    useUi.getState().notify('请先保存文件，再粘贴图片')
    return true // 拦截（无目录可写），避免 vditor 默认行为报错
  }
  try {
    const data = await file.arrayBuffer()
    const { relativePath } = await api.saveImage(refDir, data, file.name, extFromMime(file.type))
    vd.insertValue(`\n![](${relativePath})\n`)
    return true
  } catch (e) {
    useUi.getState().notify(`图片保存失败: ${(e as Error).message}`)
    return true // 已消费（失败也拦截，插入占位无意义）
  }
}

export function attachImageHandlers(vd: Vditor, host: HTMLElement): () => void {
  const onPaste = (e: ClipboardEvent): void => {
    const imgs = e.clipboardData ? collectImageFiles(e.clipboardData) : []
    if (imgs.length === 0) return
    e.preventDefault()
    e.stopPropagation()
    for (const f of imgs) void insertImageFromFile(vd, f)
  }
  const onDrop = (e: DragEvent): void => {
    const imgs = e.dataTransfer ? collectImageFiles(e.dataTransfer) : []
    if (imgs.length === 0) return
    e.preventDefault()
    e.stopPropagation()
    for (const f of imgs) void insertImageFromFile(vd, f)
  }
  const onDragOver = (e: DragEvent): void => {
    if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
  }
  // capture 阶段先于 vditor 自身处理
  host.addEventListener('paste', onPaste, true)
  host.addEventListener('drop', onDrop, true)
  host.addEventListener('dragover', onDragOver, false)
  return () => {
    host.removeEventListener('paste', onPaste, true)
    host.removeEventListener('drop', onDrop, true)
    host.removeEventListener('dragover', onDragOver, false)
  }
}
```

`Editor.tsx` 创建实例后挂载（effect 内、`editors.set` 之后）：

```ts
import { attachImageHandlers } from '../lib/imagePaste'

    const detach = attachImageHandlers(vd, hostRef.current)
    return () => {
      detach()
      editors.delete(tabId)
      vd.destroy()
    }
```

- [ ] **Step 5: 测试 + 手动验证**

```bash
npm test && npm run typecheck
```

手动清单：

1. macOS 截图（⌘⇧4）→ 编辑器 ⌘V → 出现 `assets/` 目录与图片文件、编辑器显示图片
2. 从访达拖一张 png 到编辑器 → 同上
3. 粘贴纯文本 → 正常走默认粘贴
4. 未保存的未命名标签中粘贴 → toast 提示先保存

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: 图片粘贴/拖拽自动落盘"
```

---

### Task 13: 大纲面板

**Files:**
- Modify: `src/renderer/src/App.tsx`（大纲可见性 CSS 联动）、`src/renderer/src/styles/global.css`
- Test: 无新单测（vditor 内置 outline，行为以手动清单 + E2E 覆盖）

**Interfaces:**
- Consumes: Task 6 Editor 的 `outline: { enable: true, position: 'left' }` 配置（已开启）、Task 5 `useUi.outlineVisible`
- Produces: `html[data-outline-hidden] .vditor-outline { display: none }` 联动样式

- [ ] **Step 1: 实现**

App.tsx（outlineVisible 联动 document dataset）：

```tsx
  const outlineVisible = useUi((st) => st.outlineVisible)
  useEffect(() => {
    if (outlineVisible) delete document.documentElement.dataset.outlineHidden
    else document.documentElement.dataset.outlineHidden = 'true'
  }, [outlineVisible])
```

`global.css` 追加：

```css
html[data-outline-hidden] .vditor-outline { display: none !important; }
```

- [ ] **Step 2: 手动验证 + Commit**

手动清单：

1. 编辑器左侧出现大纲面板，随输入实时更新标题层级
2. 点击大纲条目 → 编辑区滚动到对应标题
3. 视图菜单「切换大纲」（⌘⇧O）→ 大纲隐藏/显示，编辑器布局不跳动

```bash
npm test && npm run typecheck && git add -A && git commit -m "feat: 大纲面板与切换"
```

---

## Milestone M5 — 导出

### Task 14: 导出 HTML 与 PDF

**Files:**
- Create: `scripts/build-export-css.mjs`、`src/main/resources/export.css`（脚本生成物，提交入库）
- Create: `src/main/services/exportService.ts`、`src/main/ipc/export.ts`、`src/main/types.d.ts`
- Modify: `src/renderer/src/lib/menuActions.ts`（export-html/export-pdf 接入）、`package.json`（prebuild 链）
- Test: `tests/unit/exportService.spec.ts`

**Interfaces:**
- Consumes: Task 2 `api`、Task 6 `editors`（`vditor.getHTML()`）
- Produces:
  - `buildHtmlDocument(title: string, bodyHtml: string, css: string): string`（纯函数）
  - `exportHtml(sourcePath: string, html: string): Promise<{ htmlPath: string }>`（写 `${去扩展}.html`）
  - `exportPdf(sourcePath: string, html: string): Promise<{ pdfPath: string }>`（隐藏窗口 printToPDF）
  - menuActions 的 `export-html` / `export-pdf` 分支完成

- [ ] **Step 1: 写入失败测试**

`tests/unit/exportService.spec.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { buildHtmlDocument, replaceTargetExt, notificationBody } from '../../src/main/services/exportService'

describe('buildHtmlDocument', () => {
  it('完整文档：charset/title 转义/CSS 内联/正文', () => {
    const doc = buildHtmlDocument('笔记<1>', '<h1>hi</h1>', 'p{color:red}')
    expect(doc).toContain('<!DOCTYPE html>')
    expect(doc).toContain('<meta charset="utf-8">')
    expect(doc).toContain('<title>笔记&lt;1&gt;</title>')
    expect(doc).toContain('<style>')
    expect(doc).toContain('p{color:red}')
    expect(doc).toContain('<h1>hi</h1>')
    expect(doc).toContain('lang="zh-CN"')
  })
})

describe('replaceTargetExt', () => {
  it('.md → .html/.pdf，保留路径', () => {
    expect(replaceTargetExt('/w/a.md', 'html')).toBe('/w/a.html')
    expect(replaceTargetExt('/w/b.markdown', 'pdf')).toBe('/w/b.pdf')
  })
  it('无扩展名时追加', () => {
    expect(replaceTargetExt('/w/untitled', 'html')).toBe('/w/untitled.html')
  })
})

describe('notificationBody', () => {
  it('返回导出文件路径', () => {
    expect(notificationBody('/w/a.pdf')).toBe('/w/a.pdf')
  })
})
```

- [ ] **Step 2: 运行确认失败**

```bash
npx vitest run tests/unit/exportService.spec.ts
```

预期：FAIL。

- [ ] **Step 3: 生成导出用内联 CSS（一次性脚本 + 生成物入库）**

`scripts/build-export-css.mjs`：

```js
// 将 vditor 内容主题 + KaTeX CSS/字体 内联为单一 export.css（保证导出 HTML 离线可看）
// 用法：node scripts/build-export-css.mjs ；生成物提交入库，随应用打包
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const vditor = (p) => join(root, 'node_modules/vditor/dist', p)
const katex = (p) => join(root, 'node_modules/katex/dist', p)

const typo = await readFile(vditor('css/content-theme/typo.css'), 'utf8')
let katexCss = await readFile(katex('katex.min.css'), 'utf8')

// 内联 KaTeX 字体为 data URI（离线渲染数学公式）。
// 注意：String.replace 的 replacer 是同步回调，await 在其中不生效，须 matchAll 逐个替换
const fontDir = katex('fonts')
const fontRe = /url\(fonts\/(KaTeX_[A-Za-z0-9_-]+\.(?:woff2|woff|ttf))\)/g
const seen = new Map()
for (const m of katexCss.matchAll(fontRe)) {
  const fname = m[1]
  let uri = seen.get(fname)
  if (!uri) {
    const buf = await readFile(join(fontDir, fname))
    uri = `data:font/${fname.endsWith('.woff2') ? 'woff2' : fname.endsWith('.woff') ? 'woff' : 'truetype'};base64,${buf.toString('base64')}`
    seen.set(fname, uri)
  }
  katexCss = katexCss.split(m[0]).join(`url(${uri})`)
}

const out = `/* 由 scripts/build-export-css.mjs 生成，勿手改 */\n${typo}\n${katexCss}\n`
await mkdir(join(root, 'src/main/resources'), { recursive: true })
await writeFile(join(root, 'src/main/resources/export.css'), out, 'utf8')
console.log('[export-css] 已生成 src/main/resources/export.css')
```

运行并提交生成物：

```bash
node scripts/build-export-css.mjs
ls -la src/main/resources/export.css
```

预期：文件存在（约 100-400KB，KaTeX 字体 woff2 全内联）。若 `node_modules/katex` 不存在（vditor 将 katex 打在自身 dist 内），改为读取 `node_modules/vditor/dist/**` 下实际存在的 katex css/字体路径（`ls node_modules/vditor/dist` 确认），脚本逻辑不变。

- [ ] **Step 4: 实现 exportService 与 IPC**

`src/main/types.d.ts`：

```ts
declare module '*.css?raw' {
  const css: string
  export default css
}
```

`src/main/services/exportService.ts`：

```ts
import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { BrowserWindow, Notification, shell } from 'electron'
import exportCss from '../resources/export.css?raw'
import { ErrorCodes, NotaraError } from '@shared/errors'

export function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export function buildHtmlDocument(title: string, bodyHtml: string, css: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
${css}
body { max-width: 800px; margin: 2rem auto; padding: 0 1rem; }
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`
}

export function replaceTargetExt(sourcePath: string, ext: 'html' | 'pdf'): string {
  return sourcePath.replace(/\.(md|markdown)$/i, '') + '.' + ext
}

export function notificationBody(p: string): string {
  return p
}

function notifyExported(p: string): void {
  try {
    const n = new Notification({ title: '导出完成', body: notificationBody(p) })
    n.on('click', () => shell.showItemInFolder(p))
    n.show()
  } catch {
    /* 通知失败不影响导出结果 */
  }
}

export async function exportHtml(sourcePath: string, html: string): Promise<{ htmlPath: string }> {
  const title = path.basename(sourcePath).replace(/\.(md|markdown)$/i, '')
  const doc = buildHtmlDocument(title, html, exportCss)
  const htmlPath = replaceTargetExt(sourcePath, 'html')
  try {
    await fs.writeFile(htmlPath, doc, 'utf8')
  } catch (e) {
    throw new NotaraError(ErrorCodes.WriteFailed, `导出失败: ${String(e)}`)
  }
  notifyExported(htmlPath)
  return { htmlPath }
}

export async function exportPdf(sourcePath: string, html: string): Promise<{ pdfPath: string }> {
  const title = path.basename(sourcePath).replace(/\.(md|markdown)$/i, '')
  const doc = buildHtmlDocument(title, html, exportCss)
  const tmpHtml = path.join(os.tmpdir(), `notara-export-${Date.now()}.html`)
  await fs.writeFile(tmpHtml, doc, 'utf8')

  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
  try {
    await win.loadFile(tmpHtml)
    await new Promise((r) => setTimeout(r, 200)) // 等字体/SVG 首帧渲染
    const pdfBuf = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4'
    })
    const pdfPath = replaceTargetExt(sourcePath, 'pdf')
    await fs.writeFile(pdfPath, pdfBuf)
    notifyExported(pdfPath)
    return { pdfPath }
  } catch (e) {
    throw new NotaraError(ErrorCodes.WriteFailed, `导出 PDF 失败: ${String(e)}`)
  } finally {
    win.destroy()
    await fs.rm(tmpHtml, { force: true })
  }
}
```

`src/main/ipc/export.ts`：

```ts
import { Channels, registerIpc } from './index'
import { exportHtml, exportPdf } from '../services/exportService'

export function registerExportIpc(): void {
  registerIpc(Channels.ExportHtml, async (p: { sourcePath: string; html: string }) =>
    exportHtml(p.sourcePath, p.html)
  )
  registerIpc(Channels.ExportPdf, async (p: { sourcePath: string; html: string }) =>
    exportPdf(p.sourcePath, p.html)
  )
}
```

ipc/index.ts 注册 `registerExportIpc()`；package.json `prebuild` 保持不变（export.css 已入库随源码分发）。

- [ ] **Step 5: menuActions 接入导出分支**

`src/renderer/src/lib/menuActions.ts` 的 default 分支前增加：

```ts
    case 'export-html':
    case 'export-pdf': {
      const { tab, vd } = await activeVditor()
      if (!tab || !vd || !tab.path) {
        useUi.getState().notify('请先保存文件，再导出')
        return
      }
      const html = vd.getHTML()
      try {
        if (action === 'export-html') await api.exportHtml(tab.path, html)
        else await api.exportPdf(tab.path, html)
      } catch (e) {
        useUi.getState().notify(`导出失败: ${(e as Error).message}`)
      }
      return
    }
```

- [ ] **Step 6: 测试 + 手动验证**

```bash
npm test && npm run typecheck
```

手动清单：

1. 打开含数学公式（`$x^2$`）、代码块、mermaid 图、中文长文的 .md
2. ⌘⇧E 导出 HTML → 通知弹出，点击通知在访达定位；断网状态打开导出文件：排版/公式/字体正常
3. ⌘E 导出 PDF → 打开 PDF：A4、背景色（代码块底色）打印、分页正常
4. 未保存标签导出 → toast「请先保存」

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: HTML/PDF 导出（离线内联资源）"
```

---

## Milestone M6 — 主题与打磨

### Task 15: 主题系统（亮/暗/自定义）

**Files:**
- Create: `src/main/services/themeService.ts`、`src/renderer/src/stores/theme.ts`、`src/renderer/src/themes/vars.css`
- Modify: `src/main/ipc/app.ts`（theme:get/set）、`src/main/menu.ts`（主题子菜单）、`src/renderer/src/App.tsx`（订阅 system-changed + 初始加载）、`src/renderer/src/lib/menuActions.ts`（set-theme 已有默认分支）、`src/renderer/src/styles/global.css`（变量迁走）
- Test: `tests/unit/themeService.spec.ts`、`tests/component/themeApply.spec.tsx`

**Interfaces:**
- Consumes: Task 2 `ThemeInfo`/`ThemeSetting`、`nativeTheme`
- Produces:
  - 主进程 `getThemeInfo(): Promise<ThemeInfo>`、`setThemeSetting(setting): Promise<ThemeInfo>`、`listCustomThemes(): Promise<{ name: string }[]>`、`onSystemThemeChanged(cb: (dark: boolean) => void)`
  - 渲染侧 `useThemeStore`：`{ setting, effective, customCss, customThemes, init(): Promise<void>, set(setting): Promise<void> }`；`applyThemeToDom(info: ThemeInfo): void`（独立函数可测）

- [ ] **Step 1: 写入失败测试**

`tests/unit/themeService.spec.ts`（themeService 依赖 app.getPath —— 将路径逻辑抽出为可注入参数 `dirProvider`）：

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// electron 的 app/nativeTheme 用 stub（纯逻辑测试）
vi.mock('electron', () => ({
  app: { getPath: () => userData },
  nativeTheme: { shouldUseDarkColors: false, on: vi.fn() }
}))
import { createThemeService } from '../../src/main/services/themeService'

let userData: string
let svc: ReturnType<typeof createThemeService>

beforeEach(async () => {
  userData = await mkdtemp(join(tmpdir(), 'notara-theme-'))
  svc = createThemeService(() => userData)
})

describe('themeService', () => {
  it('默认 system/light，无自定义主题', async () => {
    const info = await svc.getThemeInfo()
    expect(info.setting).toBe('system')
    expect(info.effective).toBe('light')
    expect(info.customThemes).toEqual([])
    expect(info.customCss).toBeNull()
  })

  it('set 持久化并可读回', async () => {
    await svc.setThemeSetting('dark')
    expect((await svc.getThemeInfo()).setting).toBe('dark')
  })

  it('自定义主题：扫描 themes/*.css，选中返回内容', async () => {
    const dir = join(userData, 'themes')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'my.css'), ':root{--accent:red}', 'utf8')
    const info = await svc.getThemeInfo()
    expect(info.customThemes).toEqual([{ name: 'my' }])
    const applied = await svc.setThemeSetting('my')
    expect(applied.customCss).toBe(':root{--accent:red}')
    expect(applied.effective).toBe('light')
  })

  it('选中的自定义主题文件被删除后回落 system', async () => {
    const dir = join(userData, 'themes')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'x.css'), 'a', 'utf8')
    await svc.setThemeSetting('x')
    await rm(join(dir, 'x.css'))
    const info = await svc.getThemeInfo()
    expect(info.setting).toBe('system')
  })
})
```

`tests/component/themeApply.spec.tsx`（applyThemeToDom 纯 DOM 逻辑，jsdom）：

```tsx
import { afterEach, describe, expect, it } from 'vitest'
import { applyThemeToDom } from '../../src/renderer/src/stores/theme'

afterEach(() => {
  delete document.documentElement.dataset.theme
  document.getElementById('custom-theme-style')?.remove()
})

describe('applyThemeToDom', () => {
  it('亮暗写入 data-theme，移除旧自定义样式', () => {
    applyThemeToDom({ setting: 'dark', effective: 'dark', customCss: null, customThemes: [] })
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('自定义 CSS 注入 <style id=custom-theme-style>', () => {
    applyThemeToDom({ setting: 'my', effective: 'light', customCss: ':root{}', customThemes: [{ name: 'my' }] })
    const el = document.getElementById('custom-theme-style') as HTMLStyleElement
    expect(el).not.toBeNull()
    expect(el.textContent).toBe(':root{}')
    // 再切换到 dark 时移除
    applyThemeToDom({ setting: 'dark', effective: 'dark', customCss: null, customThemes: [] })
    expect(document.getElementById('custom-theme-style')).toBeNull()
  })
})
```

- [ ] **Step 2: 运行确认失败**

```bash
npx vitest run tests/unit/themeService.spec.ts tests/component/themeApply.spec.tsx
```

预期：FAIL。

- [ ] **Step 3: 实现 themeService（主进程）**

`src/main/services/themeService.ts`：

```ts
import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import { app, nativeTheme } from 'electron'
import type { ThemeInfo, ThemeSetting } from '@shared/types'

export function createThemeService(userDataDir: () => string) {
  const settingsFile = (): string => path.join(userDataDir(), 'settings.json')
  const themesDir = (): string => path.join(userDataDir(), 'themes')

  async function readSetting(): Promise<ThemeSetting> {
    try {
      return JSON.parse(await fs.readFile(settingsFile(), 'utf8')).theme ?? 'system'
    } catch {
      return 'system'
    }
  }

  async function writeSetting(setting: ThemeSetting): Promise<void> {
    await fs.mkdir(path.dirname(settingsFile()), { recursive: true })
    await fs.writeFile(settingsFile(), JSON.stringify({ theme: setting }, null, 2), 'utf8')
  }

  async function listCustomThemes(): Promise<{ name: string }[]> {
    try {
      const files = await fs.readdir(themesDir())
      return files.filter((f) => f.endsWith('.css')).map((f) => ({ name: f.slice(0, -4) }))
    } catch {
      return []
    }
  }

  async function readCustomCss(name: string): Promise<string | null> {
    try {
      return await fs.readFile(path.join(themesDir(), `${name}.css`), 'utf8')
    } catch {
      return null
    }
  }

  async function buildInfo(setting: ThemeSetting): Promise<ThemeInfo> {
    let s = setting
    const dark = nativeTheme.shouldUseDarkColors
    let customCss: string | null = null
    if (s !== 'system' && s !== 'light' && s !== 'dark') {
      customCss = await readCustomCss(s)
      if (customCss === null) {
        s = 'system' // 自定义主题丢失，回落
        await writeSetting(s)
      }
    }
    const effective: 'light' | 'dark' = s === 'dark' ? 'dark' : s === 'light' ? 'light' : dark ? 'dark' : 'light'
    return { setting: s, effective, customCss, customThemes: await listCustomThemes() }
  }

  return {
    async getThemeInfo(): Promise<ThemeInfo> {
      return buildInfo(await readSetting())
    },
    async setThemeSetting(setting: ThemeSetting): Promise<ThemeInfo> {
      await writeSetting(setting)
      return buildInfo(setting)
    },
    onSystemThemeChanged(cb: (dark: boolean) => void): void {
      nativeTheme.on('updated', () => cb(nativeTheme.shouldUseDarkColors))
    }
  }
}

// 应用内单例（测试用 createThemeService 注入目录）
export const themeService = createThemeService(() => app.getPath('userData'))
```

`src/main/ipc/app.ts` 追加：

```ts
import { themeService } from '../services/themeService'
import { broadcast } from './index'

registerIpc(Channels.ThemeGet, async () => themeService.getThemeInfo())
registerIpc(Channels.ThemeSet, async (p: { setting: string }) => themeService.setThemeSetting(p.setting))

// 应用启动时（registerAllIpc 调用处）：
themeService.onSystemThemeChanged((dark) => broadcast({ type: 'theme:system-changed', dark }))
```

（onSystemThemeChanged 的接线放在 ipc/index.ts 的 registerAllIpc 末尾。）

- [ ] **Step 4: 实现渲染侧 theme store 与 CSS 变量**

`src/renderer/src/themes/vars.css`（从 global.css 迁出变量并补暗色）：

```css
:root {
  --bg: #ffffff; --bg-elevated: #f5f5f7; --fg: #1d1d1f; --fg-secondary: #6e6e73;
  --border: #d2d2d7; --accent: #3167d6;
}
html[data-theme='dark'] {
  --bg: #1e1e20; --bg-elevated: #2a2a2d; --fg: #e8e8ea; --fg-secondary: #98989d;
  --border: #3a3a3e; --accent: #5c8dff;
}
/* vditor 暗色联动（覆盖其面板变量） */
html[data-theme='dark'] .vditor {
  --panel-background-color: var(--bg-elevated);
  --textarea-background-color: var(--bg);
  --textarea-text-color: var(--fg);
  --border-color: var(--border);
  --ir-heading-border-color: var(--border);
  --ir-bi-color: var(--fg-secondary);
  --ir-heading-color: var(--fg);
  --ir-link-color: var(--accent);
  --ir-blockquote-color: var(--fg-secondary);
  --ir-code-color: var(--fg-secondary);
  --ir-table-border-color: var(--border);
}
```

global.css 顶部的 `:root { --bg... }` 块删除（由 vars.css 提供），并在 global.css 首行 `@import './themes/vars.css';`。

`src/renderer/src/stores/theme.ts`：

```ts
import { create } from 'zustand'
import type { ThemeInfo, ThemeSetting } from '@shared/types'
import { api } from '../lib/api'

export function applyThemeToDom(info: ThemeInfo): void {
  document.documentElement.dataset.theme = info.effective
  const old = document.getElementById('custom-theme-style')
  if (old) old.remove()
  if (info.customCss) {
    const style = document.createElement('style')
    style.id = 'custom-theme-style'
    style.textContent = info.customCss
    document.head.appendChild(style)
  }
}

interface ThemeStore {
  setting: ThemeSetting
  effective: 'light' | 'dark'
  customThemes: { name: string }[]
  init: () => Promise<void>
  set: (setting: ThemeSetting) => Promise<void>
  apply: (info: ThemeInfo) => void
}

export const useThemeStore = create<ThemeStore>((set) => ({
  setting: 'system',
  effective: 'light',
  customThemes: [],
  async init() {
    const info = await api.getTheme()
    this.apply(info)
    set({ setting: info.setting, effective: info.effective, customThemes: info.customThemes })
  },
  async set(setting) {
    const info = await api.setTheme(setting)
    this.apply(info)
    set({ setting: info.setting, effective: info.effective, customThemes: info.customThemes })
  },
  apply(info) {
    applyThemeToDom(info)
    set({ effective: info.effective, customCss: info.customCss })
  }
}))
```

（接口中 `customCss?: string | null` 字段加入 ThemeStore interface。）

App.tsx 挂载时初始化 + 订阅 system-changed：

```tsx
  useEffect(() => {
    void useThemeStore.getState().init()
  }, [])
```

事件订阅 effect 中追加：

```tsx
      if (event.type === 'theme:system-changed') {
        const st = useThemeStore.getState()
        if (st.setting === 'system') {
          const info = await api.getTheme()
          st.apply(info)
        }
      }
```

（`await` 在非 async 回调里不允许——订阅回调改为 `void (async () => { ... })()` 包裹或对 system-changed 直接本地推导 `applyThemeToDom({ setting: 'system', effective: event.dark ? 'dark' : 'light', customCss: null, customThemes: [] })`。采用后者，避免一次 IPC 往返。）

- [ ] **Step 5: 菜单主题子菜单**

`src/main/menu.ts` 视图菜单追加（动态主题项在每次 installMenu 时读取；自定义主题列表通过 `themeService.getThemeInfo()` 异步获取后重建菜单）：

```ts
import { themeService } from './services/themeService'

// 视图 submenu 中：
{
  label: '主题',
  submenu: [
    { label: '跟随系统', type: 'radio', checked: true, click: () => sendFocused('set-theme:system') },
    { label: '亮色', type: 'radio', click: () => sendFocused('set-theme:light') },
    { label: '暗色', type: 'radio', click: () => sendFocused('set-theme:dark') }
  ]
}
```

installMenu 改为 async，构建时读取当前 setting 标记 radio checked，并在 ThemeSet IPC 后由主进程调用 `installMenu()` 重建（ipc/app.ts 的 ThemeSet handler 追加 `void installMenu()`）。自定义主题动态项：读取 `themeService.getThemeInfo()` 后 map 为 `{ label: name, type: 'radio', click: () => sendFocused('set-theme:' + name) }` 追加到子菜单，与三个内置项合并。

- [ ] **Step 6: 测试 + 手动验证**

```bash
npm test && npm run typecheck
```

手动清单：

1. 系统外观切换（系统设置里切换深色模式）→ 界面与编辑器即时切换
2. 视图→主题→暗色：持久化（重启仍是暗色）
3. `mkdir ~/Library/Application\ Support/Notara/themes && echo ':root{--accent:#ff2d55}' > .../themes/pink.css` → 菜单出现 pink 选项，选中后强调色变化；重启仍生效；删除 pink.css 后回落 system

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: 主题系统（系统联动/亮暗/自定义 CSS）"
```

---

### Task 16: 最近工作区 + 欢迎页

**Files:**
- Modify: `src/main/services/recentService.ts`（补 removeRecent，补测试）
- Create: `src/renderer/src/components/Welcome.tsx`
- Modify: `src/renderer/src/App.tsx`（无标签时显示 Welcome）、`src/renderer/src/strings.ts`
- Test: `tests/unit/recentService.spec.ts`、`tests/component/Welcome.spec.tsx`

**Interfaces:**
- Consumes: Task 9 `touchRecent`/`listRecent`、`useWorkspace.open`
- Produces: `removeRecent(root): Promise<void>`；Welcome props `{ recents: RecentWorkspace[]; onOpenFolder: () => void; onNewFile: () => void; onOpenRecent: (root: string) => void }`

- [ ] **Step 1: 写入失败测试**

`tests/unit/recentService.spec.ts`：

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('electron', () => ({ app: { getPath: () => userData } }))
import { listRecent, touchRecent, removeRecent } from '../../src/main/services/recentService'

let userData: string

beforeEach(async () => {
  userData = await mkdtemp(join(tmpdir(), 'notara-recent-'))
})

describe('recentService', () => {
  it('touch 去重排序并截断到 10', async () => {
    for (let i = 0; i < 12; i++) {
      await touchRecent(`/w/${i}`)
    }
    await touchRecent('/w/5') // 提升优先级
    const list = await listRecent()
    expect(list).toHaveLength(10)
    expect(list[0].root).toBe('/w/5')
    expect(list.some((r) => r.root === '/w/0')).toBe(false) // 最旧的被挤出
  })

  it('removeRecent 移除指定项', async () => {
    await touchRecent('/a'); await touchRecent('/b')
    await removeRecent('/a')
    expect((await listRecent()).map((r) => r.root)).toEqual(['/b'])
  })
})
```

`tests/component/Welcome.spec.tsx`：

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Welcome } from '../../src/renderer/src/components/Welcome'

const recents = [
  { root: '/Users/logan/notes', lastOpenedAt: 1 },
  { root: '/tmp/工作区', lastOpenedAt: 2 }
]

describe('Welcome', () => {
  it('列出最近工作区（名称+路径）并触发打开', () => {
    const onOpenRecent = vi.fn(); const onOpenFolder = vi.fn(); const onNewFile = vi.fn()
    render(<Welcome recents={recents} onOpenFolder={onOpenFolder} onNewFile={onNewFile} onOpenRecent={onOpenRecent} />)
    expect(screen.getByTestId('recent-notes')).toHaveTextContent('notes')
    expect(screen.getByTestId('recent-notes')).toHaveTextContent('/Users/logan/notes')
    fireEvent.click(screen.getByTestId('recent-工作区'))
    expect(onOpenRecent).toHaveBeenCalledWith('/tmp/工作区')
    fireEvent.click(screen.getByTestId('welcome-open-folder'))
    expect(onOpenFolder).toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('welcome-new-file'))
    expect(onNewFile).toHaveBeenCalled()
  })

  it('无最近时显示空态', () => {
    render(<Welcome recents={[]} onOpenFolder={() => {}} onNewFile={() => {}} onOpenRecent={() => {}} />)
    expect(screen.getByText('还没有最近的工作区')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 运行确认失败**

```bash
npx vitest run tests/unit/recentService.spec.ts tests/component/Welcome.spec.tsx
```

预期：FAIL。

- [ ] **Step 3: 实现**

`recentService.ts` 追加：

```ts
export async function removeRecent(root: string): Promise<void> {
  const list = (await listRecent()).filter((r) => r.root !== root)
  await fs.writeFile(file(), JSON.stringify(list, null, 2), 'utf8')
}
```

`src/renderer/src/components/Welcome.tsx`：

```tsx
import type { RecentWorkspace } from '@shared/types'
import { s } from '../strings'

interface WelcomeProps {
  recents: RecentWorkspace[]
  onOpenFolder: () => void
  onNewFile: () => void
  onOpenRecent: (root: string) => void
}

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
```

App.tsx：无标签时渲染 Welcome（替换 `{tabs.length > 0 ? ... : null}` 的 null 分支）：

```tsx
  const [recents, setRecents] = useState<RecentWorkspace[]>([])
  useEffect(() => {
    void api.listRecent().then(setRecents)
    // workspace:open 后刷新
  }, [])

      ) : (
        <Welcome
          recents={recents}
          onOpenFolder={() => void handleMenuAction('open')}
          onNewFile={() => void handleMenuAction('new-file')}
          onOpenRecent={(root) => void useWorkspace.getState().open(root)}
        />
      )}
```

workspace open 后刷新 recents：`useWorkspace.getState().open` 成功后（App 中的调用处）追加 `void api.listRecent().then(setRecents)`。

`global.css` 追加：

```css
.welcome { max-width: 480px; margin: 12vh auto 0; padding: 0 24px; }
.welcome-title { font-size: 28px; margin-bottom: 24px; }
.welcome-actions { display: flex; gap: 12px; margin-bottom: 40px; }
.welcome-recent-title { font-size: 13px; color: var(--fg-secondary); font-weight: 600; }
.welcome-recent-list { list-style: none; padding: 0; }
.welcome-recent-item { display: flex; flex-direction: column; gap: 2px; width: 100%; text-align: left; padding: 10px 12px; border: none; background: none; border-radius: 8px; cursor: pointer; }
.welcome-recent-item:hover { background: var(--bg-elevated); }
.welcome-recent-name { font-size: 14px; color: var(--fg); }
.welcome-recent-path { font-size: 12px; color: var(--fg-secondary); font-family: ui-monospace, monospace; }
.welcome-empty { color: var(--fg-secondary); font-size: 13px; }
```

- [ ] **Step 4: 运行测试 + Commit**

```bash
npm test && npm run typecheck
git add -A && git commit -m "feat: 欢迎页与最近工作区"
```

---

### Task 17: 窗口状态持久化 + 退出/关闭握手

**Files:**
- Create: `src/main/services/windowStateService.ts`
- Modify: `src/main/window.ts`（bounds 恢复 + close 拦截）、`src/main/index.ts`（before-quit 握手）、`src/main/ipc/app.ts`（get/save state、allow-close、flush-done）
- Modify: `src/renderer/src/App.tsx`（恢复流程、flush 响应、close-requested 确认）
- Test: `tests/unit/windowStateService.spec.ts`

**Interfaces:**
- Consumes: Task 4 `saveScheduler.flushAll`、Task 5 `useUi.askConfirm`
- Produces:
  - `loadWindowState(): WindowState | null`（`WindowState = { bounds: Rectangle; payload: WindowStatePayload }`）、`saveWindowState(win: BrowserWindow, payload: WindowStatePayload): Promise<void>`
  - 退出握手：before-quit → 广播 `app:flush-before-quit` → 各窗口 `flushDone()` ack → 3s 超时兜底 → 保存状态 → `app.exit(0)`
  - 关闭握手：win 'close' → preventDefault → 发 `app:close-requested` → 渲染侧 flush + 脏标签批量确认 → `allowClose()` → `win.destroy()`

- [ ] **Step 1: 写入失败测试**

`tests/unit/windowStateService.spec.ts`：

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('electron', () => ({
  app: { getPath: () => userData },
  // load() 用 screen 校验 bounds 是否落在可见显示器内
  screen: { getAllDisplays: () => [{ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }] }
}))
import { createWindowStateService } from '../../src/main/services/windowStateService'

let userData: string
let svc: ReturnType<typeof createWindowStateService>

beforeEach(async () => {
  userData = await mkdtemp(join(tmpdir(), 'notara-wstate-'))
  svc = createWindowStateService(() => userData)
})

describe('windowStateService', () => {
  it('保存后可读回（含 bounds 与 payload）', async () => {
    await svc.save({ x: 1, y: 2, width: 800, height: 600 }, {
      workspaceRoot: '/w', tabPaths: ['/w/a.md'], activeIndex: 0
    })
    const st = await svc.load()
    expect(st?.bounds).toEqual({ x: 1, y: 2, width: 800, height: 600 })
    expect(st?.payload.workspaceRoot).toBe('/w')
    expect(st?.payload.tabPaths).toEqual(['/w/a.md'])
  })

  it('无文件时返回 null（首启）', async () => {
    expect(await svc.load()).toBeNull()
  })

  it('超出屏幕的 bounds 被丢弃（防恢复到不可见位置）', async () => {
    await svc.save({ x: -99999, y: 99999, width: 800, height: 600 }, {
      workspaceRoot: null, tabPaths: [], activeIndex: -1
    })
    const st = await svc.load()
    expect(st?.bounds).toBeUndefined()
  })
})
```

- [ ] **Step 2: 运行确认失败**

```bash
npx vitest run tests/unit/windowStateService.spec.ts
```

预期：FAIL。

- [ ] **Step 3: 实现 windowStateService**

`src/main/services/windowStateService.ts`：

```ts
import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import { screen } from 'electron'
import type { WindowStatePayload } from '@shared/types'

export interface WindowState {
  bounds?: Electron.Rectangle
  payload: WindowStatePayload
}

export function createWindowStateService(userDataDir: () => string) {
  const file = (): string => path.join(userDataDir(), 'window-state.json')

  async function save(bounds: Electron.Rectangle, payload: WindowStatePayload): Promise<void> {
    await fs.mkdir(path.dirname(file()), { recursive: true })
    await fs.writeFile(file(), JSON.stringify({ bounds, payload }, null, 2), 'utf8')
  }

  async function load(): Promise<WindowState | null> {
    let raw: string
    try {
      raw = await fs.readFile(file(), 'utf8')
    } catch {
      return null
    }
    try {
      const st = JSON.parse(raw) as WindowState
      const out: WindowState = { payload: st.payload ?? { workspaceRoot: null, tabPaths: [], activeIndex: -1 } }
      if (st.bounds) {
        // bounds 需至少与任一显示器有交集
        const visible = screen.getAllDisplays().some((d) => {
          const b = d.workArea
          return (
            st.bounds!.x < b.x + b.width &&
            st.bounds!.x + st.bounds!.width > b.x &&
            st.bounds!.y < b.y + b.height &&
            st.bounds!.y + st.bounds!.height > b.y
          )
        })
        if (visible) out.bounds = st.bounds
      }
      return out
    } catch {
      return null
    }
  }

  return { save, load }
}
```

`src/main/window.ts` 更新：

```ts
import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { createWindowStateService } from './services/windowStateService'

const stateService = createWindowStateService(() => app.getPath('userData'))
export { stateService }

export async function createWindow(): Promise<BrowserWindow> {
  const last = await stateService.load()
  const win = new BrowserWindow({
    width: last?.bounds?.width ?? 1200,
    height: last?.bounds?.height ?? 800,
    x: last?.bounds?.x,
    y: last?.bounds?.y,
    minWidth: 640,
    minHeight: 400,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  // 关闭握手：脏标签确认在渲染侧完成后 allowClose 才真正销毁
  win.on('close', (e) => {
    if (!(win as BrowserWindow & { __allowedClose?: boolean }).__allowedClose) {
      e.preventDefault()
      win.webContents.send('main:event', { type: 'app:close-requested' })
    }
  })

  win.once('ready-to-show', () => win.show())
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) void win.loadURL(devUrl)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
  return win
}
```

`src/main/index.ts` 退出握手（追加）：

```ts
let quitting = false

app.on('before-quit', (e) => {
  if (quitting) return
  const wins = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed())
  if (wins.length === 0) return
  e.preventDefault()
  quitting = true
  let acks = 0
  const total = wins.length
  const finish = (): void => {
    if (++acks > total) return
    if (acks === total) {
      clearTimeout(timeout)
      app.exit(0)
    }
  }
  const timeout = setTimeout(() => app.exit(0), 3000) // 兜底：渲染侧无响应
  for (const w of wins) w.webContents.send('main:event', { type: 'app:flush-before-quit' })
  // flush-done 由 ipc/app.ts 的 handler 调 finish（见下）
})
```

（`finish` 需暴露给 ipc/app.ts——将其挂在模块级导出 `export const quitAck = { finish: () => {} }` 由 ipc 注册时注入，或把握手整体移到 `src/main/quit.ts` 导出 `installQuitHandshake()`。采用后者，避免循环导入。）

`src/main/ipc/app.ts` 追加：

```ts
import { BrowserWindow } from 'electron'

registerIpc(Channels.AppFlushDone, async (_p: unknown, event: IpcMainInvokeEvent) => {
  quitAck(event.sender)
  return null
})

registerIpc(Channels.AppAllowClose, async (_p: unknown, event: IpcMainInvokeEvent) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) {
    ;(win as BrowserWindow & { __allowedClose?: boolean }).__allowedClose = true
    win.destroy()
  }
  return null
})

registerIpc(Channels.AppGetWindowState, async () => stateService.load())
registerIpc(Channels.AppSaveWindowState, async (p: { state: WindowStatePayload }) => {
  const win = BrowserWindow.getFocusedWindow()
  if (win) await stateService.save(win.getBounds(), p.state)
  return null
})
```

（`quitAck` 为 quit.ts 暴露的注册函数注入的回调；`IpcMainInvokeEvent` 类型从 electron 导入。）

- [ ] **Step 4: 渲染侧恢复与握手**

App.tsx（初始恢复 + 保存节流 + 握手响应）：

```tsx
  // 启动恢复：上次的 workspace 与标签
  const [restored, setRestored] = useState(false)
  useEffect(() => {
    void (async () => {
      if (restored) return
      setRestored(true)
      const st = await api.getWindowState()
      if (st?.payload.workspaceRoot) {
        await useWorkspace.getState().open(st.payload.workspaceRoot).catch(() => undefined)
        for (const p of st.payload.tabPaths) await openPath(p)
        if (st.payload.activeIndex >= 0) useTabs.getState().setActive(Math.min(st.payload.activeIndex, useTabs.getState().tabs.length - 1))
      }
    })()
  }, [restored])

  // 状态保存（节流 1s）
  const persistState = useRef<() => void>(() => {})
  persistState.current = () => {
    const ws = useWorkspace.getState()
    const tabs = useTabs.getState()
    void api.saveWindowState({
      workspaceRoot: ws.root,
      tabPaths: tabs.tabs.map((t) => t.path).filter((p): p is string => p !== null),
      activeIndex: tabs.activeIndex
    })
  }
  useEffect(() => {
    const t = setInterval(() => persistState.current(), 1000)
    return () => clearInterval(t)
  }, [])

  // 退出/关闭握手
  useEffect(() => {
    const off = api.onEvent((event: MainEvent) => {
      if (event.type === 'app:flush-before-quit') {
        void saveScheduler.flushAll().then(() => {
          persistState.current()
          void api.flushDone()
        })
      }
      if (event.type === 'app:close-requested') {
        void (async () => {
          await saveScheduler.flushAll()
          const dirty = useTabs.getState().tabs.filter((t) => t.dirty)
          if (dirty.length === 0) {
            persistState.current()
            void api.allowClose()
            return
          }
          useUi.getState().askConfirm({
            title: '未保存的修改',
            text: `有 ${dirty.length} 个标签未保存，关闭前保存吗？`,
            confirmText: '保存',
            onConfirm: () => {
              void saveScheduler.flushAll().then(async () => {
                persistState.current()
                await api.allowClose()
              })
            },
            onCancel: () => {
              void api.allowClose()
            }
          })
        })()
      }
    })
    return off
  }, [])
```

注意：启动恢复需要与 Task 7 的 launchOpen 互斥——`getLaunchOpen()` 有值时跳过 window-state 恢复（命令行参数优先）。

- [ ] **Step 5: 标签快捷键（设计 §6.2：⌘⇧[ / ⌘⇧] / ⌘1..9）**

App.tsx 追加全局键盘处理（编辑器聚焦时 keydown 冒泡到 window；macOS 下 `metaKey` 即 ⌘）：

```tsx
  useEffect(() => {
    const h = (e: KeyboardEvent): void => {
      const tabs = useTabs.getState()
      if (e.metaKey && e.shiftKey && (e.key === '[' || e.key === ']')) {
        e.preventDefault()
        const n = tabs.tabs.length
        if (n === 0) return
        const next = e.key === ']' ? (tabs.activeIndex + 1) % n : (tabs.activeIndex - 1 + n) % n
        tabs.setActive(next)
        return
      }
      if (e.metaKey && !e.shiftKey && !e.ctrlKey && /^[1-9]$/.test(e.key)) {
        e.preventDefault()
        const i = Number(e.key) - 1
        if (i < tabs.tabs.length) tabs.setActive(i)
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])
```

注意：⌘1..9 与 vditor 内部无冲突；若发现 macOS 输入法占用 ⌘⇧[（如切换输入法），保持实现不变（系统级冲突无法覆盖）。

- [ ] **Step 6: 测试 + 手动验证**

```bash
npm test && npm run typecheck
```

手动清单：

1. 打开工作区 + 3 个标签 → 移动/调整窗口 → ⌘Q 退出 → 重启：工作区、标签、窗口位置全部恢复
2. 有脏标签时 ⌘Q：自动 flush 保存（无弹窗），重启后内容在
3. 有脏标签时点红色关闭按钮：弹批量确认；「不保存」直接关闭
4. 拔掉外接显示器后重启（旧 bounds 不可见）：窗口仍出现在可见区域
5. ⌘⇧]/⌘⇧[ 循环切换标签；⌘2 直达第二个标签

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: 窗口状态持久化、退出握手与标签快捷键"
```

---

### Task 18: E2E 冒烟 + electron-builder 打包

**Files:**
- Create: `playwright.config.ts`、`tests/e2e/smoke.spec.ts`、`tests/fixtures/e2e-workspace/README.md`、`tests/fixtures/e2e-workspace/docs/note.md`
- Create: `electron-builder.yml`
- Modify: `package.json`（build 资源包含）

**Interfaces:**
- Consumes: 全部前序任务；`NOTARA_OPEN` 启动参数（Task 7）、`data-testid`（tab-*/tree-node-*/welcome-*）

- [ ] **Step 1: 准备 fixture 与 playwright 配置**

`tests/fixtures/e2e-workspace/README.md`：

```markdown
# E2E 工作区

初始内容，用于冒烟测试。
```

`tests/fixtures/e2e-workspace/docs/note.md`：

```markdown
# 笔记

子目录文件。
```

`playwright.config.ts`：

```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  workers: 1, // Electron 单实例
  reporter: 'line'
})
```

- [ ] **Step 2: 写入 E2E 冒烟测试**

`tests/e2e/smoke.spec.ts`：

```ts
import { test, expect, _electron, type ElectronApplication, type Page } from '@playwright/test'
import { cp, mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const fixture = join(repoRoot, 'tests/fixtures/e2e-workspace')

test('打开工作区 → 编辑 → 自动保存 → 导出 HTML', async () => {
  const ws = await mkdtemp(join(tmpdir(), 'notara-e2e-'))
  await cp(fixture, ws, { recursive: true })

  const app: ElectronApplication = await _electron.launch({
    args: [join(repoRoot, '.')], // package.json main → out/main/index.js
    env: { ...process.env, NOTARA_OPEN: ws }
  })
  const page: Page = await app.firstWindow()

  // 文件树出现并打开 README.md
  await expect(page.getByTestId(`tree-node-${join(ws, 'README.md')}`)).toBeVisible({ timeout: 10_000 })
  await page.getByTestId(`tree-node-${join(ws, 'README.md')}`).click()
  await expect(page.locator('.vditor')).toBeVisible()

  // 编辑（末尾追加一行）
  await page.click('.vditor')
  await page.keyboard.press('Meta+ArrowDown')
  await page.keyboard.press('Enter')
  await page.keyboard.type('E2E-EDIT-MARK')

  // 自动保存（防抖 500ms + 写盘 + 余量）
  await page.waitForTimeout(1200)
  const content = await readFile(join(ws, 'README.md'), 'utf8')
  expect(content).toContain('E2E-EDIT-MARK')

  // 通过暴露的 API 直接导出 HTML（绕过菜单）。
  // 注意：preload 已解包 IpcResult 信封，成功时直接返回 value（失败则 throw）
  const r = await page.evaluate(
    (src) => window.notara.exportHtml(src, '<h1>导出</h1>'),
    join(ws, 'README.md')
  )
  expect(r.htmlPath).toBe(join(ws, 'README.html'))
  const exported = await readFile(join(ws, 'README.html'), 'utf8')
  expect(exported).toContain('<h1>导出</h1>')
  expect(exported).toContain('<title>README</title>')

  // 退出（flush 握手路径）
  await app.close()
  await rm(ws, { recursive: true, force: true })
})
```

注意 `window.notara.exportHtml` 在 contextBridge 下返回的是 Promise；`page.evaluate` 会正确等待。TS 全局类型未在 e2e 里声明时用 `(window as any).notara` 规避——本测试已 import type 无关，直接 `window.notara` 需在 e2e tsconfig 上下文可解析；如类型报错，改用 `(window as unknown as { notara: { exportHtml: (a: string, b: string) => Promise<{ ok: boolean }> } }).notara`。

- [ ] **Step 3: 运行 E2E**

```bash
npm run e2e
```

预期：1 个用例 PASS（自动先执行 `npm run build`）。

常见失败排查：`_electron.launch` 需要传可执行目录——若报 "Cannot find Electron"，把 `args` 改为 `[join(repoRoot, 'out/main/index.js')]`（直接指向编译产物）并保留 env。

- [ ] **Step 4: electron-builder 打包**

`electron-builder.yml`：

```yaml
appId: io.github.logan.notara
productName: Notara
directories:
  output: release
files:
  - out/**
  - "!**/.map"
  - package.json
mac:
  category: public.app-category.productivity
  target:
    - target: dmg
      arch:
        - arm64
        - x64
  identity: null # 本地构建不签名；公证与签名留待发布流程
asarUnpack:
  - "**/resources/*"
```

运行：

```bash
npm run dist
```

预期：`release/` 下生成 `Notara-0.1.0-arm64.dmg`（与 x64），打开 dmg 拖入 Applications 后启动：核心流程（⌘O → 编辑 → 自动保存 → 导出）与 dev 一致。⚠️ export.css 经 `?raw` 打进主进程 bundle，无需 asarUnpack——上面 asarUnpack 配置可删；若构建警告 CSS 未包含，再恢复。

- [ ] **Step 5: 全量回归 + Commit**

```bash
npm test && npm run typecheck && npm run e2e
git add -A
git commit -m "test: E2E 冒烟与 electron-builder 打包"
```

---

## 附：手动验收清单（全部任务完成后走一遍）

1. 冷启动 → 欢迎页 → 打开最近工作区 → 恢复标签
2. 即时渲染：标题/加粗/列表/表格/代码/公式/mermaid 正常，中文 IME 顺畅
3. 多标签：脏点、中键关闭、关闭确认三态、⌘⇧[/] 切换
4. 文件树：展开/右键新建/重命名/删除（废纸篓）、外部变更刷新
5. 图片：截图粘贴、拖拽、无目录提示
6. 外部冲突：净重载 / 脏弹窗两分支 / 外部删除标记
7. 导出：HTML（断网可看）、PDF（A4 分页）
8. 主题：系统联动、持久化、自定义 CSS、vditor 暗色
9. 退出：⌘Q flush 无丢失；红绿灯关闭确认
10. dmg 安装包可用

## 附：刻意留待后续（v0.2 候选）

- 帮助菜单（macOS Help Book 注册）
- Word 导出（pandoc）
- 工作区内全局搜索
- 代码签名与公证、Homebrew 分发

