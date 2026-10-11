export type Platform = 'darwin' | 'win32' | 'linux'

export interface AppInfo {
  name: string
  version: string
  platform: Platform
  dataPath: string
  logPath: string
  isDev: boolean
}
