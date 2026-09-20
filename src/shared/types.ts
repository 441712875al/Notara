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

// ── Typora 主题导入 ─────────────────────────────────────
/** 主题包内相对资源（字体/图片）的落点：转换时逐个解析，主进程照单复制 */
export interface TyporaAssetMapping {
  /** 主题里的原始引用（如 ./fonts/x.woff2） */
  relativeUrl: string
  /** 生成 CSS 中实际写出的 url（已复制资源为 file:// 绝对地址；缺失资源原样保留） */
  emitUrl: string
  /** 可复制的源文件绝对路径；缺失资源为 null */
  copyFrom: string | null
  /** 复制目标绝对路径（与 copyFrom 同时存在） */
  destPath: string | null
}

/** 转换报告：导入 toast 的摘要 + 写进主题文件头注释的完整记录 */
export interface TyporaImportResult {
  name: string
  /** 变量桥接明细，如 '--primary-color → --accent' */
  varsBridged: string[]
  /** 未能桥接的 Typora 变量名 */
  varsDropped: string[]
  /** 转换产出的规则条数（不含变量块） */
  rulesMapped: number
  /** 未映射的选择器（至多 30 个，完整清单见主题文件头注释同源） */
  selectorsDropped: string[]
  /** 成功复制的资源数 */
  assetsCopied: number
  /** 找不到源文件的资源引用 */
  missingAssets: string[]
  notes: string[]
}

// ── 窗口状态 ────────────────────────────────────────────
export interface WindowStatePayload {
  workspaceRoot: string | null
  tabPaths: string[]
  activeIndex: number
}

/** 窗口位置尺寸（与 Electron.Rectangle 结构一致；此处独立声明以便渲染侧引用） */
export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface WindowState {
  /** 上次关闭时的窗口位置尺寸；不在任何可见显示器内时缺省（由主进程校验后丢弃） */
  bounds?: WindowBounds
  payload: WindowStatePayload
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
  | 'import-typora-theme'
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
/**
 * preload 已解包 IpcResult 信封：成功直接返回 value，失败 throw Error。
 * 注意：contextBridge 跨桥只克隆 Error 的 stack/message（自定义属性 code 会丢），
 * 故错误码编码进 message 前缀 `[code] message`；渲染侧用 parseIpcError 解回 code 与纯 message。
 */
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
  /** 导入 Typora 主题包：sourcePath 缺省时主进程弹选择框；用户取消返回 null */
  importTyporaTheme(sourcePath?: string): Promise<TyporaImportResult | null>
  // 应用生命周期
  flushDone(): Promise<void>
  allowClose(): Promise<void>
  quitPending(): Promise<void>
  quitCancel(): Promise<void>
  getWindowState(): Promise<WindowState | null>
  saveWindowState(state: WindowStatePayload): Promise<void>
  // 事件
  onEvent(cb: (event: MainEvent) => void): () => void
}
