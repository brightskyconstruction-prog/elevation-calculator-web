import React, { useEffect } from 'react';
import { useLang } from '../LangContext';

interface Props {
  onDone: () => void;
}

const SPLASH_DURATION = 2800;
const NAVY = '#163A63';
const GOLD = '#F5C542';

// ─── Leveling Rod SVG illustration ───────────────────────────────────────────
function LevelingRod() {
  return (
    <svg
      viewBox="0 0 70 230"
      width="70"
      height="230"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="rodBodyGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#d0d0d0" />
          <stop offset="18%"  stopColor="#f6f6f6" />
          <stop offset="82%"  stopColor="#f6f6f6" />
          <stop offset="100%" stopColor="#b8b8b8" />
        </linearGradient>
        <linearGradient id="goldSectionGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#e0a800" />
          <stop offset="20%"  stopColor={GOLD} />
          <stop offset="80%"  stopColor={GOLD} />
          <stop offset="100%" stopColor="#c89500" />
        </linearGradient>
      </defs>

      {/* ── Top cap ── */}
      <rect x="15" y="4"  width="40" height="6"  rx="2" fill="#3a3a3a" />
      <rect x="12" y="6"  width="5"  height="22" rx="1.5" fill="#4a4a4a" opacity="0.75" />
      <rect x="53" y="6"  width="5"  height="22" rx="1.5" fill="#4a4a4a" opacity="0.75" />

      {/* ── Rod body – white/light section ── */}
      <rect x="17" y="8" width="36" height="158" rx="2" fill="url(#rodBodyGrad)" />

      {/* ── Section 3 black graduation bars (top) ── */}
      <rect x="22" y="10"  width="22" height="9" fill="#181818" />
      <rect x="22" y="27"  width="22" height="9" fill="#181818" />
      <rect x="22" y="44"  width="22" height="9" fill="#181818" />
      <rect x="22" y="61"  width="22" height="9" fill="#181818" />
      <rect x="22" y="78"  width="22" height="9" fill="#181818" />

      {/* ── Red section divider 3 → 2 ── */}
      <rect x="17" y="99" width="36" height="3.5" fill="#D32F2F" />

      {/* ── Section 2 black graduation bars (mid) ── */}
      <rect x="22" y="105" width="22" height="9" fill="#181818" />
      <rect x="22" y="122" width="22" height="9" fill="#181818" />
      <rect x="22" y="139" width="22" height="9" fill="#181818" />
      <rect x="22" y="156" width="22" height="6" fill="#181818" />

      {/* ── Red section divider 2 → 1 ── */}
      <rect x="17" y="163" width="36" height="3.5" fill="#D32F2F" />

      {/* ── Gold / yellow section (section 1 – bottom) ── */}
      <rect x="17" y="166" width="36" height="57" fill="url(#goldSectionGrad)" rx="0" />

      {/* ── Section 1 dark graduation bars ── */}
      <rect x="22" y="168" width="22" height="9" fill="#1a1a1a" opacity="0.72" />
      <rect x="22" y="185" width="22" height="9" fill="#1a1a1a" opacity="0.72" />
      <rect x="22" y="202" width="22" height="9" fill="#1a1a1a" opacity="0.72" />

      {/* ── Section number labels ── */}
      {/* "3" — left of top section */}
      <text x="10" y="60"  textAnchor="middle" fill={GOLD} fontSize="13" fontWeight="900"
            fontFamily="'Arial Black', Arial, sans-serif">3</text>
      {/* "2" — left of mid section */}
      <text x="10" y="140" textAnchor="middle" fill={GOLD} fontSize="13" fontWeight="900"
            fontFamily="'Arial Black', Arial, sans-serif">2</text>
      {/* "1" — inside gold section */}
      <text x="35" y="210" textAnchor="middle" fill="#1a1a1a" fontSize="14" fontWeight="900"
            fontFamily="'Arial Black', Arial, sans-serif">1</text>

      {/* ── Left-side tick marks ── */}
      {[10,19,27,36,44,53,61,70,78,87,105,114,122,131,139,148,156,168,177,185,194,202].map((y, i) => (
        <line
          key={i}
          x1="17" y1={y + 4}
          x2={i % 4 === 0 ? 10 : 12}
          y2={y + 4}
          stroke="rgba(255,255,255,0.65)"
          strokeWidth={i % 4 === 0 ? 1.5 : 0.9}
        />
      ))}

      {/* ── Bottom foot / base ── */}
      <rect x="14" y="220" width="42" height="5" rx="2" fill={GOLD} />
      <rect x="10" y="224" width="50" height="4" rx="2" fill="#3a3a3a" />
    </svg>
  );
}

// ─── Splash screen component ──────────────────────────────────────────────────
export default function SplashScreenWeb({ onDone }: Props) {
  const { t } = useLang();

  useEffect(() => {
    const id = setTimeout(() => {
      try { sessionStorage.setItem('splash:shown', '1'); } catch {}
      onDone();
    }, SPLASH_DURATION);
    return () => clearTimeout(id);
  }, [onDone]);

  return (
    <div style={styles.root}>
      {/* Multi-layer gradient background */}
      <div style={styles.bg} />

      {/* Centre content — fades + slides up */}
      <div style={{ ...styles.center, animation: 'splashFadeUp 0.75s ease-out both' }}>

        {/* Rod glow halo */}
        <div style={styles.rodHalo} />

        {/* Leveling rod — scales in with slight spring */}
        <div style={{ ...styles.rodWrap, animation: 'splashScaleIn 0.85s cubic-bezier(0.34,1.5,0.64,1) both' }}>
          <LevelingRod />
        </div>

        {/* Title block */}
        <div style={styles.titleBlock}>
          <h1 style={styles.title}>{t('splashTitle')}</h1>
          <p  style={styles.tagline}>{t('splashTagline')}</p>
        </div>

        {/* Gold accent divider */}
        <div style={styles.divider} />

        {/* Version badge */}
        <p style={styles.version}>{t('splashVersion')}</p>
      </div>

      {/* "Powered by" — delayed fade in */}
      <p style={{ ...styles.poweredBy, animation: 'splashFadeUp 1s ease-out 0.5s both' }}>
        {t('splashPoweredBy')}
      </p>

      {/* Bottom progress bar */}
      <div style={styles.loadingBar}>
        <div style={styles.loadingFill} />
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  root: {
    position:        'fixed',
    inset:           0,
    backgroundColor: NAVY,
    display:         'flex',
    flexDirection:   'column',
    alignItems:      'center',
    justifyContent:  'center',
    zIndex:          9999,
    overflow:        'hidden',
  },
  bg: {
    position:      'absolute',
    inset:         0,
    background: `
      radial-gradient(ellipse at 50% 32%, rgba(245,197,66,0.14) 0%, transparent 52%),
      radial-gradient(ellipse at 18% 78%, rgba(59,130,246,0.10) 0%, transparent 42%),
      radial-gradient(ellipse at 85% 10%, rgba(245,197,66,0.07) 0%, transparent 38%)
    `,
    pointerEvents: 'none',
  },
  center: {
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    gap:            18,
    padding:        '0 32px',
    zIndex:         1,
    position:       'relative',
  },
  rodHalo: {
    position:       'absolute',
    top:            -20,
    left:           '50%',
    transform:      'translateX(-50%)',
    width:          140,
    height:         290,
    borderRadius:   '50%',
    background:     `radial-gradient(ellipse at center, rgba(245,197,66,0.22) 0%, transparent 68%)`,
    pointerEvents:  'none',
    zIndex:         0,
    animation:      'splashGlowPulse 2.4s ease-in-out 0.5s infinite',
  },
  rodWrap: {
    position:       'relative',
    zIndex:         1,
    filter:         'drop-shadow(0 6px 28px rgba(245,197,66,0.40)) drop-shadow(0 2px 8px rgba(0,0,0,0.45))',
  },
  titleBlock: {
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    gap:            8,
    textAlign:      'center',
  },
  title: {
    margin:         0,
    fontSize:       26,
    fontWeight:     800,
    color:          '#FFFFFF',
    letterSpacing:  '-0.4px',
    textAlign:      'center',
    fontFamily:     'inherit',
    lineHeight:     1.2,
  },
  tagline: {
    margin:         0,
    fontSize:       12,
    color:          'rgba(255,255,255,0.62)',
    letterSpacing:  0.2,
    textAlign:      'center',
    lineHeight:     1.55,
    maxWidth:       260,
  },
  divider: {
    width:          52,
    height:         3,
    backgroundColor: GOLD,
    borderRadius:   2,
  },
  version: {
    margin:         0,
    fontSize:       12,
    color:          GOLD,
    fontWeight:     600,
    letterSpacing:  0.5,
  },
  poweredBy: {
    position:       'absolute',
    bottom:         28,
    left:           0,
    right:          0,
    textAlign:      'center',
    fontSize:       11,
    color:          'rgba(255,255,255,0.42)',
    letterSpacing:  0.4,
    fontWeight:     500,
    zIndex:         1,
  },
  loadingBar: {
    position:        'absolute',
    bottom:          0,
    left:            0,
    right:           0,
    height:          3,
    backgroundColor: 'rgba(255,255,255,0.10)',
    overflow:        'hidden',
  },
  loadingFill: {
    height:          '100%',
    width:           '100%',
    backgroundColor: GOLD,
    animation:       `splashLoad ${SPLASH_DURATION}ms linear both`,
    transformOrigin: 'left center',
  },
};

// ─── Inject keyframe animations ───────────────────────────────────────────────
const STYLE_ID = '__splashKf';
if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = `
    @keyframes splashLoad {
      from { transform: scaleX(0); }
      to   { transform: scaleX(1); }
    }
    @keyframes splashFadeUp {
      from { opacity: 0; transform: translateY(14px); }
      to   { opacity: 1; transform: translateY(0);    }
    }
    @keyframes splashScaleIn {
      from { transform: scale(0.78); opacity: 0.4; }
      to   { transform: scale(1);    opacity: 1;   }
    }
    @keyframes splashGlowPulse {
      0%, 100% { opacity: 0.65; transform: translateX(-50%) scale(1);    }
      50%       { opacity: 1;   transform: translateX(-50%) scale(1.08); }
    }
  `;
  document.head.appendChild(el);
}
