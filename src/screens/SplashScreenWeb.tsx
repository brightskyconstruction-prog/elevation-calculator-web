import React, { useEffect } from 'react';
import { LevelingRodIcon } from '../components/LevelingRodIcon';
import { useLang }         from '../LangContext';

interface Props {
  onDone: () => void;
}

const SPLASH_DURATION = 2800;
const NAVY = '#163A63';
const GOLD = '#F5C542';

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

      {/* Centre content — fades + slides up on load */}
      <div style={{ ...styles.center, animation: 'splashFadeUp 0.75s ease-out both' }}>

        {/* Glow halo behind the rod */}
        <div style={styles.rodHalo} />

        {/* Leveling rod — scales in with a spring */}
        <div style={{ ...styles.rodWrap, animation: 'splashScaleIn 0.85s cubic-bezier(0.34,1.5,0.64,1) both' }}>
          <LevelingRodIcon size="large" />
        </div>

        {/* Title */}
        <div style={styles.titleBlock}>
          <h1 style={styles.title}>{t('splashTitle')}</h1>
          <p  style={styles.tagline}>{t('splashTagline')}</p>
        </div>

        {/* Gold accent divider */}
        <div style={styles.divider} />

        {/* Version */}
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
      radial-gradient(ellipse at 50% 34%, rgba(245,197,66,0.13) 0%, transparent 50%),
      radial-gradient(ellipse at 18% 78%, rgba(59,130,246,0.09) 0%, transparent 42%),
      radial-gradient(ellipse at 85% 10%, rgba(245,197,66,0.07) 0%, transparent 38%)
    `,
    pointerEvents: 'none',
  },
  center: {
    display:       'flex',
    flexDirection: 'column',
    alignItems:    'center',
    gap:           18,
    padding:       '0 32px',
    zIndex:        1,
    position:      'relative',
  },
  rodHalo: {
    position:      'absolute',
    top:           -24,
    left:          '50%',
    transform:     'translateX(-50%)',
    width:         130,
    height:        300,
    borderRadius:  '50%',
    background:    'radial-gradient(ellipse at center, rgba(245,197,66,0.20) 0%, transparent 68%)',
    pointerEvents: 'none',
    zIndex:        0,
    animation:     'splashGlowPulse 2.6s ease-in-out 0.6s infinite',
  },
  rodWrap: {
    position: 'relative',
    zIndex:   1,
    filter:   'drop-shadow(0 8px 32px rgba(0,0,0,0.55)) drop-shadow(0 2px 8px rgba(0,0,0,0.35))',
  },
  titleBlock: {
    display:       'flex',
    flexDirection: 'column',
    alignItems:    'center',
    gap:           8,
  },
  title: {
    margin:        0,
    fontSize:      26,
    fontWeight:    800,
    color:         '#FFFFFF',
    letterSpacing: '-0.4px',
    textAlign:     'center',
    fontFamily:    'inherit',
    lineHeight:    1.2,
  },
  tagline: {
    margin:        0,
    fontSize:      12,
    color:         'rgba(255,255,255,0.62)',
    letterSpacing: 0.2,
    textAlign:     'center',
    lineHeight:    1.55,
    maxWidth:      260,
  },
  divider: {
    width:           52,
    height:          3,
    backgroundColor: GOLD,
    borderRadius:    2,
  },
  version: {
    margin:        0,
    fontSize:      12,
    color:         GOLD,
    fontWeight:    600,
    letterSpacing: 0.5,
  },
  poweredBy: {
    position:  'absolute',
    bottom:    28,
    left:      0,
    right:     0,
    textAlign: 'center',
    fontSize:  11,
    color:     'rgba(255,255,255,0.40)',
    letterSpacing: 0.4,
    fontWeight: 500,
    zIndex:    1,
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

// ─── Inject keyframe animations once ─────────────────────────────────────────
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
      from { transform: scale(0.78); opacity: 0.5; }
      to   { transform: scale(1);    opacity: 1;   }
    }
    @keyframes splashGlowPulse {
      0%, 100% { opacity: 0.6;  transform: translateX(-50%) scale(1);    }
      50%       { opacity: 1.0; transform: translateX(-50%) scale(1.07); }
    }
  `;
  document.head.appendChild(el);
}
