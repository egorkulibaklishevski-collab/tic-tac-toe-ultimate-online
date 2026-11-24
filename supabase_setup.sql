-- TIC-TAC-TOE ULTIMATE ONLINE: Supabase SQL setup
-- Paste this whole file into Supabase -> SQL Editor -> New query -> Run.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  wins integer not null default 0,
  losses integer not null default 0,
  draws integer not null default 0,
  points integer not null default 0,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare uname text;
begin
  uname := coalesce(nullif(trim(new.raw_user_meta_data->>'username'),''), 'Player_' || substr(new.id::text,1,8));
  insert into public.profiles(id, username) values(new.id, uname)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create table if not exists public.parties (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host_id uuid not null references auth.users(id),
  board_size integer not null check(board_size in (3,5,10,15)),
  target integer not null,
  board jsonb not null,
  status text not null default 'waiting' check(status in ('waiting','playing','finished')),
  current_turn uuid references auth.users(id),
  winner_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.party_members (
  party_id uuid not null references public.parties(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null check(symbol in ('X','O')),
  joined_at timestamptz not null default now(),
  primary key(party_id,user_id),
  unique(party_id,symbol)
);

alter table public.profiles enable row level security;
alter table public.parties enable row level security;
alter table public.party_members enable row level security;

drop policy if exists "profiles readable" on public.profiles;
create policy "profiles readable" on public.profiles for select using (true);
drop policy if exists "profile owner update" on public.profiles;
create policy "profile owner update" on public.profiles for update using (auth.uid()=id) with check(auth.uid()=id);

drop policy if exists "party members can read party" on public.parties;
create policy "party members can read party" on public.parties for select using (
  exists(select 1 from public.party_members m where m.party_id=id and m.user_id=auth.uid())
);
drop policy if exists "members can read members" on public.party_members;
-- Each player can read their own membership row. This avoids recursive RLS policies.
create policy "members can read members" on public.party_members for select using (user_id=auth.uid());

create or replace function public.create_party(p_size integer)
returns uuid language plpgsql security definer set search_path=public
as $$
declare pid uuid; pcode text; t integer; initial jsonb;
begin
  if auth.uid() is null then raise exception 'Нужно войти в аккаунт'; end if;
  if p_size not in (3,5,10,15) then raise exception 'Неверный размер поля'; end if;
  t := case p_size when 3 then 3 when 5 then 4 when 10 then 5 else 7 end;
  pcode := upper(substr(encode(gen_random_bytes(5),'hex'),1,6));
  initial := (select jsonb_agg(''::text) from generate_series(1,p_size*p_size));
  insert into parties(code,host_id,board_size,target,board,status,current_turn)
  values(pcode,auth.uid(),p_size,t,initial,'waiting',auth.uid()) returning id into pid;
  insert into party_members(party_id,user_id,symbol) values(pid,auth.uid(),'X');
  return pid;
end;
$$;

create or replace function public.join_party(p_code text)
returns uuid language plpgsql security definer set search_path=public
as $$
declare p parties%rowtype; pid uuid;
begin
  if auth.uid() is null then raise exception 'Нужно войти в аккаунт'; end if;
  select * into p from parties where code=upper(trim(p_code)) for update;
  if not found then raise exception 'Комната не найдена'; end if;
  if p.status <> 'waiting' then raise exception 'Комната уже началась или завершена'; end if;
  if exists(select 1 from party_members where party_id=p.id and user_id=auth.uid()) then return p.id; end if;
  if (select count(*) from party_members where party_id=p.id)>=2 then raise exception 'Комната заполнена'; end if;
  insert into party_members(party_id,user_id,symbol) values(p.id,auth.uid(),'O');
  update parties set status='playing',current_turn=host_id where id=p.id;
  return p.id;
end;
$$;

create or replace function public.make_party_move(p_party uuid,p_index integer)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare p parties%rowtype; sym text; n integer; x integer; y integer; d integer; dx integer; dy integer; k integer; xx integer; yy integer; cnt integer; won boolean:=false; next_user uuid; new_board jsonb; cell text;
begin
  if auth.uid() is null then raise exception 'Нужно войти в аккаунт'; end if;
  select * into p from parties where id=p_party for update;
  if not found then raise exception 'Комната не найдена'; end if;
  if p.status <> 'playing' then raise exception 'Матч сейчас не активен'; end if;
  if p.current_turn <> auth.uid() then raise exception 'Сейчас ход другого игрока'; end if;
  select symbol into sym from party_members where party_id=p_party and user_id=auth.uid();
  if sym is null then raise exception 'Ты не участник этой комнаты'; end if;
  n:=p.board_size;
  if p_index<0 or p_index>=n*n then raise exception 'Неверная клетка'; end if;
  if p.board->>p_index <> '' then raise exception 'Клетка уже занята'; end if;
  new_board:=jsonb_set(p.board,array[p_index::text],to_jsonb(sym),false);
  x:=p_index%n; y:=p_index/n;
  for d in 1..4 loop
    if d=1 then dx:=1;dy:=0;
    elsif d=2 then dx:=0;dy:=1;
    elsif d=3 then dx:=1;dy:=1;
    else dx:=1;dy:=-1; end if;
    cnt:=1;
    for k in 1..(p.target-1) loop
      xx:=x+dx*k; yy:=y+dy*k;
      if xx<0 or yy<0 or xx>=n or yy>=n then exit; end if;
      if new_board->>(yy*n+xx)=sym then cnt:=cnt+1; else exit; end if;
    end loop;
    for k in 1..(p.target-1) loop
      xx:=x-dx*k; yy:=y-dy*k;
      if xx<0 or yy<0 or xx>=n or yy>=n then exit; end if;
      if new_board->>(yy*n+xx)=sym then cnt:=cnt+1; else exit; end if;
    end loop;
    if cnt>=p.target then won:=true; end if;
  end loop;
  if won then
    update parties set board=new_board,status='finished',winner_id=auth.uid(),current_turn=null where id=p_party;
    if sym='X' then
      update profiles set wins=wins+1,points=points+10 where id=auth.uid();
      update profiles set losses=losses+1 where id=(select user_id from party_members where party_id=p_party and symbol='O');
    else
      update profiles set wins=wins+1,points=points+10 where id=auth.uid();
      update profiles set losses=losses+1 where id=(select user_id from party_members where party_id=p_party and symbol='X');
    end if;
  elsif not exists(select 1 from jsonb_array_elements_text(new_board) as cells(value) where cells.value='') then
    update parties set board=new_board,status='finished',current_turn=null where id=p_party;
    update profiles set draws=draws+1,points=points+2 where id in (select user_id from party_members where party_id=p_party);
  else
    select user_id into next_user from party_members where party_id=p_party and user_id<>auth.uid() limit 1;
    update parties set board=new_board,current_turn=next_user where id=p_party;
  end if;
  return jsonb_build_object('ok',true);
end;
$$;

grant execute on function public.create_party(integer) to authenticated;
grant execute on function public.join_party(text) to authenticated;
grant execute on function public.make_party_move(uuid,integer) to authenticated;

-- Enable realtime updates for parties (safe to run once; ignore duplicate-publication errors).
do $$ begin
  alter publication supabase_realtime add table public.parties;
exception when duplicate_object then null;
when others then null;
end $$;
