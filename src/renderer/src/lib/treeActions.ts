/** 依菜单意图解析最终条目名与类型：file 无 md/markdown 扩展时自动补 .md；directory 原样。 */
export function resolveCreateEntry(
  name: string,
  kind: 'file' | 'directory'
): { name: string; kind: 'file' | 'directory' } {
  // directory 显式意图原样返回；用户即使输入像 md 文件的名称也建目录
  if (kind === 'directory') return { name, kind }
  // file 意图：无 md/markdown 扩展名时自动补 .md
  const hasMdExt = /\.(md|markdown)$/i.test(name)
  return { name: hasMdExt ? name : `${name}.md`, kind }
}
