import { Channels, registerIpc } from './index'
import { saveImage } from '../services/imageService'

export function registerImagesIpc(): void {
  registerIpc(
    Channels.ImagesSave,
    async (p: { refDir: string; data: ArrayBuffer; originalName: string; ext: string }) => {
      const buf = Buffer.from(p.data)
      const r = await saveImage(p.refDir, buf, p.originalName, p.ext)
      return { relativePath: r }
    }
  )
}
