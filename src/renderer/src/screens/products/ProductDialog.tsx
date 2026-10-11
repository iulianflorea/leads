import { type ReactNode, useEffect, useState } from 'react'
import type { Product } from '@shared/schemas/product'
import { call } from '@renderer/lib/api'
import { toast } from '@renderer/stores/toast'
import { t } from '@renderer/lib/i18n'
import { Modal } from '@renderer/components/Modal'
import { TagInput } from '@renderer/components/TagInput'
import { Button, Field, Switch } from '@renderer/components/ui'

export function ProductDialog({
  open,
  product,
  initialName,
  onClose,
}: {
  open: boolean
  product: Product | null
  initialName?: string
  onClose(createdId?: number): void
}): ReactNode {
  const [name, setName] = useState('')
  const [synonyms, setSynonyms] = useState<string[]>([])
  const [active, setActive] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(product?.name ?? initialName ?? '')
    setSynonyms(product?.synonyms.map((s) => s.value) ?? [])
    setActive(product?.active ?? true)
  }, [open, product, initialName])

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      if (product) {
        await call('products:update', { id: product.id, patch: { name, synonyms, active } })
        toast.success(t('products.saved'))
        onClose()
      } else {
        const id = await call('products:create', { name, synonyms, active })
        toast.success(t('products.saved'))
        onClose(id)
      }
    } catch (error) {
      toast.error(error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => onClose()}
      title={product ? t('products.editTitle') : t('products.addTitle')}
      footer={
        <>
          <Button onClick={() => onClose()}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            disabled={!name.trim()}
            loading={saving}
            onClick={() => void save()}
          >
            {product ? t('common.save') : t('common.create')}
          </Button>
        </>
      }
    >
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) void save()
        }}
      >
        <Field label={t('products.name')}>
          {(id) => (
            <input
              id={id}
              className="input"
              value={name}
              data-autofocus
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <Field label={t('products.synonyms')} hint={t('products.synonymsHint')}>
          {(id) => (
            <TagInput
              id={id}
              value={synonyms}
              onChange={setSynonyms}
              placeholder={t('products.synonymsPlaceholder')}
            />
          )}
        </Field>
        <div className="row-between">
          <div>
            <div className="field-label">{t('products.active')}</div>
            <div className="field-hint">{t('products.activeHint')}</div>
          </div>
          <Switch checked={active} onChange={setActive} label={t('products.active')} />
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
