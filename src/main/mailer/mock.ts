import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { AppError } from '@shared/errors'
import type { MailAccount } from '@shared/schemas/mail'
import type { MailProvider, OutgoingMessage, SendResult } from './types'

/**
 * Dry-run provider for development and demos: no network. Each "sent" message is written
 * as JSON to userData/mock-outbox so it can be inspected. Set LEADMAILER_MOCK_FAIL_RATE
 * (0..1) to simulate random failures and LEADMAILER_MOCK_DELAY_MS to change the latency.
 */
export class MockMailProvider implements MailProvider {
  readonly kind = 'mock' as const
  private readonly sent = new Set<string>()

  constructor(private readonly outboxDir: () => string) {}

  async getAccount(): Promise<MailAccount | null> {
    return { provider: 'mock', email: 'demo@leadmailer.local', name: 'Mod demonstrativ' }
  }

  async send(m: OutgoingMessage, signal?: AbortSignal): Promise<SendResult> {
    const delay = Number(process.env.LEADMAILER_MOCK_DELAY_MS ?? 350)
    await new Promise((resolve) => setTimeout(resolve, delay))
    if (signal?.aborted) throw new AppError('unknown', 'aborted')
    const failRate = Number(process.env.LEADMAILER_MOCK_FAIL_RATE ?? 0)
    if (failRate > 0 && Math.random() < failRate)
      throw new AppError('recipientRejected', 'mock failure')
    if (/@fail\./i.test(m.to.email)) throw new AppError('recipientRejected', 'mock failure')
    const dir = this.outboxDir()
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, `${Date.now()}-${m.sendId}.json`),
      JSON.stringify(
        {
          to: m.to,
          subject: m.subject,
          attachments: m.attachments.map((a) => a.name),
          html: m.html,
        },
        null,
        2,
      ),
    )
    this.sent.add(m.sendId)
    return { messageId: `mock-${m.sendId}` }
  }

  async wasSent(sendId: string): Promise<boolean | null> {
    return this.sent.has(sendId) ? true : null
  }
}
