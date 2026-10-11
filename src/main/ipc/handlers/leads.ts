import type { AppContext } from '../../context'
import { broadcast, type Handlers } from '../registry'

const changed = (): void => broadcast('data:changed', { scope: ['leads', 'lists'] })

export function leadHandlers(ctx: AppContext): Partial<Handlers> {
  return {
    'lists:list': () => ctx.lists.all(),
    'lists:create': ({ name }) => {
      const id = ctx.lists.create(name)
      changed()
      return id
    },
    'lists:rename': ({ id, name }) => {
      ctx.lists.rename(id, name)
      changed()
    },
    'lists:delete': ({ id, withLeads }) => {
      ctx.lists.delete(id, withLeads)
      changed()
    },
    'leads:query': (q) => ctx.leads.query(q),
    'leads:get': ({ id }) => ctx.leads.get(id),
    'leads:create': (input) => {
      const id = ctx.leads.create(input)
      changed()
      return id
    },
    'leads:update': ({ id, patch }) => {
      ctx.leads.update(id, patch)
      changed()
      return ctx.leads.get(id)
    },
    'leads:delete': ({ ids }) => {
      ctx.leads.softDelete(ids)
      changed()
    },
    'leads:restore': ({ ids }) => {
      ctx.leads.restore(ids)
      changed()
    },
    'leads:setStatus': ({ ids, status }) => {
      ctx.leads.setStatus(ids, status)
      changed()
    },
  }
}
