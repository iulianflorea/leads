import { type ReactNode, useState } from 'react'
import type { LeadInput } from '@shared/schemas/lead'
import { isValidEmail } from '@shared/import/validate'
import { Field } from '@renderer/components/ui'
import { useLists } from '@renderer/stores/lists'
import { t } from '@renderer/lib/i18n'

export type LeadFormValue = Required<Omit<LeadInput, 'extra'>> & { listId: number | null }

export const emptyLeadForm: LeadFormValue = {
  listId: null,
  name: '',
  firstName: '',
  email: '',
  phone: '',
  address: '',
  productRaw: '',
}

export function leadFormErrors(v: LeadFormValue): Partial<Record<keyof LeadFormValue, string>> {
  return v.email.trim() && !isValidEmail(v.email) ? { email: t('leads.invalidEmail') } : {}
}

export function LeadForm({
  value,
  onChange,
  autoFocus,
}: {
  value: LeadFormValue
  onChange(value: LeadFormValue): void
  autoFocus?: boolean
}): ReactNode {
  const lists = useLists((s) => s.lists)
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const errors = leadFormErrors(value)
  const text = (
    key: Exclude<keyof LeadFormValue, 'listId'>,
    label: string,
    type = 'text',
    hint?: string,
  ) => (
    <Field label={label} hint={hint} error={touched[key] ? errors[key] : undefined}>
      {(id) => (
        <input
          id={id}
          type={type}
          className="input"
          value={value[key]}
          aria-invalid={touched[key] && errors[key] ? true : undefined}
          data-autofocus={autoFocus && key === 'name' ? true : undefined}
          onChange={(e) => onChange({ ...value, [key]: e.target.value })}
          onBlur={() => setTouched({ ...touched, [key]: true })}
        />
      )}
    </Field>
  )
  return (
    <div className="form-grid">
      {text('name', t('fields.name'))}
      {text('firstName', t('fields.firstName'), 'text', t('fieldHints.firstName'))}
      {text('email', t('fields.email'), 'email')}
      {text('phone', t('fields.phone'), 'tel')}
      <div className="span-2">{text('address', t('fields.address'))}</div>
      <div className="span-2">
        {text('productRaw', t('fields.product'), 'text', t('fieldHints.product'))}
      </div>
      <div className="span-2">
        <Field label={t('fields.list')}>
          {(id) => (
            <select
              id={id}
              className="select"
              value={value.listId ?? ''}
              onChange={(e) =>
                onChange({ ...value, listId: e.target.value ? Number(e.target.value) : null })
              }
            >
              <option value="">{t('leads.noList')}</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
    </div>
  )
}
