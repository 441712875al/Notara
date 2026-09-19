import type Vditor from 'vditor'

// tabId → vditor 实例。模块级 Map 保证实例跨 React 渲染存活（撤销历史保留）
export const editors = new Map<number, Vditor>()
