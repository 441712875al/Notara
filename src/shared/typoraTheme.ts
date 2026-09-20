/**
 * Typora 主题 CSS → Notara 自定义主题 CSS 转换器（纯函数，主进程调用、单测直测）。
 *
 * Typora 主题的排版世界（#write 内容画布 + CodeMirror 源码编辑器）与 Notara
 * （vditor IR + hljs）不同，但表达的是同一套视觉意图。本转换器做四件事：
 * 1. 变量桥接：Typora 的 :root 变量（--bg-color 等）→ Notara 的主题变量（vars.css）；
 * 2. 选择器重写：#write 正文规则 → .editors .vditor-reset 内容作用域；
 * 3. token 映射：CodeMirror 的 .cm-s-inner .cm-* → highlight.js 的 .hljs-*；
 * 4. 资源重写：@font-face / 背景图等相对 url() 经 resolveAsset 换成复制后的落点。
 *
 * 设计取舍（v1）：
 * - 转换结果为「单套配色」：:root 与 html[data-theme='dark'] 写同一份变量，
 *   主题亮暗不随系统切换（Typora 主题本身也多为一套色）；
 * - 只映射对 Notara 有意义的排版属性，几何类（#write max-width、.md-fences
 *   width/position 等）与交互类属性一律丢弃——布局由 Notara 接管；
 * - 映射不到的选择器/变量/资源记入报告，主进程把完整报告写进生成文件的头注释，
 *   用户可以自查「为什么我主题里那条没生效」。
 */
import type { TyporaAssetMapping, TyporaImportResult } from './types'

// ── 输出侧选择器常量（与 renderer/src/styles/editor.css 的规则保持一致）──
// 作用域下 Notara 只重排正文内容；菜单/侧边栏/标签栏继续走应用自身主题。
const SEL_CONTENT = '.editors .vditor-reset'
/** #write 的等价物：vditor 的正文排版承载层 */
const SEL_PROSE = '.editors .vditor-ir pre.vditor-reset'
/** 代码块底板：渲染态 pre + 展开态源码 pre（就地高亮的两层共用同一底板变量） */
const SEL_PLATE =
  `${SEL_CONTENT} pre.vditor-ir__preview,\n${SEL_CONTENT} .vditor-ir__node--expand pre.vditor-ir__marker--pre`
/** 代码块文字层：渲染态 code、源码 code、高亮 overlay code——三层必须同参对齐 */
const SEL_CODE_LAYERS =
  `${SEL_CONTENT} pre.vditor-ir__preview code,\n` +
  `${SEL_CONTENT} .vditor-ir__node--expand pre.vditor-ir__marker--pre > code,\n` +
  '.editors .notara-code-overlay code'
/** 行内代码（IR 里行内 code 的稳定祖先） */
const SEL_INLINE_CODE = `${SEL_CONTENT} span.vditor-ir__node[data-type='code'] code`

/** CodeMirror token → highlight.js class。多对一时合并（cm-string-2 并入 hljs-string） */
const CM_TO_HLJS: Record<string, string> = {
  keyword: 'keyword',
  atom: 'literal',
  number: 'number',
  def: 'title.function_',
  variable: 'variable',
  'variable-2': 'built_in',
  'variable-3': 'type',
  property: 'property',
  operator: 'operator',
  comment: 'comment',
  string: 'string',
  'string-2': 'string',
  meta: 'meta',
  qualifier: 'selector-class',
  builtin: 'built_in',
  bracket: 'punctuation',
  tag: 'tag',
  attribute: 'attribute',
  link: 'link'
}

// ── 宽容解析（不引第三方库）：只求拿到规则骨架，不求还原 AST ──

interface RawRule {
  prelude: string
  body: string
}

/** 去块注释（字符串里的 /* 极罕见，接受这个近似） */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

/**
 * 顶层规则切分：跨字符串/括号/花括号扫描。
 * @media 的嵌套体整块作为 body 返回（递归再 parse）；裸语句（@import x;）body 为空。
 */
function parseRules(css: string): RawRule[] {
  const rules: RawRule[] = []
  let prelude = ''
  let body = ''
  let depth = 0
  let inStr: string | null = null
  const append = (c: string): void => {
    if (depth > 0) body += c
    else prelude += c
  }
  for (let i = 0; i < css.length; i++) {
    const c = css[i]
    if (inStr) {
      append(c)
      if (c === inStr && css[i - 1] !== '\\') inStr = null
      continue
    }
    if (c === '"' || c === "'") {
      inStr = c
      append(c)
      continue
    }
    if (c === '{') {
      if (depth === 0) {
        depth = 1
        body = ''
        continue
      }
      depth++
      body += c
      continue
    }
    if (c === '}') {
      depth--
      if (depth === 0) {
        rules.push({ prelude: prelude.trim(), body })
        prelude = ''
        continue
      }
      body += c
      continue
    }
    if (c === ';' && depth === 0) {
      // 语句型 at-rule（@charset/@import）：记录为空 body，统一在分类阶段丢弃
      if (prelude.trim()) rules.push({ prelude: prelude.trim(), body: '' })
      prelude = ''
      continue
    }
    append(c)
  }
  return rules
}

/** 声明切分：`;` 在括号/引号外才断；属性名转小写（CSS 大小写不敏感） */
function parseDeclarations(body: string): [string, string][] {
  const out: [string, string][] = []
  let cur = ''
  let depth = 0
  let inStr: string | null = null
  const push = (): void => {
    const t = cur.trim()
    const i = t.indexOf(':')
    if (i > 0) out.push([t.slice(0, i).trim().toLowerCase(), t.slice(i + 1).trim()])
    cur = ''
  }
  for (let i = 0; i < body.length; i++) {
    const c = body[i]
    if (inStr) {
      cur += c
      if (c === inStr && body[i - 1] !== '\\') inStr = null
      continue
    }
    if (c === '"' || c === "'") {
      inStr = c
      cur += c
      continue
    }
    if (c === '(') depth++
    if (c === ')') depth--
    if (c === ';' && depth === 0) {
      push()
      continue
    }
    cur += c
  }
  push()
  return out
}

/** 顶层逗号切分（避开 :not() 等括号内逗号），返回去空白后的选择器列表 */
function splitSelectorList(prelude: string): string[] {
  const out: string[] = []
  let cur = ''
  let depth = 0
  let inStr: string | null = null
  for (let i = 0; i < prelude.length; i++) {
    const c = prelude[i]
    if (inStr) {
      cur += c
      if (c === inStr && prelude[i - 1] !== '\\') inStr = null
      continue
    }
    if (c === '"' || c === "'") {
      inStr = c
      cur += c
      continue
    }
    if (c === '(') depth++
    if (c === ')') depth--
    if (c === ',' && depth === 0) {
      out.push(cur.replace(/\s+/g, ' ').trim())
      cur = ''
      continue
    }
    cur += c
  }
  const last = cur.replace(/\s+/g, ' ').trim()
  if (last) out.push(last)
  return out
}

// ── 选择器分类 ──────────────────────────────────────────

type Target =
  | { kind: 'root' } // :root（仅收集变量，不产出规则）
  | { kind: 'body' } // html/body（提取全局色/字体）
  | { kind: 'write' } // #write（提取 + 正文排版规则）
  | { kind: 'fences' } // .md-fences / #write pre（代码块底板+文字层）
  | { kind: 'preCode' } // #write pre code（代码块内层 code）
  | { kind: 'inlineCode' } // #write code（行内代码）
  | { kind: 'cmBase' } // .cm-s-inner（CodeMirror 基色）
  | { kind: 'cmLines' } // .CodeMirror-lines（行内距 ≈ 底板内距）
  | { kind: 'token'; hljs: string } // .cm-xxx 语法 token
  | { kind: 'element'; chain: string } // 内容元素链（h1/blockquote/a:hover…）

/** 元素链合法性：仅允许「元素名 + 伪类/伪元素 + 组合符」，出现类/id/属性即拒绝 */
const ELEMENT_TOKEN = /^[a-zA-Z][a-zA-Z0-9-]*(?:::?[a-zA-Z-]+(?:\([^()]*\))?)?$/

function mapSelector(raw: string): Target | null {
  const sel = raw.replace(/\s+/g, ' ').trim()
  if (sel === ':root') return { kind: 'root' }
  if (sel === 'html' || sel === 'body') return { kind: 'body' }
  if (sel === '#write') return { kind: 'write' }

  // 代码块族：.md-fences（含 #write 前缀与多余状态类）与 pre（缩进代码块）
  if (/^(#write\s+)?\.md-fences(\.[\w-]+)*$/.test(sel)) return { kind: 'fences' }
  if (/^#write\s+pre$/.test(sel)) return { kind: 'fences' }
  if (/^#write\s+pre\s+code$/.test(sel)) return { kind: 'preCode' }
  // 行内代码：#write code / #write p code（Typora 惯用后者收紧范围）
  if (/^(#write\s+)?(p\s+)?code$/.test(sel)) return { kind: 'inlineCode' }

  // CodeMirror 族：先匹配终点类，再看 token
  if (/\.CodeMirror-lines$/.test(sel)) return { kind: 'cmLines' }
  if (/\.cm-s-inner(\.[\w-]+)*$/.test(sel)) return { kind: 'cmBase' }
  const token = sel.match(/\.cm-([\w-]+)$/)
  if (token) {
    const hljs = CM_TO_HLJS[token[1]]
    return hljs ? { kind: 'token', hljs } : null
  }

  // 内容元素链：剥掉 #write 前缀（含子/后代组合符），剩余部分须全是元素/伪类
  const rest = sel.replace(/^#write\s*[>+~]?\s*/, '')
  if (!rest || /[#.\[]/.test(rest)) return null
  const tokens = rest.split(/\s*([>+~])\s*|\s+/).filter(Boolean)
  const ok = tokens.every((t) => t === '>' || t === '+' || t === '~' || ELEMENT_TOKEN.test(t))
  if (!ok || !tokens.some((t) => t !== '>' && t !== '+' && t !== '~')) return null
  return { kind: 'element', chain: rest }
}

// ── 属性路由 ────────────────────────────────────────────

const FONT_PROPS = /^font(-(family|size|weight|style|variant|stretch|feature-settings|ligatures))?$/

/** 布局/交互类属性：交给 Notara 接管，转换时直接丢弃 */
const LAYOUT_DENY = new Set([
  'position',
  'float',
  'clear',
  'transform',
  'translate',
  'scale',
  'z-index',
  'display',
  'width',
  'max-width',
  'min-width',
  'height',
  'min-height',
  'top',
  'right',
  'bottom',
  'left'
])

/** token 上只保留「墨色表达」类属性，避免主题把编辑器内部结构画花 */
const TOKEN_ALLOW = new Set([
  'color',
  'font-style',
  'font-weight',
  'text-decoration',
  'text-decoration-style',
  'text-decoration-color',
  'opacity'
])

type Decl = [string, string]

// ── 转换主流程 ──────────────────────────────────────────

export interface ConvertOptions {
  /**
   * 相对资源解析器：输入主题里的相对 url（./font.woff2），返回落点。
   * 同步调用；主进程实现里做存在性检查与去重命名。
   */
  resolveAsset: (relativeUrl: string) => TyporaAssetMapping
}

export interface ConvertOutput {
  css: string
  report: TyporaImportResult
  /** 去重后的资源映射（主进程照单复制） */
  assets: TyporaAssetMapping[]
}

export function convertTyporaTheme(css: string, name: string, opts: ConvertOptions): ConvertOutput {
  const report: TyporaImportResult = {
    name,
    varsBridged: [],
    varsDropped: [],
    rulesMapped: 0,
    selectorsDropped: [],
    assetsCopied: 0,
    missingAssets: [],
    notes: []
  }
  const noted = new Set<string>()
  const note = (text: string): void => {
    if (!noted.has(text)) {
      noted.add(text)
      report.notes.push(text)
    }
  }
  const droppedSeen = new Set<string>()
  const dropSelector = (sel: string): void => {
    if (!sel || droppedSeen.has(sel)) return
    droppedSeen.add(sel)
    if (report.selectorsDropped.length < 30) report.selectorsDropped.push(sel)
  }

  const rules = parseRules(stripComments(css))

  // ── pass 1：收集 :root / html / body / #write 的变量与全局基色（#write 优先）──
  const rootVars = new Map<string, string>()
  const bodyDecls = new Map<string, string>() // html/body 合并，先到先得
  const writeDecls = new Map<string, string>() // #write 合并，先到先得
  for (const r of rules) {
    if (!r.body) continue
    const decls = parseDeclarations(r.body)
    for (const sel of splitSelectorList(r.prelude)) {
      const t = mapSelector(sel)
      if (t?.kind === 'root' || t?.kind === 'body') {
        for (const [prop, value] of decls) {
          if (prop.startsWith('--')) rootVars.set(prop, value)
          if (t.kind === 'body') bodyDecls.set(prop, value)
        }
      } else if (t?.kind === 'write') {
        for (const [prop, value] of decls) {
          if (prop.startsWith('--')) rootVars.set(prop, value)
          else writeDecls.set(prop, value)
        }
      }
    }
  }

  /** var() 引用解析（Typora 变量常引用另一个变量），可解析则标记为已消费 */
  const consumedRootVars = new Set<string>()
  const resolveVarRefs = (v: string, depth = 0): string => {
    if (depth > 5 || !v.includes('var(')) return v
    const next = v.replace(
      /var\((--[\w-]+)\s*(?:,\s*([^()]*))?\)/g,
      (_m, vn: string, fb: string) => {
        const got = rootVars.get(vn)
        if (got !== undefined) {
          consumedRootVars.add(vn)
          return got
        }
        return fb ?? ''
      }
    )
    return next === v ? v : resolveVarRefs(next, depth + 1)
  }

  // 变量桥接：同一目标多来源时，字面规则（#write > body > :root 变量）优先
  const varOverrides = new Map<string, string>()
  const bridge = (nv: string, value: string, desc: string): void => {
    const v = resolveVarRefs(value).trim()
    if (!v || varOverrides.has(nv)) return
    varOverrides.set(nv, v)
    report.varsBridged.push(`${desc} → ${nv}`)
  }
  /** 从 :root 变量桥接（直接采纳值时同样标记已消费，避免误报为 dropped） */
  const bridgeRoot = (nv: string, rootVar: string): void => {
    const raw = rootVars.get(rootVar)
    if (raw === undefined) return
    consumedRootVars.add(rootVar)
    bridge(nv, raw, rootVar)
  }
  const pick = (m: Map<string, string>, ...props: string[]): string | undefined => {
    for (const p of props) {
      const v = m.get(p)
      if (v) return v
    }
    return undefined
  }
  // 底色：#write 字面值 > body 字面值 > :root 变量（Typora 内容画布最终看到的色）
  const bgLiteral =
    pick(writeDecls, 'background', 'background-color') ?? pick(bodyDecls, 'background', 'background-color')
  const fgLiteral = pick(writeDecls, 'color') ?? pick(bodyDecls, 'color')
  if (bgLiteral) bridge('--bg', bgLiteral, '#write/body background（--bg-color）')
  else bridgeRoot('--bg', '--bg-color')
  if (fgLiteral) bridge('--fg', fgLiteral, '#write/body color（--text-color）')
  else bridgeRoot('--fg', '--text-color')
  // 正文字体：字面值优先，否则按主题惯例取 --serif，再退 --sans-serif
  const proseFont = pick(writeDecls, 'font-family') ?? pick(bodyDecls, 'font-family')
  if (proseFont) bridge('--font-prose', proseFont, '#write/body font-family')
  else if (rootVars.has('--serif')) bridgeRoot('--font-prose', '--serif')
  else if (rootVars.has('--sans-serif')) bridgeRoot('--font-prose', '--sans-serif')
  bridgeRoot('--accent', '--primary-color')
  bridgeRoot('--selection', '--select-text-bg-color')
  bridgeRoot('--bg-elevated', '--side-bar-bg-color')
  bridgeRoot('--bg-hover', '--item-hover-bg-color')
  bridgeRoot('--fg-secondary', '--control-text-color')
  bridgeRoot('--font-mono', '--monospace')

  // ── 输出收集 ──
  const fontRules: string[] = []
  const mediaBlocks: string[] = []
  let codePad: string | null = null
  const bridgePad = (value: string, desc: string): void => {
    if (codePad === null && value.trim()) {
      codePad = value.trim()
      report.varsBridged.push(`${desc} → --code-block-pad`)
    }
  }
  // 等宽字体可能来自 fences 而非 --monospace，晚到也能补位（先到先得语义）
  const bridgeMono = (value: string, desc: string): void => {
    if (!varOverrides.has('--font-mono')) bridge('--font-mono', value, desc)
  }

  /** 资源 url 重写：远程/内联地址原样保留（受 CSP 限制，记入报告），相对路径走解析器 */
  const assets = new Map<string, TyporaAssetMapping>()
  const rewriteUrls = (value: string): string =>
    value.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (_m, q: string, u: string) => {
      if (/^(https?:|data:|file:|#)/i.test(u)) {
        if (/^https?:/i.test(u)) note(`远程资源需联网加载且受安全策略限制，可能不生效: ${u}`)
        return `url(${q}${u}${q})`
      }
      let m = assets.get(u)
      if (!m) {
        m = opts.resolveAsset(u)
        assets.set(u, m)
        if (m.copyFrom) report.assetsCopied++
        else report.missingAssets.push(u)
      }
      return `url(${q}${m.emitUrl}${q})`
    })

  const emit = (selector: string, decls: Decl[], bucket: string[]): boolean => {
    if (decls.length === 0) return false
    bucket.push(`${selector} {\n${decls.map(([p, v]) => `  ${p}: ${v};`).join('\n')}\n}`)
    report.rulesMapped++
    return true
  }

  /**
   * 单条规则的声明按目标路由进 bucket（@media 内时为该媒体块专属的桶）。
   * plate/layers/inline/prose 是四个互斥的输出面：
   * - plate：底板（背景/边框/外距）
   * - layers：代码文字层（字体/墨色，三层对齐同参）
   * - inline：行内代码
   * - prose：正文/元素规则
   */
  const route = (t: Target, decls: Decl[], bucket: string[]): void => {
    const plate: Decl[] = []
    const layers: Decl[] = []
    const inline: Decl[] = []
    const prose: Decl[] = []
    for (const [prop, rawValue] of decls) {
      if (prop.startsWith('--')) continue // 变量声明已在 pass 1 收敛
      // 值里的 var() 引用就地解析：Typora 变量在 Notara 侧不存在，原样落盘是死引用；
      // 引用链断裂（未知变量无 fallback）时丢弃该声明，避免产出空值
      const resolved = resolveVarRefs(rawValue).trim()
      if (!resolved) continue
      const value = /url\(/.test(resolved) ? rewriteUrls(resolved) : resolved
      switch (t.kind) {
        case 'write':
          // 色板/字体已桥接为变量；几何属性记一次报告后丢弃
          if (['font-family', 'background', 'background-color', 'color'].includes(prop)) continue
          if (['max-width', 'padding', 'margin', 'width'].includes(prop)) {
            note('内容列宽度与页边距由 Notara 布局接管（#write 几何属性未应用）')
            continue
          }
          if (
            prop === 'font-size' ||
            prop === 'line-height' ||
            prop === 'letter-spacing' ||
            prop === 'word-spacing' ||
            prop === 'text-align' ||
            prop === 'text-justify'
          )
            prose.push([prop, value])
          break
        case 'body':
          // 其余 body 属性（margin 等）无对应物，静默丢弃
          if (prop === 'font-size' || prop === 'line-height') prose.push([prop, value])
          break
        case 'element':
          if (LAYOUT_DENY.has(prop)) continue
          prose.push([prop, value])
          break
        case 'fences':
        case 'cmBase':
          if (prop === 'font-family') {
            layers.push([prop, value])
            bridgeMono(rawValue, t.kind === 'fences' ? '.md-fences font-family' : '.cm-s-inner font-family')
          } else if (prop === 'padding') {
            bridgePad(value, t.kind === 'fences' ? '.md-fences padding' : '.CodeMirror padding')
          } else if (
            prop === 'background' ||
            prop === 'background-color' ||
            prop.startsWith('border') ||
            prop === 'box-shadow' ||
            prop === 'margin'
          ) {
            plate.push([prop, value])
          } else if (
            FONT_PROPS.test(prop) ||
            prop === 'color' ||
            prop === 'line-height' ||
            prop === 'letter-spacing' ||
            prop === 'word-spacing'
          ) {
            layers.push([prop, value])
          } else if (['white-space', 'word-wrap', 'overflow-wrap', 'text-overflow', 'word-break'].includes(prop)) {
            note('代码块的折行与滚动行为由 Notara 接管（.md-fences 折行属性未应用）')
          } // 其余几何类（width/position 等）静默丢弃
          break
        case 'cmLines':
          if (prop === 'padding') bridgePad(value, '.CodeMirror-lines padding')
          break
        case 'preCode':
          // padding/background 已由 Notara 显式归零（两层对齐的前提），不采纳
          if (prop === 'font-family') {
            layers.push([prop, value])
            bridgeMono(rawValue, 'pre code font-family')
          } else if (FONT_PROPS.test(prop) || prop === 'color' || prop === 'line-height')
            layers.push([prop, value])
          break
        case 'inlineCode':
          if (prop === 'font-family') {
            inline.push([prop, value])
            bridgeMono(rawValue, 'code font-family')
          } else if (
            FONT_PROPS.test(prop) ||
            prop === 'color' ||
            prop === 'background' ||
            prop === 'background-color' ||
            prop.startsWith('border') ||
            prop === 'padding' ||
            prop === 'border-radius' ||
            prop === 'vertical-align'
          )
            inline.push([prop, value])
          break
        case 'token':
          if (TOKEN_ALLOW.has(prop)) layers.push([prop, value])
          break
        case 'root':
          break
      }
    }
    switch (t.kind) {
      case 'write':
      case 'body':
        emit(SEL_PROSE, prose, bucket)
        break
      case 'element':
        emit(`${SEL_CONTENT} ${t.chain}`, prose, bucket)
        break
      case 'fences':
      case 'cmBase':
      case 'cmLines':
        emit(SEL_PLATE, plate, bucket)
        emit(SEL_CODE_LAYERS, layers, bucket)
        break
      case 'preCode':
        emit(SEL_CODE_LAYERS, layers, bucket)
        break
      case 'inlineCode':
        emit(SEL_INLINE_CODE, inline, bucket)
        emit(SEL_CODE_LAYERS, layers, bucket)
        break
      case 'token':
        emit(`${SEL_CONTENT} .hljs-${t.hljs}`, layers, bucket)
        break
      case 'root':
        break
    }
  }

  /**
   * pass 2：逐规则分类转换，产出的内容规则按顺序落入 bucket；
   * @media 递归处理（内部元素/代码块规则正常映射），@font-face 与嵌套媒体
   * 直接进全局桶（字体的生效与媒体条件无关）。
   */
  const processRules = (list: RawRule[], inMedia: boolean, bucket: string[]): void => {
    for (const r of list) {
      if (r.prelude.startsWith('@')) {
        if (r.prelude.startsWith('@font-face')) {
          if (!r.body) continue
          const decls = parseDeclarations(r.body).map(
            ([p, v]) => (p === 'src' || /url\(/.test(v) ? ([p, rewriteUrls(v)] as Decl) : ([p, v] as Decl))
          )
          emit('@font-face', decls, fontRules)
          continue
        }
        if (r.prelude.startsWith('@media')) {
          if (/\bprint\b/.test(r.prelude)) {
            note('已跳过打印媒体查询（@media print）——导出由 Notara 内置排版接管')
            continue
          }
          const inner: string[] = []
          processRules(parseRules(r.body), true, inner)
          if (inner.length > 0)
            mediaBlocks.push(`${r.prelude.replace(/\s+/g, ' ')} {\n${inner.join('\n')}\n}`)
          continue
        }
        note(`已跳过不支持的 at-rule: ${r.prelude.split(/[\s{;]/)[0]}`)
        continue
      }
      if (!r.body) {
        dropSelector(r.prelude)
        continue
      }
      const decls = parseDeclarations(r.body)
      const dropped: string[] = []
      const routed = new Set<string>() // 同 prelude 内已路由的目标（write/body 合并键）
      for (const sel of splitSelectorList(r.prelude)) {
        const t = mapSelector(sel)
        if (!t) {
          dropped.push(sel)
          continue
        }
        if (inMedia && (t.kind === 'root' || t.kind === 'body' || t.kind === 'write')) {
          note('@media 内的 :root/html/body/#write 规则未映射（导入主题为单套配色）')
          dropped.push(sel)
          continue
        }
        const key = t.kind === 'write' || t.kind === 'body' ? 'prose' : JSON.stringify(t)
        if (routed.has(key)) continue
        routed.add(key)
        route(t, decls, bucket)
      }
      // 部分映射（h1, .md-focus）：映射侧已产出，未映射侧记入报告
      for (const d of dropped) dropSelector(d)
    }
  }

  const contentRules: string[] = []
  processRules(rules, false, contentRules)

  // 未消费的 :root 变量进报告（Typora 的侧栏高亮/控件色等，Notara 无对应物）；
  // 在 pass 2 之后计算——fences 等规则值的 var() 解析也会补消费标记
  for (const k of rootVars.keys()) if (!consumedRootVars.has(k)) report.varsDropped.push(k)

  // ── 组装输出 ──
  const chunks: string[] = []
  if (varOverrides.size > 0) {
    const block = Array.from(varOverrides, ([p, v]) => `  ${p}: ${v};`).join('\n')
    // 单套配色：暗色下钉同一份值，避免系统暗色变量反向冲掉主题
    chunks.push(
      `/* 主题变量（由 Typora 主题转换；亮暗固定为此配色） */\n:root {\n${block}\n}\nhtml[data-theme='dark'] {\n${block}\n}`
    )
  }
  if (codePad !== null) {
    chunks.push(
      `/* 代码块底板内距（源码层与高亮 overlay 的对齐前提） */\n.editors .vditor {\n  --code-block-pad: ${codePad};\n}`
    )
  }
  if (fontRules.length > 0) chunks.push(fontRules.join('\n'))
  if (contentRules.length > 0) chunks.push(contentRules.join('\n'))
  if (mediaBlocks.length > 0) chunks.push(mediaBlocks.join('\n'))
  report.notes.push('导出 HTML/PDF 使用 Notara 内置排版，不应用导入主题')

  return { css: chunks.join('\n\n') + '\n', report, assets: Array.from(assets.values()) }
}
