import { BrowserWindow, ipcMain, nativeTheme, shell } from 'electron'
import { join } from 'node:path'

const TITLEBAR_HEIGHT = 44

export const windowColors = {
  light: { background: '#f5f5f7', symbol: '#1d1d1f' },
  dark: { background: '#1e1e20', symbol: '#f5f5f7' },
}

function palette(): (typeof windowColors)['light'] {
  return nativeTheme.shouldUseDarkColors ? windowColors.dark : windowColors.light
}

ipcMain.on('theme:isDarkSync', (event) => {
  event.returnValue = nativeTheme.shouldUseDarkColors
})

export function createMainWindow(): BrowserWindow {
  const isMac = process.platform === 'darwin'
  const isWin = process.platform === 'win32'
  const colors = palette()

  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 620,
    show: false,
    // Matching the theme background avoids a white flash before the first paint.
    backgroundColor: isMac ? '#00000000' : colors.background,
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    trafficLightPosition: isMac ? { x: 18, y: 16 } : undefined,
    titleBarOverlay: isMac
      ? undefined
      : { color: '#00000000', symbolColor: colors.symbol, height: TITLEBAR_HEIGHT },
    vibrancy: isMac ? 'sidebar' : undefined,
    visualEffectState: isMac ? 'followWindow' : undefined,
    backgroundMaterial: isWin ? 'mica' : undefined,
    autoHideMenuBar: !isMac,
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  })

  win.once('ready-to-show', () => win.show())

  // External links open in the system browser; the app never navigates away.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url) || url.startsWith('mailto:')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault()
  })

  const onTheme = (): void => {
    if (win.isDestroyed()) return
    const c = palette()
    win.webContents.send('theme:changed', nativeTheme.shouldUseDarkColors)
    if (!isMac) {
      win.setTitleBarOverlay({ color: '#00000000', symbolColor: c.symbol, height: TITLEBAR_HEIGHT })
      win.setBackgroundColor(c.background)
    }
  }
  nativeTheme.on('updated', onTheme)
  win.on('closed', () => nativeTheme.off('updated', onTheme))

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) void win.loadURL(devUrl)
  else void win.loadFile(join(import.meta.dirname, '../renderer/index.html'))

  return win
}
