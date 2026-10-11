import { t } from '@shared/i18n'
import type { AppContext } from '../../context'
import { MessageBuilder } from '../../services/message'
import { broadcast, type Handlers } from '../registry'

const changed = (): void => broadcast('data:changed', { scope: ['templates'] })

export function templateHandlers(ctx: AppContext): Partial<Handlers> {
  return {
    'templates:list': () => ctx.templates.all(),
    'templates:create': (input) => {
      const id = ctx.templates.create(input)
      changed()
      return id
    },
    'templates:update': ({ id, patch }) => {
      const updated = ctx.templates.update(id, patch)
      changed()
      return updated
    },
    'templates:delete': ({ id }) => {
      ctx.templates.delete(id)
      changed()
    },
    'templates:duplicate': ({ id }) => {
      const source = ctx.templates.get(id)
      const copy = ctx.templates.create({
        name: t('templates.copyName', { name: source.name }),
        subject: source.subject,
        bodyHtml: source.bodyHtml,
      })
      changed()
      return copy
    },
    'templates:setDefault': ({ id }) => {
      ctx.templates.setDefault(id)
      changed()
    },
    'templates:preview': ({ source, leadId }) =>
      MessageBuilder.toPreview(ctx.messages.build(source, leadId)),
    'templates:variables': () => ctx.messages.knownExtras(),
  }
}
