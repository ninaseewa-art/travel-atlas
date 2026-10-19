begin;
alter table public.prices add constraint iso_currency check(currency in ('AED','AFN','ALL','AMD','ANG','AOA','ARS','AUD','AWG','AZN','BAM','BBD','BDT','BGN','BHD','BIF','BMD','BND','BOB','BRL','BSD','BTN','BWP','BYN','BZD','CAD','CDF','CHF','CLP','CNY','COP','CRC','CUC','CUP','CVE','CZK','DJF','DKK','DOP','DZD','EGP','ERN','ETB','EUR','FJD','FKP','GBP','GEL','GHS','GIP','GMD','GNF','GTQ','GYD','HKD','HNL','HRK','HTG','HUF','IDR','ILS','INR','IQD','IRR','ISK','JMD','JOD','JPY','KES','KGS','KHR','KMF','KPW','KRW','KWD','KYD','KZT','LAK','LBP','LKR','LRD','LSL','LYD','MAD','MDL','MGA','MKD','MMK','MNT','MOP','MRU','MUR','MVR','MWK','MXN','MYR','MZN','NAD','NGN','NIO','NOK','NPR','NZD','OMR','PAB','PEN','PGK','PHP','PKR','PLN','PYG','QAR','RON','RSD','RUB','RWF','SAR','SBD','SCR','SDG','SEK','SGD','SHP','SLE','SLL','SOS','SRD','SSP','STN','SVC','SYP','SZL','THB','TJS','TMT','TND','TOP','TRY','TTD','TWD','TZS','UAH','UGX','USD','UYU','UZS','VES','VND','VUV','WST','XAF','XCD','XCG','XDR','XOF','XPF','XSU','YER','ZAR','ZMW','ZWG','ZWL'));
alter table public.prices add constraint price_dates check(valid_to is null or valid_from is null or valid_to>=valid_from);
alter table public.prices add constraint price_hotel_note check(length(notes)<=20000);
create function public.price_unit_guard() returns trigger language plpgsql set search_path='' as $$ begin
 if new.unit<>'night' and exists(select 1 from public.places where id=new.place_id and primary_category='hotels') then raise exception 'Hotel prices must be per night'; end if; return new;
end $$;
create trigger price_unit_guard before insert or update on public.prices for each row execute function public.price_unit_guard();
create function public.visit_author_guard() returns trigger language plpgsql set search_path='' as $$ begin
 if TG_OP='INSERT' then new.created_by=auth.uid(); else new.created_by=old.created_by; end if; return new;
end $$;
create trigger visit_author_guard before insert or update on public.visits for each row execute function public.visit_author_guard();
commit;
