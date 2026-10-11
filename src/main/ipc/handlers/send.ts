import type { AppContext } from '../../context'
import { broadcast, type Handlers } from '../registry'

export function sendHandlers(ctx: AppContext): Partial<Handlers> {
  const announce = async (): Promise<Awaited<ReturnType<typeof ctx.mail.status>>> => {
    const status = await ctx.mail.status()
    broadcast('account:changed', status)
    return status
  }
  return {
    'account:status': () => ctx.mail.status(),
    'account:login': async () => {
      await ctx.mail.login()
      return announce()
    },
    'account:logout': async () => {
      await ctx.mail.logout()
      return announce()
    },
    'account:setSmtpPassword': async ({ password }) => {
      ctx.mail.setSmtpPassword(password)
      await announce()
    },
    'account:testSmtp': () => ctx.mail.testSmtp(),
    'send:checks': ({ leadId, templateId }) => ctx.sender.checks(leadId, templateId),
    'send:single': ({ leadId, templateId }) => ctx.sender.sendSingle(leadId, templateId),
    'send:test': ({ source, leadId }) => ctx.sender.sendTest(source, leadId),
    'leads:history': ({ id }) => ctx.sends.forLead(id),
  }
}
