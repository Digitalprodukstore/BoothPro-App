-- BoothPro Midtrans dynamic QRIS notification ledger
-- Run once in the Supabase SQL Editor for the BoothPro project.
create table if not exists public.boothpro_payment_transactions (
  order_id text primary key,
  gross_amount numeric(12,2) not null,
  transaction_status text not null,
  payment_type text,
  fraud_status text,
  status_code text not null,
  updated_at timestamptz not null default now()
);
alter table public.boothpro_payment_transactions enable row level security;
-- No anon/authenticated policies are created. Only the server-side service role can read/write this table.
