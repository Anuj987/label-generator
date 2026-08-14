# National Traders Operations Console

Mobile-first operations software for National Traders after billing is completed. Limited to Admin, Packing, and Delivery workflows — not ERP, inventory, billing, accounting, purchase, or GST software.

## Stack

- Next.js App Router
- React + TypeScript
- Tailwind CSS
- Supabase-ready Auth / Database / Storage schema

## Demo users

| Role | Name | Home |
| --- | --- | --- |
| Admin | Anuj | `/dashboard` |
| Packing | Somnath | `/packing` |
| Delivery | Mayur | `/delivery` |

## Workflow

`NEW` → accept → `PACKING` → checklist complete → `READY` → start delivery → `OUT FOR DELIVERY` → Delivered / Partial / Full Return

## Routes

- `/login`
- `/dashboard` (admin activity feed + counts)
- `/customers`
- `/orders`, `/orders/[orderId]`
- `/packing`
- `/delivery`
- `/payments`
- `/search`

## Local run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Demo mode uses in-browser persistence and role cookies so you can explore without Supabase credentials.

## Connect Supabase

1. Copy `.env.example` to `.env.local`
2. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Run `supabase/schema.sql`
4. Create Auth users for Anuj / Somnath / Mayur
5. Insert matching `profiles` rows with roles `admin`, `packing`, `delivery`
6. Create private Storage bucket `operations-files`
7. Replace demo login/provider with Supabase session + queries

## Verification

```bash
npm run lint
npm run build
```
