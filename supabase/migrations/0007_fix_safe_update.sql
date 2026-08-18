-- ============================================================
--  0007: oprava recompute_quality
--
--  Supabase ma zapnutu ochranu `safeupdate`, ktora odmietne UPDATE bez
--  WHERE. Prepocet kvality menil celu tabulku naraz, preto import padal
--  na poslednom kroku a cela transakcia sa vratila spat.
--  Riesenie: podmienka, ktora meni len riadky, kde sa hodnota naozaj lisi
--  — je to zaroven rychlejsie, lebo nezapisuje nezmenene riadky.
-- ============================================================

create or replace function recompute_quality() returns integer
language plpgsql security definer set search_path = public as $$
declare changed integer;
begin
  with calc as (
    select id,
      case
        when name is null
          or btrim(name) = ''
          or lower(btrim(name)) in ('odberné miesto','odberne miesto','zálohomat','zalohomat',
                                    'recycling','vending machine','shop','store')
          then 0
        when lower(btrim(name)) in ('potraviny','večierka','vecierka','obchod','mini market',
                                    'minimarket','market','supermarket','zmiešaný tovar')
             and (address is null or btrim(address) = '')
          then 0
        when address is not null and btrim(address) <> '' then 2
        else 1
      end as q
    from machines
  )
  update machines m
     set quality = calc.q
    from calc
   where m.id = calc.id
     and m.quality is distinct from calc.q;

  get diagnostics changed = row_count;

  update machines
     set quality = 3
   where deposit_source in ('szs','user')
     and quality between 1 and 2;

  raise notice 'recompute_quality: zmenenych riadkov %', changed;
  return (select count(*) from machines where quality >= 1);
end $$;

select recompute_quality();
