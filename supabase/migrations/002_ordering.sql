begin;
create function public.reorder_photos(p_place uuid,p_ids uuid[]) returns void language plpgsql security invoker set search_path='' as $$
declare n integer; begin
 perform 1 from public.places where id=p_place for update;
 select count(*) into n from public.photos where place_id=p_place;
 if n<>cardinality(p_ids) or n<>(select count(distinct x) from unnest(p_ids) x) or exists(select 1 from unnest(p_ids) x where not exists(select 1 from public.photos where id=x and place_id=p_place)) then raise exception 'Photo list changed; refresh and retry'; end if;
 update public.photos p set sort_order=x.ord::integer-1 from unnest(p_ids) with ordinality x(id,ord) where p.id=x.id and p.place_id=p_place;
end $$;
create function public.reorder_collections(p_workspace uuid,p_ids uuid[]) returns void language plpgsql security invoker set search_path='' as $$
declare n integer; begin
 perform 1 from public.collections where workspace_id=p_workspace for update;
 select count(*) into n from public.collections where workspace_id=p_workspace;
 if n<>cardinality(p_ids) or n<>(select count(distinct x) from unnest(p_ids) x) or exists(select 1 from unnest(p_ids) x where not exists(select 1 from public.collections where id=x and workspace_id=p_workspace)) then raise exception 'Collection list changed; refresh and retry'; end if;
 update public.collections c set sort_order=x.ord::integer-1 from unnest(p_ids) with ordinality x(id,ord) where c.id=x.id and c.workspace_id=p_workspace;
end $$;
revoke all on function public.reorder_photos(uuid,uuid[]),public.reorder_collections(uuid,uuid[]) from public;
grant execute on function public.reorder_photos(uuid,uuid[]),public.reorder_collections(uuid,uuid[]) to authenticated;
commit;
