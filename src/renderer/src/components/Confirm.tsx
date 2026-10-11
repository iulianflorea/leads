import { type ReactNode } from 'react'
import { create } from 'zustand'
import { t } from '@renderer/lib/i18n'
import { Modal } from './Modal'
import { Button } from './ui'

interface ConfirmOptions {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}

interface ConfirmState {
  options: ConfirmOptions | null
  resolve: ((value: boolean) => void) | null
}

const useConfirmStore = create<ConfirmState>(() => ({ options: null, resolve: null }))

/** Asks the user for explicit confirmation; resolves to true when confirmed. */
export function confirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    useConfirmStore.getState().resolve?.(false)
    useConfirmStore.setState({ options, resolve })
  })
}

export function ConfirmHost(): ReactNode {
  const { options, resolve } = useConfirmStore()
  const close = (value: boolean): void => {
    resolve?.(value)
    useConfirmStore.setState({ options: null, resolve: null })
  }
  return (
    <Modal
      open={!!options}
      onClose={() => close(false)}
      title={options?.title ?? ''}
      description={options?.description}
      footer={
        <>
          <Button onClick={() => close(false)}>{options?.cancelLabel ?? t('common.cancel')}</Button>
          <Button
            variant={options?.destructive ? 'danger' : 'primary'}
            onClick={() => close(true)}
            data-autofocus
          >
            {options?.confirmLabel ?? t('common.confirm')}
          </Button>
        </>
      }
    />
  )
}
