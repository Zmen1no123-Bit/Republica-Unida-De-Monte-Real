-- RUMR — autenticação, aprovação manual e cargos
-- Execute no SQL Editor do Supabase depois de criar o projeto.
-- A primeira conta ADMIN é promovida manualmente no passo final do guia.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role text not null default 'participant'
    check (role in ('participant','president','congress','judge','minister','admin')),
  approval_status text not null default 'pending'
    check (approval_status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id)
);

alter table public.profiles enable row level security;
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;

create or replace function public.current_rumr_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.user_id = (select auth.uid())
    and p.approval_status = 'approved'
  limit 1;
$$;

revoke all on function public.current_rumr_role() from public;
grant execute on function public.current_rumr_role() to authenticated;

create or replace function public.create_pending_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', '')
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_rumr on auth.users;
create trigger on_auth_user_created_rumr
after insert on auth.users
for each row execute procedure public.create_pending_profile();

create policy "Read own profile"
on public.profiles for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Admins read all profiles"
on public.profiles for select
to authenticated
using ((select public.current_rumr_role()) = 'admin');

-- Não há política de UPDATE/INSERT para o navegador.
-- Assim, o próprio usuário não pode aprovar a conta nem trocar seu cargo.

create or replace function public.review_rumr_user(
  target_user_id uuid,
  decision text,
  assigned_role text default 'participant'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
     or (select public.current_rumr_role()) <> 'admin' then
    raise exception 'Apenas administradores aprovados podem revisar cadastros.';
  end if;

  if decision not in ('approved','rejected') then
    raise exception 'Decisão inválida.';
  end if;

  if assigned_role not in ('participant','president','congress','judge','minister') then
    raise exception 'Cargo inválido.';
  end if;

  update public.profiles
  set approval_status = decision,
      role = case when decision = 'approved' then assigned_role else 'participant' end,
      reviewed_at = now(),
      reviewed_by = (select auth.uid())
  where user_id = target_user_id;

  if not found then
    raise exception 'Cadastro não encontrado.';
  end if;
end;
$$;

revoke all on function public.review_rumr_user(uuid,text,text) from public;
grant execute on function public.review_rumr_user(uuid,text,text) to authenticated;

-- Conteúdo de decretos: leitura pública apenas para atos publicados.
create table if not exists public.decrees (
  id uuid primary key default gen_random_uuid(),
  decree_number text not null unique,
  title text not null,
  summary text not null default '',
  body text not null,
  status text not null default 'draft'
    check (status in ('draft','published','revoked')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

alter table public.decrees enable row level security;
revoke all on table public.decrees from anon, authenticated;
grant select on table public.decrees to anon, authenticated;
grant insert, update on table public.decrees to authenticated;

create policy "Public reads published decrees"
on public.decrees for select
to anon, authenticated
using (status = 'published');

create policy "Approved officials read all decrees"
on public.decrees for select
to authenticated
using (
  (select public.current_rumr_role()) in
  ('admin','president','congress','judge','minister')
);

create policy "Approved officials create own drafts"
on public.decrees for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and status = 'draft'
  and (select public.current_rumr_role()) in ('admin','president','minister')
);

create policy "Admins and presidents update decrees"
on public.decrees for update
to authenticated
using (
  (select public.current_rumr_role()) in ('admin','president')
)
with check (
  (select public.current_rumr_role()) in ('admin','president')
);

create index if not exists profiles_status_idx on public.profiles (approval_status);
create index if not exists decrees_status_date_idx on public.decrees (status, published_at desc);
