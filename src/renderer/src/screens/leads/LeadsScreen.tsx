import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { FileSpreadsheet, Plus, Search, Send, Trash2, Users, X } from 'lucide-react'
import { useBulkDialog } from '../send/BulkSendDialog'
import { leadStatuses, type LeadStatus } from '@shared/schemas/lead'
import { useLeads, defaultFilters } from '@renderer/stores/leads'
import { useLists } from '@renderer/stores/lists'
import { useProducts } from '@renderer/stores/products'
import { useNav } from '@renderer/stores/nav'
import { toast } from '@renderer/stores/toast'
import { call } from '@renderer/lib/api'
import { t, tp } from '@renderer/lib/i18n'
import { Button, EmptyState, SkeletonRows } from '@renderer/components/ui'
import { Modal } from '@renderer/components/Modal'
import { confirm } from '@renderer/components/Confirm'
import { TitlebarActions } from '@renderer/components/TitlebarActions'
import { registerCommands } from '@renderer/components/CommandPalette'
import { LeadsTable } from './LeadsTable'
import { LeadPanel } from './LeadPanel'
import { LeadForm, emptyLeadForm, leadFormErrors, type LeadFormValue } from './LeadForm'

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return v
}

function AddLeadDialog({ open, onClose }: { open: boolean; onClose(): void }): ReactNode {
  const listId = useLeads((s) => s.filters.listId)
  const [form, setForm] = useState<LeadFormValue>(emptyLeadForm)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (open) setForm({ ...emptyLeadForm, listId: listId && listId > 0 ? listId : null })
  }, [open, listId])
  const valid =
    (form.name.trim() || form.email.trim()) && Object.keys(leadFormErrors(form)).length === 0
  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      const id = await call('leads:create', form)
      toast.success(t('leads.createdLead'))
      onClose()
      useLeads.getState().open(id)
    } catch (error) {
      toast.error(error)
    } finally {
      setSaving(false)
    }
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('leads.addTitle')}
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={!valid} loading={saving} onClick={() => void save()}>
            {t('common.add')}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (valid) void save()
        }}
      >
        <LeadForm value={form} onChange={setForm} autoFocus />
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}

export function LeadsScreen(): ReactNode {
  const {
    rows,
    loaded,
    loading,
    filters,
    selected,
    openId,
    fetch,
    setFilters,
    resetFilters,
    clearSelection,
  } = useLeads()
  const { lists, load: loadLists } = useLists()
  const { products, load: loadProducts } = useProducts()
  const params = useNav((s) => s.params)
  const go = useNav((s) => s.go)
  const [search, setSearch] = useState(filters.search)
  const debounced = useDebounced(search, 200)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    void loadLists()
    void loadProducts()
    const listId = typeof params.listId === 'number' ? params.listId : undefined
    if (listId !== undefined) {
      setSearch('')
      useLeads.setState({ filters: { ...defaultFilters, listId } })
    }
    void fetch()
  }, [params, fetch, loadLists, loadProducts])

  useEffect(() => {
    if (debounced !== useLeads.getState().filters.search) setFilters({ search: debounced })
  }, [debounced, setFilters])

  useEffect(
    () =>
      registerCommands('leads', [
        {
          id: 'lead-add',
          label: t('leads.add'),
          icon: <Plus size={16} />,
          run: () => setAdding(true),
        },
      ]),
    [],
  )

  const deleteLeads = useCallback(async (ids: number[]) => {
    const ok = await confirm({
      title: tp('leads.deleteConfirmTitle', ids.length),
      description: t('leads.deleteConfirmText'),
      confirmLabel: t('common.delete'),
      destructive: true,
    })
    if (!ok) return
    try {
      await call('leads:delete', { ids })
      useLeads.getState().clearSelection()
      useLeads.getState().open(null)
      toast.success(tp('leads.deleted', ids.length), undefined, {
        label: t('common.undo'),
        run: () => {
          void call('leads:restore', { ids }).then(() => toast.info(t('leads.restored')))
        },
      })
    } catch (error) {
      toast.error(error)
    }
  }, [])

  const setStatus = async (status: LeadStatus): Promise<void> => {
    try {
      await call('leads:setStatus', { ids: [...selected], status })
    } catch (error) {
      toast.error(error)
    }
  }

  const filtersActive =
    JSON.stringify({ ...filters, search: '' }) !== JSON.stringify(defaultFilters) || !!search
  const isEmptyDb = loaded && rows.length === 0 && !filtersActive

  return (
    <div className="screen-fill">
      <TitlebarActions>
        <Button
          size="sm"
          variant="primary"
          icon={<Plus size={14} />}
          onClick={() => setAdding(true)}
        >
          {t('leads.add')}
        </Button>
      </TitlebarActions>

      {!isEmptyDb && (
        <div className="toolbar">
          <div className="input-with-icon toolbar-search">
            <Search size={14} />
            <input
              className="input"
              type="search"
              data-search
              placeholder={t('leads.searchPlaceholder')}
              aria-label={t('common.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="select"
            aria-label={t('fields.list')}
            value={filters.listId ?? ''}
            onChange={(e) => setFilters({ listId: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">{t('leads.allLists')}</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <select
            className="select"
            aria-label={t('fields.status')}
            value={filters.status ?? ''}
            onChange={(e) => setFilters({ status: (e.target.value || null) as LeadStatus | null })}
          >
            <option value="">{t('leads.allStatuses')}</option>
            {leadStatuses.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </select>
          <select
            className="select"
            aria-label={t('fields.product')}
            value={filters.productId ?? ''}
            onChange={(e) =>
              setFilters({ productId: e.target.value === '' ? null : Number(e.target.value) })
            }
          >
            <option value="">{t('leads.allProducts')}</option>
            <option value="0">{t('leads.unmatchedProducts')}</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            className="select"
            aria-label={t('fields.pdf')}
            value={filters.hasPdf === null ? '' : String(filters.hasPdf)}
            onChange={(e) =>
              setFilters({ hasPdf: e.target.value === '' ? null : e.target.value === 'true' })
            }
          >
            <option value="">{t('leads.pdfAny')}</option>
            <option value="true">{t('leads.pdfYes')}</option>
            <option value="false">{t('leads.pdfNo')}</option>
          </select>
          <div className="grow" />
          {filters.listId !== null && rows.length > 0 && selected.size === 0 && (
            <Button
              size="sm"
              icon={<Send size={14} />}
              onClick={() => useBulkDialog.getState().open({ listId: filters.listId! })}
            >
              {t('bulk.sendList')}
            </Button>
          )}
          <span className="subtle tabular" aria-live="polite">
            {loading && !loaded ? '' : tp('leads.count', rows.length)}
          </span>
        </div>
      )}

      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            className="selection-bar"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
          >
            <strong className="tabular">{tp('leads.selected', selected.size)}</strong>
            <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={clearSelection}>
              {t('leads.clearSelection')}
            </Button>
            <div className="grow" />
            <select
              className="select select-sm"
              aria-label={t('leads.setStatus')}
              value=""
              onChange={(e) => e.target.value && void setStatus(e.target.value as LeadStatus)}
            >
              <option value="">{t('leads.setStatus')}</option>
              {leadStatuses.map((s) => (
                <option key={s} value={s}>
                  {t(`status.${s}`)}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="primary"
              icon={<Send size={14} />}
              onClick={() =>
                useBulkDialog
                  .getState()
                  .open({ leadIds: rows.filter((r) => selected.has(r.id)).map((r) => r.id) })
              }
              data-testid="bulk-open"
            >
              {t('bulk.action')}
            </Button>
            <Button
              size="sm"
              variant="danger-ghost"
              icon={<Trash2 size={14} />}
              onClick={() => void deleteLeads([...selected])}
            >
              {t('leads.deleteSelected')}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="table-card">
        {!loaded ? (
          <div style={{ padding: 16 }}>
            <SkeletonRows rows={10} />
          </div>
        ) : isEmptyDb ? (
          <EmptyState
            icon={<Users size={26} />}
            title={t('leads.emptyTitle')}
            description={t('leads.emptyText')}
            action={
              <div className="row">
                <Button onClick={() => setAdding(true)} icon={<Plus size={14} />}>
                  {t('leads.add')}
                </Button>
                <Button
                  variant="primary"
                  icon={<FileSpreadsheet size={14} />}
                  onClick={() => go('import')}
                >
                  {t('leads.emptyImport')}
                </Button>
              </div>
            }
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Search size={26} />}
            title={t('leads.noResults')}
            action={
              <Button
                onClick={() => {
                  setSearch('')
                  resetFilters()
                }}
              >
                {t('leads.resetFilters')}
              </Button>
            }
          />
        ) : (
          <LeadsTable onDelete={(ids) => void deleteLeads(ids)} />
        )}
      </div>

      <AnimatePresence>{openId !== null && <LeadPanel key={openId} id={openId} />}</AnimatePresence>
      <AddLeadDialog open={adding} onClose={() => setAdding(false)} />
    </div>
  )
}
