-- =============================================================================
-- National Traders Operations Console — Order permissions (Admin delete)
-- =============================================================================
-- MANUAL ONLY: run in Supabase SQL Editor for project bwpmuknevcoshtufaytk.
-- Do NOT execute from the app or CI.
--
-- Goals:
--   - Admin can DELETE any order (any status)
--   - Packing / Delivery cannot delete
--   - Does not delete customers or payment collection rows
--   - Cleans order-owned child rows before removing the order
--
-- Uses existing helpers (from expenses migration or equivalent):
--   public.current_nt_user_role()
-- =============================================================================

-- Ensure staff role helper exists (safe if already created).
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

-- -----------------------------------------------------------------------------
-- Admin-only order delete RPC (preferred path used by the app)
-- -----------------------------------------------------------------------------
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

  -- Child / event rows that belong to the order.
  -- Customers and payment collection records are NOT deleted.
  delete from public.order_items where order_id = p_order_id;

  if to_regclass('public.packing_checklist_items') is not null then
    execute 'delete from public.packing_checklist_items where order_id = $1' using p_order_id;
  end if;

  if to_regclass('public.packing_events') is not null then
    execute 'delete from public.packing_events where order_id = $1' using p_order_id;
  end if;

  if to_regclass('public.delivery_events') is not null then
    execute 'delete from public.delivery_events where order_id = $1' using p_order_id;
  end if;

  if to_regclass('public.delivery_documents') is not null then
    execute 'delete from public.delivery_documents where order_id = $1' using p_order_id;
  end if;

  if to_regclass('public.audit_logs') is not null then
    execute 'delete from public.audit_logs where order_id = $1' using p_order_id;
  end if;

  -- If payments reference an order_id column, detach only — do not delete payments.
  if to_regclass('public.payments') is not null
     and exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'payments'
         and column_name = 'order_id'
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

-- -----------------------------------------------------------------------------
-- RLS: authenticated users may DELETE orders only when role is admin
-- (defense in depth; app uses delete_nt_order RPC)
-- -----------------------------------------------------------------------------
alter table public.orders enable row level security;

drop policy if exists "orders_delete_admin" on public.orders;
create policy "orders_delete_admin"
  on public.orders
  for delete
  to authenticated
  using (public.current_nt_user_role() = 'admin');

-- Explicitly do NOT grant packing/delivery delete via open policies.
-- No USING (true) / WITH CHECK (true) for delete.
