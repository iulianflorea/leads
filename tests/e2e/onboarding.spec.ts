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
