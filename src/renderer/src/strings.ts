// 全部 UI 文案集中于此（设计文档 §6.5）
export const s = {
  app: { name: 'Notara' },
  tab: {
    untitled: '未命名',
    deleted: '已删除',
    dirty: '未保存',
    new: '新建文件',
    close: '关闭'
  },
  confirm: {
    closeDirtyTitle: '未保存的修改',
    closeDirtyText: (n: string) => `「${n}」有未保存的修改，关闭前保存吗？`,
    save: '保存', discard: '不保存', cancel: '取消',
    deleteTitle: '删除', deleteText: (n: string) => `确定将「${n}」移入废纸篓吗？`,
    useDiskTitle: '文件已在磁盘上被修改',
    keepMine: '保留我的版本', useDisk: '加载磁盘版本',
    discardLocalTitle: '丢弃未保存的修改',
    discardLocalText: (n: string) => `确定丢弃「${n}」的未保存修改？`,
  },
  toast: {
    saveFailed: '保存失败，已保留修改稍后重试',
    binaryFile: '不是文本文件，无法打开',
    openFailed: (msg: string) => `打开失败: ${msg}`,
    deletedFile: '文件已被删除，保存时将提示另存为',
    saveImageFirst: '请先保存文件，再粘贴图片',
    imageSaveFailed: (msg: string) => `图片保存失败: ${msg}`,
    exportFirst: '请先保存文件，再导出',
    exportFailed: (msg: string) => `导出失败: ${msg}`,
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
