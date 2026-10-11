import { z } from 'zod'
import { DEFAULT_SEND_INTERVAL_SECONDS, isValidClientId } from '../config'

export const themeSchema = z.enum(['system', 'light', 'dark'])
export type Theme = z.infer<typeof themeSchema>

export const mailProviderKindSchema = z.enum(['graph', 'outlook', 'smtp', 'mock'])
export type MailProviderKind = z.infer<typeof mailProviderKindSchema>

const smtpFields = {
  host: z.string().trim().max(255),
  port: z.number().int().min(1).max(65535),
  /** true = implicit TLS (usually port 465); false = STARTTLS when offered. */
  secure: z.boolean(),
  user: z.string().trim().max(320),
  fromName: z.string().trim().max(200),
  fromEmail: z.string().trim().max(320),
}

export const smtpSettingsSchema = z.object({
  host: smtpFields.host.default(''),
  port: smtpFields.port.default(587),
  secure: smtpFields.secure.default(false),
  user: smtpFields.user.default(''),
  fromName: smtpFields.fromName.default(''),
  fromEmail: smtpFields.fromEmail.default(''),
})
export type SmtpSettings = z.infer<typeof smtpSettingsSchema>

const DEFAULT_UNSUBSCRIBE_HTML =
  '<p style="font-size:12px;color:#888">Dacă nu mai dorești să primești emailuri de la noi, răspunde cu „Dezabonare”.</p>'

const settingsFields = {
  theme: themeSchema,
  language: z.enum(['ro']),
  mailProvider: mailProviderKindSchema,
  sendIntervalSeconds: z.number().min(0.5).max(600),
  signatureHtml: z.string().max(50_000),
  unsubscribeEnabled: z.boolean(),
  unsubscribeHtml: z.string().max(5_000),
  onboardingDone: z.boolean(),
  /** Microsoft Entra application (client) ID entered in the app; empty = not set. */
  /** Classic Outlook account (SMTP address) to send from; empty = Outlook's default. */
  outlookAccount: z.string().trim().max(320),
  msClientId: z
    .string()
    .trim()
    .refine((v) => v === '' || isValidClientId(v), 'invalid client id'),
}

export const settingsSchema = z.object({
  theme: settingsFields.theme.default('system'),
  language: settingsFields.language.default('ro'),
  mailProvider: settingsFields.mailProvider.default('graph'),
  sendIntervalSeconds: settingsFields.sendIntervalSeconds.default(DEFAULT_SEND_INTERVAL_SECONDS),
  smtp: smtpSettingsSchema.default(smtpSettingsSchema.parse({})),
  signatureHtml: settingsFields.signatureHtml.default(''),
  unsubscribeEnabled: settingsFields.unsubscribeEnabled.default(false),
  unsubscribeHtml: settingsFields.unsubscribeHtml.default(DEFAULT_UNSUBSCRIBE_HTML),
  onboardingDone: settingsFields.onboardingDone.default(false),
  msClientId: settingsFields.msClientId.default(''),
  outlookAccount: settingsFields.outlookAccount.default(''),
})
export type Settings = z.infer<typeof settingsSchema>

/** Partial update: no defaults, so omitted fields keep their current value. */
export const settingsPatchSchema = z
  .object({ ...settingsFields, smtp: z.object(smtpFields).partial() })
  .partial()
export type SettingsPatch = z.infer<typeof settingsPatchSchema>

export const defaultSettings: Settings = settingsSchema.parse({})
