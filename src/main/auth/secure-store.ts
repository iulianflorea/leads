import { safeStorage } from 'electron'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { logger } from '../logger'

/**
 * Encrypts secrets with the OS keychain (Electron safeStorage). When encryption is not
 * available (some Linux setups without a keyring) nothing is persisted, so the user signs
 * in again after a restart instead of having secrets stored in plain text.
 */
export const secureStore = {
  available(): boolean {
    return safeStorage.isEncryptionAvailable()
  },

  encrypt(plain: string): string | null {
    if (!safeStorage.isEncryptionAvailable()) return null
    return safeStorage.encryptString(plain).toString('base64')
  },

  decrypt(encoded: string): string | null {
    try {
      return safeStorage.decryptString(Buffer.from(encoded, 'base64'))
    } catch {
      logger.warn('[secure-store] could not decrypt a stored secret')
      return null
    }
  },

  readFile(path: string): string | null {
    if (!existsSync(path)) return null
    try {
      return this.decrypt(readFileSync(path, 'utf8'))
    } catch {
      return null
    }
  },

  writeFile(path: string, plain: string): void {
    const encrypted = this.encrypt(plain)
    if (encrypted === null) return
    writeFileSync(path, encrypted, { encoding: 'utf8', mode: 0o600 })
  },

  removeFile(path: string): void {
    rmSync(path, { force: true })
  },
}
