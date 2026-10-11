-- Lists group imported leads (campaigns / batches).
CREATE TABLE lists (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE leads (
  id INTEGER PRIMARY KEY,
  list_id INTEGER REFERENCES lists(id) ON DELETE SET NULL,
  name TEXT NOT NULL DEFAULT '',
  first_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  email_norm TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  product_raw TEXT NOT NULL DEFAULT '',
  -- Unmapped spreadsheet columns, available in templates as {{extra.Column}}.
  extra TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'sent', 'error', 'do_not_contact')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  -- Soft delete so deletions can be undone.
  deleted_at TEXT
);
CREATE INDEX idx_leads_list ON leads(list_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_email_norm ON leads(email_norm) WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_status ON leads(status) WHERE deleted_at IS NULL;

CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  name_norm TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1,
  -- File name inside userData/pdfs, original file name and size in bytes.
  pdf_file TEXT,
  pdf_name TEXT,
  pdf_size INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE product_synonyms (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  value TEXT NOT NULL,
  value_norm TEXT NOT NULL UNIQUE
);

-- Each product value found on a lead (split on , ; /) and the product it matched.
CREATE TABLE lead_product_values (
  id INTEGER PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  value TEXT NOT NULL,
  value_norm TEXT NOT NULL,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL
);
CREATE INDEX idx_lpv_lead ON lead_product_values(lead_id);
CREATE INDEX idx_lpv_value ON lead_product_values(value_norm);
CREATE INDEX idx_lpv_product ON lead_product_values(product_id);

-- Unmatched product values the user chose to send without an attachment.
CREATE TABLE ignored_product_values (
  value_norm TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Column mapping remembered per normalized header signature.
CREATE TABLE column_mappings (
  signature TEXT PRIMARY KEY,
  mapping TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE templates (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  body_html TEXT NOT NULL DEFAULT '',
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Emails that must never be contacted, independent of lead rows.
CREATE TABLE do_not_contact (
  email_norm TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE send_jobs (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('single', 'bulk')),
  template_id INTEGER REFERENCES templates(id) ON DELETE SET NULL,
  template_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'paused', 'cancelled', 'completed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- One row per outgoing email. The rendered content is snapshotted when queued, so a
-- resumed job sends exactly what was confirmed. Rows in 'sent' are never sent again.
CREATE TABLE sends (
  id INTEGER PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES send_jobs(id) ON DELETE CASCADE,
  lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  template_id INTEGER REFERENCES templates(id) ON DELETE SET NULL,
  template_name TEXT NOT NULL DEFAULT '',
  to_email TEXT NOT NULL,
  to_email_norm TEXT NOT NULL,
  to_name TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  -- JSON array of { productId, name, file, size }.
  attachments TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sending', 'sent', 'failed', 'skipped', 'cancelled', 'unknown')),
  error_code TEXT,
  error_detail TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  provider TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  sent_at TEXT
);
CREATE INDEX idx_sends_job ON sends(job_id, status);
CREATE INDEX idx_sends_lead ON sends(lead_id);
CREATE INDEX idx_sends_template_email ON sends(template_id, to_email_norm, status);
CREATE INDEX idx_sends_created ON sends(created_at);
