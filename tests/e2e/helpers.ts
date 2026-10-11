import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

export const root = resolve(import.meta.dirname, '../..')
export const samplesDir = join(root, 'samples')

export interface Launched {
  app: ElectronApplication
  page: Page
  userData: string
}

/**
 * Launches the built app with an isolated data folder and the mock mail provider,
 * so no network calls to Microsoft Graph happen during tests.
 */
export async function launch(): Promise<Launched> {
  const userData = mkdtempSync(join(tmpdir(), 'leadmailer-e2e-'))
  const app = await electron.launch({
    args: [root],
    env: {
      ...process.env,
      LEADMAILER_USER_DATA: userData,
      LEADMAILER_MAIL_PROVIDER: 'mock',
      NODE_ENV: 'production',
    },
  })
  const page = await app.firstWindow()
  await page.getByRole('button', { name: 'Leaduri', exact: true }).waitFor()
  return { app, page, userData }
}

/** Replaces the native open dialog so the next file picker returns `path`. */
export async function stubOpenDialog(app: ElectronApplication, path: string): Promise<void> {
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] })
  }, path)
}
