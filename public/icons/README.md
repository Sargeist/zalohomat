# Externé ikony

Sem ulož SVG súbory, ak chceš nahradiť vstavané ikony vlastnými
(Iconshock, Noun Project, alebo hocijaký iný set).

## Ako na to

1. Stiahni ikonu ako **SVG** (nie PNG — PNG sa nedá prefarbiť).
2. Ulož ju sem pod jednoduchým menom, napr. `map.svg`, `list.svg`, `award.svg`.
3. V `src/components/AppShell.tsx` nahraď komponent:

   ```tsx
   // pred
   <IconMap size={21} />
   // po
   <MaskIcon name="map" size={21} />
   ```

4. Import uprav na `import { MaskIcon } from './icons';`

Farbu neriešiš — ikona sa vykreslí cez CSS mask a prevezme farbu textu,
takže aktívna položka v navigácii ostane modrá a neaktívna sivá.

## Aké ikony aplikácia používa

| Kde | Vstavaný komponent | Odporúčané meno súboru |
|---|---|---|
| Navigácia — mapa | `IconMap` | `map.svg` |
| Navigácia — zoznam | `IconList` | `list.svg` |
| Navigácia — body | `IconAward` | `award.svg` |
| Navigácia — info | `IconInfo` | `info.svg` |
| Tlačidlo hlásenia | `IconPlus` | `plus.svg` |
| Vyhľadávanie | `IconSearch` | `search.svg` |
| Späť | `IconBack` | `back.svg` |
| Navigovať | `IconNavigate` | `navigate.svg` |
| Stav: funguje | `IconCheck` | `check.svg` |
| Stav: čiastočne | `IconAlert` | `alert.svg` |
| Stav: nefunguje | `IconCross` | `cross.svg` |
| Stav: neznámy | `IconQuestion` | `question.svg` |

## Licencia

Ikony z komerčných knižníc majú vlastné licenčné podmienky. Bezplatné
varianty spravidla vyžadujú uvedenie autora — v tom prípade doplň
poďakovanie na obrazovku **Info**, kde už je atribúcia OpenStreetMap.
Platená licencia túto povinnosť zvyčajne ruší. Podmienky si over
priamo u poskytovateľa pred nasadením.
