import { create } from 'zustand'
import type { AccountStatus } from '@shared/schemas/mail'
import { call, subscribe } from '@renderer/lib/api'
import { t } from '@renderer/lib/i18n'
import { toast } from './toast'

interface AccountState {
  status: AccountStatus | null
  connecting: boolean
  load(): Promise<void>
  login(): Promise<boolean>
  logout(): Promise<void>
}

export const useAccount = create<AccountState>((set) => ({
  status: null,
  connecting: false,
  async load() {
    try {
      set({ status: await call('account:status') })
    } catch (error) {
      toast.error(error)
    }
  },
  async login() {
    set({ connecting: true })
    try {
      const status = await call('account:login')
      set({ status })
      if (status.account)
        toast.success(t('account.connectedToast', { email: status.account.email }))
      return !!status.account
    } catch (error) {
      toast.error(error)
      return false
    } finally {
      set({ connecting: false })
    }
  },
  async logout() {
    try {
      set({ status: await call('account:logout') })
    } catch (error) {
      toast.error(error)
    }
  },
}))

subscribe('account:changed', (status) => useAccount.setState({ status }))
