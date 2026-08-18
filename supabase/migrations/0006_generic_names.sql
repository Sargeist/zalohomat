-- ============================================================
--  0006: obecne nazvy typu "Potraviny" sa zobrazia len s ulicou
--  Spusti po 0005.
--
--  V OSM je v Bratislave 25 predajni pomenovanych jednoducho "Potraviny".
--  Samo o sebe to uzivatelovi nic nepovie. S ulicou uz ano:
--  "Potraviny, Kollárova 12" je pouzitelna informacia.
-- ============================================================

create or replace function recompute_quality() returns integer
language plpgsql security definer set search_path = public as $$
begin
  update machines set quality =
    case
      -- zastupny nazov: nikdy nezobrazujeme
      when name is null
        or btrim(name) = ''
        or lower(btrim(name)) in ('odberné miesto','odberne miesto','zálohomat','zalohomat',
                                  'recycling','vending machine','shop','store')
        then 0
      -- obecny nazov bez ulice tiez nic nepovie
      when lower(btrim(name)) in ('potraviny','večierka','vecierka','obchod','mini market',
                                  'minimarket','market','supermarket','zmiešaný tovar')
           and (address is null or btrim(address) = '')
        then 0
      when address is not null and btrim(address) <> '' then 2
      else 1
    end;

  update machines set quality = 3
   where deposit_source in ('szs','user') and quality >= 1;

  return (select count(*) from machines where quality >= 1);
end $$;

select recompute_quality();
