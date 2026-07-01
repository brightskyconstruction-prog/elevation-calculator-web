import React, { useState, useRef, useEffect, useCallback } from 'react';
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

  // ── Keyboard-aware layout via visualViewport API ──────────────────────────
  // When the soft keyboard opens, the visual viewport shrinks. We update the
  // container's height and vertical offset to always match the visible area.
  // Because the root uses flex-start + card margins for centering, all overflow
  // goes to the bottom — scrollTop = scrollHeight always reveals both buttons.
  useEffect(() => {
    const vvp = window.visualViewport;
    if (!vvp) return;

    let raf = 0;
    let prevHeight = vvp.height;

    const sync = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = rootRef.current;
        if (!el) return;

        const newHeight = vvp.height;
        const keyboardOpened = newHeight < prevHeight - 100;

        // offsetTop: visual viewport's position relative to the layout viewport.
        // For position:fixed elements this shifts "top" when the keyboard opens
        // or the browser chrome (URL bar) slides in/out.
        el.style.height = `${newHeight}px`;
        el.style.top    = `${vvp.offsetTop}px`;
        prevHeight = newHeight;

        // Auto-scroll to bottom when keyboard opens so both buttons are visible.
        // A second rAF lets the height update paint first.
        if (keyboardOpened) {
          requestAnimationFrame(() => {
            if (rootRef.current) rootRef.current.scrollTop = rootRef.current.scrollHeight;
          });
        }
      });
    };

    vvp.addEventListener('resize', sync);
    vvp.addEventListener('scroll', sync);
    sync(); // initial sync

    return () => {
      cancelAnimationFrame(raf);
      vvp.removeEventListener('resize', sync);
      vvp.removeEventListener('scroll', sync);
    };
  }, []);

  // Fallback scroll on focus (covers edge cases where visualViewport fires
  // before the keyboard has fully appeared and height hasn't changed yet).
  const handleInputFocus = useCallback(() => {
    setTimeout(() => {
      const el = rootRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }, 350);
  }, []);

  const handleInputBlur = useCallback(() => {
    setTimeout(() => {
      const el = rootRef.current;
      if (el) el.scrollTop = 0;
    }, 100);
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

      <div style={styles.card}>
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
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
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
  // Root: position:fixed so the visualViewport JS can set height/top directly.
  // overflow-y:auto allows scrolling if the card ever exceeds the visible area.
  root: {
    position:      'fixed',
    top:           0,
    left:          0,
    right:         0,
    height:        '100dvh',   // overridden by visualViewport JS
    display:       'flex',
    flexDirection: 'column',
    alignItems:    'center',
    justifyContent:'flex-start',
    padding:       '12px 16px',
    overflowY:     'auto',
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
    // Reduced gap (was 18) — tightens all inter-section spacing uniformly
    gap:             12,
    position:        'relative',
    zIndex:          1,
    overflow:        'hidden',
    paddingBottom:   20,
    // Centers the card within the flex-start root. When the keyboard opens
    // and the container shrinks, marginTop compresses first — all overflow
    // goes to the bottom, which is fully scrollable.
    marginTop:       'auto',
    marginBottom:    'auto',
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
    position:  'relative',
    zIndex:    1,
    margin:    '12px 0 0',
    fontSize:  11,
    color:     'rgba(255,255,255,0.50)',
    textAlign: 'center',
  },
};
