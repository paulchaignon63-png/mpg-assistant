-- Stockage clé → valeur de l'app « Le 11 parfait » (alertes push, précision
-- mesurée, pronostics figés). Accès uniquement côté serveur avec la clé
-- service_role : RLS activé sans aucune policy, et aucun droit pour les rôles
-- publics. Table préfixée car le projet Supabase est partagé avec d'autres apps.
create table if not exists public.onze_parfait_kv (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.onze_parfait_kv enable row level security;

revoke all on table public.onze_parfait_kv from anon, authenticated;

create index if not exists onze_parfait_kv_key_prefix_idx
  on public.onze_parfait_kv (key text_pattern_ops);
