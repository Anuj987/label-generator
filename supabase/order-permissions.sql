-- =============================================================================
-- National Traders Operations Console — Order permissions (Admin delete) FIXED
-- =============================================================================
-- MANUAL ONLY: re-run in Supabase SQL Editor for project bwpmuknevcoshtufaytk.
-- Fixes prior delete_nt_order crash when packing_checklist_items has no order_id.
-- =============================================================================

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

revoke all on function public.current_nt_user_role() from public;
grant execute on function public.current_nt_user_role() to authenticated;

create or replace function public.delete_nt_order(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_existing uuid;
begin
  v_role := public.current_nt_user_role();
  if v_role is distinct from 'admin' then
    raise exception 'Only admin can delete orders';
  end if;

  select id into v_existing from public.orders where id = p_order_id;
  if v_existing is null then
    raise exception 'Order not found';
  end if;

  -- Always remove line items for this order.
  delete from public.order_items where order_id = p_order_id;

  -- Delete child rows only when the table AND order_id column exist.
  if to_regclass('public.packing_events') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'packing_events' and column_name = 'order_id'
     )
  then
    execute 'delete from public.packing_events where order_id = $1' using p_order_id;
  end if;

  if to_regclass('public.delivery_events') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'delivery_events' and column_name = 'order_id'
     )
  then
    execute 'delete from public.delivery_events where order_id = $1' using p_order_id;
  end if;

  if to_regclass('public.delivery_documents') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'delivery_documents' and column_name = 'order_id'
     )
  then
    execute 'delete from public.delivery_documents where order_id = $1' using p_order_id;
  end if;

  if to_regclass('public.packing_checklist_items') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'packing_checklist_items' and column_name = 'order_id'
     )
  then
    execute 'delete from public.packing_checklist_items where order_id = $1' using p_order_id;
  end if;

  if to_regclass('public.audit_logs') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'audit_logs' and column_name = 'order_id'
     )
  then
    execute 'delete from public.audit_logs where order_id = $1' using p_order_id;
  end if;

  -- Detach payments if they reference order_id — never delete payment rows.
  if to_regclass('public.payments') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'payments' and column_name = 'order_id'
     )
  then
    execute 'update public.payments set order_id = null where order_id = $1' using p_order_id;
  end if;

  delete from public.orders where id = p_order_id;
  return p_order_id;
end;
$$;

revoke all on function public.delete_nt_order(uuid) from public;
grant execute on function public.delete_nt_order(uuid) to authenticated;

alter table public.orders enable row level security;

drop policy if exists "orders_delete_admin" on public.orders;
create policy "orders_delete_admin"
  on public.orders
  for delete
  to authenticated
  using (public.current_nt_user_role() = 'admin');
