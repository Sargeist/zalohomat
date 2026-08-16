/**
 * Ikonovy set — inline SVG, 24x24, stroke 1.8, zaoblene konce.
 * Vsetky pouzivaju currentColor, takze farbu riadi CSS.
 *
 * Ak chces neskor nahradit ikony z thenounproject.com:
 * stiahni SVG, vloz jeho <path> sem a nechaj wrapper <Svg> — zvysok sa neposunie.
 */
type P = { size?: number; className?: string };

const Svg = ({ size = 24, className, children }: P & { children: React.ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}
       aria-hidden="true" focusable="false">{children}</svg>
);

export const IconMap = (p: P) => (
  <Svg {...p}><path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" /><circle cx="12" cy="10" r="2.6" /></Svg>
);

export const IconList = (p: P) => (
  <Svg {...p}><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="4.5" cy="12" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="4.5" cy="18" r="1.1" fill="currentColor" stroke="none" /></Svg>
);

export const IconAward = (p: P) => (
  <Svg {...p}><circle cx="12" cy="9" r="5.4" /><path d="m8.2 13.6-1.4 7.2 5.2-2.8 5.2 2.8-1.4-7.2" /></Svg>
);

export const IconInfo = (p: P) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11.2v5M12 7.8h.01" /></Svg>
);

export const IconPlus = (p: P) => (
  <Svg {...p}><path d="M12 5v14M5 12h14" strokeWidth="2.4" /></Svg>
);

export const IconSearch = (p: P) => (
  <Svg {...p}><circle cx="10.8" cy="10.8" r="6.8" /><path d="m20 20-4.4-4.4" /></Svg>
);

export const IconBack = (p: P) => (
  <Svg {...p}><path d="M19.5 12H5M11.5 5.5 5 12l6.5 6.5" strokeWidth="2" /></Svg>
);

export const IconClose = (p: P) => (
  <Svg {...p}><path d="M6 6l12 12M18 6 6 18" strokeWidth="2" /></Svg>
);

export const IconCheck = (p: P) => (
  <Svg {...p}><path d="M20 6.5 9.4 17.5 4 12" strokeWidth="2.6" /></Svg>
);

export const IconAlert = (p: P) => (
  <Svg {...p}><path d="M12 3.5 1.8 20.5h20.4L12 3.5Z" /><path d="M12 10v4.2M12 17.4h.01" strokeWidth="2" /></Svg>
);

export const IconCross = (p: P) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="m9 9 6 6M15 9l-6 6" strokeWidth="2" /></Svg>
);

export const IconQuestion = (p: P) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M9.4 9.4a2.7 2.7 0 1 1 3.4 2.6c-.5.2-.8.7-.8 1.2v.6M12 17.2h.01" /></Svg>
);

export const IconNavigate = (p: P) => (
  <Svg {...p}><path d="M21 3 3 10.6l7.6 2.8L13.4 21 21 3Z" /></Svg>
);

export const IconClock = (p: P) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7.4V12l3 1.8" /></Svg>
);

export const IconRefresh = (p: P) => (
  <Svg {...p}><path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v4.5h-4.5" /></Svg>
);

export const IconStore = (p: P) => (
  <Svg {...p}><path d="M4 9.5V20h16V9.5M2.5 9.5 4.6 4h14.8l2.1 5.5a3.2 3.2 0 0 1-6.4 0 3.2 3.2 0 0 1-6.4 0 3.2 3.2 0 0 1-6.2 0Z" /></Svg>
);

/** Ikona podla stavu automatu — pouziva sa v zozname aj na detaile */
export const StatusIcon = ({ status, size = 22 }: { status: string; size?: number }) =>
  status === 'ok' ? <IconCheck size={size} />
  : status === 'issue' ? <IconAlert size={size} />
  : status === 'down' ? <IconCross size={size} />
  : <IconQuestion size={size} />;

/* ============================================================
   Podpora externych ikon (Iconshock, Noun Project, Feather…)
   ------------------------------------------------------------
   1. Stiahni SVG a uloz ho do  public/icons/<meno>.svg
   2. Pouzi  <MaskIcon name="map" />  namiesto <IconMap />

   Ikona sa vykresli cez CSS mask, takze si zachova currentColor
   a bude sa farbit temou rovnako ako vstavane ikony — aj ked ma
   povodny subor natvrdo zapisanu ciernu alebo bielu vypln.
   ============================================================ */
export const MaskIcon = ({ name, size = 22, className }: P & { name: string }) => (
  <span
    className={className}
    role="img"
    aria-hidden="true"
    style={{
      display: 'inline-block',
      width: size,
      height: size,
      backgroundColor: 'currentColor',
      WebkitMaskImage: `url(/icons/${name}.svg)`,
      maskImage: `url(/icons/${name}.svg)`,
      WebkitMaskRepeat: 'no-repeat',
      maskRepeat: 'no-repeat',
      WebkitMaskPosition: 'center',
      maskPosition: 'center',
      WebkitMaskSize: 'contain',
      maskSize: 'contain',
      flex: 'none',
    }}
  />
);
