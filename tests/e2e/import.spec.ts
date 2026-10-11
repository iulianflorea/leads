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

test('imports the example spreadsheet: file -> sheet -> mapping -> review -> leads', async () => {
  const { app, page } = ctx
  await stubOpenDialog(app, join(samplesDir, 'leads-example.xlsx'))

  await page.getByRole('button', { name: 'Import', exact: true }).click()
  await page.getByTestId('pick-file').click()

  // The workbook has two sheets, so the user picks one.
  await expect(page.getByText('Alege foaia de lucru')).toBeVisible()
  await page.locator('.sheet-card', { hasText: 'Leaduri' }).click()

  // Columns are auto-detected from Romanian headers.
  await expect(page.getByRole('heading', { name: 'Potrivește coloanele' })).toBeVisible()
  await expect(page.locator('#map-name')).toHaveValue('Nume și prenume')
  await expect(page.locator('#map-email')).toHaveValue('E-mail')
  await expect(page.locator('#map-phone')).toHaveValue('Telefon')
  await expect(page.locator('#map-address')).toHaveValue('Adresă')
  await expect(page.locator('#map-product')).toHaveValue('Produs de interes')
  await expect(page.locator('#map-firstName')).toHaveValue('')
  // Unmapped columns become template variables; the preview shows real rows.
  await expect(page.getByText('{{extra.Oraș}}')).toBeVisible()
  await expect(page.locator('.preview-table')).toContainText('andrei.popescu@example.com')

  await page.getByTestId('mapping-continue').click()

  // Review: 1 invalid email, 1 in-file duplicate, 1 empty row; 9 ready.
  await expect(page.getByRole('heading', { name: 'Verifică înainte de import' })).toBeVisible()
  const stats = page.locator('.stat')
  await expect(stats.filter({ hasText: 'Gata de import' })).toContainText('9')
  await expect(stats.filter({ hasText: 'Email invalid' })).toContainText('1')
  await expect(stats.filter({ hasText: 'Duplicate în fișier' })).toContainText('1')

  await page.getByTestId('import-commit').click()
  await expect(page.getByText('Import finalizat')).toBeVisible()
  await page.getByRole('button', { name: 'Vezi leadurile' }).click()

  await expect(page.locator('.table-row')).toHaveCount(9)
  await expect(page.getByText('9 leaduri')).toBeVisible()

  // Re-importing the same file proposes the saved mapping and flags existing leads.
  await page.getByRole('button', { name: 'Import', exact: true }).click()
  await page.getByTestId('pick-file').click()
  await page.locator('.sheet-card', { hasText: 'Leaduri' }).click()
  await expect(page.getByText('Am folosit potrivirea de la importul anterior')).toBeVisible()
  await page.getByTestId('mapping-continue').click()
  await expect(page.locator('.stat').filter({ hasText: 'Există deja' })).toContainText('9')
})

test('searches and inline-edits leads', async () => {
  const { app, page } = ctx
  await stubOpenDialog(app, join(samplesDir, 'leads-example.xlsx'))
  await page.getByRole('button', { name: 'Import', exact: true }).click()
  await page.getByTestId('pick-file').click()
  await page.locator('.sheet-card', { hasText: 'Leaduri' }).click()
  await page.getByTestId('mapping-continue').click()
  await page.getByTestId('import-commit').click()
  await page.getByRole('button', { name: 'Vezi leadurile' }).click()

  // Diacritic-insensitive search.
  await page.getByRole('searchbox').fill('stefanescu')
  await expect(page.locator('.table-row')).toHaveCount(1)
  await expect(page.locator('.table-row')).toContainText('Ana Ștefănescu')

  await page.locator('.table-row .col-phone').dblclick()
  const editor = page.locator('.cell-input')
  await editor.fill('0700 000 000')
  await editor.press('Enter')
  await expect(page.locator('.table-row .col-phone')).toContainText('0700 000 000')
})
