import { create } from 'zustand'

interface OnboardingState {
  open: boolean
  step: number
  /** Reopen at the template step once the import wizard finishes. */
  resumeAfterImport: boolean
  show(step?: number): void
  hide(options?: { resumeAfterImport?: boolean }): void
  setStep(step: number): void
  restart(): void
}

export const useOnboarding = create<OnboardingState>((set) => ({
  open: false,
  step: 0,
  resumeAfterImport: false,
  show: (step) => set((s) => ({ open: true, step: step ?? s.step })),
  hide: (options) => set({ open: false, resumeAfterImport: options?.resumeAfterImport ?? false }),
  setStep: (step) => set({ step }),
  restart: () => set({ open: true, step: 0, resumeAfterImport: false }),
}))
