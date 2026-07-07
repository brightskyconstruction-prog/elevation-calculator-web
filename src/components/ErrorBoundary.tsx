import React from 'react';
import { strings, Lang } from '../i18n';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error:    Error | null;
}

const NAVY = '#143A63';
const GOLD = '#F4B02A';

/** Read language from localStorage — safe to call in a class component. */
function getLang(): Lang {
  try {
    return localStorage.getItem('app:language') === 'es' ? 'es' : 'en';
  } catch {
    return 'en';
  }
}

/**
 * Root-level error boundary.
 * Catches any unhandled React render/lifecycle error and shows a
 * user-friendly recovery screen instead of a blank white page.
 * Wrap <App /> in this inside main.tsx.
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // In production, send to your error tracking service (e.g., Sentry):
    // Sentry.captureException(error, { extra: info });
    console.error('[ErrorBoundary] Unhandled React error:', error, info.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleClearAndReload = () => {
    try {
      // Data keys only — don't clear auth or language preferences
      const authEmail = localStorage.getItem('auth:email');
      const lang      = localStorage.getItem('app:language');
      localStorage.clear();
      if (authEmail) localStorage.setItem('auth:email', authEmail);
      if (lang)      localStorage.setItem('app:language', lang);
    } catch { /* ignore */ }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const s = strings[getLang()];
      return (
        <div style={styles.root}>
          <div style={styles.card}>
            {/* Top accent */}
            <div style={styles.accent} />

            {/* Icon */}
            <div style={styles.iconWrap}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
                stroke={GOLD} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>

            <h2 style={styles.title}>{s.errorTitle}</h2>
            <p style={styles.msg}>{s.errorBody}</p>

            <button style={styles.btnPrimary} onClick={this.handleReload}>
              {s.errorReload}
            </button>
            <button style={styles.btnSecondary} onClick={this.handleClearAndReload}>
              {s.errorClearReload}
            </button>

            {/* Error detail (collapsed, for developers) */}
            {this.state.error && (
              <details style={styles.details}>
                <summary style={styles.summary}>{s.errorTechDetails}</summary>
                <pre style={styles.pre}>
                  {this.state.error.toString()}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    position:        'fixed',
    inset:           0,
    backgroundColor: '#F0EEE8',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    padding:         '20px',
    boxSizing:       'border-box',
    fontFamily:      '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius:    16,
    maxWidth:        360,
    width:           '100%',
    textAlign:       'center',
    boxShadow:       '0 8px 32px rgba(0,0,0,0.14)',
    overflow:        'hidden',
    display:         'flex',
    flexDirection:   'column',
    gap:             0,
  },
  accent: {
    height:     4,
    background: `linear-gradient(90deg, ${NAVY}, ${GOLD} 50%, ${NAVY})`,
  },
  iconWrap: {
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    width:           72,
    height:          72,
    borderRadius:    '50%',
    backgroundColor: 'rgba(20,58,99,0.08)',
    margin:          '28px auto 0',
  },
  title: {
    margin:        '16px 24px 8px',
    fontSize:      20,
    fontWeight:    800,
    color:         '#111827',
    letterSpacing: '-0.2px',
  },
  msg: {
    margin:     '0 24px 20px',
    fontSize:   14,
    color:      '#6B7280',
    lineHeight: 1.55,
  },
  btnPrimary: {
    height:          48,
    margin:          '0 24px 10px',
    borderRadius:    12,
    backgroundColor: NAVY,
    border:          `2px solid ${GOLD}`,
    color:           '#FFFFFF',
    fontSize:        15,
    fontWeight:      800,
    letterSpacing:   0.5,
    cursor:          'pointer',
    transition:      'opacity 0.15s',
  },
  btnSecondary: {
    height:          44,
    margin:          '0 24px 20px',
    borderRadius:    12,
    backgroundColor: 'transparent',
    border:          '1.5px solid #D1D5DB',
    color:           '#6B7280',
    fontSize:        13,
    fontWeight:      600,
    cursor:          'pointer',
    transition:      'background-color 0.15s',
  },
  details: {
    margin:     '0 24px 24px',
    textAlign:  'left',
  },
  summary: {
    fontSize:   12,
    color:      '#9CA3AF',
    cursor:     'pointer',
    fontWeight: 600,
  },
  pre: {
    marginTop:       8,
    fontSize:        11,
    color:           '#DC2626',
    backgroundColor: '#FEF2F2',
    borderRadius:    8,
    padding:         '10px 12px',
    overflowX:       'auto',
    whiteSpace:      'pre-wrap',
    wordBreak:       'break-word',
    border:          '1px solid rgba(220,38,38,0.2)',
  },
};
