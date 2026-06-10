import React from 'react';
import { useLang } from '../LangContext';

const NAVY = '#143A63';
const GOLD = '#F4B02A';

// ─── Slope diagram icon ────────────────────────────────────────────────────────
function SlopeIcon() {
  return (
    <svg width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Dashed reference lines */}
      <line x1="8" y1="42" x2="44" y2="42" stroke="rgba(244,176,42,0.35)" strokeWidth="1.5" strokeDasharray="4 3" />
      <line x1="44" y1="10" x2="44" y2="42" stroke="rgba(244,176,42,0.35)" strokeWidth="1.5" strokeDasharray="4 3" />
      {/* Slope line */}
      <line x1="8" y1="42" x2="44" y2="10" stroke={GOLD} strokeWidth="3" strokeLinecap="round" />
      {/* End-point dots */}
      <circle cx="8"  cy="42" r="4" fill={NAVY} stroke={GOLD} strokeWidth="2" />
      <circle cx="44" cy="10" r="4" fill={NAVY} stroke={GOLD} strokeWidth="2" />
      {/* Right-angle marker */}
      <path d="M38 42 L38 36 L44 36" stroke="rgba(244,176,42,0.55)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Slope screen — "Coming Soon" placeholder ─────────────────────────────────
export default function SlopeScreen() {
  const { t, lang } = useLang();

  return (
    <div style={styles.root}>
      <div style={styles.card}>
        {/* Icon container */}
        <div style={styles.iconBox}>
          <SlopeIcon />
        </div>

        {/* Title */}
        <h2 style={styles.title}>{t('tabSlope')}</h2>

        {/* Badge */}
        <span style={styles.badge}>{t('comingSoon')}</span>

        {/* Divider */}
        <div style={styles.divider} />

        {/* Sub-text */}
        <p style={styles.hint}>
          {lang === 'es'
            ? 'Los cálculos de pendiente estarán disponibles pronto.'
            : 'Slope calculations will be available in a future update.'}
        </p>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  root: {
    flex:            1,
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    padding:         '32px 20px',
    backgroundColor: '#F5F4F0',
  },
  card: {
    width:           '100%',
    maxWidth:        340,
    backgroundColor: '#FFFFFF',
    borderRadius:    20,
    boxShadow:       '0 4px 24px rgba(0,0,0,0.09)',
    padding:         '36px 28px',
    display:         'flex',
    flexDirection:   'column',
    alignItems:      'center',
    gap:             12,
  },
  iconBox: {
    width:           72,
    height:          72,
    borderRadius:    20,
    backgroundColor: NAVY,
    border:          `1.5px solid ${GOLD}`,
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    marginBottom:    4,
    boxShadow:       '0 4px 16px rgba(20,58,99,0.25)',
  },
  title: {
    margin:          0,
    fontSize:        26,
    fontWeight:      800,
    color:           NAVY,
    letterSpacing:   '-0.4px',
    fontFamily:      'inherit',
  },
  badge: {
    display:         'inline-block',
    backgroundColor: GOLD,
    color:           NAVY,
    fontSize:        11,
    fontWeight:      800,
    letterSpacing:   1,
    textTransform:   'uppercase' as const,
    padding:         '4px 12px',
    borderRadius:    20,
  },
  divider: {
    width:           44,
    height:          3,
    backgroundColor: GOLD,
    borderRadius:    2,
    margin:          '4px 0',
  },
  hint: {
    margin:          0,
    fontSize:        13,
    color:           '#6B7280',
    textAlign:       'center' as const,
    lineHeight:      1.55,
    maxWidth:        240,
  },
};
