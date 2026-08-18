# Подготовка к раздаче тестировщикам

## Обязательное перед первым внешним человеком

```powershell
# в Vercel → Settings → Environment Variables
CRON_SECRET=<случайная строка>          # без него /api/cron/refresh открыт всем
SUPABASE_SERVICE_ROLE_KEY=<ключ>        # нужен крону
IP_HASH_SALT=<случайная строка>
```

Сгенерировать строку: `-join ((1..32) | % { '{0:x}' -f (Get-Random -Max 16) })`

Проверить, что порог гео-верификации вернулся на место — в `submit_report`
должно быть `if d > 150`, а не значение, которое ты ставил для отладки:

```sql
select prosrc like '%d > 150%' as radius_ok from pg_proc where proname = 'submit_report';
```

Иконки PWA: положить `icon-192.png` и `icon-512.png` в `public/`.

Внешний git-репозиторий, который создался по ошибке:
```powershell
Remove-Item -Recurse -Force D:\dev\.git
```

## Что сказать тестировщикам

Три вещи, иначе получишь отчёты не о том:

1. Статус с процентом — оценка по часам работы, не проверка автомата. Сплошной
   зелёный без процента — проверено человеком.
2. Отчёт отправляется только в радиусе 150 метров от точки. Это защита от
   накрутки, не баг.
3. Данные о магазинах из OpenStreetMap, ошибки будут. Кнопка отчёта — способ их
   исправить.

## Что смотреть в первую неделю

```sql
-- приходят ли отчёты вообще
select date_trunc('day', created_at) d, count(*) from reports group by 1 order by 1 desc;

-- где данные врут: точки, которые люди пометили сломанными без подтверждений
select m.name, m.address, count(*) from reports r
  join machines m on m.id = r.machine_id
 where r.status = 'down' and r.created_at > now() - interval '7 days'
 group by 1,2 order by 3 desc limit 20;

-- покрытие: сколько точек вообще получили хоть один отчёт
select count(*) filter (where status is not null) as s_hlasenim, count(*) from machines where quality >= 1;
```

Последний запрос — главная метрика. Если за неделю отчёты получили меньше
одного процента точек, проблема не в коде, а в мотивации, и решать надо её.

## Перед публичным запуском

- [ ] Turnstile включён (`TURNSTILE_SECRET_KEY`), виджет добавлен в шторку
- [ ] `flag_suspicious_reporters()` на расписании
- [ ] политика приватности: геолокация, анонимные аккаунты, срок хранения
- [ ] 20 точек проверены ногами, доля ошибок известна
- [ ] запрос в SZS на официальный фид отправлен
