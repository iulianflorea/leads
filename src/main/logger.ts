import log from 'electron-log/main'

/**
 * File logger. Never log lead personal data (names, emails, phones, addresses):
 * log ids and counts instead.
 */
log.initialize()
log.transports.file.level = 'info'
log.transports.file.maxSize = 5 * 1024 * 1024
log.transports.console.level = process.env.NODE_ENV === 'production' ? false : 'debug'

export const logger = log

/** Masks an email address for the rare cases where a hint is useful (a***@d***.com). */
export function maskEmail(email: string): string {
  const [user = '', domain = ''] = email.split('@')
  const [host = '', ...tld] = domain.split('.')
  return `${user.slice(0, 1)}***@${host.slice(0, 1)}***${tld.length ? '.' + tld.join('.') : ''}`
}
