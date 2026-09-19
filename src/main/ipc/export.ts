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
