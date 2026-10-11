import { z } from 'zod'

export const targetFields = ['name', 'firstName', 'email', 'phone', 'address', 'product'] as const
export const targetFieldSchema = z.enum(targetFields)
export type TargetField = (typeof targetFields)[number]

/** Column header for each target field, or null when not present. */
export const columnMappingSchema = z.object({
  name: z.string().nullable(),
  firstName: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  product: z.string().nullable(),
})
export type ColumnMapping = z.infer<typeof columnMappingSchema>

/** Tie-break order when a header scores equally for several fields. */
export const fieldPriority: TargetField[] = [
  'email',
  'phone',
  'product',
  'firstName',
  'name',
  'address',
]

export const emptyMapping: ColumnMapping = {
  name: null,
  firstName: null,
  email: null,
  phone: null,
  address: null,
  product: null,
}

/**
 * Header synonyms (Romanian + English), already folded to lowercase without diacritics.
 * Multi-word entries match on whole words.
 */
export const fieldSynonyms: Record<TargetField, string[]> = {
  name: [
    'nume',
    'nume client',
    'nume complet',
    'nume si prenume',
    'nume prenume',
    'prenume si nume',
    'prenume nume',
    'nume si prenumele',
    'numele',
    'client',
    'name',
    'full name',
    'fullname',
    'customer',
    'customer name',
    'contact',
    'persoana',
    'persoana contact',
    'denumire client',
  ],
  firstName: ['prenume', 'first name', 'firstname', 'given name', 'prenumele'],
  email: [
    'email',
    'e mail',
    'mail',
    'adresa email',
    'adresa e mail',
    'adresa mail',
    'adresa de email',
    'adresa de e mail',
    'email address',
    'e mail address',
    'posta electronica',
  ],
  phone: [
    'telefon',
    'tel',
    'nr tel',
    'nr telefon',
    'numar telefon',
    'numar de telefon',
    'phone',
    'phone number',
    'mobile',
    'mobil',
    'gsm',
    'celular',
  ],
  address: [
    'adresa',
    'adresa postala',
    'address',
    'strada',
    'localitate',
    'oras',
    'city',
    'locatie',
    'judet',
  ],
  product: [
    'produs',
    'produse',
    'produs de interes',
    'produs interes',
    'interes',
    'interesat de',
    'product',
    'products',
    'product of interest',
    'interest',
    'model',
    'articol',
    'serviciu',
  ],
}
