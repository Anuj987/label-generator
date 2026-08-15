-- National Traders Operations Console
-- Supabase schema with RLS scaffolding

create extension if not exists "pgcrypto";

create type public.user_role as enum ('admin', 'packing', 'delivery');
create type public.order_status as enum (
  'new',
  'packing',
  'ready',
  'out_for_delivery',
  'delivered',
  'partial_delivery',
  'full_return'
);
create type public.priority_level as enum ('normal', 'urgent', 'very_urgent');
create type public.payment_mode as enum ('cash', 'upi', 'bank_transfer', 'cheque');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.user_role not null,
  created_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_person text not null,
  mobile text not null,
  address text not null,
  gst text,
  notes text,
  billing_source text,
  external_customer_id text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  invoice_number text not null,
  invoice_date date not null,
  delivery_date date not null,
  customer_id uuid not null references public.customers(id),
  priority public.priority_level not null default 'normal',
  notes text,
  status public.order_status not null default 'new',
  accepted_by uuid references public.profiles(id),
  packing_start_time timestamptz,
  packing_completed_time timestamptz,
  packing_duration_minutes integer,
  delivery_start_time timestamptz,
  delivery_completed_time timestamptz,
  delivery_outcome_notes text,
  return_reason text,
  billing_source text,
  external_invoice_id text,
  external_customer_id text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Snapshot fields keep historical order lines stable even after a future product master exists.
create table public.order_products (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_name text not null,
  description text,
  quantity numeric not null check (quantity > 0),
  unit text not null,
  purchase_price numeric,
  product_master_id uuid,
  created_at timestamptz not null default now()
);

create table public.packing_checklist_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  label text not null,
  kind text not null check (kind in ('general', 'product')),
  product_id uuid references public.order_products(id) on delete set null,
  completed boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.partial_delivery_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.order_products(id) on delete set null,
  product_name text not null,
  ordered_quantity numeric not null,
  delivered_quantity numeric not null,
  returned_quantity numeric not null,
  reason text,
  created_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  invoice_number text not null,
  invoice_date date not null,
  amount numeric not null check (amount > 0),
  mode public.payment_mode not null,
  order_id uuid references public.orders(id),
  notes text,
  collected_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  payment_id uuid references public.payments(id) on delete cascade,
  kind text not null,
  file_path text not null,
  file_name text not null,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check (order_id is not null or payment_id is not null)
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete set null,
  payment_id uuid references public.payments(id) on delete set null,
  actor_id uuid references public.profiles(id),
  actor_name text not null,
  action text not null,
  detail text not null,
  emoji text,
  created_at timestamptz not null default now()
);

create or replace function public.current_role()
returns public.user_role
language sql
stable
as $$
  select role from public.profiles where id = auth.uid()
$$;

alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_products enable row level security;
alter table public.packing_checklist_items enable row level security;
alter table public.partial_delivery_lines enable row level security;
alter table public.payments enable row level security;
alter table public.documents enable row level security;
alter table public.audit_events enable row level security;

create policy "profiles read own or admin"
  on public.profiles for select
  using (id = auth.uid() or public.current_role() = 'admin');

create policy "customers readable by authenticated"
  on public.customers for select
  to authenticated
  using (true);

create policy "customers writable by admin"
  on public.customers for all
  using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

create policy "orders readable by authenticated"
  on public.orders for select
  to authenticated
  using (true);

create policy "orders insert by admin"
  on public.orders for insert
  with check (public.current_role() = 'admin');

create policy "orders update by role workflow"
  on public.orders for update
  using (
    public.current_role() = 'admin'
    or public.current_role() = 'packing'
    or public.current_role() = 'delivery'
  );

create policy "order products readable"
  on public.order_products for select
  to authenticated
  using (true);

create policy "checklist readable"
  on public.packing_checklist_items for select
  to authenticated
  using (true);

create policy "checklist update packing"
  on public.packing_checklist_items for update
  using (public.current_role() = 'packing');

create policy "payments readable"
  on public.payments for select
  to authenticated
  using (true);

create policy "payments insert admin delivery"
  on public.payments for insert
  with check (public.current_role() in ('admin', 'delivery'));

create policy "documents readable"
  on public.documents for select
  to authenticated
  using (true);

create policy "documents insert authenticated roles"
  on public.documents for insert
  with check (public.current_role() in ('admin', 'packing', 'delivery'));

create policy "audit readable"
  on public.audit_events for select
  to authenticated
  using (true);

-- Storage bucket: operations-files (create as private in Supabase dashboard)
