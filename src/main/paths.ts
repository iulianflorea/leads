import { app } from 'electron'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

export const paths = {
  get root(): string {
    return app.getPath('userData')
  },
  get db(): string {
    return join(this.root, 'leadmailer.db')
  },
  get pdfs(): string {
    const dir = join(this.root, 'pdfs')
    mkdirSync(dir, { recursive: true })
    return dir
  },
  get restoreStaging(): string {
    return join(this.root, 'restore-staging')
  },
  get authCache(): string {
    return join(this.root, 'auth-cache.bin')
  },
}
