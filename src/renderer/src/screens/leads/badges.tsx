import { type ReactNode } from 'react'
import { AlertCircle, FileCheck2, FileMinus2, FileWarning } from 'lucide-react'
import type { LeadStatus, PdfState } from '@shared/schemas/lead'
import { Badge } from '@renderer/components/ui'
import { t } from '@renderer/lib/i18n'

const statusTone: Record<LeadStatus, 'accent' | 'success' | 'danger' | undefined> = {
  new: 'accent',
  sent: 'success',
  error: 'danger',
  do_not_contact: undefined,
}

export function StatusBadge({ status }: { status: LeadStatus }): ReactNode {
  return <Badge tone={statusTone[status]}>{t(`status.${status}`)}</Badge>
}

export function PdfIndicator({ state, count }: { state: PdfState; count: number }): ReactNode {
  const label = t(`pdfState.${state}`)
  const icon =
    state === 'ok' ? (
      <FileCheck2 size={15} />
    ) : state === 'partial' ? (
      <FileWarning size={15} />
    ) : state === 'missing' ? (
      <AlertCircle size={15} />
    ) : (
      <FileMinus2 size={15} />
    )
  return (
    <span className={`pdf-indicator pdf-${state}`} title={label}>
      {icon}
      <span>{state === 'ok' && count > 1 ? `${count} PDF` : label}</span>
    </span>
  )
}
