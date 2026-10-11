import { expect, test } from '@playwright/test'
import { join } from 'node:path'
import { launch, samplesDir, stubOpenDialog, type Launched } from './helpers'

let ctx: Launched

test.beforeEach(async () => {
  ctx = await launch()
})

test.afterEach(async () => {
  await ctx.app.close()
})

test('import -> mapping -> product PDF -> template preview for a real lead', async () => {
  const { app, page } = ctx

  // Import with the auto-detected mapping.
  await stubOpenDialog(app, join(samplesDir, 'leads-example.xlsx'))
  await page.getByRole('button', { name: 'Import', exact: true }).click()
  await page.getByTestId('pick-file').click()
  await page.locator('.sheet-card', { hasText: 'Leaduri' }).click()
  await expect(page.locator('#map-email')).toHaveValue('E-mail')
  await page.getByTestId('mapping-continue').click()
  await page.getByTestId('import-commit').click()
  await expect(page.getByText('Import finalizat')).toBeVisible()

  // A product with a PDF: unrecognized values become recognized.
  await page.getByRole('button', { name: 'Produse', exact: true }).click()
  await page.getByRole('button', { name: 'Produs nou' }).first().click()
  await page.locator('.dialog input').first().fill('Pompă de căldură')
  await page.getByRole('button', { name: 'Creează', exact: true }).click()
  await stubOpenDialog(app, join(samplesDir, 'pompa-de-caldura.pdf'))
  await page
    .locator('.product-card', { hasText: 'Pompă de căldură' })
    .getByRole('button', { name: 'Atașează PDF' })
    .click()
  await expect(page.locator('.product-card', { hasText: 'Pompă de căldură' })).toContainText(
    'pompa-de-caldura.pdf',
  )

  // Starter template previewed for Andrei Popescu.
  await page.getByRole('button', { name: 'Șabloane', exact: true }).click()
  await page.getByRole('button', { name: 'Creează primul șablon' }).click()
  await page.locator('.lead-picker-btn').click()
  await page.locator('.picker-pop input').fill('andrei')
  await page.locator('.picker-list li', { hasText: 'Andrei Popescu' }).click()

  const preview = page.getByTestId('template-preview')
  await expect(preview.locator('.mail-subject')).toHaveText('Oferta pentru Pompă de căldură')
  await expect(preview).toContainText('andrei.popescu@example.com')
  await expect(preview.locator('.attachment-chip')).toContainText('pompa-de-caldura.pdf')
  await expect(preview.frameLocator('iframe').locator('body')).toContainText('Bună ziua, Andrei')

  // Typing a variable updates the live preview; unknown ones are flagged.
  await page.locator('.rich-content').click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type(' Oraș: {{extra.Oraș}} {{extra.Inexistent}}')
  await expect(preview.frameLocator('iframe').locator('body')).toContainText('Oraș: Cluj-Napoca')
  await expect(preview).toContainText('Variabile necunoscute: {{extra.Inexistent}}')
})
