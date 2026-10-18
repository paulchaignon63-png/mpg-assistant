-- Stockage clé → valeur du 11 parfait (abonnements push, fiabilité des
-- sources de compos, pronostics figés, état des alertes).
-- Accès uniquement côté serveur, avec la clé service_role : aucune policy
-- n'est ouverte aux clés publiques.
create table if not exists public.kv (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.kv enable row level security;

create index if not exists kv_key_prefix_idx on public.kv (key text_pattern_ops);
