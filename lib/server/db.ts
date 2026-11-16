// Local SQLite database (Node's built-in node:sqlite, no extra packages or services).
// The file is created and seeded on first use; delete it (npm run db:reset) to start over.

import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { seed } from "./seed.ts";
import { transaction, type Db } from "./tx.ts";

export { transaction, type Db };

const SCHEMA = `
create table if not exists users (
  id            text primary key,
  email         text not null unique collate nocase,
  name          text not null,
  password_hash text not null
);

create table if not exists sessions (
  token_hash text primary key,
  user_id    text not null references users (id) on delete cascade,
  expires_at text not null
);

create table if not exists companies (
  id                text primary key,
  name              text not null,
  address           text not null,
  tax_id            text not null check (length(tax_id) = 13 and tax_id not glob '*[^0-9]*'),
  branch            text not null default 'สำนักงานใหญ่',
  phone             text,
  email             text,
  logo_url          text,
  bank_name         text,
  bank_account_name text,
  bank_account_no   text,
  -- VAT registered: receipts are issued as ใบเสร็จรับเงิน/ใบกำกับภาษี.
  vat_registered    integer not null default 1,
  created_at        text not null default (datetime('now'))
);

create table if not exists customers (
  id               text primary key,
  name             text not null,
  address          text not null default '',
  tax_id           text check (tax_id is null or (length(tax_id) = 13 and tax_id not glob '*[^0-9]*')),
  branch           text,
  contact_name     text,
  phone            text,
  email            text,
  credit_term_days integer not null default 30 check (credit_term_days >= 0),
  created_at       text not null default (datetime('now'))
);

create table if not exists products (
  id             text primary key,
  code           text not null unique,
  name           text not null,
  unit           text not null,
  unit_price     real not null default 0 check (unit_price >= 0),
  vat_applicable integer not null default 1,
  created_at     text not null default (datetime('now'))
);

-- Totals are written by saveDocument() using lib/calc.ts, the same code as the live builder.
create table if not exists documents (
  id                 text primary key,
  company_id         text not null references companies (id) on delete restrict,
  customer_id        text not null references customers (id) on delete restrict,
  source_document_id text references documents (id) on delete restrict,
  type               text not null check (type in ('QT', 'IV')),
  status             text not null default 'draft'
                     check (status in ('draft', 'sent', 'approved', 'paid', 'cancelled')),
  doc_number         text not null unique,
  issue_date         text not null,
  due_date           text not null,
  vat_rate           real not null default 7 check (vat_rate between 0 and 100),
  wht_rate           real not null default 0 check (wht_rate between 0 and 100),
  notes              text,
  paid_at            text,
  subtotal           real not null default 0,
  vat_amount         real not null default 0,
  grand_total        real not null default 0,
  wht_amount         real not null default 0,
  net_total          real not null default 0,
  created_at         text not null default (datetime('now')),
  check (due_date >= issue_date),
  check (type = 'IV' or status <> 'paid'),
  check (type = 'IV' or source_document_id is null)
);

create index if not exists documents_customer_idx on documents (customer_id);
create index if not exists documents_list_idx on documents (type, status, issue_date desc);
create unique index if not exists documents_one_live_invoice_per_quotation
  on documents (source_document_id)
  where source_document_id is not null and status <> 'cancelled';

create table if not exists document_items (
  id             text primary key,
  document_id    text not null references documents (id) on delete cascade,
  product_id     text references products (id) on delete set null,
  position       integer not null,
  description    text not null,
  unit           text not null,
  quantity       real not null check (quantity > 0),
  unit_price     real not null check (unit_price >= 0),
  vat_applicable integer not null default 1,
  amount         real not null
);

create index if not exists document_items_document_idx on document_items (document_id, position);

-- Billing notes (ใบวางบิล) group a customer's issued, unpaid invoices for collection.
-- Amounts are not copied: they are read from the invoices, so edits to an invoice show up here.
create table if not exists billing_notes (
  id          text primary key,
  company_id  text not null references companies (id) on delete restrict,
  customer_id text not null references customers (id) on delete restrict,
  doc_number  text not null unique,
  issue_date  text not null,
  due_date    text not null,
  status      text not null default 'issued' check (status in ('issued', 'cancelled')),
  notes       text,
  created_at  text not null default (datetime('now')),
  check (due_date >= issue_date)
);

create index if not exists billing_notes_customer_idx on billing_notes (customer_id);

create table if not exists billing_note_items (
  billing_note_id text not null references billing_notes (id) on delete cascade,
  invoice_id      text not null references documents (id) on delete restrict,
  position        integer not null,
  primary key (billing_note_id, invoice_id)
);

create index if not exists billing_note_items_invoice_idx on billing_note_items (invoice_id);

-- Receipts (ใบเสร็จรับเงิน) record payment of one or more invoices. Issuing one marks its
-- invoices paid; cancelling restores each invoice's previous status and paid date.
create table if not exists receipts (
  id             text primary key,
  company_id     text not null references companies (id) on delete restrict,
  customer_id    text not null references customers (id) on delete restrict,
  doc_number     text not null unique,
  receipt_date   text not null,
  payment_method text not null check (payment_method in ('cash', 'transfer', 'cheque', 'other')),
  payment_ref    text,
  notes          text,
  status         text not null default 'issued' check (status in ('issued', 'cancelled')),
  -- Tax invoice details fixed at issue, so a reprinted copy matches the original.
  is_tax_invoice  integer not null default 0,
  seller_snapshot text,
  buyer_snapshot  text,
  created_at     text not null default (datetime('now'))
);

create index if not exists receipts_customer_idx on receipts (customer_id);

create table if not exists receipt_items (
  receipt_id     text not null references receipts (id) on delete cascade,
  invoice_id     text not null references documents (id) on delete restrict,
  position       integer not null,
  prev_status    text not null,
  prev_paid_at   text,
  primary key (receipt_id, invoice_id)
);

create index if not exists receipt_items_invoice_idx on receipt_items (invoice_id);

-- Tax invoices issued on delivery of goods (ใบส่งของ/ใบกำกับภาษี), one live per invoice.
-- Seller and buyer are fixed at issue, like tax-invoice receipts.
create table if not exists tax_invoices (
  id              text primary key,
  company_id      text not null references companies (id) on delete restrict,
  invoice_id      text not null references documents (id) on delete restrict,
  doc_number      text not null unique,
  tax_date        text not null,
  notes           text,
  status          text not null default 'issued' check (status in ('issued', 'cancelled')),
  seller_snapshot text not null,
  buyer_snapshot  text not null,
  created_at      text not null default (datetime('now'))
);

create unique index if not exists tax_invoices_one_live_per_invoice
  on tax_invoices (invoice_id) where status <> 'cancelled';

-- One running number per type and month, e.g. QT202611-001
-- (BL billing notes, RC receipts, TX tax invoices on delivery).
create table if not exists document_sequences (
  type    text not null,
  period  text not null,
  last_no integer not null,
  primary key (type, period)
);
`;

/** Columns added after a table was first created (CREATE TABLE IF NOT EXISTS skips them). */
const ADDED_COLUMNS: [table: string, column: string, definition: string][] = [
  ["companies", "vat_registered", "integer not null default 1"],
  ["receipts", "is_tax_invoice", "integer not null default 0"],
  ["receipts", "seller_snapshot", "text"],
  ["receipts", "buyer_snapshot", "text"],
];

export function migrate(db: Db) {
  for (const [table, column, definition] of ADDED_COLUMNS) {
    const columns = db.prepare(`pragma table_info(${table})`).all() as { name: string }[];
    if (!columns.some((c) => c.name === column)) {
      db.exec(`alter table ${table} add column ${column} ${definition}`);
    }
  }
}

/** Opens (and creates/seeds if needed) a database. Use ":memory:" in tests. */
export function openDatabase(file: string): Db {
  if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("pragma foreign_keys = on; pragma busy_timeout = 5000;");
  if (file !== ":memory:") db.exec("pragma journal_mode = wal;");
  db.exec(SCHEMA);
  migrate(db);
  // Seed only a brand-new database (no users yet). A database whose business data was
  // cleared on purpose keeps its login account and stays empty.
  transaction(db, () => {
    const { n } = db.prepare("select count(*) as n from users").get() as { n: number };
    if (n === 0) seed(db);
  });
  return db;
}

/** data/app.db in the project folder; set DATABASE_FILE to keep it elsewhere. */
export const DATABASE_FILE = process.env.DATABASE_FILE
  ? path.resolve(/*turbopackIgnore: true*/ process.env.DATABASE_FILE)
  : path.join(process.cwd(), "data", "app.db");

const globalForDb = globalThis as unknown as { __appDb?: Db; __appSchema?: string };

/**
 * Shared connection, kept on globalThis so dev hot reloads do not open new handles.
 * When the schema text changes (new tables after an update), it is applied again;
 * every statement is "if not exists", so existing data is kept.
 */
export function db(): Db {
  if (!globalForDb.__appDb) {
    globalForDb.__appDb = openDatabase(DATABASE_FILE);
    globalForDb.__appSchema = SCHEMA;
  } else if (globalForDb.__appSchema !== SCHEMA) {
    globalForDb.__appDb.exec(SCHEMA);
    migrate(globalForDb.__appDb);
    globalForDb.__appSchema = SCHEMA;
  }
  return globalForDb.__appDb;
}
