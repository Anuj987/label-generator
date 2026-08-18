-- =============================================================================
-- National Traders Operations Console — Expenses
-- =============================================================================
-- MANUAL ONLY: run this in the Supabase SQL Editor for project bwpmuknevcoshtufaytk.
-- Do NOT execute from the app or CI.
--
-- Prerequisites (already on live):
--   - public.users (id, name, role, active, auth_user_id, …)
--   - Auth users linked via users.auth_user_id
--
-- This migration:
--   1) Ensures staff helper functions (users-based, not profiles)
--   2) Creates public.expenses + RLS
--   3) Creates private Storage bucket expense-receipts + policies
-- =============================================================================

create extension if not exists "pgcrypto";

-- Staff helpers keyed off public.users.auth_user_id (existing Auth linkage).
create or replace function public.current_nt_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.users
  where auth_user_id = auth.uid()
    and coalesce(active, true) = true
  limit 1;
$$;

create or replace function public.current_nt_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role::text
  from public.users
  where auth_user_id = auth.uid()
    and coalesce(active, true) = true
  limit 1;
$$;

revoke all on function public.current_nt_user_id() from public;
revoke all on function public.current_nt_user_role() from public;
grant execute on function public.current_nt_user_id() to authenticated;
grant execute on function public.current_nt_user_role() to authenticated;

-- -----------------------------------------------------------------------------
-- Table
-- -----------------------------------------------------------------------------
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  amount numeric not null check (amount > 0),
  expense_date date not null default (current_date),
  category text not null check (
    category in (
      'Fuel',
      'Transport',
      'Food',
      'Packing Material',
      'Loading/Unloading',
      'Other'
    )
  ),
  description text,
  submitted_by uuid not null references public.users (id),
  receipt_path text,
  receipt_file_name text,
  created_at timestamptz not null default now()
);

create index if not exists expenses_expense_date_idx
  on public.expenses (expense_date desc);

create index if not exists expenses_submitted_by_idx
  on public.expenses (submitted_by);

create index if not exists expenses_category_idx
  on public.expenses (category);

alter table public.expenses enable row level security;

-- Drop prior policy names if re-running this script.
drop policy if exists "expenses_select_own_or_admin" on public.expenses;
drop policy if exists "expenses_insert_own" on public.expenses;
drop policy if exists "expenses_update_own_or_admin" on public.expenses;
drop policy if exists "expenses_delete_own_or_admin" on public.expenses;

-- Admin: all rows. Packing/Delivery: only own rows.
create policy "expenses_select_own_or_admin"
  on public.expenses
  for select
  to authenticated
  using (
    public.current_nt_user_role() = 'admin'
    or submitted_by = public.current_nt_user_id()
  );

-- Insert only as the authenticated staff member (cannot spoof submitted_by).
create policy "expenses_insert_own"
  on public.expenses
  for insert
  to authenticated
  with check (
    submitted_by = public.current_nt_user_id()
    and public.current_nt_user_role() in ('admin', 'packing', 'delivery')
  );

-- Admin may update any; staff may update only their own (cannot reassign ownership).
create policy "expenses_update_own_or_admin"
  on public.expenses
  for update
  to authenticated
  using (
    public.current_nt_user_role() = 'admin'
    or submitted_by = public.current_nt_user_id()
  )
  with check (
    public.current_nt_user_role() = 'admin'
    or submitted_by = public.current_nt_user_id()
  );

-- Admin may delete any; staff may delete only their own.
create policy "expenses_delete_own_or_admin"
  on public.expenses
  for delete
  to authenticated
  using (
    public.current_nt_user_role() = 'admin'
    or submitted_by = public.current_nt_user_id()
  );

grant select, insert, update, delete on public.expenses to authenticated;

-- -----------------------------------------------------------------------------
-- Private Storage bucket for receipts (NOT public)
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'expense-receipts',
  'expense-receipts',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Object path layout: {users.id}/{expense_id}/{filename}
drop policy if exists "expense_receipts_select_own_or_admin" on storage.objects;
drop policy if exists "expense_receipts_insert_own" on storage.objects;
drop policy if exists "expense_receipts_update_own_or_admin" on storage.objects;
drop policy if exists "expense_receipts_delete_own_or_admin" on storage.objects;

create policy "expense_receipts_select_own_or_admin"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'expense-receipts'
    and (
      public.current_nt_user_role() = 'admin'
      or (storage.foldername(name))[1] = public.current_nt_user_id()::text
    )
  );

create policy "expense_receipts_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'expense-receipts'
    and (storage.foldername(name))[1] = public.current_nt_user_id()::text
    and public.current_nt_user_role() in ('admin', 'packing', 'delivery')
  );

create policy "expense_receipts_update_own_or_admin"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'expense-receipts'
    and (
      public.current_nt_user_role() = 'admin'
      or (storage.foldername(name))[1] = public.current_nt_user_id()::text
    )
  )
  with check (
    bucket_id = 'expense-receipts'
    and (
      public.current_nt_user_role() = 'admin'
      or (storage.foldername(name))[1] = public.current_nt_user_id()::text
    )
  );

create policy "expense_receipts_delete_own_or_admin"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'expense-receipts'
    and (
      public.current_nt_user_role() = 'admin'
      or (storage.foldername(name))[1] = public.current_nt_user_id()::text
    )
  );
