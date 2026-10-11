import { expect, test } from '@playwright/test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createStarterTemplate, importSample, launch } from './helpers'

function outbox(userData: string): Array<{ to: { email: string } }> {
  const dir = join(userData, 'mock-outbox')
  try {
    return readdirSync(dir).map(
      (f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as { to: { email: string } },
    )
  } catch {
    return []
  }
}

test('single send from the lead panel (mock provider)', async () => {
  const { app, page, userData } = await launch()
  try {
    await importSample(app, page)
    await createStarterTemplate(page)
    await page.getByRole('button', { name: 'Leaduri', exact: true }).click()
    await page.locator('.table-row', { hasText: 'Maria Ionescu' }).click()
    await page.getByTestId('lead-send').click()
    await expect(page.locator('.dialog .mail-subject')).toContainText('Oferta pentru')
    await page.keyboard.press('ControlOrMeta+Enter')
    await expect(page.getByText('Email trimis către maria.ionescu@example.com')).toBeVisible()
    await expect(page.locator('.drawer')).toContainText('Trimis')
    expect(outbox(userData).map((m) => m.to.email)).toEqual(['maria.ionescu@example.com'])

    // Sending the same template again asks for confirmation.
    await page.getByTestId('lead-send').click()
    await expect(page.getByText(/a primit deja acest șablon/).first()).toBeVisible()
  } finally {
    await app.close()
  }
})

test('bulk send survives an app restart without sending anyone twice', async () => {
  // Slow mock sends so the app can be closed mid-queue.
  const env = { LEADMAILER_MOCK_DELAY_MS: '400' }
  const first = await launch({ env })
  const { userData } = first
  let { app, page } = first
  await importSample(app, page)
  await createStarterTemplate(page)

  await page.getByRole('button', { name: 'Setări', exact: true }).click()
  await page.getByLabel('Viteza de trimitere').selectOption('1')

  await page.getByRole('button', { name: 'Leaduri', exact: true }).click()
  await page.getByRole('checkbox', { name: 'Toate' }).check()
  await page.getByTestId('bulk-open').click()
  const summary = page.getByTestId('bulk-summary')
  await expect(summary.locator('.stat').first()).toContainText('9')
  await expect(page.getByTestId('bulk-start')).toBeDisabled()
  await page.getByTestId('bulk-confirm').check()
  await page.getByTestId('bulk-start').click()

  await expect(page.getByRole('heading', { name: 'Istoric' })).toBeVisible()
  await expect.poll(() => outbox(userData).length, { timeout: 15_000 }).toBeGreaterThanOrEqual(2)
  await app.close()
  const sentBeforeRestart = outbox(userData).length
  expect(sentBeforeRestart).toBeLessThan(9)

  ;({ app, page } = await launch({ userData, env: { LEADMAILER_MOCK_DELAY_MS: '20' } }))
  try {
    await page.getByRole('button', { name: 'Istoric', exact: true }).click()
    const job = page.getByTestId('job-card').first()
    await expect(job).toContainText('întreruptă')
    await job.getByTestId('job-resume').click()
    await expect(job).toContainText('Finalizat', { timeout: 30_000 })

    const recipients = outbox(userData).map((m) => m.to.email.toLowerCase())
    // 9 valid unique addresses in the sample; nobody received the email twice.
    expect(new Set(recipients).size).toBe(recipients.length)
    expect(recipients.length).toBeGreaterThanOrEqual(8)
    await expect(job).toContainText('0 eșuate')
  } finally {
    await app.close()
  }
})
