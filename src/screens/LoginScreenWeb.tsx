import React, { useState, useRef } from 'react';
import { useLang } from '../LangContext';

interface Props {
  onLogin:      (email: string) => void;
  onGuestLogin: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const NAVY  = '#163A63';
const GOLD2 = '#F4B02A';
const GOLD_LIGHT = 'rgba(244,176,42,0.18)';
const BORDER = '#D1D5DB';
const ERR    = '#DC2626';

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
  const inputRef = useRef<HTMLInputElement>(null);

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
    <div style={styles.root}>
      {/* Angled background */}
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
            {/* mix-blend-mode:screen makes the black bg transparent,
                leaving only the white rod against the navy square */}
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

        {/* Heading */}
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

        {/* Divider with "or" */}
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
  root: {
    position:        'fixed',
    inset:           0,
    backgroundColor: '#F0EEE8',
    display:         'flex',
    flexDirection:   'column',
    alignItems:      'center',
    justifyContent:  'center',
    padding:         '20px 16px',
    overflowY:       'auto',
  },
  bg: {
    position:   'absolute',
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
    gap:             18,
    position:        'relative',
    zIndex:          1,
    overflow:        'hidden',
    paddingBottom:   24,
  },
  topAccent: {
    height:          5,
    background:      `linear-gradient(90deg, ${NAVY}, ${GOLD2} 50%, ${NAVY})`,
    flexShrink:      0,
  },
  tickStrip: {
    padding:        '0 20px',
    marginTop:      -4,
    opacity:        0.9,
  },
  logoRow: {
    display:        'flex',
    alignItems:     'center',
    gap:            13,
    padding:        '0 24px',
    marginTop:      2,
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
    mixBlendMode: 'screen' as const,
    display:      'block',
  },
  logoText: {
    display:        'flex',
    flexDirection:  'column',
    gap:            3,
    minWidth:       0,
  },
  appName: {
    fontSize:       17,
    fontWeight:     800,
    color:          NAVY,
    letterSpacing:  '-0.3px',
    lineHeight:     1.2,
  },
  appTag: {
    fontSize:       11.5,
    color:          '#6B7280',
    lineHeight:     1.3,
  },
  divider: {
    height:          1.5,
    backgroundColor: '#F3F4F6',
    margin:          '0 24px',
  },
  heading: {
    display:        'flex',
    flexDirection:  'column',
    gap:            4,
    padding:        '0 24px',
  },
  title: {
    margin:         0,
    fontSize:       22,
    fontWeight:     800,
    color:          '#111827',
    letterSpacing:  '-0.3px',
    fontFamily:     'inherit',
  },
  subtitle: {
    margin:         0,
    fontSize:       13.5,
    color:          '#6B7280',
    lineHeight:     1.4,
  },
  fieldWrap: {
    display:        'flex',
    flexDirection:  'column',
    gap:            6,
    padding:        '0 24px',
  },
  label: {
    fontSize:       12,
    fontWeight:     700,
    color:          '#374151',
    letterSpacing:  0.3,
    textTransform:  'uppercase' as const,
  },
  inputWrap: {
    position:       'relative',
    display:        'flex',
    alignItems:     'center',
  },
  inputIcon: {
    position:       'absolute',
    left:           14,
    fontSize:       16,
    fontWeight:     700,
    color:          '#9CA3AF',
    pointerEvents:  'none',
    userSelect:     'none' as const,
  },
  input: {
    height:          50,
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
    borderColor:    ERR,
    backgroundColor: '#FFF5F5',
  },
  errorMsg: {
    fontSize:       12,
    color:          ERR,
    fontWeight:     500,
    display:        'flex',
    alignItems:     'center',
    gap:            5,
  },
  errorDot: {
    fontSize:       7,
  },
  btnPrimary: {
    height:          52,
    margin:          '0 24px',
    borderRadius:    13,
    backgroundColor: NAVY,
    border:          `2px solid ${GOLD2}`,
    color:           '#FFFFFF',
    fontSize:        15,
    fontWeight:      800,
    letterSpacing:   0.8,
    cursor:          'pointer',
    transition:      'opacity 0.15s, transform 0.1s',
    boxShadow:       `0 4px 16px rgba(22,58,99,0.28)`,
  },
  btnLoading: {
    opacity:        0.6,
    cursor:         'default',
  },
  orRow: {
    display:        'flex',
    alignItems:     'center',
    gap:            10,
    padding:        '0 24px',
  },
  orLine: {
    flex:           1,
    height:         1,
    backgroundColor: BORDER,
  },
  orText: {
    fontSize:       12,
    color:          '#9CA3AF',
    fontWeight:     600,
    letterSpacing:  0.3,
  },
  btnGuest: {
    height:          50,
    margin:          '0 24px',
    borderRadius:    13,
    backgroundColor: GOLD_LIGHT,
    border:          `1.5px solid ${GOLD2}`,
    color:           NAVY,
    fontSize:        14,
    fontWeight:      700,
    letterSpacing:   0.4,
    cursor:          'pointer',
    transition:      'background-color 0.15s, opacity 0.15s',
  },
  footer: {
    position:       'relative',
    zIndex:         1,
    margin:         '16px 0 0',
    fontSize:       11,
    color:          'rgba(255,255,255,0.50)',
    textAlign:      'center',
  },
};
