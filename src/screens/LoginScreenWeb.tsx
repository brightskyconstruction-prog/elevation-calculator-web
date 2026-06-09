import React, { useState, useRef } from 'react';
import { SurveyIcon } from '../components/SurveyIcon';
import { useLang }    from '../LangContext';

interface Props {
  onLogin: (email: string) => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginScreenWeb({ onLogin }: Props) {
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
    // Brief visual delay for feedback, then store + proceed
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
      {/* Background gradient */}
      <div style={styles.bg} />

      <div style={styles.card}>
        {/* Logo */}
        <div style={styles.logoRow}>
          <div style={styles.logoWrap}>
            <SurveyIcon size={42} color="#F5C542" />
          </div>
          <div style={styles.logoText}>
            <span style={styles.appName}>{t('appTitle')}</span>
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
          {error && <span style={styles.errorMsg}>{error}</span>}
        </div>

        {/* Continue button */}
        <button
          style={{
            ...styles.btn,
            ...(loading ? styles.btnLoading : {}),
          }}
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading ? '…' : t('continueBtn')}
        </button>
      </div>

      {/* Footer */}
      <p style={styles.footer}>{t('appTitle')} · {t('version')}</p>
    </div>
  );
}

const NAVY  = '#163A63';
const GOLD2 = '#F4B02A';

const styles: Record<string, React.CSSProperties> = {
  root: {
    position:        'fixed',
    inset:           0,
    backgroundColor: '#F5F4F0',
    display:         'flex',
    flexDirection:   'column',
    alignItems:      'center',
    justifyContent:  'center',
    padding:         '24px 16px',
  },
  bg: {
    position:   'absolute',
    inset:      0,
    background: `linear-gradient(160deg, ${NAVY} 0%, ${NAVY} 38%, #F5F4F0 38%)`,
    zIndex:     0,
    pointerEvents: 'none',
  },
  card: {
    width:           '100%',
    maxWidth:        400,
    backgroundColor: '#FFFFFF',
    borderRadius:    20,
    padding:         '28px 24px',
    boxShadow:       '0 8px 40px rgba(0,0,0,0.14)',
    display:         'flex',
    flexDirection:   'column',
    gap:             20,
    position:        'relative',
    zIndex:          1,
  },
  logoRow: {
    display:    'flex',
    alignItems: 'center',
    gap:        14,
  },
  logoWrap: {
    width:           64,
    height:          64,
    borderRadius:    16,
    backgroundColor: NAVY,
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
  },
  logoText: {
    display:       'flex',
    flexDirection: 'column',
    gap:           3,
  },
  appName: {
    fontSize:      18,
    fontWeight:    800,
    color:         NAVY,
    letterSpacing: '-0.3px',
    lineHeight:    1.2,
  },
  appTag: {
    fontSize:  12,
    color:     '#6B7280',
    lineHeight: 1.3,
  },
  divider: {
    height:          2,
    backgroundColor: '#F3F4F6',
    borderRadius:    1,
    margin:          '-4px 0',
  },
  heading: {
    display:       'flex',
    flexDirection: 'column',
    gap:           4,
  },
  title: {
    margin:        0,
    fontSize:      22,
    fontWeight:    800,
    color:         '#111827',
    letterSpacing: '-0.3px',
    fontFamily:    'inherit',
  },
  subtitle: {
    margin:   0,
    fontSize: 14,
    color:    '#6B7280',
  },
  fieldWrap: {
    display:       'flex',
    flexDirection: 'column',
    gap:           6,
  },
  label: {
    fontSize:    13,
    fontWeight:  700,
    color:       '#374151',
    letterSpacing: 0.2,
  },
  input: {
    height:          50,
    borderRadius:    10,
    border:          '1.5px solid #D1D5DB',
    padding:         '0 14px',
    fontSize:        15,
    color:           '#111827',
    backgroundColor: '#FFFFFF',
    outline:         'none',
    boxSizing:       'border-box' as const,
    width:           '100%',
    transition:      'border-color 0.15s',
  },
  inputErr: {
    borderColor: '#EF4444',
  },
  errorMsg: {
    fontSize:  12,
    color:     '#EF4444',
    fontWeight: 500,
  },
  btn: {
    height:          52,
    borderRadius:    12,
    backgroundColor: NAVY,
    border:          `2px solid ${GOLD2}`,
    color:           '#FFFFFF',
    fontSize:        15,
    fontWeight:      800,
    letterSpacing:   0.8,
    cursor:          'pointer',
    transition:      'opacity 0.15s',
  },
  btnLoading: {
    opacity: 0.6,
    cursor:  'default',
  },
  footer: {
    position: 'relative',
    zIndex:   1,
    margin:   '18px 0 0',
    fontSize: 11,
    color:    'rgba(255,255,255,0.55)',
  },
};
