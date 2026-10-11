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
export async function launch(
  options: { userData?: string; env?: Record<string, string>; keepOnboarding?: boolean } = {},
): Promise<Launched> {
  const fresh = !options.userData
  const userData = options.userData ?? mkdtempSync(join(tmpdir(), 'leadmailer-e2e-'))
  const app = await electron.launch({
    // GitHub's Ubuntu runners restrict the Chromium sandbox (AppArmor user namespaces).
    args: process.platform === 'linux' && process.env.CI ? [root, '--no-sandbox'] : [root],
    env: {
      ...process.env,
      LEADMAILER_USER_DATA: userData,
      LEADMAILER_MAIL_PROVIDER: 'mock',
      NODE_ENV: 'production',
      LEADMAILER_MOCK_DELAY_MS: '30',
      ...options.env,
    },
  })
  const page = await app.firstWindow()
  await page.getByRole('button', { name: 'Leaduri', exact: true }).waitFor()
  if (fresh && !options.keepOnboarding) {
    // First run shows the welcome guide; most tests start from an empty app instead.
    await page.getByTestId('onboarding-skip-all').click()
    await page.locator('.onb-overlay').waitFor({ state: 'detached' })
  }
  return { app, page, userData }
}

/** Replaces the native open dialog so the next file picker returns `path`. */
export async function stubOpenDialog(app: ElectronApplication, path: string): Promise<void> {
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] })
  }, path)
}

/** Imports the sample spreadsheet with the auto-detected mapping into a new list. */
export async function importSample(app: ElectronApplication, page: Page): Promise<void> {
  await stubOpenDialog(app, join(samplesDir, 'leads-example.xlsx'))
  await page.getByRole('button', { name: 'Import', exact: true }).click()
  await page.getByTestId('pick-file').click()
  await page.locator('.sheet-card', { hasText: 'Leaduri' }).click()
  await page.getByTestId('mapping-continue').click()
  await page.getByTestId('import-commit').click()
  await page.getByRole('button', { name: 'Vezi leadurile' }).click()
}

/** Creates the starter template from the Templates screen. */
export async function createStarterTemplate(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Șabloane', exact: true }).click()
  await page.getByRole('button', { name: 'Creează primul șablon' }).click()
  await page.locator('.template-item').first().waitFor()
}
