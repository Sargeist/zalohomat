export const DICT = {
  sk: {
    loc: 'Vaša poloha', all: 'Všetky', ok: 'Funguje', issue: 'Čiastočne', down: 'Nefunguje',
    unknown: 'Neznáme', openNow: 'Otvorené', cans: 'Plechovky', big: 'Veľkokapacitný',
    near: 'V okolí', nav1: 'Mapa', nav2: 'Zoznam', nav3: 'Body', nav4: 'Profil',
    now: 'teraz', min: '{n} min', h: '{n} h', d: '{n} d',
    heroLabel: 'Najbližší funkčný automat', heroNone: 'Žiadny overený automat v okolí',
    live: 'naživo', works: '{a} z {b} funguje',
    hOk: 'Automat funguje', hIssue: 'Funguje s obmedzením', hDown: 'Automat nefunguje',
    hUnknown: 'Stav nie je overený',
    lastReport: 'Posledné hlásenie {ago}', noReport: 'Nikto nehlásil 24 h',
    tLast: 'POSLEDNÉ', tConf: 'POTVRDENÍ', tDist: 'VZDIALENOSŤ',
    day: 'Stav za 24 hodín', byReports: 'podľa hlásení', feed: 'Hlásenia',
    kHours: 'Otváracie hodiny', kTakes: 'Prijíma', kType: 'Typ odberu', kRefund: 'Vrátenie zálohy',
    vAuto: 'Zálohomat', vBig: 'Veľkokapacitný', vManual: 'Ručne pri pokladni', vCoupon: 'Kupón na pokladni',
    source: 'Poloha a hodiny: OpenStreetMap a oficiálna mapa odberných miest. Prevádzkový stav: hlásenia používateľov.',
    route: 'Navigovať', report: 'Nahlásiť stav',
    dlgTitle: 'Aký je stav automatu?', geoOk: 'Poloha overená · {d} m od automatu',
    geoWait: 'Zisťujem polohu…', geoFar: 'Ste {d} m od automatu. Hlásiť môžete do 150 m.',
    geoDenied: 'Bez prístupu k polohe nemôžeme hlásenie overiť.',
    oOk: 'Funguje', oOkS: 'Prijíma obaly bez problémov',
    oIssue: 'Čiastočne', oIssueS: 'Plný, rad alebo neberie všetko',
    oDown: 'Nefunguje', oDownS: 'Mimo prevádzky alebo zatvorené',
    reasons: ['Plný', 'Neberie plechovky', 'Neberie PET', 'Nevydáva bloček', 'Dlhý rad', 'Zatvorená predajňa', 'Chyba systému'],
    cancel: 'Zrušiť', send: 'Odoslať', sending: 'Odosielam…',
    privacy: 'Hlásenie je anonymné. Ukladáme len zaokrúhlenú polohu na overenie vzdialenosti od automatu.',
    sent: 'Stav bol aktualizovaný', errRate: 'Priveľa hlásení. Skúste o hodinu.',
    errDup: 'Tento automat ste práve hlásili.', errAcc: 'GPS je nepresné. Skúste vonku.',
    errGeneric: 'Hlásenie sa nepodarilo odoslať.',
    m: 'm', km: 'km', open: 'otvorené', closed: 'zatvorené', loading: 'Načítavam automaty…',
    empty: 'V okolí sme nenašli žiadne odberné miesto.',
    pContrib: 'Váš prínos', pTitle: 'Body a rebríček', pPoints: 'BODY', pReports: 'HLÁSENÍ',
    pAcc: 'PRESNOSŤ', pAccF: 'potvrdené inými', pRank: 'PORADIE', pRankF: 'v okolí',
    pLevel: 'Úroveň {n} · Strážca automatov',
  },
  ru: {
    loc: 'Ваше местоположение', all: 'Все', ok: 'Работает', issue: 'Частично', down: 'Не работает',
    unknown: 'Неизвестно', openNow: 'Открыто', cans: 'Банки', big: 'Большой',
    near: 'Рядом', nav1: 'Карта', nav2: 'Список', nav3: 'Баллы', nav4: 'Профиль',
    now: 'сейчас', min: '{n} мин', h: '{n} ч', d: '{n} д',
    heroLabel: 'Ближайший рабочий автомат', heroNone: 'Рядом нет подтверждённых автоматов',
    live: 'вживую', works: 'работает {a} из {b}',
    hOk: 'Автомат работает', hIssue: 'Работает с ограничением', hDown: 'Автомат не работает',
    hUnknown: 'Статус не подтверждён',
    lastReport: 'Последний отчёт: {ago}', noReport: 'Нет отчётов за 24 ч',
    tLast: 'ОТЧЁТ', tConf: 'ПОДТВЕРЖДЕНИЙ', tDist: 'РАССТОЯНИЕ',
    day: 'Статус за 24 часа', byReports: 'по отчётам', feed: 'Отчёты',
    kHours: 'Часы работы', kTakes: 'Принимает', kType: 'Тип приёма', kRefund: 'Возврат залога',
    vAuto: 'Автомат', vBig: 'Большой автомат', vManual: 'Вручную на кассе', vCoupon: 'Купон на кассе',
    source: 'Адрес и часы: OpenStreetMap и официальная карта пунктов приёма. Рабочий статус: отчёты пользователей.',
    route: 'Маршрут', report: 'Сообщить',
    dlgTitle: 'Как работает автомат?', geoOk: 'Геопозиция подтверждена · {d} м до автомата',
    geoWait: 'Определяю местоположение…', geoFar: 'Вы в {d} м от автомата. Сообщить можно в радиусе 150 м.',
    geoDenied: 'Без доступа к геопозиции отчёт нельзя подтвердить.',
    oOk: 'Работает', oOkS: 'Принимает тару без проблем',
    oIssue: 'Частично', oIssueS: 'Полный, очередь или берёт не всё',
    oDown: 'Не работает', oDownS: 'Сломан или магазин закрыт',
    reasons: ['Переполнен', 'Не берёт банки', 'Не берёт PET', 'Не печатает чек', 'Большая очередь', 'Магазин закрыт', 'Ошибка системы'],
    cancel: 'Отмена', send: 'Отправить', sending: 'Отправляю…',
    privacy: 'Отчёт анонимный. Сохраняем только округлённые координаты для проверки расстояния до автомата.',
    sent: 'Статус обновлён', errRate: 'Слишком много отчётов. Попробуйте через час.',
    errDup: 'Вы только что сообщали об этом автомате.', errAcc: 'GPS неточный. Попробуйте на улице.',
    errGeneric: 'Не удалось отправить отчёт.',
    m: 'м', km: 'км', open: 'открыто', closed: 'закрыто', loading: 'Загружаю автоматы…',
    empty: 'Рядом не нашлось ни одного пункта приёма.',
    pContrib: 'Ваш вклад', pTitle: 'Баллы и рейтинг', pPoints: 'БАЛЛЫ', pReports: 'ОТЧЁТОВ',
    pAcc: 'ТОЧНОСТЬ', pAccF: 'подтвердили другие', pRank: 'МЕСТО', pRankF: 'рядом',
    pLevel: 'Уровень {n} · Хранитель автоматов',
  },
} as const;

export type Lang = keyof typeof DICT;
export type Key = keyof typeof DICT['sk'];

export const reasonsFor = (lang: Lang) => DICT[lang].reasons as unknown as string[];

export function makeT(lang: Lang) {
  return (key: Key, vars: Record<string, string | number> = {}) => {
    const raw = DICT[lang][key];
    if (Array.isArray(raw)) return raw.join(', ');
    let s = raw as unknown as string;
    for (const k in vars) s = s.replace(`{${k}}`, String(vars[k]));
    return s;
  };
}

export function agoText(min: number, t: ReturnType<typeof makeT>) {
  if (!isFinite(min)) return '—';
  if (min < 3) return t('now');
  if (min < 60) return t('min', { n: Math.round(min) });
  if (min < 1440) return t('h', { n: Math.round(min / 60) });
  return t('d', { n: Math.round(min / 1440) });
}
