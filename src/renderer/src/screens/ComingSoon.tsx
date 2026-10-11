import { type ReactNode } from 'react'
import { Sparkles } from 'lucide-react'
import { EmptyState } from '@renderer/components/ui'
import { t } from '@renderer/lib/i18n'

export function ComingSoon(): ReactNode {
  return (
    <EmptyState
      icon={<Sparkles size={26} />}
      title={t('empty.comingSoon')}
      description={t('empty.comingSoonHint')}
    />
  )
}
