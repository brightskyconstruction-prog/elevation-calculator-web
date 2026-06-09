import React, { useEffect } from 'react';
import { SurveyIcon } from '../components/SurveyIcon';
import { useLang }    from '../LangContext';

interface Props {
  onDone: () => void;
}

const SPLASH_DURATION = 2000;

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
      {/* Subtle background pattern */}
      <div style={styles.bgPattern} />

      {/* Center content */}
      <div style={styles.center}>
        {/* Logo container */}
        <div style={styles.logoWrap}>
          <SurveyIcon size={72} color="#F5C542" />
        </div>

        {/* Title */}
        <div style={styles.titleBlock}>
          <h1 style={styles.title}>{t('splashTitle')}</h1>
          <p  style={styles.tagline}>{t('splashTagline')}</p>
        </div>

        {/* Gold divider */}
        <div style={styles.divider} />

        {/* Version */}
        <p style={styles.version}>{t('splashVersion')}</p>
      </div>

      {/* Bottom loading bar */}
      <div style={styles.loadingBar}>
        <div style={styles.loadingFill} />
      </div>
    </div>
  );
}

const NAVY  = '#163A63';
const GOLD  = '#F5C542';

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
  bgPattern: {
    position:   'absolute',
    inset:      0,
    background: `radial-gradient(ellipse at 30% 20%, rgba(245,197,66,0.07) 0%, transparent 60%),
                 radial-gradient(ellipse at 70% 80%, rgba(59,130,246,0.08) 0%, transparent 55%)`,
    pointerEvents: 'none',
  },
  center: {
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    gap:            20,
    padding:        '0 32px',
    zIndex:         1,
  },
  logoWrap: {
    width:           110,
    height:          110,
    borderRadius:    28,
    backgroundColor: 'rgba(255,255,255,0.08)',
    border:          `2px solid rgba(245,197,66,0.35)`,
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    boxShadow:       `0 0 40px rgba(245,197,66,0.18)`,
  },
  titleBlock: {
    display:   'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap:        8,
  },
  title: {
    margin:        0,
    fontSize:      28,
    fontWeight:    800,
    color:         '#FFFFFF',
    letterSpacing: '-0.5px',
    textAlign:     'center',
    fontFamily:    'inherit',
  },
  tagline: {
    margin:        0,
    fontSize:      13,
    color:         'rgba(255,255,255,0.65)',
    letterSpacing: 0.2,
    textAlign:     'center',
    lineHeight:    1.4,
  },
  divider: {
    width:           48,
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
  loadingBar: {
    position:        'absolute',
    bottom:          0,
    left:            0,
    right:           0,
    height:          3,
    backgroundColor: 'rgba(255,255,255,0.12)',
    overflow:        'hidden',
  },
  loadingFill: {
    height:     '100%',
    width:      '100%',
    backgroundColor: GOLD,
    animation:  `splashLoad ${SPLASH_DURATION}ms linear forwards`,
    transformOrigin: 'left center',
  },
};

// Inject keyframe animation once
const STYLE_ID = '__splashKf';
if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = `@keyframes splashLoad { from { transform: scaleX(0); } to { transform: scaleX(1); } }`;
  document.head.appendChild(el);
}
