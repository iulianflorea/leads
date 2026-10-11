import { create } from 'zustand'
import type { JobProgress } from '@shared/schemas/send'
import { call, subscribe } from '@renderer/lib/api'
import { toast } from './toast'

interface QueueState {
  jobs: JobProgress[]
  loaded: boolean
  load(): Promise<void>
  act(action: 'pause' | 'resume' | 'cancel', jobId: number): Promise<void>
  retryFailed(jobId: number): Promise<number>
}

export const useQueue = create<QueueState>((set, get) => ({
  jobs: [],
  loaded: false,
  async load() {
    try {
      set({ jobs: await call('queue:jobs'), loaded: true })
    } catch (error) {
      toast.error(error)
    }
  },
  async act(action, jobId) {
    try {
      await call(`queue:${action}`, { jobId })
      await get().load()
    } catch (error) {
      toast.error(error)
    }
  },
  async retryFailed(jobId) {
    try {
      const n = await call('queue:retryFailed', { jobId })
      await get().load()
      return n
    } catch (error) {
      toast.error(error)
      return 0
    }
  },
}))

subscribe('queue:progress', (progress) => {
  const jobs = useQueue.getState().jobs
  const exists = jobs.some((j) => j.jobId === progress.jobId)
  useQueue.setState({
    jobs: exists
      ? jobs.map((j) => (j.jobId === progress.jobId ? progress : j))
      : [progress, ...jobs],
  })
})

export function activeJob(jobs: JobProgress[]): JobProgress | undefined {
  return jobs.find((j) => j.status === 'running')
}
