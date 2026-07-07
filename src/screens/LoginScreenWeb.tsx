import React, { useState, useRef, useEffect } from 'react';
import { useLang } from '../LangContext';
import { strings } from '../i18n';
import PrivacyPolicyModal from '../components/PrivacyPolicyModal';
import {
  isFirebaseConfigured,
  isEmailSignInLink,
  getStoredSignInEmail,
  completeEmailSignIn,
  sendSignInLink,
} from '../firebase';

// ─── Login screen modes ───────────────────────────────────────────────────────
// 'enter-email'   — initial state: email input + "Send Sign-In Link" button
// 'link-sent'     — user hit send: show "Check your email" confirmation
// 'completing'    — URL is a sign-in link, auto-completing in background
// 'confirm-email' — sign-in link opened on different device: ask for email
type Mode = 'enter-email' | 'link-sent' | 'completing' | 'confirm-email';

interface Props {
  /** Called after successful Firebase Email Link sign-in with email + Firebase UID. */
  onLogin:      (email: string, uid: string) => void;
  onGuestLogin: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const NAVY       = '#163A63';
const GOLD2      = '#F4B02A';
const GOLD_LIGHT = 'rgba(244,176,42,0.18)';
const BORDER     = '#D1D5DB';
const ERR        = '#DC2626';
const GREEN      = '#065F46';

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
  const { t, lang } = useLang();
  const [mode,         setMode]         = useState<Mode>('enter-email');
  const [email,        setEmail]        = useState('');
  const [error,        setError]        = useState('');
  const [loading,      setLoading]      = useState(false);
  const [showPrivacy,  setShowPrivacy]  = useState(false);
  const [privacyTab,   setPrivacyTab]   = useState<'privacy' | 'terms'>('privacy');
  const inputRef  = useRef<HTMLInputElement>(null);
  const rootRef   = useRef<HTMLDivElement>(null);
  const cardRef   = useRef<HTMLDivElement>(null);

  // ── On mount: check if the current URL is a sign-in link ─────────────────
  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    if (!isEmailSignInLink(window.location.href)) return;

    const storedEmail = getStoredSignInEmail();
    if (storedEmail) {
      // Same device — auto-complete silently
      setMode('completing');
      completeEmailSignIn(storedEmail, window.location.href)
        .then(user => {
          window.history.replaceState({}, document.title, '/');
          try { localStorage.setItem('auth:email', storedEmail); } catch {}
          onLogin(storedEmail, user.uid);
        })
        .catch(err => {
          console.error('[Login] Email link sign-in failed:', err);
          setError(t('signInLinkExpired'));
          setMode('enter-email');
          window.history.replaceState({}, document.title, '/');
        });
    } else {
      // Different device — ask the user to confirm their email
      setMode('confirm-email');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Keyboard-aware layout via visualViewport API ──────────────────────────
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
        const vh  = vvp.height;
        root.style.height = `${vh}px`;
        root.style.top    = `${vvp.offsetTop}px`;
        const PAD   = 16;
        const cardH = card.offsetHeight;
        if (cardH + PAD * 2 <= vh) {
          card.style.transform = 'translateY(0px)';
        } else {
          const ty = Math.round(vh / 2 - PAD - cardH / 2);
          card.style.transform = `translateY(${ty}px)`;
        }
      });
    };
    vvp.addEventListener('resize', sync);
    vvp.addEventListener('scroll', sync);
    sync();
    return () => {
      cancelAnimationFrame(raf);
      vvp.removeEventListener('resize', sync);
      vvp.removeEventListener('scroll', sync);
    };
  }, []);

  // ── Send sign-in link ─────────────────────────────────────────────────────
  const handleSendLink = async () => {
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setError(t('invalidEmail'));
      inputRef.current?.focus();
      return;
    }
    setError('');
    setLoading(true);
    try {
      if (isFirebaseConfigured()) {
        await sendSignInLink(trimmed);
        setMode('link-sent');
      } else {
        // Firebase not configured — fall back to instant (guest-like) login
        try { localStorage.setItem('auth:email', trimmed); } catch {}
        onLogin(trimmed, '');
      }
    } catch (err) {
      console.error('[Login] sendSignInLink failed:', err);
      setError(t('sendLinkError'));
    } finally {
      setLoading(false);
    }
  };

  // ── Complete sign-in on a different device ────────────────────────────────
  const handleConfirmEmail = async () => {
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setError(t('invalidEmail'));
      inputRef.current?.focus();
      return;
    }
    setError('');
    setLoading(true);
    try {
      const user = await completeEmailSignIn(trimmed, window.location.href);
      window.history.replaceState({}, document.title, '/');
      try { localStorage.setItem('auth:email', trimmed); } catch {}
      onLogin(trimmed, user.uid);
    } catch (err) {
      console.error('[Login] confirmEmail sign-in failed:', err);
      setError(t('signInLinkExpired'));
      setMode('enter-email');
      window.history.replaceState({}, document.title, '/');
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    if (mode === 'enter-email')   handleSendLink();
    if (mode === 'confirm-email') handleConfirmEmail();
  };

  // ─── Shared card header ──────────────────────────────────────────────────
  const CardHeader = () => (
    <>
      <div style={styles.topAccent} />
      <div style={styles.tickStrip}><MeasureTicks /></div>
      <div style={styles.logoRow}>
        <div style={styles.logoWrap}>
          <img src="/rod.png" alt="" style={styles.logoRod} />
        </div>
        <div style={styles.logoText}>
          <span style={styles.appName}>{t('splashTitle')}</span>
          <span style={styles.appTag}>{t('appTagline')}</span>
        </div>
      </div>
      <div style={styles.divider} />
    </>
  );

  // ─── "Signing you in…" screen ────────────────────────────────────────────
  if (mode === 'completing') {
    return (
      <div ref={rootRef} style={styles.root}>
        <div style={styles.bg} />
        <div ref={cardRef} style={styles.card}>
          <CardHeader />
          <div style={styles.centerBlock}>
            <div style={styles.spinner} aria-hidden="true" />
            <p style={styles.centerTitle}>{t('completingSignIn')}</p>
          </div>
        </div>
        <p style={styles.footer}>{t('appTitle')} · {t('version')}</p>
      </div>
    );
  }

  // ─── "Check your email" screen ───────────────────────────────────────────
  if (mode === 'link-sent') {
    return (
      <div ref={rootRef} style={styles.root}>
        <div style={styles.bg} />
        <div ref={cardRef} style={styles.card}>
          <CardHeader />
          <div style={styles.centerBlock}>
            <div style={styles.mailIcon} aria-hidden="true">📧</div>
            <h2 style={styles.checkTitle}>{t('checkEmailTitle')}</h2>
            <p style={styles.checkMsg}>
              {strings[lang].checkEmailMsg(email.trim())}
            </p>
          </div>
          <button
            style={styles.btnOutline}
            onClick={() => { setMode('enter-email'); setEmail(''); }}
          >
            {t('resendLink')}
          </button>
          <div style={styles.legalRow}>
            <button style={styles.legalLink} onClick={() => { setPrivacyTab('privacy'); setShowPrivacy(true); }}>
              {t('settingsPrivacy')}
            </button>
            <span style={styles.legalDot}>·</span>
            <button style={styles.legalLink} onClick={() => { setPrivacyTab('terms'); setShowPrivacy(true); }}>
              {t('settingsTerms')}
            </button>
          </div>
        </div>
        <p style={styles.footer}>{t('appTitle')} · {t('version')}</p>
        {showPrivacy && <PrivacyPolicyModal initialTab={privacyTab} onClose={() => setShowPrivacy(false)} />}
      </div>
    );
  }

  // ─── "Confirm email" screen (different device) ───────────────────────────
  if (mode === 'confirm-email') {
    return (
      <div ref={rootRef} style={styles.root}>
        <div style={styles.bg} />
        <div ref={cardRef} style={styles.card}>
          <CardHeader />
          <div style={styles.heading}>
            <h2 style={styles.title}>{t('confirmEmailTitle')}</h2>
            <p  style={styles.subtitle}>{t('confirmEmailMsg')}</p>
          </div>
          <div style={styles.fieldWrap}>
            <label style={styles.label}>{t('emailLabel')}</label>
            <div style={styles.inputWrap}>
              <span style={styles.inputIcon}>@</span>
              <input
                ref={inputRef}
                type="email"
                autoFocus
                style={{ ...styles.input, ...(error ? styles.inputErr : {}) }}
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
          <button
            style={{ ...styles.btnPrimary, ...(loading ? styles.btnLoading : {}) }}
            onClick={handleConfirmEmail}
            disabled={loading}
          >
            {loading ? '…' : t('confirmAndSignIn')}
          </button>
          <div style={styles.legalRow}>
            <button style={styles.legalLink} onClick={() => { setPrivacyTab('privacy'); setShowPrivacy(true); }}>
              {t('settingsPrivacy')}
            </button>
            <span style={styles.legalDot}>·</span>
            <button style={styles.legalLink} onClick={() => { setPrivacyTab('terms'); setShowPrivacy(true); }}>
              {t('settingsTerms')}
            </button>
          </div>
        </div>
        <p style={styles.footer}>{t('appTitle')} · {t('version')}</p>
        {showPrivacy && <PrivacyPolicyModal initialTab={privacyTab} onClose={() => setShowPrivacy(false)} />}
      </div>
    );
  }

  // ─── Default: email entry screen ─────────────────────────────────────────
  return (
    <div ref={rootRef} style={styles.root}>
      <div style={styles.bg} />
      <div ref={cardRef} style={styles.card}>
        <CardHeader />
        <div style={styles.heading}>
          <h2 style={styles.title}>{t('loginTitle')}</h2>
          <p  style={styles.subtitle}>{t('loginSubtitle')}</p>
        </div>
        <div style={styles.fieldWrap}>
          <label style={styles.label}>{t('emailLabel')}</label>
          <div style={styles.inputWrap}>
            <span style={styles.inputIcon}>@</span>
            <input
              ref={inputRef}
              type="email"
              autoFocus
              style={{ ...styles.input, ...(error ? styles.inputErr : {}) }}
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

        {/* Primary — Send Sign-In Link */}
        <button
          style={{ ...styles.btnPrimary, ...(loading ? styles.btnLoading : {}) }}
          onClick={handleSendLink}
          disabled={loading}
        >
          {loading ? '…' : t('sendLinkBtn')}
        </button>

        {/* Divider */}
        <div style={styles.orRow}>
          <div style={styles.orLine} />
          <span style={styles.orText}>or</span>
          <div style={styles.orLine} />
        </div>

        {/* Secondary — Continue as Guest */}
        <button style={styles.btnGuest} onClick={onGuestLogin} disabled={loading}>
          {t('continueAsGuest')}
        </button>

        {/* Privacy / Terms links */}
        <div style={styles.legalRow}>
          <button style={styles.legalLink} onClick={() => { setPrivacyTab('privacy'); setShowPrivacy(true); }}>
            {t('settingsPrivacy')}
          </button>
          <span style={styles.legalDot}>·</span>
          <button style={styles.legalLink} onClick={() => { setPrivacyTab('terms'); setShowPrivacy(true); }}>
            {t('settingsTerms')}
          </button>
        </div>
      </div>

      <p style={styles.footer}>{t('appTitle')} · {t('version')}</p>

      {showPrivacy && (
        <PrivacyPolicyModal initialTab={privacyTab} onClose={() => setShowPrivacy(false)} />
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  root: {
    position:       'fixed',
    top:            0,
    left:           0,
    right:          0,
    height:         '100dvh',
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    justifyContent: 'center',
    padding:        '12px 16px',
    overflow:       'hidden',
    boxSizing:      'border-box',
  },
  bg: {
    position:      'fixed',
    inset:         0,
    background:    `linear-gradient(158deg, ${NAVY} 0%, ${NAVY} 36%, #F0EEE8 36%)`,
    zIndex:        0,
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
    flexShrink:      0,
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
    position:   'relative',
    display:    'flex',
    alignItems: 'center',
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
  errorDot: { fontSize: 7 },
  btnPrimary: {
    height:          46,
    margin:          '0 24px',
    borderRadius:    13,
    backgroundColor: NAVY,
    border:          `2px solid ${GOLD2}`,
    color:           '#FFFFFF',
    fontSize:        16,
    fontWeight:      800,
    letterSpacing:   0.8,
    cursor:          'pointer',
    transition:      'opacity 0.15s, transform 0.1s',
    boxShadow:       `0 4px 16px rgba(22,58,99,0.28)`,
  },
  btnLoading: {
    opacity: 0.6,
    cursor:  'default',
  },
  orRow: {
    display:      'flex',
    alignItems:   'center',
    gap:          10,
    padding:      '0 24px',
    marginTop:    -5,
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
    height:          46,
    margin:          '0 24px',
    borderRadius:    13,
    backgroundColor: GOLD_LIGHT,
    border:          `1.5px solid ${GOLD2}`,
    color:           NAVY,
    fontSize:        16,
    fontWeight:      700,
    letterSpacing:   0.4,
    cursor:          'pointer',
    transition:      'background-color 0.15s, opacity 0.15s',
  },
  btnOutline: {
    height:          44,
    margin:          '0 24px',
    borderRadius:    13,
    backgroundColor: 'transparent',
    border:          `1.5px solid ${BORDER}`,
    color:           '#6B7280',
    fontSize:        14,
    fontWeight:      700,
    cursor:          'pointer',
  },
  legalRow: {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            8,
    padding:        '2px 24px 0',
    marginTop:      -4,
  },
  legalLink: {
    background:          'none',
    border:              'none',
    color:               '#9CA3AF',
    fontSize:            11,
    fontWeight:          600,
    cursor:              'pointer',
    padding:             '4px 0',
    textDecoration:      'underline',
    textUnderlineOffset: '2px',
    letterSpacing:       0.2,
  },
  legalDot: {
    fontSize: 11,
    color:    '#9CA3AF',
  },
  footer: {
    position:  'absolute',
    bottom:    10,
    left:      0,
    right:     0,
    zIndex:    1,
    fontSize:  11,
    color:     'rgba(255,255,255,0.50)',
    textAlign: 'center' as const,
  },
  // ── Completing / check-email screens ──
  centerBlock: {
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    padding:        '12px 24px 8px',
    gap:            10,
  },
  spinner: {
    width:          36,
    height:         36,
    borderRadius:   '50%',
    border:         `3px solid rgba(20,58,99,0.12)`,
    borderTopColor: NAVY,
    animation:      'loginSpin 0.8s linear infinite',
  },
  centerTitle: {
    margin:        0,
    fontSize:      15,
    fontWeight:    700,
    color:         '#374151',
    textAlign:     'center' as const,
  },
  mailIcon: {
    fontSize:   40,
    lineHeight: 1,
  },
  checkTitle: {
    margin:        0,
    fontSize:      20,
    fontWeight:    800,
    color:         '#111827',
    textAlign:     'center' as const,
    letterSpacing: '-0.2px',
    fontFamily:    'inherit',
  },
  checkMsg: {
    margin:     0,
    fontSize:   14,
    color:      '#6B7280',
    textAlign:  'center' as const,
    lineHeight: 1.55,
  },
  // Inline style for the spinner animation
  _spinnerKeyframes: {} as React.CSSProperties,
};

// Inject the spinner keyframe once (can't do this in inline styles)
if (typeof document !== 'undefined') {
  const id = 'login-spin-kf';
  if (!document.getElementById(id)) {
    const s = document.createElement('style');
    s.id = id;
    s.textContent = `@keyframes loginSpin { to { transform: rotate(360deg); } }`;
    document.head.appendChild(s);
  }
}
