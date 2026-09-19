# Notara 设计文档 — macOS Markdown 编辑器

- 日期：2026-09-19
- 状态：已确认
- 目标平台：macOS（Apple Silicon 优先，Intel 兼容）

## 1. 背景与目标

Typora 转为付费后，需要一个免费、开源的替代品。Notara 是一个运行在 macOS 上的
Markdown 编辑器，核心体验对齐 Typora 的**即时渲染（所见即所得）**编辑模式，
并具备日常写作所需的文件管理、导出与主题能力。

### 1.1 目标（Goals）

- 即时渲染编辑体验（打字后 Markdown 语法即时转为富文本，语法标记淡出显示）
- 工作区单窗口模型：一个窗口管理一个文件夹（文件树 + 多标签页）
- 打开单个文件时退化为单标签、无文件树的轻窗口
- 自动保存、外部变更检测
- 导出 PDF / HTML
- 亮 / 暗主题（跟随系统）+ 自定义 CSS 主题
- 粘贴 / 拖拽图片自动落盘并插入相对路径引用
- 简体中文界面

### 1.2 非目标（Non-Goals，均为未来可扩展项）

- Word（.docx）导出（依赖外部 pandoc，暂不引入）
- 云同步 / 移动端
- 可视化主题编辑器
- 协同编辑
- 非 macOS 平台

## 2. 技术选型

| 层 | 选型 | 理由 |
|---|---|---|
| 应用壳 | Electron（最新稳定版） | 与 Typora 同款技术；文件对话框、菜单、打印等桌面能力成熟 |
| 语言 | TypeScript（主进程/渲染进程/preload 三端统一类型） | IPC 类型安全，降低跨进程契约出错率 |
| 构建 | electron-vite | 主/渲染/preload 三端构建 + 开发热更新 |
| 打包 | electron-builder（dmg + zip） | macOS 标准分发格式 |
| UI 框架 | React 19 + zustand | 标签页、文件树、大纲均为状态驱动 UI；zustand 轻量管理 tab/tree/theme 状态 |
| 编辑器内核 | vditor ^3（MIT） | `mode: 'ir'` 即时渲染模式即仿 Typora 设计；自带数学公式（KaTeX）、mermaid、代码高亮、大纲、中文优化 |
| 测试 | Vitest（单元/组件）+ Playwright（Electron E2E） | 覆盖核心逻辑与冒烟路径 |

**参考项目**：
- [vditor](https://github.com/Vanessa219/vditor)（⭐11.3k）— 编辑器内核
- [horseMD](https://github.com/BND-1/horseMD)（⭐478）— Electron 整壳的 Typora 替代品，交互可参考
- [MarkEdit](https://github.com/MarkEdit-app/MarkEdit)（⭐5.7k）— 混合路线的同类应用，主题/交互可参考

## 3. 系统架构

标准 Electron 安全模型：**nodeIntegration 关闭、contextIsolation 开启、sandbox 开启**，
渲染进程仅通过 preload 暴露的类型化 API（contextBridge）与主进程通信，文件系统操作全部在主进程完成。

```
┌─ Main 进程（Node.js）──────────────────────────────┐
│ index.ts     应用生命周期、菜单（macOS 规范）、⌘ 快捷键 │
│ window.ts    BrowserWindow 创建与状态恢复            │
│ workspace.ts 文件树扫描（懒加载）+ fs.watch 外部变更   │
│ files.ts     读写、自动保存调度、重命名/删除/新建      │
│ images.ts    图片落盘（assets/），返回相对路径         │
│ export.ts    HTML 生成（内联样式）、PDF（printToPDF） │
│ recent.ts    最近工作区持久化（userData JSON）        │
└───────────────────┬─────────────────────────────────┘
                    │ typed IPC（invoke + event）
┌───────────────────┴─────────────────────────────────┐
│ Renderer（React 19 + vditor）                        │
│ App.tsx      布局：标签栏 / 左侧栏（文件树·大纲）/ 编辑区│
│ TabBar       多标签页（未保存圆点、中键关闭）          │
│ FileTree     懒加载目录、右键菜单（新建/重命名/删除）  │
│ Outline      标题大纲，点击跳转                      │
│ Editor       vditor 封装：每标签页一个实例，保留撤销史 │
│ themes/      CSS 变量主题系统                        │
│ Welcome      欢迎页（最近工作区列表）                │
└──────────────────────────────────────────────────────┘
```

## 4. 模块职责与 IPC 契约

共享类型定义在 `src/shared/types.ts`（IPC 的请求/响应类型、TreeNode、TabState 等，
主进程与渲染进程共用）。

### 4.1 Renderer → Main（invoke，均有返回值）

| 通道 | 请求 | 响应 |
|---|---|---|
| `dialog:open` | – | `{ type: 'folder' \| 'file', path: string } \| null`（⌘O，可选文件或文件夹） |
| `files:read` | `{ path }` | `{ content, mtime }` |
| `files:write` | `{ path, content }` | `{ mtime }`（原子写入：临时文件 + rename） |
| `files:create` | `{ dir, name, kind: 'file' \| 'directory' }` | `{ path }` |
| `files:rename` | `{ oldPath, newPath }` | `{ path }` |
| `files:delete` | `{ path }`（移入废纸篓，可恢复） | `void` |
| `files:save-as` | `{ suggestedName, content }` | `{ path } \| null` |
| `workspace:children` | `{ dir }` | `TreeNode[]`（懒加载单层） |
| `workspace:open` | `{ root }` | 启动 fs.watch，记录最近工作区 |
| `images:save` | `{ refDir, buffer, ext }` | `{ relativePath }`（写入 `refDir/assets/`） |
| `export:html` | `{ path, content }` | `{ htmlPath }` |
| `export:pdf` | `{ path, content }` | `{ pdfPath }` |
| `recent:list` | – | `RecentWorkspace[]` |
| `app:flush-done` | – | `void`（配合 §5.1 退出握手：主进程发 `app:flush-before-quit`，渲染进程写盘全部脏标签后回此 ack，主进程放行退出） |

### 4.2 Main → Renderer（event 推送）

| 事件 | 载荷 | 说明 |
|---|---|---|
| `workspace:tree-changed` | `{ root }` | 文件树有增删改，通知 FileTree 刷新 |
| `file:external-change` | `{ path, mtime }` | 打开中的文件被外部修改（见 §5.2 冲突策略） |
| `file:external-delete` | `{ path }` | 打开中的文件被外部删除（标签标记"已删除"） |
| `file:renamed` | `{ oldPath, newPath }` | 外部或本应用发起的重命名，同步标签/文件树 |

### 4.3 文件树规则

- 仅显示 Markdown 相关文件（`.md`、`.markdown`）与目录；图片等其他文件不列出
  （文件树面向写作，非文件浏览器）
- 忽略：`.git`、`node_modules`、隐藏目录（`.` 开头）
- `assets` 目录**不**忽略（用户可浏览其中的图片，便于确认插入结果）
- 目录懒加载：展开时才请求子节点；排序：目录在前、按名称不区分大小写
- 树节点变更由 fs.watch（macOS 递归监听）驱动刷新

## 5. 关键数据流

### 5.1 编辑与自动保存

```
vditor input → 标记该 tab dirty（标题栏圆点 + 标题 "已编辑"）
            → 防抖 500ms → files:write → dirty=false
```

强制写盘（flush，绕过防抖立即保存）时机：切换标签、关闭标签、窗口失焦、
退出应用（`before-quit` 中阻塞退出，广播 `app:flush-before-quit`，等待渲染进程
写盘全部脏标签并回 `app:flush-done` 后再放行，带超时兜底）。

写入采用原子写：先写 `path + '.tmp'` 再 `rename` 覆盖，避免半写状态。
写盘前后比对 mtime 用于外部变更检测（§5.2）。

### 5.2 外部变更冲突策略

fs.watch 检测到打开中的文件变更：

| 状态 | 行为 |
|---|---|
| 文件不脏 | 自动重载内容（保留光标行位置） |
| 文件脏 | 系统通知提示选择：**保留我的版本**（立即写盘覆盖外部修改）/ **加载磁盘版本**（丢弃本地未保存内容，需二次确认） |

### 5.3 图片处理

粘贴（paste 事件）或拖拽（drop 事件）含图片时：

1. Renderer 拿到 Blob，读为 ArrayBuffer
2. IPC `images:save`：主进程写入**当前文件所在目录**的 `assets/`
   （文件名 `{原名或 'image'}-{时间戳}-{随机4位}.png`，重名安全）
3. 主进程返回相对路径，Renderer 以 `![](assets/xxx.png)` 插入光标处
4. 多文件同名冲突：文件名含时间戳+随机后缀，天然避免
5. 粘贴非图片文本照常走 vditor 默认粘贴逻辑

### 5.4 导出

- **HTML**：vditor 渲染为完整 HTML，**关键渲染资源（CSS、KaTeX、mermaid）内联**，
  保证导出文件离线可打开（文件变大可接受），默认导出到源文件同目录 `xxx.html`
- **PDF**：主进程创建隐藏 BrowserWindow 加载导出 HTML（固定浅色主题），
  `webContents.printToPDF`（A4、合理边距、背景打印），导出到源文件同目录 `xxx.pdf`
- 导出完成以系统通知提示，并可在通知中打开文件所在位置

### 5.5 主题系统

- 内置两套：`light` / `dark`，默认**跟随系统**（`nativeTheme.shouldUseDarkColors`，变化实时切换）
- 主题 = 一组 CSS 自定义属性（`--bg`、`--fg`、`--accent`、编辑区排版变量等），
  同时联动切换 vditor 的内容主题 CSS
- 自定义主题：用户将 `.css` 文件放入 `userData/themes/`，启动时扫描列出，
  选中后作为附加样式层叠加在基础主题之上（提供变量覆盖能力）
- 主题选择持久化到 userData 配置

## 6. UI 与交互

### 6.1 窗口模型

- **工作区窗口**：`⌘O` 选择文件夹 → 单窗口，左侧文件树 + 顶部标签页，
  fs.watch 递归监听根目录
- **单文件窗口**：`⌘O` 选择 `.md` 文件 → 无文件树、单标签的轻窗口，
  仅监听该文件及其父目录（外部重命名/删除可感知）
- 多窗口可并存（不同工作区/文件互不影响）；窗口尺寸与各窗口的工作区、
  打开标签列表持久化到 userData，重启还原

### 6.2 标签页

- 脏标记：标题前圆点；关闭未保存标签时提示保存/放弃
- 中键点击关闭；`⌘W` 关闭当前标签，`⌘⇧[` / `⌘⇧]` 切换前后标签，`⌘1..9` 直达
- 标签超出宽度时滚动 + 「+」按钮新建文件

### 6.3 菜单（macOS 规范）

应用菜单、文件（新建 ⌘N / 打开 ⌘O / 保存 ⌘S / 另存为 ⌘⇧S / 导出 PDF ⌘E / 导出 HTML ⌘⇧E /
关闭标签 ⌘W / 关闭窗口 ⇧⌘W）、编辑、格式（加粗 ⌘B / 斜体 ⌘I / 插入链接 ⌘K 等，
转发给 vditor）、视图（切换文件树/大纲、切换主题、放大缩小）、窗口、帮助。

### 6.4 欢迎页

无打开内容时显示：最近工作区列表（点击直达）、「打开文件夹」「新建文件」按钮。

### 6.5 界面语言

简体中文硬编码文案（不做 i18n 框架，文案集中一处便于未来抽取）。

## 7. 错误处理

| 场景 | 处理 |
|---|---|
| 文件被外部删除（标签打开中） | 标签标题标记「已删除」；保存时提示另存为 |
| 写盘失败（权限/磁盘） | 系统通知 + 保留脏标记（内容不丢），下次输入重试 |
| 工作区根目录被删除/不可访问 | 关闭文件树，回到欢迎页 |
| 读取非 UTF-8 / 二进制文件 | 打开前检测，非文本则拒绝并提示 |
| 图片保存失败 | 通知 + 插入失败占位文本，不打断编辑 |
| fs.watch 报错（目录消失等） | 停止该 watcher，提示工作区不可用 |
| IPC 调用异常 | preload 层统一包装为 reject + 错误对象，UI 层通知 |

## 8. 安全

- `nodeIntegration: false`、`contextIsolation: true`、`sandbox: true`
- 渲染进程不直接接触 fs/path；所有路径由主进程校验后操作
- 外部链接默认系统浏览器打开（`setWindowOpenHandler` 拦截）
- 导出 HTML 时对标题等插值做转义，防注入

## 9. 测试策略

- **单元（Vitest，主进程纯逻辑）**：文件树扫描/过滤/排序、图片命名与相对路径计算、
  原子写、防抖/flush 调度、导出文件名
- **组件（Vitest + Testing Library）**：TabBar 脏标记与关闭确认、FileTree 懒加载与右键菜单、
  Welcome 最近列表
- **E2E（Playwright `_electron`）冒烟**：启动 → 打开工作区 fixture → 编辑 → 自动保存断言 →
  粘贴图片 → 导出 HTML 存在且非空 → 关闭时无脏标签
- **手动清单**：中文 IME 长文输入、系统亮暗切换实时联动、外部编辑器改文件触发的重载提示、
  dmg 安装启动

## 10. 里程碑（建议的实施顺序）

1. **M1 骨架**：electron-vite 工程搭建、窗口/菜单/IPC 骨架、CI 可跑测试
2. **M2 编辑核心**：vditor 集成（ir 模式）、打开/编辑/自动保存、脏标记
3. **M3 工作区**：文件树、多标签页、外部变更处理
4. **M4 图片与大纲**：图片粘贴/拖拽落盘、大纲面板
5. **M5 导出**：HTML、PDF
6. **M6 主题与打磨**：亮暗主题、自定义主题、欢迎页、最近工作区、错误路径完善

## 11. 未来扩展（明确不在本期）

- Word 导出（pandoc 集成）
- 自定义主题的可视化编辑
- 文档内全局搜索（工作区 grep）
- 发布到 Homebrew cask
