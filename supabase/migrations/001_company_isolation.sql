-- =====================================================================================
-- Migration 001: separate business data per company.
--
-- For a project created with the schema from before this change (one shared company).
-- Run this file once in the SQL Editor, then run supabase/schema.sql again.
-- It runs in one transaction: if any step fails, nothing is changed.
--
-- Existing data:
--   * All existing customers, products, documents and running numbers go to the existing
--     company (the oldest one).
--   * Accounts: the oldest admin account becomes the super admin (manages accounts, has no
--     company and sees no company data). Every other approved account (admin / user) is
--     put in the existing company and keeps its role there. Pending accounts stay pending.
-- =====================================================================================

begin;

-- ------------------------------------------------------------------ companies
-- A super admin creates a company with a name only; its admin fills in the rest.
alter table public.companies alter column address set default '';
alter table public.companies alter column tax_id drop not null;
alter table public.companies drop constraint if exists companies_tax_id_check;
alter table public.companies add constraint companies_tax_id_check
  check (tax_id is null or tax_id ~ '^[0-9]{13}$');
alter table public.companies drop constraint if exists companies_name_check;
alter table public.companies add constraint companies_name_check check (btrim(name) <> '');

-- ------------------------------------------------------------------ profiles
alter table public.profiles add column if not exists company_id uuid references public.companies (id) on delete set null;
alter table public.profiles add column if not exists is_super_admin boolean not null default false;
create index if not exists profiles_company_idx on public.profiles (company_id);

-- Needed now for the column defaults below; schema.sql defines it the same way.
create or replace function public.app_company() returns uuid
language sql stable security definer set search_path = public, pg_temp
as $$ select company_id from public.profiles where id = auth.uid() and role in ('admin', 'user') $$;

-- ------------------------------------------------------------------ company of existing rows
alter table public.customers add column if not exists company_id uuid references public.companies (id) on delete restrict;
alter table public.products add column if not exists company_id uuid references public.companies (id) on delete restrict;
alter table public.document_sequences add column if not exists company_id uuid references public.companies (id) on delete cascade;

do $$
declare
  v_company uuid;
  v_super uuid;
begin
  select id into v_company from public.companies order by created_at, id limit 1;

  if v_company is null and (exists (select 1 from public.customers) or exists (select 1 from public.products)) then
    raise exception 'There are customers or products but no company. Create the company first.';
  end if;
  update public.customers set company_id = v_company where company_id is null;
  update public.products set company_id = v_company where company_id is null;
  -- Running numbers continue per company; without a company there are no documents yet.
  update public.document_sequences set company_id = v_company where company_id is null;
  delete from public.document_sequences where company_id is null;

  -- Accounts
  if not exists (select 1 from public.profiles where is_super_admin) then
    select id into v_super from public.profiles where role = 'admin' order by created_at, id limit 1;
    update public.profiles set is_super_admin = true, company_id = null where id = v_super;
  end if;
  update public.profiles set company_id = v_company
  where not is_super_admin and company_id is null and role in ('admin', 'user');
end $$;

alter table public.customers alter column company_id set not null;
alter table public.customers alter column company_id set default public.app_company();
alter table public.products alter column company_id set not null;
alter table public.products alter column company_id set default public.app_company();
alter table public.document_sequences alter column company_id set not null;

alter table public.profiles drop constraint if exists profiles_super_admin_no_company;
alter table public.profiles add constraint profiles_super_admin_no_company
  check (not (is_super_admin and company_id is not null));

-- ------------------------------------------------------------------ numbers are unique per company
alter table public.products drop constraint if exists products_code_key;
alter table public.products drop constraint if exists products_company_code_key;
alter table public.products add constraint products_company_code_key unique (company_id, code);

alter table public.documents drop constraint if exists documents_doc_number_key;
alter table public.documents drop constraint if exists documents_company_number_key;
alter table public.documents add constraint documents_company_number_key unique (company_id, doc_number);

alter table public.billing_notes drop constraint if exists billing_notes_doc_number_key;
alter table public.billing_notes drop constraint if exists billing_notes_company_number_key;
alter table public.billing_notes add constraint billing_notes_company_number_key unique (company_id, doc_number);

alter table public.receipts drop constraint if exists receipts_doc_number_key;
alter table public.receipts drop constraint if exists receipts_company_number_key;
alter table public.receipts add constraint receipts_company_number_key unique (company_id, doc_number);

alter table public.tax_invoices drop constraint if exists tax_invoices_doc_number_key;
alter table public.tax_invoices drop constraint if exists tax_invoices_company_number_key;
alter table public.tax_invoices add constraint tax_invoices_company_number_key unique (company_id, doc_number);

alter table public.document_sequences drop constraint if exists document_sequences_pkey;
alter table public.document_sequences add primary key (company_id, type, period);

commit;

-- Next: run supabase/schema.sql (new functions, row level security and privileges).
