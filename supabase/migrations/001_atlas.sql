-- Run once in the Supabase SQL editor as project owner. No service key in the app.
begin;
create table public.workspaces(id uuid primary key default gen_random_uuid(), name text not null default 'Наш атлас', created_at timestamptz not null default now());
-- Provisioning only: never grant authenticated users write access to these tables.
create table public.allowed_members(workspace_id uuid not null references public.workspaces on delete cascade,email text not null check(email=lower(trim(email))),primary key(workspace_id,email));
create table public.memberships(workspace_id uuid not null references public.workspaces on delete cascade,user_id uuid not null references auth.users on delete cascade,role text not null default 'owner' check(role='owner'),created_at timestamptz not null default now(),primary key(workspace_id,user_id),unique(user_id));
create function public.enforce_two_owners() returns trigger language plpgsql set search_path='' as $$ begin
 perform 1 from public.workspaces where id=new.workspace_id for update;
 if (select count(*) from public.allowed_members where workspace_id=new.workspace_id)>=2 then raise exception 'Only two allowed owners'; end if; return new;
end $$;
create trigger two_owners before insert on public.allowed_members for each row execute function public.enforce_two_owners();
create function public.is_member(w uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.memberships where workspace_id=w and user_id=auth.uid()) $$;
revoke all on function public.is_member(uuid) from public; grant execute on function public.is_member(uuid) to authenticated;
create function public.claim_workspace() returns uuid language plpgsql security definer set search_path='' as $$ declare w uuid; begin
 if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then raise exception 'Confirmed email required'; end if;
 select a.workspace_id into w from public.allowed_members a join auth.users u on lower(u.email)=a.email where u.id=auth.uid();
 if w is null then raise exception 'This email is not invited'; end if;
 insert into public.memberships(workspace_id,user_id) values(w,auth.uid()) on conflict do nothing; return w;
end $$;
revoke all on function public.claim_workspace() from public; grant execute on function public.claim_workspace() to authenticated;
create table public.categories(id text primary key,name text not null,icon text not null default '•',sort_order integer not null default 0);
insert into public.categories(id,name,icon,sort_order) values
('hotels','Отели и проживание','⌂',1),('restaurants','Рестораны и кафе','☕',2),('theatres','Театры','◈',3),('opera','Оперные театры','♫',4),('ballet','Балет','✧',5),('museums','Музеи','▥',6),('galleries','Галереи и выставки','▣',7),('libraries','Библиотеки','▤',8),('castles','Замки и дворцы','♜',9),('architecture','Архитектура','⌂',10),('history','Исторические места','◷',11),('nature','Природа','❋',12),('mountains','Горы','△',13),('waterfalls','Водопады','≋',14),('lakes','Озёра','≈',15),('beaches','Пляжи','☀',16),('gardens','Сады и парки','♧',17),('bookshops','Книжные магазины','▤',18),('cinemas','Кинотеатры','▸',19),('concerts','Концертные залы','♪',20),('festivals','Фестивали','✺',21),('adventures','Активности и приключения','↗',22),('cities','Города и районы','⌘',23),('other','Другое','•',24);
create table public.places(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces on delete cascade,name text not null check(length(trim(name)) between 1 and 200),country text not null check(length(trim(country)) between 1 and 100),country_code text,region text not null default '',city text not null default '',address text not null default '',lat double precision not null check(lat between -90 and 90),lng double precision not null check(lng between -180 and 180),primary_category text not null references public.categories,status text not null default 'want_to_go' check(status in ('want_to_go','visited')),description text not null default '',notes text not null default '',website_url text not null default '' check(website_url='' or website_url ~ '^https?://[^[:space:]]+$'),booking_url text not null default '' check(booking_url='' or booking_url ~ '^https?://[^[:space:]]+$'),favorite boolean not null default false,season text not null default '',created_by uuid not null references auth.users,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(id,workspace_id));
create function public.place_audit() returns trigger language plpgsql set search_path='' as $$ begin
 if TG_OP='INSERT' then new.created_by=auth.uid(); new.created_at=now(); else new.created_by=old.created_by; new.created_at=old.created_at; new.workspace_id=old.workspace_id; end if;
 new.updated_at=clock_timestamp(); return new; end $$;
create trigger place_audit before insert or update on public.places for each row execute function public.place_audit();
create table public.collections(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces on delete cascade,name text not null check(length(trim(name)) between 1 and 100),description text not null default '',icon text not null default '◇',sort_order integer not null default 0,created_at timestamptz not null default now(),unique(id,workspace_id));
create table public.tags(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces on delete cascade,name text not null check(length(name) between 1 and 60),normalized_name text generated always as (lower(trim(name))) stored,unique(workspace_id,normalized_name),unique(id,workspace_id));
create table public.collection_places(workspace_id uuid not null,collection_id uuid not null,place_id uuid not null,primary key(collection_id,place_id),foreign key(collection_id,workspace_id) references public.collections(id,workspace_id) on delete cascade,foreign key(place_id,workspace_id) references public.places(id,workspace_id) on delete cascade);
create table public.place_tags(workspace_id uuid not null,place_id uuid not null,tag_id uuid not null,primary key(place_id,tag_id),foreign key(place_id,workspace_id) references public.places(id,workspace_id) on delete cascade,foreign key(tag_id,workspace_id) references public.tags(id,workspace_id) on delete cascade);
create table public.place_categories(workspace_id uuid not null,place_id uuid not null,category_id text not null references public.categories,primary key(place_id,category_id),foreign key(place_id,workspace_id) references public.places(id,workspace_id) on delete cascade);
create table public.photos(id uuid primary key default gen_random_uuid(),workspace_id uuid not null,place_id uuid not null,storage_path text not null unique,source_url text not null default '',attribution text not null default '',sort_order integer not null default 0,created_at timestamptz not null default now(),foreign key(place_id,workspace_id) references public.places(id,workspace_id) on delete cascade,check(storage_path like workspace_id::text||'/'||place_id::text||'/%'));
create table public.prices(id uuid primary key default gen_random_uuid(),workspace_id uuid not null,place_id uuid not null,amount_min numeric not null check(amount_min>=0),amount_max numeric check(amount_max>=amount_min),currency text not null check(currency ~ '^[A-Z]{3}$'),unit text not null check(unit in ('night','ticket','person','visit')),valid_from date,valid_to date,source_url text not null default '' check(source_url='' or source_url ~ '^https?://[^[:space:]]+$'),checked_at date,notes text not null default '',foreign key(place_id,workspace_id) references public.places(id,workspace_id) on delete cascade,unique(place_id));
create table public.visits(id uuid primary key default gen_random_uuid(),workspace_id uuid not null,place_id uuid not null,visited_on date not null,notes text not null default '',created_by uuid not null default auth.uid() references auth.users,foreign key(place_id,workspace_id) references public.places(id,workspace_id) on delete cascade);
-- Events/imports reserved for phase 2, with access boundaries already in place.
create table public.events(id uuid primary key default gen_random_uuid(),workspace_id uuid not null,place_id uuid not null,title text not null,event_type text not null,starts_at timestamptz not null,ends_at timestamptz,timezone text not null,ticket_url text,status text not null default 'want_to_go',notes text not null default '',foreign key(place_id,workspace_id) references public.places(id,workspace_id) on delete cascade);
create table public.imports(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces,created_by uuid not null default auth.uid() references auth.users,source_type text not null,source_url text,status text not null,extracted_data jsonb,error text,created_at timestamptz not null default now());
create index places_workspace_status on public.places(workspace_id,status);
create index places_coordinates on public.places(lat,lng);
create index collection_places_place on public.collection_places(place_id);
create index place_tags_tag on public.place_tags(tag_id);
do $$ declare t text; begin
 foreach t in array array['workspaces','allowed_members','memberships','categories','places','collections','tags','collection_places','place_tags','place_categories','photos','prices','visits','events','imports'] loop execute format('alter table public.%I enable row level security',t); end loop;
 foreach t in array array['places','collections','tags','collection_places','place_tags','place_categories','photos','prices','visits','events','imports'] loop
 execute format('create policy member_access on public.%I for all to authenticated using (public.is_member(workspace_id)) with check(public.is_member(workspace_id))',t);
 execute format('grant select,insert,update,delete on public.%I to authenticated',t);
 execute format('create index on public.%I(workspace_id)',t);
 end loop;
end $$;
create policy workspace_read on public.workspaces for select to authenticated using(public.is_member(id));
create policy membership_read on public.memberships for select to authenticated using(public.is_member(workspace_id));
create policy category_read on public.categories for select to authenticated using(true);
revoke all on public.allowed_members,public.memberships,public.workspaces,public.categories from anon,authenticated;
grant select on public.memberships,public.workspaces,public.categories to authenticated;
-- Atomic aggregate save. Every nested relation is validated by RLS + composite FKs.
create function public.save_place(p jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare pid uuid; w uuid; tag_name text; tid uuid; cid text; old_updated timestamptz; begin
 w=(p->>'workspace_id')::uuid; pid=coalesce(nullif(p->>'id','')::uuid,gen_random_uuid());
 if not public.is_member(w) then raise exception 'Access denied'; end if;
 select updated_at into old_updated from public.places where id=pid for update;
 if old_updated is not null and old_updated is distinct from (p->>'updated_at')::timestamptz then raise exception 'CONFLICT: запись изменена другим пользователем. Обновите страницу.'; end if;
 insert into public.places(id,workspace_id,name,country,region,city,address,lat,lng,primary_category,status,description,notes,website_url,booking_url,favorite,season,created_by)
 values(pid,w,trim(p->>'name'),trim(p->>'country'),coalesce(p->>'region',''),coalesce(p->>'city',''),coalesce(p->>'address',''),(p->>'lat')::float8,(p->>'lng')::float8,p->>'primary_category',p->>'status',coalesce(p->>'description',''),coalesce(p->>'notes',''),coalesce(p->>'website_url',''),coalesce(p->>'booking_url',''),coalesce((p->>'favorite')::boolean,false),coalesce(p->>'season',''),auth.uid())
 on conflict(id) do update set name=excluded.name,country=excluded.country,region=excluded.region,city=excluded.city,address=excluded.address,lat=excluded.lat,lng=excluded.lng,primary_category=excluded.primary_category,status=excluded.status,description=excluded.description,notes=excluded.notes,website_url=excluded.website_url,booking_url=excluded.booking_url,favorite=excluded.favorite,season=excluded.season;
 delete from public.place_tags where place_id=pid; delete from public.collection_places where place_id=pid;
 for tag_name in select value from jsonb_array_elements_text(coalesce(p->'tags','[]')) loop
 tag_name=lower(trim(tag_name)); if tag_name='' then continue; end if;
 insert into public.tags(workspace_id,name) values(w,tag_name) on conflict(workspace_id,normalized_name) do update set name=excluded.name returning id into tid;
 insert into public.place_tags(workspace_id,place_id,tag_id) values(w,pid,tid) on conflict do nothing;
 end loop;
 for cid in select value from jsonb_array_elements_text(coalesce(p->'collection_ids','[]')) loop
 insert into public.collection_places(workspace_id,collection_id,place_id) values(w,cid::uuid,pid) on conflict do nothing; end loop;
 delete from public.prices where place_id=pid;
 if p->'price' is not null and p->'price'<>'null'::jsonb then
 insert into public.prices(workspace_id,place_id,amount_min,amount_max,currency,unit,source_url,checked_at)
 values(w,pid,(p->'price'->>'amount_min')::numeric,nullif(p->'price'->>'amount_max','')::numeric,p->'price'->>'currency',p->'price'->>'unit',coalesce(p->'price'->>'source_url',''),nullif(p->'price'->>'checked_at','')::date); end if;
 if nullif(p->>'visited_on','') is not null then insert into public.visits(workspace_id,place_id,visited_on,notes) values(w,pid,(p->>'visited_on')::date,coalesce(p->>'visit_notes','')); end if;
 return pid; end $$;
revoke all on function public.save_place(jsonb) from public; grant execute on function public.save_place(jsonb) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('atlas-photos','atlas-photos',false,10485760,array['image/jpeg','image/png','image/webp']);
create function public.photo_path_member(path text) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.memberships where user_id=auth.uid() and workspace_id::text=split_part(path,'/',1)) $$;
revoke all on function public.photo_path_member(text) from public; grant execute on function public.photo_path_member(text) to authenticated;
create policy private_photos on storage.objects for all to authenticated using(bucket_id='atlas-photos' and public.photo_path_member(name)) with check(bucket_id='atlas-photos' and public.photo_path_member(name));
-- Realtime is advisory: clients always refetch authoritative, RLS-filtered records.
do $$ declare t text; begin foreach t in array array['places','collections','photos','visits','collection_places','place_tags','prices'] loop
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then execute format('alter publication supabase_realtime add table public.%I',t); end if;
 end loop; end $$;
commit;
