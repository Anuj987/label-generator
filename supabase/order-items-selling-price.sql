-- Prepared only. Do not execute until the matching application build is ready to deploy.
-- Nullable by design: existing order items remain unchanged with selling_price = NULL.
alter table public.order_items
  add column if not exists selling_price numeric null;
