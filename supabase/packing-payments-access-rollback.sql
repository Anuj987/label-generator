-- Safe rollback for packing-payments-access.sql.
-- Restores the exact pre-migration payment policies. The private bucket and
-- any proof objects are deliberately retained so rollback never deletes data.

begin;

drop policy if exists "payments_select_operations" on public.payments;
drop policy if exists "payments_insert_operations" on public.payments;

create policy "auth_cutover_payments_select"
  on public.payments for select to authenticated
  using ((select public.current_nt_user_role()) in ('admin', 'delivery'));

create policy "auth_cutover_payments_insert"
  on public.payments for insert to authenticated
  with check (
    (select public.current_nt_user_role()) in ('admin', 'delivery')
    and received_by = (select public.current_nt_user_id())
  );

drop policy if exists "payment_proofs_insert_own" on storage.objects;
drop policy if exists "payment_proofs_select_authorized" on storage.objects;
drop policy if exists "payment_proofs_delete_own_or_admin" on storage.objects;

commit;
