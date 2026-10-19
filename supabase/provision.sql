-- EDIT BOTH EMAILS, then run once AFTER migration 001 in the SQL editor.
-- Invite these same two people in Authentication > Users > Invite user.
-- Leave public sign-ups disabled. Both emails must be confirmed.
do $$ declare w uuid; begin
 if exists(select 1 from public.workspaces) then raise exception 'Workspace already provisioned; edit allowed_members manually instead'; end if;
 insert into public.workspaces(name) values('Наш атлас') returning id into w;
 insert into public.allowed_members(workspace_id,email) values(w,'owner-one@example.com'),(w,'owner-two@example.com');
 insert into public.collections(workspace_id,name,sort_order)
 select w,n,ord::int from unnest(array['Замки','Особенные отели','Природные чудеса','Библиотеки','Балет и опера','Театры','Музеи','Архитектура','Романтические места','Места из книг и фильмов']) with ordinality as x(n,ord);
end $$;
