import { z } from 'zod'
import { DEFAULT_SEND_INTERVAL_SECONDS } from '../config'

export const themeSchema = z.enum(['system', 'light', 'dark'])
export type Theme = z.infer<typeof themeSchema>

export const mailProviderKindSchema = z.enum(['graph', 'smtp', 'mock'])
export type MailProviderKind = z.infer<typeof mailProviderKindSchema>

export const smtpSettingsSchema = z.object({
  host: z.string().trim().max(255).default(''),
  port: z.number().int().min(1).max(65535).default(587),
  /** true = implicit TLS (usually port 465); false = STARTTLS when offered. */
  secure: z.boolean().default(false),
  user: z.string().trim().max(320).default(''),
  fromName: z.string().trim().max(200).default(''),
  fromEmail: z.string().trim().max(320).default(''),
})
export type SmtpSettings = z.infer<typeof smtpSettingsSchema>

export const settingsSchema = z.object({
  theme: themeSchema.default('system'),
  language: z.enum(['ro']).default('ro'),
  mailProvider: mailProviderKindSchema.default('graph'),
  sendIntervalSeconds: z.number().min(0.5).max(600).default(DEFAULT_SEND_INTERVAL_SECONDS),
  smtp: smtpSettingsSchema.default(smtpSettingsSchema.parse({})),
  signatureHtml: z.string().max(50_000).default(''),
  unsubscribeEnabled: z.boolean().default(false),
  unsubscribeHtml: z
    .string()
    .max(5_000)
    .default(
      '<p style="font-size:12px;color:#888">Dacă nu mai dorești să primești emailuri de la noi, răspunde cu „Dezabonare”.</p>',
    ),
  onboardingDone: z.boolean().default(false),
})
export type Settings = z.infer<typeof settingsSchema>

export const settingsPatchSchema = settingsSchema.partial().extend({
  smtp: smtpSettingsSchema.partial().optional(),
})
export type SettingsPatch = z.infer<typeof settingsPatchSchema>

export const defaultSettings: Settings = settingsSchema.parse({})
