import { type ReactNode, useEffect, useState } from 'react'
import {
  AlertTriangle,
  ExternalLink,
  FileText,
  Package,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react'
import type { Product } from '@shared/schemas/product'
import { useProducts } from '@renderer/stores/products'
import { toast } from '@renderer/stores/toast'
import { call } from '@renderer/lib/api'
import { t, tp } from '@renderer/lib/i18n'
import { cx } from '@renderer/lib/platform'
import { formatBytes } from '@renderer/lib/format'
import { Badge, Button, EmptyState, SkeletonRows, Switch } from '@renderer/components/ui'
import { confirm } from '@renderer/components/Confirm'
import { TitlebarActions } from '@renderer/components/TitlebarActions'
import { registerCommands } from '@renderer/components/CommandPalette'
import { ProductDialog } from './ProductDialog'
import { IgnoredList, UnmatchedPanel } from './UnmatchedPanel'

function PdfSlot({ product }: { product: Product }): ReactNode {
  const [dragging, setDragging] = useState(false)
  const attach = (path?: string): void => {
    const req = path
      ? call('products:attachPdf', { id: product.id, path }).then(() => true)
      : call('products:pickPdf', { id: product.id })
    req.then((ok) => ok && toast.success(t('products.pdfAttached'))).catch(toast.error)
  }
  return (
    <div
      className={cx('pdf-slot', dragging && 'pdf-slot-active', !product.pdf && 'pdf-slot-empty')}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        const file = e.dataTransfer.files[0]
        if (file) attach(window.lm.getPathForFile(file))
      }}
    >
      {dragging ? (
        <span className="muted">{t('products.dropPdf')}</span>
      ) : product.pdf ? (
        <>
          <FileText size={16} className={product.pdf.missing ? 'text-danger' : 'text-accent'} />
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="truncate" title={product.pdf.name}>
              {product.pdf.name}
            </div>
            {product.pdf.missing ? (
              <div className="subtle text-danger">{t('products.pdfMissingFile')}</div>
            ) : (
              <div className="subtle">{formatBytes(product.pdf.size)}</div>
            )}
          </div>
          {!product.pdf.missing && (
            <Button
              size="sm"
              variant="ghost"
              icon={<ExternalLink size={13} />}
              aria-label={t('products.openPdf')}
              title={t('products.openPdf')}
              onClick={() => void call('products:openPdf', { id: product.id }).catch(toast.error)}
            />
          )}
          <Button size="sm" variant="ghost" onClick={() => attach()}>
            {t('products.replacePdf')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<Trash2 size={13} />}
            aria-label={t('products.removePdf')}
            title={t('products.removePdf')}
            onClick={() => void call('products:removePdf', { id: product.id }).catch(toast.error)}
          />
        </>
      ) : (
        <>
          <AlertTriangle size={15} className="text-warning" />
          <span className="grow muted">{t('products.noPdf')}</span>
          <Button size="sm" icon={<Upload size={13} />} onClick={() => attach()}>
            {t('products.attachPdf')}
          </Button>
        </>
      )}
    </div>
  )
}

function ProductCard({ product, onEdit }: { product: Product; onEdit(): void }): ReactNode {
  const remove = async (): Promise<void> => {
    const ok = await confirm({
      title: t('products.deleteTitle', { name: product.name }),
      description: t('products.deleteText'),
      confirmLabel: t('common.delete'),
      destructive: true,
    })
    if (!ok) return
    try {
      await call('products:delete', { id: product.id })
      toast.success(t('products.deleted'))
    } catch (error) {
      toast.error(error)
    }
  }
  return (
    <article
      className={cx('product-card', !product.active && 'is-inactive')}
      aria-label={product.name}
    >
      <div className="row-between">
        <div style={{ minWidth: 0 }}>
          <h3 className="product-name truncate">{product.name}</h3>
          <div className="subtle">
            {tp('products.leads', product.leadCount)}
            {!product.active && (
              <>
                {' · '}
                <Badge>{t('products.inactive')}</Badge>
              </>
            )}
          </div>
        </div>
        <div className="row">
          <Switch
            checked={product.active}
            label={t('products.active')}
            onChange={(active) =>
              void call('products:update', { id: product.id, patch: { active } }).catch(toast.error)
            }
          />
          <Button
            size="sm"
            variant="ghost"
            icon={<Pencil size={13} />}
            aria-label={t('common.edit')}
            onClick={onEdit}
          />
          <Button
            size="sm"
            variant="danger-ghost"
            icon={<Trash2 size={13} />}
            aria-label={t('common.delete')}
            onClick={() => void remove()}
          />
        </div>
      </div>
      {product.synonyms.length > 0 && (
        <div className="synonyms">
          {product.synonyms.map((s) => (
            <span key={s.id} className="tag tag-static">
              {s.value}
            </span>
          ))}
        </div>
      )}
      <PdfSlot product={product} />
    </article>
  )
}

export function ProductsScreen(): ReactNode {
  const { products, loaded, load } = useProducts()
  const [dialog, setDialog] = useState<{ product: Product | null; initialName?: string } | null>(
    null,
  )

  useEffect(() => {
    void load()
  }, [load])

  useEffect(
    () =>
      registerCommands('products', [
        {
          id: 'product-add',
          label: t('products.add'),
          icon: <Plus size={16} />,
          run: () => setDialog({ product: null }),
        },
      ]),
    [],
  )

  return (
    <div className="screen">
      <TitlebarActions>
        <Button
          size="sm"
          variant="primary"
          icon={<Plus size={14} />}
          onClick={() => setDialog({ product: null })}
        >
          {t('products.add')}
        </Button>
      </TitlebarActions>
      <div className="products-wrap">
        <p className="page-intro">{t('products.intro')}</p>
        {!loaded ? (
          <SkeletonRows rows={6} />
        ) : (
          <div className="stack" style={{ gap: 24 }}>
            <UnmatchedPanel
              onCreate={(value) => setDialog({ product: null, initialName: value })}
            />
            {products.length === 0 ? (
              <EmptyState
                icon={<Package size={26} />}
                title={t('products.emptyTitle')}
                description={t('products.emptyText')}
                action={
                  <Button
                    variant="primary"
                    icon={<Plus size={14} />}
                    onClick={() => setDialog({ product: null })}
                  >
                    {t('products.add')}
                  </Button>
                }
              />
            ) : (
              <div className="product-grid">
                {products.map((p) => (
                  <ProductCard key={p.id} product={p} onEdit={() => setDialog({ product: p })} />
                ))}
              </div>
            )}
            <IgnoredList />
          </div>
        )}
      </div>
      <ProductDialog
        open={!!dialog}
        product={dialog?.product ?? null}
        initialName={dialog?.initialName}
        onClose={() => setDialog(null)}
      />
    </div>
  )
}
