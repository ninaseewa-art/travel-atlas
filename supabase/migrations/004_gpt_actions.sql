begin;
-- Dedicated, revocable capabilities. No service-role key or user password leaves Supabase.
create table public.gpt_connections (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces on delete cascade,
 owner_id uuid not null references auth.users on delete cascade,
 token_hash text not null unique, expires_at timestamptz not null,
 revoked_at timestamptz, last_used_at timestamptz,
 rate_window timestamptz not null default now(), rate_count integer not null default 0,
 unique(workspace_id,owner_id)
);
create table public.gpt_requests (
 connection_id uuid references public.gpt_connections on delete cascade,
 request_id text not null, payload_hash text not null, response jsonb not null,
 created_at timestamptz not null default now(), primary key(connection_id,request_id)
);
alter table public.gpt_connections enable row level security;
alter table public.gpt_requests enable row level security;
revoke all on public.gpt_connections,public.gpt_requests from public,anon,authenticated;
create function public.gpt_connection_status(w uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.is_member(w) then raise exception 'ACCESS_DENIED'; end if;
 return (select jsonb_build_object('active',revoked_at is null and expires_at>now(),'expires_at',expires_at,'last_used_at',last_used_at) from public.gpt_connections where workspace_id=w and owner_id=auth.uid());
end $$;
create function public.create_gpt_connection(w uuid) returns text language plpgsql security definer set search_path='' as $$
declare token text; begin
 if not public.is_member(w) then raise exception 'ACCESS_DENIED'; end if;
 token='atlas_'||replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
 insert into public.gpt_connections(workspace_id,owner_id,token_hash,expires_at)
 values(w,auth.uid(),encode(sha256(convert_to(token,'UTF8')),'hex'),now()+interval '90 days')
 on conflict(workspace_id,owner_id) do update set token_hash=excluded.token_hash,expires_at=excluded.expires_at,revoked_at=null,rate_count=0;
 return token;
end $$;
create function public.revoke_gpt_connection(w uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_member(w) then raise exception 'ACCESS_DENIED'; end if;
 update public.gpt_connections set revoked_at=now() where workspace_id=w and owner_id=auth.uid();
end $$;
revoke all on function public.gpt_connection_status(uuid),public.create_gpt_connection(uuid),public.revoke_gpt_connection(uuid) from public;
grant execute on function public.gpt_connection_status(uuid),public.create_gpt_connection(uuid),public.revoke_gpt_connection(uuid) to authenticated;

create function public.gpt_atlas(p_token text,p_action text,p_payload jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.gpt_connections; result jsonb; old_claim text; pid uuid; target uuid; row_data jsonb; v_request_id text; fingerprint text; cached public.gpt_requests; item jsonb; offset_n integer; begin
 if p_token is null or length(p_token)<>70 then raise exception 'INVALID_TOKEN'; end if;
 select * into c from public.gpt_connections where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') for update;
 if c.id is null or c.revoked_at is not null or c.expires_at<=now() or not exists(select 1 from public.memberships where workspace_id=c.workspace_id and user_id=c.owner_id) then raise exception 'INVALID_TOKEN'; end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>65536 then raise exception 'INVALID_INPUT'; end if;
 if c.rate_window>now()-interval '1 minute' and c.rate_count>=60 then raise exception 'RATE_LIMIT'; end if;
 update public.gpt_connections set last_used_at=now(),rate_count=case when rate_window<=now()-interval '1 minute' then 1 else rate_count+1 end,rate_window=case when rate_window<=now()-interval '1 minute' then now() else rate_window end where id=c.id;
 if p_action in ('save','create_collection') then
   v_request_id=p_payload->>'request_id';
   if v_request_id is null or length(v_request_id) not between 16 and 120 then raise exception 'INVALID_REQUEST_ID'; end if;
   fingerprint=encode(sha256(convert_to(p_action||p_payload::text,'UTF8')),'hex');
   select * into cached from public.gpt_requests where connection_id=c.id and gpt_requests.request_id=v_request_id;
   if found then
     if cached.payload_hash<>fingerprint then raise exception 'REQUEST_CONFLICT'; end if;
     return cached.response;
   end if;
 end if;
 if p_action='collections' then
   select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into result from (select id,name,description from public.collections where workspace_id=c.workspace_id order by sort_order,name limit 100) x;
 elsif p_action in ('list','get') then
   if p_action='get' then target=(p_payload->>'id')::uuid; end if;
   offset_n=greatest(0,least(10000,coalesce((p_payload->>'offset')::integer,0)));
   select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into result from (
     select p.id,p.name,p.country,p.city,p.address,p.lat,p.lng,p.primary_category,p.status,p.description,p.notes,p.favorite,p.website_url,p.booking_url,p.season,p.updated_at,
       coalesce((select jsonb_agg(t.name) from public.place_tags pt join public.tags t on t.id=pt.tag_id where pt.place_id=p.id),'[]'::jsonb) as tags,
       coalesce((select jsonb_agg(cp.collection_id) from public.collection_places cp where cp.place_id=p.id),'[]'::jsonb) as collection_ids,
       (select to_jsonb(pr)-'id'-'workspace_id'-'place_id' from public.prices pr where pr.place_id=p.id) as price
     from public.places p where p.workspace_id=c.workspace_id
       and (target is null or p.id=target)
       and (coalesce(p_payload->>'q','')='' or position(lower(p_payload->>'q') in lower(p.name||' '||p.country||' '||p.city))>0)
     order by p.updated_at desc,p.id limit 50 offset offset_n
   ) x;
   result=jsonb_build_object('places',result,'next_offset',case when jsonb_array_length(result)=50 then offset_n+50 else null end);
 elsif p_action='create_collection' then
   if length(trim(coalesce(p_payload->>'name',''))) not between 1 and 100 then raise exception 'INVALID_INPUT'; end if;
   select id into pid from public.collections where workspace_id=c.workspace_id and lower(name)=lower(trim(p_payload->>'name')) limit 1;
   if pid is null then insert into public.collections(workspace_id,name) values(c.workspace_id,trim(p_payload->>'name')) returning id into pid; end if;
   result=jsonb_build_object('id',pid,'name',trim(p_payload->>'name'));
 elsif p_action='save' then
   item=p_payload->'place';
   if jsonb_typeof(item) is distinct from 'object' then raise exception 'INVALID_INPUT'; end if;
   if nullif(item->>'id','') is not null then
     target=(item->>'id')::uuid;
     select to_jsonb(p) into row_data from public.places p where id=target and workspace_id=c.workspace_id for update;
     if row_data is null then raise exception 'NOT_FOUND'; end if;
     if item->>'updated_at' is null or (item->>'updated_at')::timestamptz<>(row_data->>'updated_at')::timestamptz then raise exception 'STALE_WRITE'; end if;
     row_data=row_data||jsonb_build_object(
       'tags',coalesce((select jsonb_agg(t.name) from public.place_tags pt join public.tags t on t.id=pt.tag_id where pt.place_id=target),'[]'::jsonb),
       'collection_ids',coalesce((select jsonb_agg(collection_id) from public.collection_places where place_id=target),'[]'::jsonb),
       'price',(select to_jsonb(pr) from public.prices pr where place_id=target));
     item=row_data||item;
   else
     item=jsonb_build_object('status','want_to_go','tags','[]'::jsonb,'collection_ids','[]'::jsonb)||item;
   end if;
   if length(coalesce(item->>'description',''))>20000 or length(coalesce(item->>'notes',''))>20000 or coalesce(jsonb_array_length(item->'tags'),0)>30 or coalesce(jsonb_array_length(item->'collection_ids'),0)>30 then raise exception 'INVALID_INPUT'; end if;
   -- Every nested relation is workspace-scoped by the existing composite FKs.
   old_claim=current_setting('request.jwt.claim.sub',true);
   perform set_config('request.jwt.claim.sub',c.owner_id::text,true);
   pid=public.save_place(item||jsonb_build_object('workspace_id',c.workspace_id,'visited_on',null,'created_by',c.owner_id));
   perform set_config('request.jwt.claim.sub',coalesce(old_claim,''),true);
   select jsonb_build_object('id',id,'name',name,'updated_at',updated_at,'saved',true) into result from public.places where id=pid;
 else raise exception 'INVALID_ACTION'; end if;
 if p_action in ('save','create_collection') then
   insert into public.gpt_requests(connection_id,request_id,payload_hash,response) values(c.id,v_request_id,fingerprint,result);
 end if;
 return result;
end $$;
revoke all on function public.gpt_atlas(text,text,jsonb) from public;
grant execute on function public.gpt_atlas(text,text,jsonb) to anon;
commit;
