-- =====================================================================================
-- Quotation & Invoicing System - Supabase schema
--
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste this file -> Run.
-- It is safe to run again on an empty project; it does not drop existing data.
--
-- Security model
--   * Every signed-in account has a row in public.profiles with role admin | user | pending.
--   * The first account to sign up becomes admin; later ones wait as "pending" until an
--     admin approves them in the app (menu "ผู้ใช้งาน").
--   * admin   : everything, including company settings, deleting and managing users
--   * user    : read everything, create and edit documents, customers and products
--   * pending : no access to business data
--   * The anon (not signed in) role cannot read or write anything.
--   * Documents, billing notes, receipts and tax invoices are only written through the
--     functions below, so numbering, totals and status rules cannot be bypassed through
--     the REST API. Customers and products are written directly (guarded by RLS + checks).
--   * Business-rule errors are raised with SQLSTATE P0001 and a Thai message that the
--     app shows to the user as is.
-- =====================================================================================

-- ------------------------------------------------------------------------------ helpers

/** Today's date in Thailand, used for overdue checks and "not in the future" rules. */
create or replace function public.today_th() returns date
language sql stable set search_path = public, pg_temp
as $$ select (now() at time zone 'Asia/Bangkok')::date $$;

-- ------------------------------------------------------------------------------ users

create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  full_name  text not null default '',
  role       text not null default 'pending' check (role in ('admin', 'user', 'pending')),
  created_at timestamptz not null default now()
);

create or replace function public.app_role() returns text
language sql stable security definer set search_path = public, pg_temp
as $$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$ select coalesce(public.app_role() in ('admin', 'user'), false) $$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$ select coalesce(public.app_role() = 'admin', false) $$;

create or replace function public.require_member() returns void
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  if not public.is_member() then
    raise exception 'ไม่มีสิทธิ์ทำรายการนี้ กรุณาติดต่อผู้ดูแลระบบ';
  end if;
end $$;

create or replace function public.require_admin() returns void
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่ทำรายการนี้ได้';
  end if;
end $$;

/** Creates the profile of a new auth user. The very first account becomes admin. */
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  perform pg_advisory_xact_lock(hashtext('profiles_first_admin'));
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    case when exists (select 1 from public.profiles where role = 'admin') then 'pending' else 'admin' end
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

/** Admin only: change a user's role. There must always be at least one admin. */
create or replace function public.set_user_role(p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_current text;
begin
  perform public.require_admin();
  if p_role is null or p_role not in ('admin', 'user', 'pending') then
    raise exception 'สิทธิ์ผู้ใช้ไม่ถูกต้อง';
  end if;
  perform pg_advisory_xact_lock(hashtext('profiles_first_admin'));
  select role into v_current from public.profiles where id = p_user for update;
  if not found then raise exception 'ไม่พบผู้ใช้นี้'; end if;
  if v_current = 'admin' and p_role <> 'admin'
     and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'ต้องมีผู้ดูแลระบบอย่างน้อย 1 คน';
  end if;
  update public.profiles set role = p_role where id = p_user;
end $$;

-- ------------------------------------------------------------------------------ tables

create table if not exists public.companies (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  address           text not null,
  tax_id            text not null check (tax_id ~ '^[0-9]{13}$'),
  branch            text not null default 'สำนักงานใหญ่',
  phone             text,
  email             text,
  logo_url          text,
  bank_name         text,
  bank_account_name text,
  bank_account_no   text,
  -- VAT registered: receipts are issued as ใบเสร็จรับเงิน/ใบกำกับภาษี.
  vat_registered    boolean not null default true,
  created_at        timestamptz not null default now()
);

create table if not exists public.customers (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (btrim(name) <> ''),
  address          text not null default '',
  tax_id           text check (tax_id is null or tax_id ~ '^[0-9]{13}$'),
  branch           text,
  contact_name     text,
  phone            text,
  email            text,
  credit_term_days integer not null default 30 check (credit_term_days >= 0),
  created_at       timestamptz not null default now()
);

create table if not exists public.products (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique check (btrim(code) <> ''),
  name           text not null check (btrim(name) <> ''),
  unit           text not null check (btrim(unit) <> ''),
  unit_price     numeric(14, 2) not null default 0 check (unit_price >= 0),
  vat_applicable boolean not null default true,
  created_at     timestamptz not null default now()
);

-- Quotations (QT) and invoices (IV). Totals are written by refresh_totals().
create table if not exists public.documents (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references public.companies (id) on delete restrict,
  customer_id        uuid not null references public.customers (id) on delete restrict,
  source_document_id uuid references public.documents (id) on delete restrict,
  type               text not null check (type in ('QT', 'IV')),
  status             text not null default 'draft'
                     check (status in ('draft', 'sent', 'approved', 'paid', 'cancelled')),
  doc_number         text not null unique,
  issue_date         date not null,
  due_date           date not null,
  vat_rate           numeric(5, 2) not null default 7 check (vat_rate between 0 and 100),
  wht_rate           numeric(5, 2) not null default 0 check (wht_rate between 0 and 100),
  notes              text,
  paid_at            date,
  subtotal           numeric(14, 2) not null default 0,
  vat_amount         numeric(14, 2) not null default 0,
  grand_total        numeric(14, 2) not null default 0,
  wht_amount         numeric(14, 2) not null default 0,
  net_total          numeric(14, 2) not null default 0,
  created_at         timestamptz not null default now(),
  check (due_date >= issue_date),
  check (type = 'IV' or status <> 'paid'),
  check (type = 'IV' or source_document_id is null)
);

create index if not exists documents_customer_idx on public.documents (customer_id);
create index if not exists documents_source_idx on public.documents (source_document_id);
create index if not exists documents_list_idx on public.documents (type, status, issue_date desc);
create unique index if not exists documents_one_live_invoice_per_quotation
  on public.documents (source_document_id)
  where source_document_id is not null and status <> 'cancelled';

create table if not exists public.document_items (
  id             uuid primary key default gen_random_uuid(),
  document_id    uuid not null references public.documents (id) on delete cascade,
  product_id     uuid references public.products (id) on delete set null,
  position       integer not null,
  description    text not null,
  unit           text not null,
  quantity       numeric(14, 3) not null check (quantity > 0),
  unit_price     numeric(14, 2) not null check (unit_price >= 0),
  vat_applicable boolean not null default true,
  amount         numeric(14, 2) not null
);

create index if not exists document_items_document_idx on public.document_items (document_id, position);

-- Billing notes (ใบวางบิล): amounts are read live from their invoices.
create table if not exists public.billing_notes (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id) on delete restrict,
  customer_id uuid not null references public.customers (id) on delete restrict,
  doc_number  text not null unique,
  issue_date  date not null,
  due_date    date not null,
  status      text not null default 'issued' check (status in ('issued', 'cancelled')),
  notes       text,
  created_at  timestamptz not null default now(),
  check (due_date >= issue_date)
);

create index if not exists billing_notes_customer_idx on public.billing_notes (customer_id);

create table if not exists public.billing_note_items (
  billing_note_id uuid not null references public.billing_notes (id) on delete cascade,
  invoice_id      uuid not null references public.documents (id) on delete restrict,
  position        integer not null,
  primary key (billing_note_id, invoice_id)
);

create index if not exists billing_note_items_invoice_idx on public.billing_note_items (invoice_id);

-- Receipts (ใบเสร็จรับเงิน): issuing marks the invoices paid; cancelling restores them.
create table if not exists public.receipts (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies (id) on delete restrict,
  customer_id     uuid not null references public.customers (id) on delete restrict,
  doc_number      text not null unique,
  receipt_date    date not null,
  payment_method  text not null check (payment_method in ('cash', 'transfer', 'cheque', 'other')),
  payment_ref     text,
  notes           text,
  status          text not null default 'issued' check (status in ('issued', 'cancelled')),
  -- Tax invoice details fixed at issue, so a reprinted copy matches the original.
  is_tax_invoice  boolean not null default false,
  seller_snapshot jsonb,
  buyer_snapshot  jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists receipts_customer_idx on public.receipts (customer_id);

create table if not exists public.receipt_items (
  receipt_id   uuid not null references public.receipts (id) on delete cascade,
  invoice_id   uuid not null references public.documents (id) on delete restrict,
  position     integer not null,
  prev_status  text not null,
  prev_paid_at date,
  primary key (receipt_id, invoice_id)
);

create index if not exists receipt_items_invoice_idx on public.receipt_items (invoice_id);

-- Tax invoices issued on delivery of goods (ใบส่งของ/ใบกำกับภาษี), one live per invoice.
create table if not exists public.tax_invoices (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies (id) on delete restrict,
  invoice_id      uuid not null references public.documents (id) on delete restrict,
  doc_number      text not null unique,
  tax_date        date not null,
  notes           text,
  status          text not null default 'issued' check (status in ('issued', 'cancelled')),
  seller_snapshot jsonb not null,
  buyer_snapshot  jsonb not null,
  created_at      timestamptz not null default now()
);

create unique index if not exists tax_invoices_one_live_per_invoice
  on public.tax_invoices (invoice_id) where status <> 'cancelled';

-- One running number per type and month, e.g. QT202611-001.
create table if not exists public.document_sequences (
  type    text not null,
  period  text not null,
  last_no integer not null,
  primary key (type, period)
);

-- ------------------------------------------------------------------------------ views
-- security_invoker: the caller's row level security applies to the underlying tables.

create or replace view public.document_summaries with (security_invoker = true) as
select d.*, c.name as customer_name,
  (d.type = 'IV' and d.status in ('sent', 'approved') and d.due_date < public.today_th()) as is_overdue,
  exists (select 1 from public.documents i where i.source_document_id = d.id and i.status <> 'cancelled') as has_invoice,
  exists (select 1 from public.tax_invoices t where t.invoice_id = d.id and t.status <> 'cancelled') as has_tax_invoice
from public.documents d
join public.customers c on c.id = d.customer_id;

/** An invoice as listed on a billing note or receipt, or offered for one. */
create or replace view public.invoice_rows with (security_invoker = true) as
select d.id, d.customer_id, d.doc_number, d.issue_date, d.due_date, d.status,
  d.grand_total, d.wht_amount, d.net_total,
  (d.status in ('sent', 'approved') and d.due_date < public.today_th()) as is_overdue,
  exists (select 1 from public.tax_invoices t where t.invoice_id = d.id and t.status <> 'cancelled') as has_tax_invoice
from public.documents d
where d.type = 'IV';

create or replace view public.billing_note_summaries with (security_invoker = true) as
select b.id, b.customer_id, c.name as customer_name, b.doc_number, b.issue_date, b.due_date,
  b.status, b.notes,
  count(d.id)::int as invoice_count,
  (count(d.id) filter (where d.status in ('sent', 'approved')))::int as open_count,
  coalesce(sum(d.grand_total), 0) as grand_total,
  coalesce(sum(d.wht_amount), 0) as wht_amount,
  coalesce(sum(d.net_total), 0) as net_total
from public.billing_notes b
join public.customers c on c.id = b.customer_id
left join public.billing_note_items i on i.billing_note_id = b.id
left join public.documents d on d.id = i.invoice_id
group by b.id, c.name;

create or replace view public.receipt_summaries with (security_invoker = true) as
select r.id, r.customer_id, c.name as customer_name, r.doc_number, r.receipt_date,
  r.payment_method, r.payment_ref, r.notes, r.status,
  r.is_tax_invoice, r.seller_snapshot, r.buyer_snapshot,
  count(d.id)::int as invoice_count,
  coalesce(sum(d.grand_total), 0) as grand_total,
  coalesce(sum(d.wht_amount), 0) as wht_amount,
  coalesce(sum(d.net_total), 0) as net_total
from public.receipts r
join public.customers c on c.id = r.customer_id
left join public.receipt_items i on i.receipt_id = r.id
left join public.documents d on d.id = i.invoice_id
group by r.id, c.name;

create or replace view public.tax_invoice_summaries with (security_invoker = true) as
select t.id, t.invoice_id, d.doc_number as invoice_number, d.customer_id, c.name as customer_name,
  t.doc_number, t.tax_date, t.notes, t.status, t.seller_snapshot, t.buyer_snapshot
from public.tax_invoices t
join public.documents d on d.id = t.invoice_id
join public.customers c on c.id = d.customer_id;

/**
 * The combined document list. Billing notes show issued / paid (every invoice paid) /
 * cancelled; receipts and tax invoices issued / cancelled. Filtering on status works across
 * all types; "unpaid" and "overdue" are filtered in the app.
 */
create or replace view public.document_list with (security_invoker = true) as
select d.id, d.type, d.status, d.doc_number, c.name as customer_name, d.issue_date, d.due_date,
  d.grand_total, d.net_total,
  (d.type = 'IV' and d.status in ('sent', 'approved') and d.due_date < public.today_th()) as is_overdue,
  exists (select 1 from public.documents i where i.source_document_id = d.id and i.status <> 'cancelled') as has_invoice,
  exists (select 1 from public.tax_invoices t where t.invoice_id = d.id and t.status <> 'cancelled') as has_tax_invoice
from public.documents d join public.customers c on c.id = d.customer_id
union all
select b.id, 'BL',
  case
    when b.status = 'cancelled' then 'cancelled'
    when not exists (
      select 1 from public.billing_note_items i join public.documents d on d.id = i.invoice_id
      where i.billing_note_id = b.id and d.status in ('sent', 'approved')
    ) then 'paid'
    else 'issued'
  end,
  b.doc_number, c.name, b.issue_date, b.due_date,
  (select coalesce(sum(d.grand_total), 0) from public.billing_note_items i join public.documents d on d.id = i.invoice_id
    where i.billing_note_id = b.id),
  (select coalesce(sum(d.net_total), 0) from public.billing_note_items i join public.documents d on d.id = i.invoice_id
    where i.billing_note_id = b.id),
  false, false, false
from public.billing_notes b join public.customers c on c.id = b.customer_id
union all
select r.id, 'RC', r.status, r.doc_number, c.name, r.receipt_date, r.receipt_date,
  (select coalesce(sum(d.grand_total), 0) from public.receipt_items i join public.documents d on d.id = i.invoice_id
    where i.receipt_id = r.id),
  (select coalesce(sum(d.net_total), 0) from public.receipt_items i join public.documents d on d.id = i.invoice_id
    where i.receipt_id = r.id),
  false, false, false
from public.receipts r join public.customers c on c.id = r.customer_id
union all
select t.id, 'TX', t.status, t.doc_number, c.name, t.tax_date, t.tax_date, d.grand_total, d.net_total,
  false, false, false
from public.tax_invoices t join public.documents d on d.id = t.invoice_id
join public.customers c on c.id = d.customer_id;

-- ------------------------------------------------------------------------------ parsing helpers

create or replace function public.try_uuid(p text) returns uuid
language plpgsql immutable set search_path = public, pg_temp
as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;

create or replace function public.try_numeric(p text) returns numeric
language plpgsql immutable set search_path = public, pg_temp
as $$
begin
  return p::numeric;
exception when others then
  return null;
end $$;

/** A YYYY-MM-DD date, or a business error. */
create or replace function public.parse_date(p text) returns date
language plpgsql immutable set search_path = public, pg_temp
as $$
declare
  v date;
begin
  if p is null or p !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'รูปแบบวันที่ไม่ถูกต้อง';
  end if;
  begin
    v := p::date;
  exception when others then
    raise exception 'รูปแบบวันที่ไม่ถูกต้อง';
  end;
  return v;
end $$;

create or replace function public.check_rate(p text, p_label text) returns numeric
language plpgsql immutable set search_path = public, pg_temp
as $$
declare
  v numeric := public.try_numeric(p);
begin
  if v is null or v < 0 or v > 100 then
    raise exception '%ต้องอยู่ระหว่าง 0 ถึง 100', p_label;
  end if;
  return round(v, 2);
end $$;

/** Distinct uuids from a JSON array of strings, in first-seen order. Bad values become null. */
create or replace function public.uuid_list(p jsonb) returns uuid[]
language sql immutable set search_path = public, pg_temp
as $$
  select coalesce(array_agg(id order by first_pos), '{}')
  from (
    select public.try_uuid(value) as id, min(pos) as first_pos
    from jsonb_array_elements_text(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end)
      with ordinality as e(value, pos)
    group by 1
  ) s
$$;

create or replace function public.party(p_name text, p_address text, p_tax_id text, p_branch text) returns jsonb
language sql immutable set search_path = public, pg_temp
as $$ select jsonb_build_object('name', p_name, 'address', p_address, 'tax_id', p_tax_id, 'branch', p_branch) $$;

-- ------------------------------------------------------------------------------ document rules

/** Next running number for the type and month of the date, e.g. IV202611-007. */
create or replace function public.next_doc_number(p_type text, p_date date) returns text
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_period text := to_char(p_date, 'YYYYMM');
  v_no integer;
begin
  insert into public.document_sequences (type, period, last_no) values (p_type, v_period, 1)
  on conflict (type, period) do update set last_no = public.document_sequences.last_no + 1
  returning last_no into v_no;
  return p_type || v_period || '-' || lpad(v_no::text, 3, '0');
end $$;

/** Why a document cannot be edited, or null. Mirrors lib/document-rules.ts editBlockReason. */
create or replace function public.edit_block_reason(
  p_type text, p_status text, p_has_invoice boolean, p_has_tax_invoice boolean
) returns text
language sql immutable set search_path = public, pg_temp
as $$
  select case
    when p_status = 'paid' then 'เอกสารที่ชำระแล้วแก้ไขไม่ได้'
    when p_status = 'cancelled' then 'เอกสารที่ยกเลิกแล้วแก้ไขไม่ได้'
    when p_type = 'IV' and p_has_tax_invoice
      then 'ใบแจ้งหนี้นี้ออกใบกำกับภาษีแล้ว แก้ไขไม่ได้ ถ้าต้องแก้ ให้ยกเลิกใบกำกับภาษีก่อน'
    when p_type = 'QT' and p_has_invoice
      then 'ใบเสนอราคานี้แปลงเป็นใบแจ้งหนี้แล้ว กรุณาแก้ไขที่ใบแจ้งหนี้แทน'
  end
$$;

/**
 * Allowed moves: draft -> sent | cancelled; sent -> approved | paid (IV) | cancelled;
 * approved -> paid (IV) | cancelled. paid and cancelled are final.
 */
create or replace function public.can_change_status(p_type text, p_from text, p_to text) returns boolean
language sql immutable set search_path = public, pg_temp
as $$
  select case
    when p_from = 'draft' then p_to in ('sent', 'cancelled')
    when p_from in ('sent', 'approved') then
      p_to = 'cancelled' or (p_to = 'paid' and p_type = 'IV') or (p_from = 'sent' and p_to = 'approved')
    else false
  end
$$;

/** Mirrors lib/document-rules.ts canDeleteDocument. */
create or replace function public.can_delete_document(p_type text, p_status text) returns boolean
language sql immutable set search_path = public, pg_temp
as $$ select p_status = 'cancelled' or (p_type in ('QT', 'IV') and p_status = 'draft') $$;

create or replace function public.validate_items(p_items jsonb) returns void
language plpgsql immutable set search_path = public, pg_temp
as $$
declare
  v_item jsonb;
  v_n bigint;
  v_qty numeric;
  v_price numeric;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'เอกสารต้องมีรายการอย่างน้อย 1 รายการ';
  end if;
  for v_item, v_n in select value, pos from jsonb_array_elements(p_items) with ordinality as e(value, pos) loop
    if btrim(coalesce(v_item ->> 'description', '')) = '' then
      raise exception 'รายการที่ %: กรุณากรอกรายละเอียด', v_n;
    end if;
    if btrim(coalesce(v_item ->> 'unit', '')) = '' then
      raise exception 'รายการที่ %: กรุณากรอกหน่วย', v_n;
    end if;
    v_qty := round(public.try_numeric(v_item ->> 'quantity'), 3);
    if v_qty is null or v_qty <= 0 then
      raise exception 'รายการที่ %: จำนวนต้องมากกว่า 0', v_n;
    end if;
    v_price := public.try_numeric(v_item ->> 'unit_price');
    if v_price is null or v_price < 0 then
      raise exception 'รายการที่ %: ราคาต้องไม่ติดลบ', v_n;
    end if;
  end loop;
end $$;

/** Writes validated items. amount = quantity x price rounded to satang (same as lib/calc.ts). */
create or replace function public.write_items(p_document uuid, p_items jsonb) returns void
language sql security definer set search_path = public, pg_temp
as $$
  insert into public.document_items
    (document_id, product_id, position, description, unit, quantity, unit_price, vat_applicable, amount)
  select p_document,
    (select p.id from public.products p where p.id = public.try_uuid(e.value ->> 'product_id')),
    e.pos,
    btrim(e.value ->> 'description'),
    btrim(e.value ->> 'unit'),
    round((e.value ->> 'quantity')::numeric, 3),
    round((e.value ->> 'unit_price')::numeric, 2),
    coalesce((e.value ->> 'vat_applicable')::boolean, false),
    round(round((e.value ->> 'quantity')::numeric, 3) * round((e.value ->> 'unit_price')::numeric, 2), 2)
  from jsonb_array_elements(p_items) with ordinality as e(value, pos)
$$;

/** VAT on vatable lines only, WHT on the pre-VAT subtotal, each rounded to satang. */
create or replace function public.refresh_totals(p_document uuid) returns void
language sql security definer set search_path = public, pg_temp
as $$
  with lines as (
    select coalesce(sum(amount), 0) as subtotal,
      coalesce(sum(amount) filter (where vat_applicable), 0) as vat_base
    from public.document_items where document_id = p_document
  ), t as (
    select l.subtotal,
      round(l.vat_base * d.vat_rate / 100, 2) as vat,
      round(l.subtotal * d.wht_rate / 100, 2) as wht
    from lines l, public.documents d where d.id = p_document
  )
  update public.documents d set
    subtotal = t.subtotal,
    vat_amount = t.vat,
    grand_total = t.subtotal + t.vat,
    wht_amount = t.wht,
    net_total = t.subtotal + t.vat - t.wht
  from t where d.id = p_document
$$;

create or replace function public.insert_document(
  p_company uuid, p_customer uuid, p_source uuid, p_type text, p_issue date, p_due date,
  p_vat numeric, p_wht numeric, p_notes text, p_items jsonb
) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  insert into public.documents
    (company_id, customer_id, source_document_id, type, doc_number, issue_date, due_date, vat_rate, wht_rate, notes)
  values
    (p_company, p_customer, p_source, p_type, public.next_doc_number(p_type, p_issue), p_issue, p_due, p_vat, p_wht, p_notes)
  returning id into v_id;
  perform public.write_items(v_id, p_items);
  perform public.refresh_totals(v_id);
  return v_id;
end $$;

-- ------------------------------------------------------------------------------ API: company

create or replace function public.save_company(p jsonb) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_name text := btrim(coalesce(p ->> 'name', ''));
  v_address text := btrim(coalesce(p ->> 'address', ''));
  v_tax_id text := btrim(coalesce(p ->> 'tax_id', ''));
  v_branch text := coalesce(nullif(btrim(coalesce(p ->> 'branch', '')), ''), 'สำนักงานใหญ่');
begin
  perform public.require_admin();
  if v_name = '' then raise exception 'กรุณากรอกชื่อบริษัท'; end if;
  if v_address = '' then raise exception 'กรุณากรอกที่อยู่บริษัท'; end if;
  if v_tax_id !~ '^[0-9]{13}$' then raise exception 'เลขผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก'; end if;

  perform pg_advisory_xact_lock(hashtext('companies_single'));
  select id into v_id from public.companies order by created_at, id limit 1;
  if v_id is null then
    insert into public.companies (name, address, tax_id, branch) values (v_name, v_address, v_tax_id, v_branch)
    returning id into v_id;
  end if;
  update public.companies set
    name = v_name, address = v_address, tax_id = v_tax_id, branch = v_branch,
    phone = nullif(p ->> 'phone', ''),
    email = nullif(p ->> 'email', ''),
    logo_url = nullif(p ->> 'logo_url', ''),
    bank_name = nullif(p ->> 'bank_name', ''),
    bank_account_name = nullif(p ->> 'bank_account_name', ''),
    bank_account_no = nullif(p ->> 'bank_account_no', ''),
    vat_registered = coalesce((p ->> 'vat_registered')::boolean, true)
  where id = v_id;
  -- One issuer: every document prints with the same, current details.
  update public.documents set company_id = v_id where company_id <> v_id;
  return v_id;
end $$;

-- ------------------------------------------------------------------------------ API: quotations & invoices

/** Creates (p_id null) or edits a QT/IV with its items. An edit keeps the number and status. */
create or replace function public.save_document(p_id uuid, p_doc jsonb, p_items jsonb) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_type text := p_doc ->> 'type';
  v_customer uuid := public.try_uuid(p_doc ->> 'customer_id');
  v_issue date;
  v_due date;
  v_vat numeric;
  v_wht numeric;
  v_notes text := nullif(btrim(coalesce(p_doc ->> 'notes', '')), '');
  v_company uuid;
  v_current record;
begin
  perform public.require_member();
  if v_type is null or v_type not in ('QT', 'IV') then raise exception 'ประเภทเอกสารไม่ถูกต้อง'; end if;
  if v_customer is null or not exists (select 1 from public.customers where id = v_customer) then
    raise exception 'กรุณาเลือกลูกค้า';
  end if;
  v_issue := public.parse_date(p_doc ->> 'issue_date');
  v_due := public.parse_date(p_doc ->> 'due_date');
  if v_due < v_issue then raise exception 'วันครบกำหนดต้องไม่ก่อนวันที่เอกสาร'; end if;
  v_vat := public.check_rate(p_doc ->> 'vat_rate', 'อัตรา VAT ');
  v_wht := public.check_rate(p_doc ->> 'wht_rate', 'อัตราหัก ณ ที่จ่าย ');
  perform public.validate_items(p_items);

  if p_id is null then
    select id into v_company from public.companies order by created_at, id limit 1;
    if v_company is null then raise exception 'ยังไม่มีข้อมูลบริษัทผู้ออกเอกสาร'; end if;
    return public.insert_document(v_company, v_customer, null, v_type, v_issue, v_due, v_vat, v_wht, v_notes, p_items);
  end if;

  perform 1 from public.documents where id = p_id for update;
  select * into v_current from public.document_summaries where id = p_id;
  if not found then raise exception 'ไม่พบเอกสาร'; end if;
  if v_current.type <> v_type then raise exception 'เปลี่ยนประเภทเอกสารไม่ได้'; end if;
  if public.edit_block_reason(v_current.type, v_current.status, v_current.has_invoice, v_current.has_tax_invoice) is not null then
    raise exception '%', public.edit_block_reason(v_current.type, v_current.status, v_current.has_invoice, v_current.has_tax_invoice);
  end if;

  update public.documents set customer_id = v_customer, issue_date = v_issue, due_date = v_due,
    vat_rate = v_vat, wht_rate = v_wht, notes = v_notes
  where id = p_id;
  delete from public.document_items where document_id = p_id;
  perform public.write_items(p_id, p_items);
  perform public.refresh_totals(p_id);
  return p_id;
end $$;

create or replace function public.set_document_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_doc record;
begin
  perform public.require_member();
  select type, status into v_doc from public.documents where id = p_id for update;
  if not found then raise exception 'ไม่พบเอกสาร'; end if;
  if p_status is null
     or p_status not in ('draft', 'sent', 'approved', 'paid', 'cancelled')
     or not public.can_change_status(v_doc.type, v_doc.status, p_status) then
    raise exception 'ไม่สามารถเปลี่ยนสถานะจาก % เป็น % ได้', v_doc.status, p_status;
  end if;
  if p_status = 'cancelled'
     and exists (select 1 from public.tax_invoices where invoice_id = p_id and status <> 'cancelled') then
    raise exception 'ใบแจ้งหนี้นี้ออกใบกำกับภาษีแล้ว กรุณายกเลิกใบกำกับภาษีก่อน';
  end if;
  update public.documents
  set status = p_status, paid_at = case when p_status = 'paid' then public.today_th() end
  where id = p_id;
end $$;

/** Copies an approved quotation into a new draft invoice and returns the invoice id. */
create or replace function public.convert_quotation_to_invoice(p_id uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_qt record;
  v_items jsonb;
  v_today date := public.today_th();
  v_term integer;
begin
  perform public.require_member();
  perform 1 from public.documents where id = p_id for update;
  select * into v_qt from public.documents where id = p_id;
  if not found then raise exception 'ไม่พบเอกสาร'; end if;
  if v_qt.type <> 'QT' or v_qt.status <> 'approved' then
    raise exception 'แปลงเป็นใบแจ้งหนี้ได้เฉพาะใบเสนอราคาที่อนุมัติแล้ว';
  end if;
  if exists (select 1 from public.documents where source_document_id = p_id and status <> 'cancelled') then
    raise exception 'ใบเสนอราคานี้ถูกแปลงเป็นใบแจ้งหนี้แล้ว';
  end if;

  select credit_term_days into v_term from public.customers where id = v_qt.customer_id;
  select jsonb_agg(jsonb_build_object(
      'product_id', product_id, 'description', description, 'unit', unit,
      'quantity', quantity, 'unit_price', unit_price, 'vat_applicable', vat_applicable
    ) order by position)
  into v_items
  from public.document_items where document_id = p_id;

  return public.insert_document(
    v_qt.company_id, v_qt.customer_id, v_qt.id, 'IV', v_today, v_today + v_term,
    v_qt.vat_rate, v_qt.wht_rate, v_qt.notes, coalesce(v_items, '[]'::jsonb)
  );
end $$;

-- ------------------------------------------------------------------------------ API: billing notes

/**
 * Invoices that can go on a billing note: issued and unpaid, and not already on another
 * active note. When editing, the note's own invoices are offered too.
 */
create or replace function public.billable_invoices(p_note uuid default null)
returns setof public.invoice_rows
language sql stable set search_path = public, pg_temp
as $$
  select v.* from public.invoice_rows v
  where (
      v.status in ('sent', 'approved') and not exists (
        select 1 from public.billing_note_items i join public.billing_notes b on b.id = i.billing_note_id
        where i.invoice_id = v.id and b.status <> 'cancelled' and b.id is distinct from p_note
      )
    )
    or v.id in (select invoice_id from public.billing_note_items where billing_note_id = p_note)
  order by v.issue_date, v.doc_number
$$;

create or replace function public.save_billing_note(p_id uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_customer uuid := public.try_uuid(p ->> 'customer_id');
  v_issue date;
  v_due date;
  v_notes text := nullif(btrim(coalesce(p ->> 'notes', '')), '');
  v_ids uuid[] := public.uuid_list(p -> 'invoice_ids');
  v_status text;
  v_company uuid;
  v_id uuid := p_id;
  v_invoice record;
  v_inv uuid;
begin
  perform public.require_member();
  if v_customer is null or not exists (select 1 from public.customers where id = v_customer) then
    raise exception 'กรุณาเลือกลูกค้า';
  end if;
  v_issue := public.parse_date(p ->> 'issue_date');
  v_due := public.parse_date(p ->> 'due_date');
  if v_due < v_issue then raise exception 'วันนัดชำระต้องไม่ก่อนวันที่วางบิล'; end if;
  if cardinality(v_ids) = 0 then raise exception 'กรุณาเลือกใบแจ้งหนี้อย่างน้อย 1 ใบ'; end if;

  if v_id is not null then
    select status into v_status from public.billing_notes where id = v_id for update;
    if not found then raise exception 'ไม่พบใบวางบิล'; end if;
    if v_status = 'cancelled' then raise exception 'ใบวางบิลที่ยกเลิกแล้วแก้ไขไม่ได้'; end if;
  end if;

  -- Lock the invoices so two billing notes cannot take the same one at once.
  perform 1 from public.documents where id = any (v_ids) order by id for update;
  foreach v_inv in array v_ids loop
    select * into v_invoice from public.billable_invoices(v_id) b where b.id = v_inv;
    if v_inv is null or not found then
      raise exception 'มีใบแจ้งหนี้ที่วางบิลไม่ได้ (ยังไม่ส่ง ชำระแล้ว หรืออยู่ในใบวางบิลอื่น)';
    end if;
    if v_invoice.customer_id <> v_customer then
      raise exception 'ใบแจ้งหนี้ % เป็นของลูกค้ารายอื่น', v_invoice.doc_number;
    end if;
  end loop;

  if v_id is not null then
    update public.billing_notes set customer_id = v_customer, issue_date = v_issue, due_date = v_due, notes = v_notes
    where id = v_id;
    delete from public.billing_note_items where billing_note_id = v_id;
  else
    select id into v_company from public.companies order by created_at, id limit 1;
    if v_company is null then raise exception 'ยังไม่มีข้อมูลบริษัทผู้ออกเอกสาร'; end if;
    insert into public.billing_notes (company_id, customer_id, doc_number, issue_date, due_date, notes)
    values (v_company, v_customer, public.next_doc_number('BL', v_issue), v_issue, v_due, v_notes)
    returning id into v_id;
  end if;

  insert into public.billing_note_items (billing_note_id, invoice_id, position)
  select v_id, x.id, x.pos from unnest(v_ids) with ordinality as x(id, pos);
  return v_id;
end $$;

/** Cancelling frees its invoices for another billing note. It cannot be undone. */
create or replace function public.cancel_billing_note(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  perform public.require_member();
  update public.billing_notes set status = 'cancelled' where id = p_id and status <> 'cancelled';
  if not found then raise exception 'ไม่พบใบวางบิล หรือถูกยกเลิกไปแล้ว'; end if;
end $$;

-- ------------------------------------------------------------------------------ API: receipts

/** Invoices a new receipt can pay: issued, and not already on an active receipt. */
create or replace function public.receivable_invoices()
returns setof public.invoice_rows
language sql stable set search_path = public, pg_temp
as $$
  select v.* from public.invoice_rows v
  where v.status in ('sent', 'approved', 'paid')
    and not exists (
      select 1 from public.receipt_items i join public.receipts r on r.id = i.receipt_id
      where i.invoice_id = v.id and r.status <> 'cancelled'
    )
  order by v.issue_date, v.doc_number
$$;

/**
 * Creates a receipt (p_id null) or edits its date, payment details and notes.
 * If the company is VAT registered the receipt is also a full tax invoice, unless its
 * invoices already have tax invoices issued on delivery (then it is a plain receipt).
 */
create or replace function public.save_receipt(p_id uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_customer uuid := public.try_uuid(p ->> 'customer_id');
  v_date date;
  v_method text := p ->> 'payment_method';
  v_ref text := nullif(btrim(coalesce(p ->> 'payment_ref', '')), '');
  v_notes text := nullif(btrim(coalesce(p ->> 'notes', '')), '');
  v_current record;
  v_ids uuid[];
  v_inv uuid;
  v_invoice record;
  v_with_tax integer := 0;
  v_company record;
  v_buyer record;
  v_is_tax boolean;
  v_id uuid;
begin
  perform public.require_member();
  if v_customer is null or not exists (select 1 from public.customers where id = v_customer) then
    raise exception 'กรุณาเลือกลูกค้า';
  end if;
  v_date := public.parse_date(p ->> 'receipt_date');
  if v_date > public.today_th() then raise exception 'วันที่รับเงินต้องไม่เป็นวันในอนาคต'; end if;
  if v_method is null or v_method not in ('cash', 'transfer', 'cheque', 'other') then
    raise exception 'กรุณาเลือกวิธีชำระเงิน';
  end if;

  if p_id is not null then
    select status, customer_id, receipt_date, is_tax_invoice into v_current
    from public.receipts where id = p_id for update;
    if not found then raise exception 'ไม่พบใบเสร็จรับเงิน'; end if;
    if v_current.status = 'cancelled' then raise exception 'ใบเสร็จที่ยกเลิกแล้วแก้ไขไม่ได้'; end if;
    if v_current.customer_id <> v_customer then
      raise exception 'เปลี่ยนลูกค้าของใบเสร็จไม่ได้ ให้ยกเลิกแล้วออกใบใหม่';
    end if;
    if v_current.is_tax_invoice and v_current.receipt_date <> v_date then
      raise exception 'วันที่ของใบกำกับภาษีแก้ไขไม่ได้ ให้ยกเลิกแล้วออกใบใหม่';
    end if;
    update public.receipts set receipt_date = v_date, payment_method = v_method, payment_ref = v_ref, notes = v_notes
    where id = p_id;
    -- The invoices were paid on the receipt date.
    update public.documents set paid_at = v_date
    where id in (select invoice_id from public.receipt_items where receipt_id = p_id);
    return p_id;
  end if;

  v_ids := public.uuid_list(p -> 'invoice_ids');
  if cardinality(v_ids) = 0 then raise exception 'กรุณาเลือกใบแจ้งหนี้อย่างน้อย 1 ใบ'; end if;
  perform 1 from public.documents where id = any (v_ids) order by id for update;
  foreach v_inv in array v_ids loop
    select * into v_invoice from public.receivable_invoices() r where r.id = v_inv;
    if v_inv is null or not found then
      raise exception 'มีใบแจ้งหนี้ที่ออกใบเสร็จไม่ได้ (ยังไม่ส่ง ยกเลิกแล้ว หรือมีใบเสร็จอยู่แล้ว)';
    end if;
    if v_invoice.customer_id <> v_customer then
      raise exception 'ใบแจ้งหนี้ % เป็นของลูกค้ารายอื่น', v_invoice.doc_number;
    end if;
    if v_invoice.issue_date > v_date then
      raise exception 'วันที่รับเงินต้องไม่ก่อนวันที่ของใบแจ้งหนี้ %', v_invoice.doc_number;
    end if;
    if v_invoice.has_tax_invoice then v_with_tax := v_with_tax + 1; end if;
  end loop;
  if v_with_tax > 0 and v_with_tax < cardinality(v_ids) then
    raise exception 'ใบแจ้งหนี้ที่ออกใบกำกับภาษีแล้วกับที่ยังไม่ได้ออก ต้องออกใบเสร็จแยกกัน';
  end if;

  select * into v_company from public.companies order by created_at, id limit 1;
  if not found then raise exception 'ยังไม่มีข้อมูลบริษัทผู้ออกเอกสาร'; end if;
  select * into v_buyer from public.customers where id = v_customer;
  -- VAT was already invoiced on delivery, so this receipt must not be a second tax invoice.
  v_is_tax := v_company.vat_registered and v_with_tax = 0;

  insert into public.receipts (company_id, customer_id, doc_number, receipt_date, payment_method, payment_ref,
    notes, is_tax_invoice, seller_snapshot, buyer_snapshot)
  values (
    v_company.id, v_customer, public.next_doc_number('RC', v_date), v_date, v_method, v_ref, v_notes, v_is_tax,
    case when v_is_tax then public.party(v_company.name, v_company.address, v_company.tax_id, v_company.branch) end,
    case when v_is_tax then public.party(v_buyer.name, v_buyer.address, v_buyer.tax_id, v_buyer.branch) end
  )
  returning id into v_id;

  insert into public.receipt_items (receipt_id, invoice_id, position, prev_status, prev_paid_at)
  select v_id, d.id, x.pos, d.status, d.paid_at
  from unnest(v_ids) with ordinality as x(id, pos) join public.documents d on d.id = x.id;
  update public.documents set status = 'paid', paid_at = v_date where id = any (v_ids);
  return v_id;
end $$;

/** Cancels a receipt and puts each invoice back the way it was before the receipt. */
create or replace function public.cancel_receipt(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  perform public.require_member();
  update public.receipts set status = 'cancelled' where id = p_id and status <> 'cancelled';
  if not found then raise exception 'ไม่พบใบเสร็จรับเงิน หรือถูกยกเลิกไปแล้ว'; end if;
  update public.documents d set status = i.prev_status, paid_at = i.prev_paid_at
  from public.receipt_items i
  where i.receipt_id = p_id and i.invoice_id = d.id and d.status = 'paid';
end $$;

-- ------------------------------------------------------------------------------ API: tax invoices on delivery

/** Why a tax invoice cannot be issued for this invoice now, or null when it can. */
create or replace function public.tax_invoice_block_reason(p_invoice uuid) returns text
language plpgsql stable set search_path = public, pg_temp
as $$
declare
  v_vat boolean;
  v_inv record;
begin
  select vat_registered into v_vat from public.companies order by created_at, id limit 1;
  if not coalesce(v_vat, false) then return 'บริษัทยังไม่ได้ตั้งค่าเป็นผู้จดทะเบียนภาษีมูลค่าเพิ่ม'; end if;
  select * into v_inv from public.document_summaries where id = p_invoice;
  if not found or v_inv.type <> 'IV' then return 'ไม่พบใบแจ้งหนี้'; end if;
  if v_inv.status = 'draft' then return 'ต้องส่งใบแจ้งหนี้ก่อนจึงจะออกใบกำกับภาษีได้'; end if;
  if v_inv.status = 'cancelled' then return 'ใบแจ้งหนี้นี้ถูกยกเลิกแล้ว'; end if;
  if v_inv.has_tax_invoice then return 'ใบแจ้งหนี้นี้ออกใบกำกับภาษีแล้ว'; end if;
  if exists (
    select 1 from public.receipt_items i join public.receipts r on r.id = i.receipt_id
    where i.invoice_id = p_invoice and r.status <> 'cancelled' and r.is_tax_invoice
  ) then
    return 'ใบแจ้งหนี้นี้มีใบเสร็จรับเงิน/ใบกำกับภาษีแล้ว';
  end if;
  return null;
end $$;

create or replace function public.issue_tax_invoice(p_invoice uuid, p_tax_date text, p_notes text) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_block text;
  v_date date;
  v_inv record;
  v_company record;
  v_buyer record;
  v_id uuid;
begin
  perform public.require_member();
  perform 1 from public.documents where id = p_invoice for update;
  v_block := public.tax_invoice_block_reason(p_invoice);
  if v_block is not null then raise exception '%', v_block; end if;
  v_date := public.parse_date(p_tax_date);
  if v_date > public.today_th() then raise exception 'วันที่ส่งมอบต้องไม่เป็นวันในอนาคต'; end if;
  select * into v_inv from public.documents where id = p_invoice;
  if v_date < v_inv.issue_date then raise exception 'วันที่ส่งมอบต้องไม่ก่อนวันที่ของใบแจ้งหนี้'; end if;

  select * into v_company from public.companies order by created_at, id limit 1;
  select * into v_buyer from public.customers where id = v_inv.customer_id;
  insert into public.tax_invoices (company_id, invoice_id, doc_number, tax_date, notes, seller_snapshot, buyer_snapshot)
  values (
    v_company.id, p_invoice, public.next_doc_number('TX', v_date), v_date,
    nullif(btrim(coalesce(p_notes, '')), ''),
    public.party(v_company.name, v_company.address, v_company.tax_id, v_company.branch),
    public.party(v_buyer.name, v_buyer.address, v_buyer.tax_id, v_buyer.branch)
  )
  returning id into v_id;
  return v_id;
end $$;

/** Cancelling unlocks the invoice; a new tax invoice can then be issued. */
create or replace function public.cancel_tax_invoice(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  perform public.require_member();
  update public.tax_invoices set status = 'cancelled' where id = p_id and status <> 'cancelled';
  if not found then raise exception 'ไม่พบใบกำกับภาษี หรือถูกยกเลิกไปแล้ว'; end if;
end $$;

-- ------------------------------------------------------------------------------ API: delete (admin)

/**
 * Admin only. Deletes a draft or cancelled document of any type. A quotation or invoice
 * that another document still refers to must have that document deleted first.
 */
create or replace function public.delete_document(p_type text, p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_status text;
  v_refs text;
begin
  perform public.require_admin();
  if p_type in ('QT', 'IV') then
    select status into v_status from public.documents where id = p_id and type = p_type for update;
  elsif p_type = 'BL' then
    select status into v_status from public.billing_notes where id = p_id for update;
  elsif p_type = 'RC' then
    select status into v_status from public.receipts where id = p_id for update;
  elsif p_type = 'TX' then
    select status into v_status from public.tax_invoices where id = p_id for update;
  else
    raise exception 'ประเภทเอกสารไม่ถูกต้อง';
  end if;
  if v_status is null then raise exception 'ไม่พบเอกสารนี้ หรือถูกลบไปแล้ว'; end if;
  if not public.can_delete_document(p_type, v_status) then
    raise exception 'ลบได้เฉพาะเอกสารฉบับร่างหรือที่ยกเลิกแล้วเท่านั้น';
  end if;

  if p_type in ('QT', 'IV') then
    select string_agg(doc_number, ', ') into v_refs from (
      select doc_number from public.documents where source_document_id = p_id
      union all
      select b.doc_number from public.billing_note_items i join public.billing_notes b on b.id = i.billing_note_id
        where i.invoice_id = p_id
      union all
      select r.doc_number from public.receipt_items i join public.receipts r on r.id = i.receipt_id
        where i.invoice_id = p_id
      union all
      select doc_number from public.tax_invoices where invoice_id = p_id
    ) refs;
    if v_refs is not null then
      raise exception 'ลบไม่ได้ เพราะมีเอกสารอ้างอิงอยู่ (%) กรุณาลบเอกสารนั้นก่อน', v_refs;
    end if;
    delete from public.documents where id = p_id;
  elsif p_type = 'BL' then
    delete from public.billing_notes where id = p_id;
  elsif p_type = 'RC' then
    delete from public.receipts where id = p_id;
  else
    delete from public.tax_invoices where id = p_id;
  end if;
end $$;

-- ------------------------------------------------------------------------------ API: dashboard

/**
 * sales   = pre-VAT value of issued invoices (sent, approved, paid), by issue month
 * arrears = net receivable (after WHT) on invoices still unpaid; overdue is a subset
 */
create or replace function public.dashboard_summary() returns jsonb
language sql stable set search_path = public, pg_temp
as $$
  with months as (
    select (date_trunc('month', public.today_th()) - make_interval(months => i))::date as month, i
    from generate_series(0, 5) as i
  ), sales as (
    select m.month, m.i, coalesce(sum(d.subtotal), 0) as sales
    from months m
    left join public.documents d
      on d.type = 'IV' and d.status in ('sent', 'approved', 'paid')
     and date_trunc('month', d.issue_date)::date = m.month
    group by m.month, m.i
  ), recv as (
    select count(*)::int as arrears_count,
      coalesce(sum(net_total), 0) as arrears_amount,
      (count(*) filter (where due_date < public.today_th()))::int as overdue_count,
      coalesce(sum(net_total) filter (where due_date < public.today_th()), 0) as overdue_amount
    from public.documents where type = 'IV' and status in ('sent', 'approved')
  )
  select jsonb_build_object(
    'sales_this_month', (select sales from sales where i = 0),
    'sales_last_month', (select sales from sales where i = 1),
    'arrears_amount', r.arrears_amount,
    'arrears_count', r.arrears_count,
    'overdue_amount', r.overdue_amount,
    'overdue_count', r.overdue_count,
    'monthly_sales', (
      select jsonb_agg(jsonb_build_object('month', to_char(month, 'YYYY-MM-DD'), 'sales', sales) order by month)
      from sales
    )
  )
  from recv r
$$;

-- ------------------------------------------------------------------------------ row level security

alter table public.profiles           enable row level security;
alter table public.companies          enable row level security;
alter table public.customers          enable row level security;
alter table public.products           enable row level security;
alter table public.documents          enable row level security;
alter table public.document_items     enable row level security;
alter table public.billing_notes      enable row level security;
alter table public.billing_note_items enable row level security;
alter table public.receipts           enable row level security;
alter table public.receipt_items      enable row level security;
alter table public.tax_invoices       enable row level security;
alter table public.document_sequences enable row level security; -- no policies: functions only

drop policy if exists "own profile or admin" on public.profiles;
create policy "own profile or admin" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());

do $$
declare
  t text;
begin
  foreach t in array array['companies', 'customers', 'products', 'documents', 'document_items',
    'billing_notes', 'billing_note_items', 'receipts', 'receipt_items', 'tax_invoices'] loop
    execute format('drop policy if exists "members read" on public.%I', t);
    execute format('create policy "members read" on public.%I for select to authenticated using (public.is_member())', t);
  end loop;
end $$;

-- Customers and products are edited directly by members; only admins delete.
drop policy if exists "members insert" on public.customers;
drop policy if exists "members update" on public.customers;
drop policy if exists "admins delete" on public.customers;
create policy "members insert" on public.customers for insert to authenticated with check (public.is_member());
create policy "members update" on public.customers for update to authenticated
  using (public.is_member()) with check (public.is_member());
create policy "admins delete" on public.customers for delete to authenticated using (public.is_admin());

drop policy if exists "members insert" on public.products;
drop policy if exists "members update" on public.products;
drop policy if exists "admins delete" on public.products;
create policy "members insert" on public.products for insert to authenticated with check (public.is_member());
create policy "members update" on public.products for update to authenticated
  using (public.is_member()) with check (public.is_member());
create policy "admins delete" on public.products for delete to authenticated using (public.is_admin());

-- ------------------------------------------------------------------------------ privileges

revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from public, anon;
grant usage on schema public to authenticated;
grant select on all tables in schema public to authenticated;
grant insert, update, delete on public.customers, public.products to authenticated;

-- Callable through the API by signed-in users (each checks the role itself).
grant execute on function
  public.today_th(), public.app_role(), public.is_member(), public.is_admin(),
  public.set_user_role(uuid, text),
  public.save_company(jsonb),
  public.save_document(uuid, jsonb, jsonb),
  public.set_document_status(uuid, text),
  public.convert_quotation_to_invoice(uuid),
  public.billable_invoices(uuid),
  public.save_billing_note(uuid, jsonb),
  public.cancel_billing_note(uuid),
  public.receivable_invoices(),
  public.save_receipt(uuid, jsonb),
  public.cancel_receipt(uuid),
  public.tax_invoice_block_reason(uuid),
  public.issue_tax_invoice(uuid, text, text),
  public.cancel_tax_invoice(uuid),
  public.delete_document(text, uuid),
  public.dashboard_summary(),
  -- Used inside views and the functions above.
  public.edit_block_reason(text, text, boolean, boolean),
  public.can_change_status(text, text, text),
  public.can_delete_document(text, text)
to authenticated;

-- Supabase grants new functions to anon by default; keep them closed.
alter default privileges in schema public revoke execute on functions from public, anon;
