-- Allow the Operations Console (publishable key) to record payments.
-- Run once in Supabase SQL Editor for project bwpmuknevcoshtufaytk.

alter table public.payments enable row level security;

drop policy if exists "payments_select_public" on public.payments;
drop policy if exists "payments_insert_public" on public.payments;
drop policy if exists "payments_update_public" on public.payments;

create policy "payments_select_public"
  on public.payments for select
  using (true);

create policy "payments_insert_public"
  on public.payments for insert
  with check (true);

create policy "payments_update_public"
  on public.payments for update
  using (true)
  with check (true);
