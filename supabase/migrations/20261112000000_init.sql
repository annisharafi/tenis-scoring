-- Fair and Fun: one social tennis session, end to end.
--
-- Browsers read sessions, players, rounds, matches and points through row-level security and
-- write only live points. Every other change (joining, the survey, starting, scores, finishing)
-- goes through the `game` edge function, which runs the shared rules in src/logic and saves the
-- result with apply_plan. Ratings and survey answers live in player_secrets, which no browser
-- can read, so in hidden mode they never reach a phone (not even through realtime).

-- Tables -------------------------------------------------------------------------------------

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^fun-[a-z0-9]{4}$'),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  host_user_id uuid not null default auth.uid() references auth.users on delete cascade,
  courts int not null check (courts between 1 and 6),
  minutes int not null check (minutes in (60, 90, 120, 150, 180)),
  game_system text not null check (game_system in ('sudden', 'advantage')),
  status text not null default 'open' check (status in ('open', 'playing', 'finished')),
  -- Bumped by every saved plan and every match going live; apply_plan refuses stale plans.
  version int not null default 0,
  created_at timestamptz not null default now()
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 30),
  survey_done boolean not null default false,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  unique (session_id, user_id)
);
-- Names are unique per session, ignoring case and surrounding spaces.
create unique index players_name_per_session on public.players (session_id, lower(btrim(name)));

create table public.player_secrets (
  player_id uuid primary key references public.players on delete cascade,
  session_id uuid not null references public.sessions on delete cascade,
  survey jsonb,
  start_rating numeric not null,
  rating numeric not null,
  matches_rated int not null default 0
);

create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions on delete cascade,
  number int not null,
  state text not null check (state in ('locked', 'planned', 'done')),
  resting uuid[] not null default '{}',
  unique (session_id, number)
);

create table public.matches (
  id uuid primary key,
  session_id uuid not null references public.sessions on delete cascade,
  round_id uuid not null references public.rounds on delete cascade,
  court int not null,
  team_a uuid[] not null,
  team_b uuid[] not null,
  games_a int,
  games_b int,
  status text not null default 'planned' check (status in ('planned', 'live', 'done'))
);
create index matches_round on public.matches (round_id);
create index matches_session on public.matches (session_id);

-- One row per live tap, in tap order; undo deletes the last row.
create table public.points (
  id bigint generated always as identity primary key,
  match_id uuid not null references public.matches on delete cascade,
  session_id uuid not null references public.sessions on delete cascade,
  team text not null check (team in ('a', 'b')),
  created_at timestamptz not null default now()
);
create index points_match on public.points (match_id, id);

-- Access helpers (security definer so policies can look at players without recursing) -----

create function public.is_member(sid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.players where session_id = sid and user_id = auth.uid())
    or exists (select 1 from public.sessions where id = sid and host_user_id = auth.uid())
$$;

-- Live counting: the host, or a player on that court, while the match's round is current.
create function public.can_count(mid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.matches m
    join public.rounds r on r.id = m.round_id
    join public.sessions s on s.id = m.session_id
    where m.id = mid
      and r.state = 'locked'
      and m.status <> 'done'
      and s.status = 'playing'
      and (
        s.host_user_id = auth.uid()
        or exists (
          select 1 from public.players p
          where p.session_id = m.session_id and p.user_id = auth.uid()
            and (p.id = any (m.team_a) or p.id = any (m.team_b))
        )
      )
  )
$$;

-- Row-level security -------------------------------------------------------------------------

alter table public.sessions enable row level security;
alter table public.players enable row level security;
alter table public.player_secrets enable row level security; -- no policies: server only
alter table public.rounds enable row level security;
alter table public.matches enable row level security;
alter table public.points enable row level security;

-- Anyone signed in (guests sign in anonymously) can open a join link by its code.
create policy "read sessions" on public.sessions for select to authenticated using (true);
-- The creator becomes the host; a new session always starts open.
create policy "create sessions" on public.sessions for insert to authenticated
  with check (host_user_id = auth.uid() and status = 'open' and version = 0);

create policy "members read players" on public.players for select to authenticated using (public.is_member(session_id));
create policy "members read rounds" on public.rounds for select to authenticated using (public.is_member(session_id));
create policy "members read matches" on public.matches for select to authenticated using (public.is_member(session_id));
create policy "members read points" on public.points for select to authenticated using (public.is_member(session_id));

create policy "count points" on public.points for insert to authenticated
  with check (public.can_count(match_id) and session_id = (select m.session_id from public.matches m where m.id = match_id));
create policy "undo points" on public.points for delete to authenticated using (public.can_count(match_id));

-- The first tap marks the match live, so the current round stops changing. -------------------

create function public.mark_match_live() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.matches set status = 'live' where id = new.match_id and status = 'planned';
  if found then
    update public.sessions set version = version + 1 where id = new.session_id;
  end if;
  return new;
end
$$;

create trigger points_mark_live after insert on public.points
  for each row execute function public.mark_match_live();

-- Saving a plan (edge function only) ---------------------------------------------------------
--
-- Writes the whole outcome of one action in one transaction: session status, every round and
-- match, and current ratings. Returns false without writing when `expected_version` is stale,
-- so the caller reloads, recomputes and tries again.
--
-- p_rounds:  [{ number, state, resting: [uuid], matches: [{ id, court, teamA: [uuid], teamB: [uuid],
--              gamesA, gamesB, status }] }]
-- p_ratings: [{ id, rating, matchesRated }]

create function public.apply_plan(
  p_session uuid,
  expected_version int,
  p_status text,
  p_rounds jsonb,
  p_ratings jsonb
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  current_version int;
  rnd jsonb;
  v_round_id uuid;
begin
  select version into current_version from public.sessions where id = p_session for update;
  if current_version is distinct from expected_version then
    return false;
  end if;

  update public.sessions set status = p_status, version = version + 1 where id = p_session;

  for rnd in select * from jsonb_array_elements(p_rounds) loop
    insert into public.rounds (session_id, number, state, resting)
    values (
      p_session,
      (rnd ->> 'number')::int,
      rnd ->> 'state',
      array(select jsonb_array_elements_text(rnd -> 'resting'))::uuid[]
    )
    on conflict (session_id, number) do update set state = excluded.state, resting = excluded.resting
    returning id into v_round_id;

    -- Matches re-paired away are removed; kept ones keep their id (and their live points).
    delete from public.matches
    where public.matches.round_id = v_round_id
      and id not in (select (m ->> 'id')::uuid from jsonb_array_elements(rnd -> 'matches') m);

    insert into public.matches (id, session_id, round_id, court, team_a, team_b, games_a, games_b, status)
    select
      (m ->> 'id')::uuid,
      p_session,
      v_round_id,
      (m ->> 'court')::int,
      array(select jsonb_array_elements_text(m -> 'teamA'))::uuid[],
      array(select jsonb_array_elements_text(m -> 'teamB'))::uuid[],
      (m ->> 'gamesA')::int,
      (m ->> 'gamesB')::int,
      m ->> 'status'
    from jsonb_array_elements(rnd -> 'matches') m
    on conflict (id) do update set
      court = excluded.court,
      team_a = excluded.team_a,
      team_b = excluded.team_b,
      games_a = excluded.games_a,
      games_b = excluded.games_b,
      status = excluded.status;
  end loop;

  update public.player_secrets s
  set rating = (r ->> 'rating')::numeric, matches_rated = (r ->> 'matchesRated')::int
  from jsonb_array_elements(p_ratings) r
  where s.player_id = (r ->> 'id')::uuid and s.session_id = p_session;

  return true;
end
$$;

revoke execute on function public.apply_plan(uuid, int, text, jsonb, jsonb) from public, anon, authenticated;

-- Realtime: every phone in the session sees joins, plans, scores and live points. -------------

alter publication supabase_realtime add table public.sessions, public.players, public.rounds, public.matches, public.points;
