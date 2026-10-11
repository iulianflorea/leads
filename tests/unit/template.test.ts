import { describe, expect, it } from 'vitest'
import {
  escapeHtml,
  extractVariables,
  renderTemplate,
  type TemplateLead,
} from '@shared/template/render'
import { composeEmail } from '@shared/template/compose'

const lead: TemplateLead = {
  name: 'Ana Pop',
  firstName: 'Ana',
  email: 'ana@example.ro',
  phone: '0722',
  address: '',
  product: 'Pompă de căldură',
  extra: { Oraș: 'Cluj', Sursa: '<Facebook>' },
}

describe('renderTemplate', () => {
  it('replaces base variables, case-insensitive and with spaces', () => {
    const r = renderTemplate('Bună {{prenume}}, {{ PRODUS }} pentru {{email}}', lead, {
      html: false,
    })
    expect(r.output).toBe('Bună Ana, Pompă de căldură pentru ana@example.ro')
    expect(r.missing).toEqual([])
  })

  it('replaces extra columns, case-insensitively', () => {
    expect(renderTemplate('{{extra.Oraș}} / {{extra.oraș}}', lead, { html: false }).output).toBe(
      'Cluj / Cluj',
    )
  })

  it('uses fallbacks for empty values', () => {
    const r = renderTemplate('Adresa: {{adresa|necunoscută}}', lead, { html: false })
    expect(r.output).toBe('Adresa: necunoscută')
    expect(r.missing).toEqual([])
  })

  it('uses the fallback when the first name is empty', () => {
    const r = renderTemplate(
      'Bună {{prenume|Client}}',
      { ...lead, firstName: ' ' },
      { html: false },
    )
    expect(r.output).toBe('Bună Client')
  })

  it('reports empty variables without fallback as missing', () => {
    const r = renderTemplate('{{adresa}}', lead, { html: false })
    expect(r.output).toBe('')
    expect(r.missing).toEqual(['adresa'])
  })

  it('reports unknown variables', () => {
    const r = renderTemplate('{{prenme}} {{extra.Nope}}', lead, {
      html: false,
      knownExtras: ['Oraș'],
    })
    expect(r.unknown).toEqual(['prenme', 'extra.Nope'])
  })

  it('treats extra columns known elsewhere as missing, not unknown', () => {
    const r = renderTemplate('{{extra.Buget}}', lead, { html: false, knownExtras: ['Buget'] })
    expect(r.unknown).toEqual([])
    expect(r.missing).toEqual(['extra.Buget'])
  })

  it('escapes values in HTML mode but not in plain mode', () => {
    expect(renderTemplate('<p>{{extra.Sursa}}</p>', lead, { html: true }).output).toBe(
      '<p>&lt;Facebook&gt;</p>',
    )
    expect(renderTemplate('{{extra.Sursa}}', lead, { html: false }).output).toBe('<Facebook>')
  })

  it('decodes editor entities in fallbacks', () => {
    expect(renderTemplate('{{adresa|A &amp; B}}', lead, { html: true }).output).toBe('A &amp; B')
  })

  it('leaves single braces alone', () => {
    expect(renderTemplate('{nume} {{nume}}', lead, { html: false }).output).toBe('{nume} Ana Pop')
  })
})

describe('extractVariables', () => {
  it('lists unique variable names', () => {
    expect(extractVariables('{{nume}} {{prenume|X}} {{nume}} {{extra.Oraș}}')).toEqual([
      'nume',
      'prenume',
      'extra.Oraș',
    ])
  })
})

describe('composeEmail', () => {
  it('renders subject, body, signature and unsubscribe footer', () => {
    const email = composeEmail(
      {
        subject: 'Oferta {{produs}} pentru {{prenume}}',
        bodyHtml: '<p>Bună {{prenume}},</p>',
        signatureHtml: '<p>Echipa</p>',
        unsubscribeHtml: '<p>Dezabonare</p>',
      },
      lead,
    )
    expect(email.subject).toBe('Oferta Pompă de căldură pentru Ana')
    expect(email.html).toContain('<p>Bună Ana,</p>')
    expect(email.html).toContain('<p>Echipa</p>')
    expect(email.html).toContain('Dezabonare')
    expect(email.html.startsWith('<!doctype html>')).toBe(true)
  })

  it('omits empty signature and footer', () => {
    const email = composeEmail(
      { subject: 'x', bodyHtml: '<p>y</p>', signatureHtml: '<p></p>' },
      lead,
    )
    expect(email.html).not.toContain('signature')
    expect(email.html).not.toContain('unsubscribe')
  })

  it('collapses whitespace in the subject', () => {
    expect(composeEmail({ subject: ' A  {{adresa}}  B ', bodyHtml: '' }, lead).subject).toBe('A B')
  })
})

describe('escapeHtml', () => {
  it('escapes special characters', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    )
  })
})
