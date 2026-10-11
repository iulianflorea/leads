import { expect, test } from '@playwright/test'
import { join } from 'node:path'
import { launch, samplesDir, stubOpenDialog } from './helpers'

test('first run guide: account -> import -> template', async () => {
  const { app, page } = await launch({
    keepOnboarding: true,
    env: { LEADMAILER_MAIL_PROVIDER: '' },
  })
  try {
    const guide = page.locator('.onb-card')
    await expect(guide).toContainText('Bun venit în LeadMailer')
    await expect(guide).toContainText('Pasul 1 din 3')

    // Step 1: no Microsoft Client ID in this build, so use demo mode.
    await page.getByTestId('onboarding-demo').click()
    await expect(guide).toContainText('Pasul 2 din 3')

    // Step 2: picking a file continues in the import wizard, then the guide comes back.
    await stubOpenDialog(app, join(samplesDir, 'leads-example.xlsx'))
    await page.getByTestId('onboarding-import').click()
    await expect(page.locator('.onb-overlay')).toBeHidden()
    await page.locator('.sheet-card', { hasText: 'Leaduri' }).click()
    await page.getByTestId('mapping-continue').click()
    await page.getByTestId('import-commit').click()
    await expect(guide).toContainText('Pasul 3 din 3')

    // Step 3: the recommended template finishes the guide.
    await page.getByTestId('onboarding-starter').click()
    await expect(page.locator('.onb-overlay')).toBeHidden()
    await expect(page.locator('.template-item').first()).toContainText('Ofertă produs')
    await expect(page.locator('.account-chip')).toContainText('Mod demonstrativ')

    // The guide does not show again after a restart.
    await page.reload()
    await page.getByRole('button', { name: 'Leaduri', exact: true }).waitFor()
    await page.waitForTimeout(500)
    await expect(page.locator('.onb-overlay')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('Microsoft Client ID can be entered and saved from Settings', async () => {
  const { app, page } = await launch({ env: { LEADMAILER_MAIL_PROVIDER: '' } })
  try {
    await page.getByRole('button', { name: 'Setări', exact: true }).click()
    const input = page.getByTestId('client-id-input')
    await expect(page.getByText('introdu mai întâi ID-ul aplicației Microsoft')).toBeVisible()

    await input.fill('not-a-guid')
    await input.blur()
    await expect(page.getByText('ID-ul are forma xxxxxxxx-xxxx')).toBeVisible()
    await expect(page.getByTestId('client-id-save')).toBeDisabled()

    await input.fill('3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b')
    await page.getByTestId('client-id-save').click()
    await expect(page.getByTestId('connect-outlook')).toBeVisible()
    await expect(page.getByText('ID aplicație: 3f2a1b4c…4a5b')).toBeVisible()

    // Saved in the local database: still there after reloading the window.
    await page.reload()
    await page.getByRole('button', { name: 'Setări', exact: true }).click()
    await expect(page.getByText('ID aplicație: 3f2a1b4c…4a5b')).toBeVisible()
  } finally {
    await app.close()
  }
})
