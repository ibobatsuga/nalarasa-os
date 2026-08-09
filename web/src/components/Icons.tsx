/** Inline 20px stroke icons — no icon dependency, no network fetch. */
type P = { className?: string };
const S = ({ children, className }: P & { children: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
    strokeLinecap="round" strokeLinejoin="round" className={className ?? 'w-[18px] h-[18px]'}>
    {children}
  </svg>
);

export const IconGrid = (p: P) => <S {...p}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></S>;
export const IconRegister = (p: P) => <S {...p}><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M7 20h10M8 8h5M8 12h8" /></S>;
export const IconBox = (p: P) => <S {...p}><path d="M21 8l-9-5-9 5v8l9 5 9-5V8z" /><path d="M3 8l9 5 9-5M12 13v8" /></S>;
export const IconCart = (p: P) => <S {...p}><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /><path d="M2 3h3l2.5 12h11L21 7H6" /></S>;
export const IconBook = (p: P) => <S {...p}><path d="M4 5a2 2 0 012-2h13v18H6a2 2 0 01-2-2V5z" /><path d="M8 7h7M8 11h7" /></S>;
export const IconUsers = (p: P) => <S {...p}><circle cx="9" cy="8" r="3.2" /><path d="M2.5 20a6.5 6.5 0 0113 0M17 11.5a3 3 0 100-6M17.5 20a6 6 0 00-2-4.5" /></S>;
export const IconBadge = (p: P) => <S {...p}><circle cx="12" cy="9" r="4" /><path d="M8.5 12.5L7 21l5-2.5L17 21l-1.5-8.5" /></S>;
export const IconCheck = (p: P) => <S {...p}><path d="M20 6L9 17l-5-5" /></S>;
export const IconShield = (p: P) => <S {...p}><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" /><path d="M9 12l2 2 4-4" /></S>;
export const IconChart = (p: P) => <S {...p}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></S>;
export const IconWallet = (p: P) => <S {...p}><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M17 14h1.5" /></S>;
export const IconBell = (p: P) => <S {...p}><path d="M18 8a6 6 0 10-12 0c0 6-2 7-2 7h16s-2-1-2-7M10.5 20a2 2 0 003 0" /></S>;
export const IconSearch = (p: P) => <S {...p}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></S>;
export const IconChevron = (p: P) => <S {...p}><path d="M15 6l-6 6 6 6" /></S>;
export const IconLeaf = (p: P) => <S {...p}><path d="M4 20c0-8 6-14 16-15 0 10-5 15-11 15H4z" /><path d="M4 20c3-5 7-8 11-9" /></S>;
export const IconTruck = (p: P) => <S {...p}><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7" /><circle cx="7" cy="18" r="1.6" /><circle cx="17.5" cy="18" r="1.6" /></S>;
export const IconFlask = (p: P) => <S {...p}><path d="M10 3v6L4.5 18A2 2 0 006.2 21h11.6a2 2 0 001.7-3L14 9V3M9 3h6" /></S>;
export const IconUserPlus = (p: P) => <S {...p}><circle cx="9" cy="8" r="3.2" /><path d="M2.5 20a6.5 6.5 0 0113 0M18 8v6M21 11h-6" /></S>;
export const IconDoc = (p: P) => <S {...p}><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z" /><path d="M14 3v5h5" /></S>;
export const IconSettings = (p: P) => <S {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1A1.7 1.7 0 008.9 19a1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1A1.7 1.7 0 004.6 8.9a1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></S>;
