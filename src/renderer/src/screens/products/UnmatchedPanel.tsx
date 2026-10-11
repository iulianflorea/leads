import { type ReactNode, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { FileQuestion, Link2, Plus, Undo2 } from 'lucide-react'
import type { ResolveValueInput, UnmatchedValue } from '@shared/schemas/product'
import { useProducts } from '@renderer/stores/products'
import { toast } from '@renderer/stores/toast'
import { call } from '@renderer/lib/api'
import { t, tp } from '@renderer/lib/i18n'
import { Button } from '@renderer/components/ui'

export function UnmatchedPanel({ onCreate }: { onCreate(value: string): void }): ReactNode {
  const { unmatched, products } = useProducts()
  if (unmatched.length === 0) return null

  const resolve = async (action: ResolveValueInput['action'], value: string): Promise<void> => {
    try {
      await call('products:resolve', { value, action })
      toast.success(t('products.resolved'))
    } catch (error) {
      toast.error(error)
    }
  }

  return (
    <section className="card unmatched" aria-labelledby="unmatched-title">
      <div className="unmatched-head">
        <FileQuestion size={18} className="text-warning" />
        <div>
          <h2 id="unmatched-title" className="section-subtitle">
            {tp('products.unmatchedTitle', unmatched.length)}
          </h2>
          <p className="subtle">{t('products.unmatchedHint')}</p>
        </div>
      </div>
      <ul className="unmatched-list">
        <AnimatePresence initial={false}>
          {unmatched.map((u) => (
            <UnmatchedRow
              key={u.valueNorm}
              item={u}
              products={products.map((p) => ({ id: p.id, name: p.name }))}
              onResolve={(action) => void resolve(action, u.value)}
              onCreate={() => onCreate(u.value)}
            />
          ))}
        </AnimatePresence>
      </ul>
    </section>
  )
}

function UnmatchedRow({
  item,
  products,
  onResolve,
  onCreate,
}: {
  item: UnmatchedValue
  products: Array<{ id: number; name: string }>
  onResolve(action: ResolveValueInput['action']): void
  onCreate(): void
}): ReactNode {
  const [picking, setPicking] = useState(false)
  const suggestion = item.suggestions[0]
  return (
    <motion.li
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, height: 0, paddingTop: 0, paddingBottom: 0 }}
      transition={{ duration: 0.18 }}
    >
      <div className="unmatched-value">
        <strong className="truncate selectable">{item.value}</strong>
        <span className="subtle">{tp('products.leads', item.leadCount)}</span>
      </div>
      <div className="row unmatched-actions">
        {picking ? (
          <select
            className="select select-sm"
            autoFocus
            aria-label={t('products.linkOther')}
            defaultValue=""
            onBlur={() => setPicking(false)}
            onChange={(e) => {
              if (e.target.value) onResolve({ kind: 'link', productId: Number(e.target.value) })
              setPicking(false)
            }}
          >
            <option value="" disabled>
              {t('products.linkOther')}
            </option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        ) : (
          <>
            {suggestion && (
              <Button
                size="sm"
                variant="primary"
                icon={<Link2 size={13} />}
                onClick={() => onResolve({ kind: 'link', productId: suggestion.productId })}
              >
                {t('products.linkTo', { name: suggestion.name })}
              </Button>
            )}
            {products.length > 0 && (
              <Button size="sm" onClick={() => setPicking(true)}>
                {suggestion ? t('products.linkOther') : t('products.linkOther').replace('…', '')}
              </Button>
            )}
          </>
        )}
        <Button size="sm" icon={<Plus size={13} />} onClick={onCreate}>
          {t('products.createFrom')}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onResolve({ kind: 'ignore' })}>
          {t('products.sendWithout')}
        </Button>
      </div>
    </motion.li>
  )
}

export function IgnoredList(): ReactNode {
  const ignored = useProducts((s) => s.ignored)
  if (ignored.length === 0) return null
  return (
    <section>
      <h2 className="group-title">{t('products.ignoredTitle')}</h2>
      <p className="subtle" style={{ margin: '-4px 0 8px 4px' }}>
        {t('products.ignoredHint')}
      </p>
      <div className="group">
        {ignored.map((v) => (
          <div className="group-row" key={v.valueNorm}>
            <div className="group-row-label">
              <div>{v.value}</div>
              <div className="subtle">{tp('products.leads', v.leadCount)}</div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              icon={<Undo2 size={13} />}
              onClick={() =>
                void call('products:unignore', { valueNorm: v.valueNorm }).catch(toast.error)
              }
            >
              {t('products.unignore')}
            </Button>
          </div>
        ))}
      </div>
    </section>
  )
}
