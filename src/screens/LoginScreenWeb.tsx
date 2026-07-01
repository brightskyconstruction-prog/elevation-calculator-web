import React, { useState, useRef, useEffect } from 'react';
import { useLang } from '../LangContext';

interface Props {
  onLogin:      (email: string) => void;
  onGuestLogin: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const NAVY       = '#163A63';
const GOLD2      = '#F4B02A';
const GOLD_LIGHT = 'rgba(244,176,42,0.18)';
const BORDER     = '#D1D5DB';
const ERR        = '#DC2626';

// ─── Decorative measurement tick strip ───────────────────────────────────────
function MeasureTicks() {
  const ticks: React.ReactNode[] = [];
  for (let i = 0; i <= 40; i++) {
    const isMajor = i % 5 === 0;
    ticks.push(
      <line
        key={i}
        x1={i * 10} y1={0}
        x2={i * 10} y2={isMajor ? 10 : 6}
        stroke={isMajor ? GOLD2 : 'rgba(244,176,42,0.45)'}
        strokeWidth={isMajor ? 1.5 : 1}
      />
    );
  }
  return (
    <svg
      viewBox="0 0 400 12"
      width="100%"
      height="12"
      preserveAspectRatio="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {ticks}
      <line x1="0" y1="0" x2="400" y2="0" stroke={GOLD2} strokeWidth="1.5" opacity="0.6" />
    </svg>
  );
}

// ─── Login screen ─────────────────────────────────────────────────────────────
export default function LoginScreenWeb({ onLogin, onGuestLogin }: Props) {
  const { t } = useLang();
  const [email,   setEmail]   = useState('');
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef  = useRef<HTMLInputElement>(null);
  const rootRef   = useRef<HTMLDivElement>(null);
  const cardRef   = useRef<HTMLDivElement>(null);

  // ── Keyboard-aware layout via visualViewport API ──────────────────────────
  // Strategy: the root div tracks the visual viewport (position:fixed,
  // height = vvp.height, top = vvp.offsetTop). Flexbox centers the card
  // inside that container. When the keyboard shrinks the viewport and the
  // card no longer fits, we apply a CSS translateY to the card so its
  // BOTTOM edge stays inside the visible area — keeping both buttons
  // fully visible at all times.
  //
  // This is a pure transform approach: nothing is resized or compressed.
  // The CSS transition on the card produces the smooth upward slide.
  useEffect(() => {
    const vvp = window.visualViewport;
    if (!vvp) return;

    let raf = 0;

    const sync = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const root = rootRef.current;
        const card = cardRef.current;
        if (!root || !card) return;

        const vh = vvp.height;

        // Make root cover exactly the visual viewport
        root.style.height = `${vh}px`;
        root.style.top    = `${vvp.offsetTop}px`;

        // Compute how far to translate the card.
        // With justify-content:center the card is naturally centered in `vh`.
        // When card fits (cardH + 2×PAD ≤ vh) no translation is needed —
        // flex already places it correctly.
        // When card is taller than the available viewport we translate it
        // upward so its bottom aligns with (vh − PAD), ensuring both buttons
        // are always in the visible area.
        const PAD   = 16;
        const cardH = card.offsetHeight;

        if (cardH + PAD * 2 <= vh) {
          // Card fits — let flex centering do the work
          card.style.transform = 'translateY(0px)';
        } else {
          // translateY = desired_bottom − natural_bottom
          //            = (vh − PAD) − (vh/2 + cardH/2)
          //            = vh/2 − PAD − cardH/2   (always negative → moves up)
          const ty = Math.round(vh / 2 - PAD - cardH / 2);
          card.style.transform = `translateY(${ty}px)`;
        }
      });
    };

    vvp.addEventListener('resize', sync);
    vvp.addEventListener('scroll', sync);
    sync(); // initial sync on mount

    return () => {
      cancelAnimationFrame(raf);
      vvp.removeEventListener('resize', sync);
      vvp.removeEventListener('scroll', sync);
    };
  }, []);

  const handleSubmit = () => {
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setError(t('invalidEmail'));
      inputRef.current?.focus();
      return;
    }
    setError('');
    setLoading(true);
    setTimeout(() => {
      try { localStorage.setItem('auth:email', trimmed); } catch {}
      onLogin(trimmed);
    }, 350);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit();
  };

  return (
    <div ref={rootRef} style={styles.root}>
      {/* Fixed gradient background — covers the full viewport at all times */}
      <div style={styles.bg} />

      <div ref={cardRef} style={styles.card}>
        {/* Gold top accent bar */}
        <div style={styles.topAccent} />

        {/* Measurement tick decoration */}
        <div style={styles.tickStrip}>
          <MeasureTicks />
        </div>

        {/* Logo row */}
        <div style={styles.logoRow}>
          <div style={styles.logoWrap}>
            <img
              src="/rod.png"
              alt=""
              style={styles.logoRod}
            />
          </div>
          <div style={styles.logoText}>
            <span style={styles.appName}>{t('splashTitle')}</span>
            <span style={styles.appTag}>{t('appTagline')}</span>
          </div>
        </div>

        {/* Divider */}
        <div style={styles.divider} />

        {/* Heading — tightened upward relative to previous layout */}
        <div style={styles.heading}>
          <h2 style={styles.title}>{t('loginTitle')}</h2>
          <p  style={styles.subtitle}>{t('loginSubtitle')}</p>
        </div>

        {/* Email field */}
        <div style={styles.fieldWrap}>
          <label style={styles.label}>{t('emailLabel')}</label>
          <div style={styles.inputWrap}>
            {/* @ icon */}
            <span style={styles.inputIcon}>@</span>
            <input
              ref={inputRef}
              type="email"
              autoFocus
              style={{
                ...styles.input,
                ...(error ? styles.inputErr : {}),
              }}
              value={email}
              placeholder={t('emailPlaceholder')}
              onChange={e => { setEmail(e.target.value); if (error) setError(''); }}
              onKeyDown={handleKey}
              autoComplete="email"
            />
          </div>
          {error && (
            <span style={styles.errorMsg}>
              <span style={styles.errorDot}>●</span> {error}
            </span>
          )}
        </div>

        {/* Primary — Continue */}
        <button
          style={{ ...styles.btnPrimary, ...(loading ? styles.btnLoading : {}) }}
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading ? '…' : t('continueBtn')}
        </button>

        {/* Divider with "or" — compact */}
        <div style={styles.orRow}>
          <div style={styles.orLine} />
          <span style={styles.orText}>or</span>
          <div style={styles.orLine} />
        </div>

        {/* Secondary — Continue as Guest */}
        <button
          style={styles.btnGuest}
          onClick={onGuestLogin}
          disabled={loading}
        >
          {t('continueAsGuest')}
        </button>
      </div>

      {/* Footer */}
      <p style={styles.footer}>
        {t('appTitle')} · {t('version')}
      </p>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  // Root: position:fixed, tracks the visual viewport via JS (height + top are
  // overridden by the visualViewport sync). overflow:hidden prevents scrollbars
  // — the card translates instead of the container scrolling.
  root: {
    position:      'fixed',
    top:           0,
    left:          0,
    right:         0,
    height:        '100dvh',   // overridden by visualViewport JS
    display:       'flex',
    flexDirection: 'column',
    alignItems:    'center',
    justifyContent:'center',   // card centers naturally when keyboard is closed
    padding:       '12px 16px',
    overflow:      'hidden',   // no scrollbars — card translates instead
    boxSizing:     'border-box',
  },
  // Background: also fixed so it always fills the viewport even when root
  // resizes with the keyboard.
  bg: {
    position:   'fixed',
    inset:      0,
    background: `linear-gradient(158deg, ${NAVY} 0%, ${NAVY} 36%, #F0EEE8 36%)`,
    zIndex:     0,
    pointerEvents: 'none',
  },
  card: {
    width:           '100%',
    maxWidth:        400,
    backgroundColor: '#FFFFFF',
    borderRadius:    20,
    boxShadow:       '0 12px 48px rgba(0,0,0,0.16), 0 2px 8px rgba(0,0,0,0.08)',
    display:         'flex',
    flexDirection:   'column',
    gap:             12,
    position:        'relative',
    zIndex:          1,
    overflow:        'hidden',
    paddingBottom:   20,
    // flex-shrink:0 prevents the flex parent (root) from compressing the card
    // when the visual viewport shrinks with the keyboard open.
    // Without this, flex-shrink:1 (the default) would squeeze the card to fit.
    flexShrink:      0,
    // Smooth upward slide when keyboard opens (translateY applied by JS).
    // will-change hints to the browser to composite this layer for GPU accel.
    transition:      'transform 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
    willChange:      'transform',
  },
  topAccent: {
    height:     5,
    background: `linear-gradient(90deg, ${NAVY}, ${GOLD2} 50%, ${NAVY})`,
    flexShrink: 0,
  },
  tickStrip: {
    padding:   '0 20px',
    marginTop: -4,
    opacity:   0.9,
  },
  logoRow: {
    display:    'flex',
    alignItems: 'center',
    gap:        13,
    padding:    '0 24px',
    marginTop:  2,
  },
  logoWrap: {
    width:           56,
    height:          56,
    borderRadius:    14,
    backgroundColor: NAVY,
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
    boxShadow:       `0 2px 10px rgba(22,58,99,0.30)`,
    overflow:        'hidden',
  },
  logoRod: {
    width:        '100%',
    height:       '100%',
    objectFit:    'contain' as const,
    mixBlendMode: 'screen'  as const,
    display:      'block',
  },
  logoText: {
    display:       'flex',
    flexDirection: 'column',
    gap:           3,
    minWidth:      0,
  },
  appName: {
    fontSize:      17,
    fontWeight:    800,
    color:         NAVY,
    letterSpacing: '-0.3px',
    lineHeight:    1.2,
  },
  appTag: {
    fontSize:   11.5,
    color:      '#6B7280',
    lineHeight: 1.3,
  },
  divider: {
    height:          1.5,
    backgroundColor: '#F3F4F6',
    margin:          '0 24px',
  },
  // Heading pulled closer to the logo/divider (marginTop compensates for card gap)
  heading: {
    display:       'flex',
    flexDirection: 'column',
    gap:           3,
    padding:       '0 24px',
    marginTop:     -2,
  },
  title: {
    margin:        0,
    fontSize:      21,
    fontWeight:    800,
    color:         '#111827',
    letterSpacing: '-0.3px',
    fontFamily:    'inherit',
  },
  subtitle: {
    margin:     0,
    fontSize:   13,
    color:      '#6B7280',
    lineHeight: 1.4,
  },
  fieldWrap: {
    display:       'flex',
    flexDirection: 'column',
    gap:           6,
    padding:       '0 24px',
  },
  label: {
    fontSize:      12,
    fontWeight:    700,
    color:         '#374151',
    letterSpacing: 0.3,
    textTransform: 'uppercase' as const,
  },
  inputWrap: {
    position: 'relative',
    display:  'flex',
    alignItems:'center',
  },
  inputIcon: {
    position:      'absolute',
    left:          14,
    fontSize:      16,
    fontWeight:    700,
    color:         '#9CA3AF',
    pointerEvents: 'none',
    userSelect:    'none' as const,
  },
  input: {
    height:          48,
    width:           '100%',
    borderRadius:    12,
    border:          `1.5px solid ${BORDER}`,
    padding:         '0 14px 0 38px',
    fontSize:        15,
    color:           '#111827',
    backgroundColor: '#FAFAFA',
    outline:         'none',
    boxSizing:       'border-box' as const,
    transition:      'border-color 0.15s, box-shadow 0.15s',
  },
  inputErr: {
    borderColor:     ERR,
    backgroundColor: '#FFF5F5',
  },
  errorMsg: {
    fontSize:   12,
    color:      ERR,
    fontWeight: 500,
    display:    'flex',
    alignItems: 'center',
    gap:        5,
  },
  errorDot: {
    fontSize: 7,
  },
  btnPrimary: {
    // Reduced height (was 52) while remaining comfortably tappable
    height:        46,
    margin:        '0 24px',
    borderRadius:  13,
    backgroundColor: NAVY,
    border:        `2px solid ${GOLD2}`,
    color:         '#FFFFFF',
    // Slightly larger font (was 15) for better legibility
    fontSize:      16,
    fontWeight:    800,
    letterSpacing: 0.8,
    cursor:        'pointer',
    transition:    'opacity 0.15s, transform 0.1s',
    boxShadow:     `0 4px 16px rgba(22,58,99,0.28)`,
  },
  btnLoading: {
    opacity: 0.6,
    cursor:  'default',
  },
  // orRow negative margins cancel out the card's gap so the two buttons sit
  // visually closer together than other card sections.
  orRow: {
    display:    'flex',
    alignItems: 'center',
    gap:        10,
    padding:    '0 24px',
    marginTop:  -5,
    marginBottom: -5,
  },
  orLine: {
    flex:            1,
    height:          1,
    backgroundColor: BORDER,
  },
  orText: {
    fontSize:      12,
    color:         '#9CA3AF',
    fontWeight:    600,
    letterSpacing: 0.3,
  },
  btnGuest: {
    // Same height as primary for visual consistency
    height:        46,
    margin:        '0 24px',
    borderRadius:  13,
    backgroundColor: GOLD_LIGHT,
    border:        `1.5px solid ${GOLD2}`,
    color:         NAVY,
    fontSize:      16,
    fontWeight:    700,
    letterSpacing: 0.4,
    cursor:        'pointer',
    transition:    'background-color 0.15s, opacity 0.15s',
  },
  footer: {
    // Absolute so it doesn't participate in flex centering (which would throw
    // off the card-centering math). Sits at the bottom of the visual viewport.
    // Naturally hidden by overflow:hidden when the keyboard pushes it out.
    position:  'absolute',
    bottom:    10,
    left:      0,
    right:     0,
    zIndex:    1,
    fontSize:  11,
    color:     'rgba(255,255,255,0.50)',
    textAlign: 'center' as const,
  },
};
