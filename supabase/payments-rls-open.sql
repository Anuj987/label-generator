-- Payments: allow Operations Console staff to read/write via publishable key + Auth.
-- Run once in Supabase SQL Editor for project bwpmuknevcoshtufaytk.
-- App saves via public.record_nt_payment(...); these policies help SELECT after save.

alter table public.payments enable row level security;

drop policy if exists "payments_select_public" on public.payments;
drop policy if exists "payments_insert_public" on public.payments;
drop policy if exists "payments_update_public" on public.payments;
drop policy if exists "payments readable" on public.payments;
drop policy if exists "payments insert admin delivery" on public.payments;

create policy "payments_select_authenticated"
  on public.payments for select
  to authenticated, anon
  using (true);

create policy "payments_insert_staff"
  on public.payments for insert
  to authenticated, anon
  with check (true);

create policy "payments_update_staff"
  on public.payments for update
  to authenticated, anon
  using (true)
  with check (true);
