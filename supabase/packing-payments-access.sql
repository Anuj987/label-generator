-- Focused Packing payment access and private payment-proof storage.
-- Prepared against the live auth_cutover_payments_* policies on 2026-10-26.
-- Do not apply after authenticated-role-rls.sql without first merging these
-- Packing rules into that final migration.

begin;

do $$
begin
  if to_regprocedure('public.current_nt_user_role()') is null
    or to_regprocedure('public.current_nt_user_id()') is null then
    raise exception 'Required National Traders role helpers are missing';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'payments'
      and policyname = 'auth_cutover_payments_select'
  ) or not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'payments'
      and policyname = 'auth_cutover_payments_insert'
  ) then
    raise exception 'Expected live payment policies were not found; review migration ordering';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'payments'
      and policyname not in ('auth_cutover_payments_select', 'auth_cutover_payments_insert')
  ) then
    raise exception 'Unexpected payment policies found; review before replacing them';
  end if;
end;
$$;

alter table public.payments enable row level security;

drop policy "auth_cutover_payments_select" on public.payments;
drop policy "auth_cutover_payments_insert" on public.payments;

create policy "payments_select_operations"
  on public.payments for select to authenticated
  using (
    (select public.current_nt_user_role()) in ('admin', 'delivery')
    or (
      (select public.current_nt_user_role()) = 'packing'
      and received_by = (select public.current_nt_user_id())
    )
  );

create policy "payments_insert_operations"
  on public.payments for insert to authenticated
  with check (
    (select public.current_nt_user_role()) in ('admin', 'packing', 'delivery')
    and received_by = (select public.current_nt_user_id())
  );

grant select, insert on table public.payments to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-proofs',
  'payment-proofs',
  false,
  10485760,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif'
  ]::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "payment_proofs_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'payment-proofs'
    and (storage.foldername(name))[1] = (select public.current_nt_user_id())::text
    and (select public.current_nt_user_role()) in ('admin', 'packing', 'delivery')
  );

create policy "payment_proofs_select_authorized"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'payment-proofs'
    and (
      (select public.current_nt_user_role()) in ('admin', 'delivery')
      or (
        (select public.current_nt_user_role()) = 'packing'
        and (storage.foldername(name))[1] = (select public.current_nt_user_id())::text
      )
    )
  );

create policy "payment_proofs_delete_own_or_admin"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'payment-proofs'
    and (
      (select public.current_nt_user_role()) = 'admin'
      or (
        (select public.current_nt_user_role()) in ('packing', 'delivery')
        and (storage.foldername(name))[1] = (select public.current_nt_user_id())::text
      )
    )
  );

commit;
