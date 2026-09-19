import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('notara', {})
