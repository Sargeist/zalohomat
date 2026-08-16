# Zálohomat — полный гайд по развёртыванию

От пустой папки до работающего приложения на телефоне. Все команды — для **PowerShell на Windows**.
Ориентировочное время первого прохода: **40–60 минут**.

---

## Что внутри

```
zalohomat/
├── src/
│   ├── app/
│   │   ├── api/machines/route.ts   ← отдаёт автоматы в радиусе
│   │   ├── api/reports/route.ts    ← принимает отчёты, проверяет капчу и IP
│   │   ├── globals.css             ← тема из концепта (Titillium Web)
│   │   ├── layout.tsx / page.tsx / manifest.ts
│   ├── components/
│   │   ├── AppShell.tsx            ← весь UI: главная, деталь, баллы, шторка
│   │   └── MapView.tsx             ← Leaflet на тёмных тайлах
│   └── lib/                        ← supabase-клиенты, i18n (SK/RU), логика статусов
├── supabase/migrations/0001_init.sql  ← схема + консенсус + RLS
├── scripts/import-osm.mjs             ← импорт точек из OpenStreetMap
└── .env.example
```

Стек: **Next.js 15 + Supabase (Postgres + PostGIS) + Leaflet**. То же, что на Doma — ничего нового учить не надо.

---

## Шаг 1. Инструменты

```powershell
winget install OpenJS.NodeJS.LTS
winget install Git.Git
winget install Microsoft.VisualStudioCode
```

Закрой и открой PowerShell заново, проверь:

```powershell
node -v    # должно быть v20 или выше
npm -v
```

---

## Шаг 2. Проект

Распакуй архив в удобное место, например `C:\dev\zalohomat`, и поставь зависимости:

```powershell
cd C:\dev\zalohomat
npm install
```

---

## Шаг 3. Supabase

1. Зайди на **supabase.com** → New project.
   - Name: `zalohomat`
   - Region: **Frankfurt (eu-central-1)** — ближайший к Словакии, меньше задержка и данные остаются в ЕС
   - Сохрани пароль от базы в менеджер паролей
2. Дождись, пока проект поднимется (~2 минуты).
3. **SQL Editor → New query** → вставь целиком содержимое `supabase/migrations/0001_init.sql` → **Run**.
   Должно быть `Success. No rows returned`. Это создаёт таблицы, PostGIS, консенсус-функцию и все политики RLS.
4. **Authentication → Sign In / Providers → Anonymous sign-ins → включить.**
   Без этого приложение не сможет выдавать анонимные аккаунты, и отчёты отправляться не будут.
5. **Project Settings → API** — скопируй `Project URL`, `anon public` и `service_role`.

---

## Шаг 4. Переменные окружения

```powershell
Copy-Item .env.example .env.local
code .env.local
```

Заполни:

```
NEXT_PUBLIC_SUPABASE_URL=https://твой-проект.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
IP_HASH_SALT=<случайная строка>
```

Соль сгенерируй так:

```powershell
-join ((1..32) | ForEach-Object { '{0:x}' -f (Get-Random -Max 16) })
```

> `service_role` обходит RLS полностью. Он нужен только скрипту импорта. В `.gitignore` он уже закрыт — проверь, что `.env.local` **никогда** не попадает в git.

---

## Шаг 5. Залить данные

```powershell
npm run import:osm
```

Скрипт заберёт из Overpass все точки Словакии с тегами `vending=bottle_return` и
`recycling_type=reverse_vending_machine` и зальёт их в базу.

Проверь: **Supabase → Table Editor → machines**. Должно быть несколько сотен строк.
Если пусто — Overpass бывает перегружен, подожди пару минут и запусти снова.

> В OSM покрытие Словакии неполное. Это стартовый слой. Дальше — карта SZS,
> store locator'ы сетей и точки, которые добавят пользователи.

---

## Шаг 6. Запуск

```powershell
npm run dev
```

Открой **http://localhost:3000**.

Что проверить:
- Браузер спросит геолокацию → разреши. Без неё центр останется на Братиславе.
- На карте появятся маркеры, ниже — список по расстоянию.
- Тапни автомат → детальный экран. Полоса «за 24 часа» пока пустая, отчётов ещё нет.
- Кнопка «Nahlásiť stav» → выбери статус → «Odoslať».

**Первый отчёт почти наверняка вернёт ошибку `too_far`** — и это правильно. Сервер проверяет, что ты в 150 м от автомата. Для локальной отладки временно ослабь порог в SQL:

```sql
-- в функции submit_report, только на время разработки
if d > 150 then   -->   if d > 50000 then
```

Не забудь вернуть обратно перед деплоем.

---

## Шаг 7. GitHub

```powershell
git init
git add .
git commit -m "Zálohomat: first working version"
git branch -M main
git remote add origin https://github.com/Sargeist/zalohomat.git
git push -u origin main
```

Репозиторий создай заранее на github.com. **Приватный** — пока в проекте нет отдельного аудита, публичный код + публичный Supabase URL упрощают жизнь тому, кто захочет поиграть с твоим API.

---

## Шаг 8. Деплой на Vercel

1. **vercel.com** → Add New → Project → импортируй репозиторий.
2. Framework определится сам (Next.js).
3. **Environment Variables** — добавь всё из `.env.local`, кроме случая с `SUPABASE_SERVICE_ROLE_KEY`: его добавляй только если скрипты будут запускаться на Vercel. Для ручного импорта с ноутбука он там не нужен.
4. Deploy. Через минуту получишь `zalohomat.vercel.app`.

Домен: если возьмёшь `zalohomat.sk`, добавь его в Vercel → Domains и пропиши NS/CNAME у регистратора.

---

## Шаг 9. Поставить на телефон

Приложение — PWA, магазины не нужны:

- **Android/Chrome**: открой сайт → меню → «Установить приложение»
- **iOS/Safari**: «Поделиться» → «На экран Домой»

Иконка появится на рабочем столе, откроется без адресной строки. Положи в `public/`
файлы `icon-192.png` и `icon-512.png`, иначе иконка будет пустой.

Нативная сборка (если понадобится пуш-уведомления и Play Integrity) — через Capacitor, но это позже.

---

## Шаг 10. Cloudflare Turnstile

Пока не обязательно, но перед публичным запуском включи:

1. **dash.cloudflare.com → Turnstile → Add site**, домен `zalohomat.sk`
2. Ключи → в `.env.local` и в Vercel:
   ```
   NEXT_PUBLIC_TURNSTILE_SITE_KEY=...
   TURNSTILE_SECRET_KEY=...
   ```

Как только `TURNSTILE_SECRET_KEY` появится, `/api/reports` начнёт требовать токен — виджет надо будет добавить в шторку отчёта. Пока переменной нет, проверка пропускается (это ветка `if (!secret) return true`).

---

## Регулярные операции

**Обновление точек из OSM** — раз в неделю:
```powershell
npm run import:osm
```

**Отлов накрутчиков** — раз в сутки, в SQL Editor:
```sql
select flag_suspicious_reporters();
```
Функция ставит shadow ban тем, у кого больше 10 отчётов и меньше 35% подтверждений. Автоматизировать можно через Supabase → Database → Cron (расширение pg_cron).

**Посмотреть, что происходит:**
```sql
-- самые активные автоматы за сутки
select m.name, count(*) filter (where r.status='down') as poruchy, count(*) as vsetky
from reports r join machines m on m.id = r.machine_id
where r.created_at > now() - interval '24 hours'
group by m.name order by vsetky desc limit 20;

-- подозрительная активность с одного IP
select ip_hash, count(*), count(distinct machine_id)
from reports where created_at > now() - interval '1 hour'
group by ip_hash having count(*) > 15;
```

---

## Как устроена защита

| Уровень | Что делает |
|---|---|
| Клиент | Не пишет в БД вообще. Только `fetch` на свои же `/api/*` |
| Route handler | Zod-валидация, проверка Turnstile, хеширование IP с солью |
| RPC `submit_report` | Проверка точности GPS (>100 м → отказ), расстояния (>150 м → отказ), rate limit 12/час и 1 на автомат в 15 мин |
| Консенсус | Статус = взвешенная сумма с полураспадом 3 ч. Один голос не решает |
| Репутация | Попал в консенсус → вес растёт, разошёлся → падает. Систематически врущий получает shadow ban |
| RLS | На `reports` нет ни одной INSERT-политики. Записать можно только через SECURITY DEFINER функцию |
| Заголовки | CSP, HSTS, X-Frame-Options: DENY — в `next.config.mjs` |

Сырой IP не хранится нигде. Координаты пользователя не сохраняются — только вычисленное расстояние до автомата в метрах.

---

## Что делать в первые две недели

1. **Проверить данные ногами.** Возьми 15–20 точек в Братиславе и сверь: существуют ли, есть ли автомат, совпадают ли часы. Это покажет, насколько OSM врёт и сколько работы по чистке.
2. **Добавить слой SZS.** Напиши в Správca zálohového systému с просьбой об официальном фиде. Пока ответа нет — заводи точки вручную через Table Editor.
3. **Дать приложение 10 живым людям.** Коллегам в баре, соседям. Смотри в `reports`, приходят ли отчёты вообще. Если за неделю их меньше 20 — проблема не в коде, а в мотивации, и её надо решать до любой новой фичи.
4. **Кабинет для магазина.** Это то, что превращает игрушку в инфраструктуру. Продавец жмёт «сломан» — статус получает максимальный вес.

---

## Если что-то сломалось

**`relation "machines" does not exist`** — миграция не прошла целиком. Прогони SQL-файл заново, он идемпотентный.

**`permission denied for function submit_report`** — не выполнился блок `grant execute`. Прогони его отдельно.

**Отчёт возвращает `unauthorized`** — не включён Anonymous sign-in в Supabase (шаг 3.4).

**Карта серая** — тайлы CARTO заблокированы CSP. Проверь, что домен `*.basemaps.cartocdn.com` есть в `img-src` в `next.config.mjs`.

**`Module not found: leaflet`** — `npm install` не доработал. Удали `node_modules` и `package-lock.json`, поставь заново.

**Список пустой, хотя в базе точки есть** — ты вне радиуса. `machines_near` ищет в 8 км от твоей позиции; в Нове-Замки точек OSM может не быть вовсе. Для проверки временно захардкодь `BRATISLAVA` в `AppShell.tsx`.
