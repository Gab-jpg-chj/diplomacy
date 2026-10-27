-- Parties en ligne de Diplomacy. À exécuter une fois dans Supabase (SQL Editor).
create table if not exists public.dip_games (
  code text primary key,
  game jsonb not null,
  submitted jsonb not null default '{}'::jsonb,
  version int not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.dip_games enable row level security;
-- aucune politique : la table n'est accessible que par les fonctions ci-dessous.

create or replace function public.dip_create(p_code text, p_game jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.dip_games(code, game) values (upper(p_code), p_game);
$$;

create or replace function public.dip_get(p_code text)
returns table(game jsonb, submitted jsonb, version int) language sql security definer set search_path = public as $$
  select g.game, g.submitted, g.version from public.dip_games g where g.code = upper(p_code);
$$;

create or replace function public.dip_submit(p_code text, p_player text, p_key text, p_orders jsonb)
returns void language sql security definer set search_path = public as $$
  update public.dip_games
     set submitted = submitted || jsonb_build_object(p_player, jsonb_build_object('k', p_key, 'o', p_orders)),
         updated_at = now()
   where code = upper(p_code) and p_player in ('W','E');
$$;

create or replace function public.dip_unsubmit(p_code text, p_player text)
returns void language sql security definer set search_path = public as $$
  update public.dip_games set submitted = submitted - p_player, updated_at = now()
   where code = upper(p_code) and p_player in ('W','E');
$$;

create or replace function public.dip_advance(p_code text, p_version int, p_game jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.dip_games
     set game = p_game, submitted = '{}'::jsonb, version = version + 1, updated_at = now()
   where code = upper(p_code) and version = p_version;
  get diagnostics n = row_count;
  return n = 1;
end $$;

revoke all on function public.dip_create(text, jsonb), public.dip_get(text), public.dip_submit(text, text, text, jsonb), public.dip_unsubmit(text, text), public.dip_advance(text, int, jsonb) from public;
grant execute on function public.dip_create(text, jsonb), public.dip_get(text), public.dip_submit(text, text, text, jsonb), public.dip_unsubmit(text, text), public.dip_advance(text, int, jsonb) to anon;
