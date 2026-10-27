-- Additive installation. Never drop existing user tables.
create table if not exists public.dva_families(id uuid primary key,code text not null unique,parent_salt text not null,parent_hash text not null,child_salt text not null,child_hash text not null,state jsonb not null,version bigint not null default 0,created_at timestamptz not null default now());
create table if not exists public.dva_sessions(token_hash text primary key,family_id uuid not null references public.dva_families(id) on delete cascade,role text not null check(role in ('parent','child')),expires_at timestamptz not null);
create table if not exists public.dva_assets(file_id text primary key,family_id uuid not null references public.dva_families(id) on delete cascade,mime text not null,created_at timestamptz not null default now());
create table if not exists public.dva_limits(key text primary key,count integer not null default 1,expires_at timestamptz not null);
alter table public.dva_families enable row level security;
alter table public.dva_sessions enable row level security;
alter table public.dva_assets enable row level security;
alter table public.dva_limits enable row level security;
revoke all on public.dva_families,public.dva_sessions,public.dva_assets,public.dva_limits from public;
create or replace function public.dva_rpc(p_action text,p_args jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb;n bigint;
begin
 case p_action
 when 'health' then return jsonb_build_object('ok',true,'schema',1);
 when 'register' then
  insert into public.dva_families(id,code,parent_salt,parent_hash,child_salt,child_hash,state) values((p_args->>'id')::uuid,p_args->>'code',p_args->>'parent_salt',p_args->>'parent_hash',p_args->>'child_salt',p_args->>'child_hash',p_args->'state');return jsonb_build_object('ok',true);
 when 'family' then select to_jsonb(f) into result from public.dva_families f where f.code=p_args->>'code';return result;
 when 'state' then select jsonb_build_object('state',f.state,'version',f.version) into result from public.dva_families f where f.id=(p_args->>'id')::uuid;return result;
 when 'cas' then
  update public.dva_families set state=p_args->'state',version=version+1 where id=(p_args->>'id')::uuid and version=(p_args->>'version')::bigint returning version into n;
  if n is null then return null;end if;return jsonb_build_object('version',n);
 when 'put_session' then
  delete from public.dva_sessions where expires_at<now();insert into public.dva_sessions(token_hash,family_id,role,expires_at) values(p_args->>'hash',(p_args->>'id')::uuid,p_args->>'role',to_timestamp((p_args->>'expires')::double precision/1000));return jsonb_build_object('ok',true);
 when 'session' then
  select jsonb_build_object('familyId',s.family_id,'role',s.role,'code',f.code) into result from public.dva_sessions s join public.dva_families f on f.id=s.family_id where s.token_hash=p_args->>'hash' and s.expires_at>now();return result;
 when 'logout' then delete from public.dva_sessions where token_hash=p_args->>'hash';return jsonb_build_object('ok',true);
 when 'rate' then
  delete from public.dva_limits where expires_at<now();insert into public.dva_limits(key,count,expires_at) values(p_args->>'key',1,to_timestamp((p_args->>'expires')::double precision/1000)) on conflict(key) do update set count=public.dva_limits.count+1 returning count into n;return jsonb_build_object('allowed',n<=(p_args->>'max')::integer);
 when 'asset_add' then
  if (select count(*) from public.dva_assets where family_id=(p_args->>'id')::uuid)>=500 then raise exception 'ASSET_LIMIT';end if;
  insert into public.dva_assets(file_id,family_id,mime) values(p_args->>'file',(p_args->>'id')::uuid,p_args->>'mime');return jsonb_build_object('ok',true);
 when 'assets' then select coalesce(jsonb_agg(jsonb_build_object('fileId',a.file_id,'mime',a.mime)),'[]'::jsonb) into result from public.dva_assets a where a.family_id=(p_args->>'id')::uuid;return result;
 else raise exception 'UNKNOWN_ACTION';end case;
end $$;
revoke all on function public.dva_rpc(text,jsonb) from public;
do $$begin
 if exists(select 1 from pg_roles where rolname='anon') then revoke all on public.dva_families,public.dva_sessions,public.dva_assets,public.dva_limits from anon;revoke all on function public.dva_rpc(text,jsonb) from anon;end if;
 if exists(select 1 from pg_roles where rolname='authenticated') then revoke all on public.dva_families,public.dva_sessions,public.dva_assets,public.dva_limits from authenticated;revoke all on function public.dva_rpc(text,jsonb) from authenticated;end if;
 if exists(select 1 from pg_roles where rolname='service_role') then grant usage on schema public to service_role;grant execute on function public.dva_rpc(text,jsonb) to service_role;end if;
end $$;
