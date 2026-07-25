import React, { useState, useEffect } from 'react';
import { useLang } from '../LangContext';
import PrivacyPolicyModal from '../components/PrivacyPolicyModal';
import {
  isFirebaseConfigured,
  isEmailSignInLink,
  getStoredSignInEmail,
  completeEmailSignIn,
  signInWithPassword,
  signUpWithPassword,
  sendPasswordReset,
} from '../firebase';

// ─── Types ────────────────────────────────────────────────────────────────────
type Mode     = 'main' | 'completing' | 'confirm-email';
type AuthTab  = 'signin' | 'signup';
type ForgotPw = 'hidden' | 'form' | 'sent';

interface Props {
  onLogin:      (email: string, uid: string) => void;
  onGuestLogin: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ─── Design tokens ────────────────────────────────────────────────────────────
const NAVY       = '#163A63';
const GOLD2      = '#F4B02A';
const GOLD_LIGHT = 'rgba(244,176,42,0.18)';
const BORDER     = '#D1D5DB';
const ERR        = '#DC2626';

// ─── Firebase error → human message ──────────────────────────────────────────
function fbErr(err: unknown, es: boolean): string {
  const code = (err as any)?.code ?? '';
  if (code === 'auth/user-not-found' || code === 'auth/invalid-credential' || code === 'auth/wrong-password')
    return es ? 'Correo o contraseña incorrectos.' : 'Incorrect email or password.';
  if (code === 'auth/email-already-in-use')
    return es ? 'Ya existe una cuenta con este correo.' : 'An account already exists with this email.';
  if (code === 'auth/weak-password')
    return es ? 'La contraseña debe tener al menos 6 caracteres.' : 'Password must be at least 6 characters.';
  if (code === 'auth/too-many-requests')
    return es ? 'Demasiados intentos. Intenta más tarde.' : 'Too many attempts. Try again later.';
  if (code === 'auth/invalid-email')
    return es ? 'Correo electrónico no válido.' : 'Please enter a valid email address.';
  if (code === 'auth/operation-not-allowed')
    return es ? 'Este método de acceso no está habilitado. Contacta al administrador.' : 'This sign-in method is not enabled. Please contact the administrator.';
  return es ? 'Ocurrió un error. Por favor intenta de nuevo.' : 'An error occurred. Please try again.';
}

// ─── Decorative ruler ticks ───────────────────────────────────────────────────
function MeasureTicks() {
  const ticks: React.ReactNode[] = [];
  for (let i = 0; i <= 40; i++) {
    const isMajor = i % 5 === 0;
    ticks.push(
      <line key={i} x1={i * 10} y1={0} x2={i * 10} y2={isMajor ? 10 : 6}
        stroke={isMajor ? GOLD2 : 'rgba(244,176,42,0.45)'}
        strokeWidth={isMajor ? 1.5 : 1} />
    );
  }
  return (
    <svg viewBox="0 0 400 12" width="100%" height="12" preserveAspectRatio="none"
      xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {ticks}
      <line x1="0" y1="0" x2="400" y2="0" stroke={GOLD2} strokeWidth="1.5" opacity="0.6" />
    </svg>
  );
}

// ─── Labeled input with left icon and optional right node ─────────────────────
function Field({
  label, icon, type = 'text', value, onChange, placeholder,
  autoComplete, hasError, endNode,
}: {
  label: string; icon: string; type?: string; value: string;
  onChange: (v: string) => void; placeholder: string;
  autoComplete?: string; hasError?: boolean; endNode?: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <label style={S.label}>{label}</label>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <span style={S.inputIcon}>{icon}</span>
        <input
          type={type} value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder} autoComplete={autoComplete}
          style={{ ...S.input, ...(hasError ? S.inputErr : {}), paddingRight: endNode ? 56 : 14 }}
        />
        {endNode && (
          <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, display: 'flex', alignItems: 'center', paddingRight: 10 }}>
            {endNode}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Show / hide password toggle ─────────────────────────────────────────────
function ShowHideBtn({ visible, onToggle, es }: { visible: boolean; onToggle: () => void; es: boolean }) {
  return (
    <button type="button" onClick={onToggle}
      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: '#6B7280', padding: '4px 2px', lineHeight: 1 }}>
      {visible ? (es ? 'Ocultar' : 'Hide') : (es ? 'Mostrar' : 'Show')}
    </button>
  );
}

// ─── Coming-soon badge ────────────────────────────────────────────────────────
const ComingSoonBadge = () => (
  <span style={{ fontSize: 9, fontWeight: 800, color: '#92400E', backgroundColor: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 20, padding: '2px 8px', letterSpacing: 0.5, textTransform: 'uppercase' as const, whiteSpace: 'nowrap' as const, lineHeight: 1.6 }}>
    Coming Soon
  </span>
);

// ─── Individual service card ──────────────────────────────────────────────────
function ServiceCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, backgroundColor: '#F8FAFC', border: '1.5px solid #E5E7EB', borderRadius: 14, padding: '12px 13px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
      <div style={{ width: 46, height: 46, borderRadius: 12, backgroundColor: '#EFF6FF', border: '1px solid #BFDBFE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 22 }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' as const, marginBottom: 3 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: '#111827', lineHeight: 1.2 }}>{title}</span>
          <ComingSoonBadge />
        </div>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#6B7280', lineHeight: 1.4 }}>{desc}</div>
      </div>
      <span style={{ fontSize: 22, color: '#CBD5E1', flexShrink: 0, lineHeight: 1, fontWeight: 300 }}>›</span>
    </div>
  );
}

// ─── Bright Sky Services modal ────────────────────────────────────────────────
function BrightSkyServicesModal({ onClose, es }: { onClose: () => void; es: boolean }) {
  // Close on Escape key
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.58)', zIndex: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 18px', boxSizing: 'border-box' as const }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="login-modal-in"
        style={{ maxWidth: 420, width: '100%', backgroundColor: '#FFFFFF', borderRadius: 22, overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.34)', display: 'flex', flexDirection: 'column', maxHeight: '88vh' }}>

        {/* Header */}
        <div style={{ backgroundColor: NAVY, padding: '16px 18px 14px', display: 'flex', alignItems: 'center', gap: 13, flexShrink: 0 }}>
          <div style={{ width: 46, height: 46, borderRadius: 12, backgroundColor: 'rgba(244,176,42,0.15)', border: '1.5px solid rgba(244,176,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 24 }}>
            🌤️
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#FFFFFF', letterSpacing: 0.1, lineHeight: 1.2 }}>
              {es ? 'Servicios Bright Sky Construction' : 'Bright Sky Construction Services'}
            </div>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.62)', marginTop: 3, lineHeight: 1.35 }}>
              {es ? 'Herramientas de productividad próximamente.' : 'Explore additional productivity tools coming soon.'}
            </div>
          </div>
          <button
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.78)', fontSize: 22, cursor: 'pointer', padding: '4px 6px', lineHeight: 1, flexShrink: 0 }}
            onClick={onClose}>✕</button>
        </div>

        {/* Service list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 6px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: '#9CA3AF', letterSpacing: 0.9, textTransform: 'uppercase' as const, marginBottom: 2 }}>
            {es ? 'Servicios Disponibles' : 'Available Services'}
          </div>
          <ServiceCard
            icon="🕒"
            title="Employee Time Tracker"
            desc={es ? 'Registra horas de trabajo, asistencia y hojas de tiempo de empleados.' : 'Track employee work hours, attendance, and timesheets.'}
          />
          <ServiceCard
            icon="📍"
            title="Employee Route Tracker"
            desc={es ? 'Visualiza rutas de empleados, historial GPS y actividad de campo.' : 'View employee travel routes, GPS history, and field activity.'}
          />
        </div>

        {/* Footer */}
        <div style={{ padding: '10px 14px 14px', textAlign: 'center' as const, borderTop: '1px solid #F3F4F6', flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 500 }}>
            {es ? 'Desarrollado por Bright Sky Construction' : 'Powered by Bright Sky Construction'}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Main login screen ────────────────────────────────────────────────────────
export default function LoginScreenWeb({ onLogin, onGuestLogin }: Props) {
  const { t, lang, setLang } = useLang();
  const es = lang === 'es';

  // Global state
  const [mode,               setMode]               = useState<Mode>('main');
  const [authTab,            setAuthTab]            = useState<AuthTab>('signin');
  const [loading,            setLoading]            = useState(false);
  const [showPrivacy,        setShowPrivacy]        = useState(false);
  const [privacyTab,         setPrivacyTab]         = useState<'privacy' | 'terms'>('privacy');
  const [showServicesModal,  setShowServicesModal]  = useState(false);

  // Sign-in
  const [siEmail,    setSiEmail]    = useState('');
  const [siPassword, setSiPassword] = useState('');
  const [siShowPw,   setSiShowPw]   = useState(false);
  const [siError,    setSiError]    = useState('');

  // Forgot-password sub-flow
  const [forgotPw, setForgotPw] = useState<ForgotPw>('hidden');
  const [fpEmail,  setFpEmail]  = useState('');
  const [fpError,  setFpError]  = useState('');

  // Sign-up
  const [suName,    setSuName]    = useState('');
  const [suEmail,   setSuEmail]   = useState('');
  const [suPass,    setSuPass]    = useState('');
  const [suConfirm, setSuConfirm] = useState('');
  const [suShowPw,  setSuShowPw]  = useState(false);
  const [suShowCf,  setSuShowCf]  = useState(false);
  const [suError,   setSuError]   = useState('');

  // Confirm-email (different-device link)
  const [ceEmail, setCeEmail] = useState('');
  const [ceError, setCeError] = useState('');

  // ── On mount: detect sign-in link in URL ─────────────────────────────────
  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    if (!isEmailSignInLink(window.location.href)) return;
    const stored = getStoredSignInEmail();
    if (stored) {
      setMode('completing');
      completeEmailSignIn(stored, window.location.href)
        .then(user => {
          window.history.replaceState({}, document.title, '/');
          try { localStorage.setItem('auth:email', stored); } catch {}
          onLogin(stored, user.uid);
        })
        .catch(() => {
          setMode('main');
          window.history.replaceState({}, document.title, '/');
        });
    } else {
      setMode('confirm-email');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sign In ───────────────────────────────────────────────────────────────
  const handleSignIn = async () => {
    const email = siEmail.trim();
    if (!EMAIL_RE.test(email)) { setSiError(es ? 'Ingresa un correo electrónico válido.' : 'Please enter a valid email address.'); return; }
    if (!siPassword)            { setSiError(es ? 'Ingresa tu contraseña.' : 'Please enter your password.'); return; }
    setSiError(''); setLoading(true);
    try {
      if (isFirebaseConfigured()) {
        const user = await signInWithPassword(email, siPassword);
        onLogin(email, user.uid);
      } else {
        try { localStorage.setItem('auth:email', email); } catch {}
        onLogin(email, '');
      }
    } catch (err) { setSiError(fbErr(err, es)); }
    finally { setLoading(false); }
  };

  // ── Sign Up ───────────────────────────────────────────────────────────────
  const handleSignUp = async () => {
    const name = suName.trim(), email = suEmail.trim();
    if (!name)                 { setSuError(es ? 'Ingresa tu nombre completo.' : 'Please enter your full name.'); return; }
    if (!EMAIL_RE.test(email)) { setSuError(es ? 'Ingresa un correo electrónico válido.' : 'Please enter a valid email address.'); return; }
    if (suPass.length < 6)     { setSuError(es ? 'La contraseña debe tener al menos 6 caracteres.' : 'Password must be at least 6 characters.'); return; }
    if (suPass !== suConfirm)  { setSuError(es ? 'Las contraseñas no coinciden.' : 'Passwords do not match.'); return; }
    setSuError(''); setLoading(true);
    try {
      if (isFirebaseConfigured()) {
        const user = await signUpWithPassword(email, suPass, name);
        onLogin(email, user.uid);
      } else {
        try { localStorage.setItem('auth:email', email); } catch {}
        onLogin(email, '');
      }
    } catch (err) { setSuError(fbErr(err, es)); }
    finally { setLoading(false); }
  };

  // ── Forgot Password ───────────────────────────────────────────────────────
  const handleForgotSend = async () => {
    const email = fpEmail.trim();
    if (!EMAIL_RE.test(email)) { setFpError(es ? 'Ingresa un correo electrónico válido.' : 'Please enter a valid email.'); return; }
    setFpError(''); setLoading(true);
    try {
      if (isFirebaseConfigured()) await sendPasswordReset(email);
      setForgotPw('sent');
    } catch (err) { setFpError(fbErr(err, es)); }
    finally { setLoading(false); }
  };

  // ── Confirm email (different-device link) ─────────────────────────────────
  const handleConfirmEmail = async () => {
    const email = ceEmail.trim();
    if (!EMAIL_RE.test(email)) { setCeError(t('invalidEmail')); return; }
    setCeError(''); setLoading(true);
    try {
      const user = await completeEmailSignIn(email, window.location.href);
      window.history.replaceState({}, document.title, '/');
      try { localStorage.setItem('auth:email', email); } catch {}
      onLogin(email, user.uid);
    } catch {
      setCeError(t('signInLinkExpired'));
      setMode('main');
      window.history.replaceState({}, document.title, '/');
    } finally { setLoading(false); }
  };

  // ── Shared pieces ─────────────────────────────────────────────────────────
  const CardHeader = () => (
    <>
      <div style={S.topAccent} />
      <div style={S.tickStrip}><MeasureTicks /></div>
      <div style={{ ...S.logoRow, justifyContent: 'space-between', alignItems: 'center' }}>
        {/* Logo + title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
          <div style={S.logoWrap}>
            <img src="/rod.png" alt="" style={S.logoRod} />
          </div>
          <div style={S.logoText}>
            <span style={S.appName}>{t('splashTitle')}</span>
            <span style={S.appTag}>{t('appTagline')}</span>
          </div>
        </div>
        {/* Language switcher — top-right of card */}
        <div style={{ display: 'flex', borderRadius: 7, border: '1.5px solid #E5E7EB', overflow: 'hidden', flexShrink: 0, marginLeft: 10 }}>
          {(['en', 'es'] as const).map(l => (
            <button
              key={l}
              aria-pressed={lang === l}
              style={{
                height: 28, width: 36, border: 'none',
                backgroundColor: lang === l ? NAVY : '#F3F4F6',
                color: lang === l ? '#ffffff' : '#9CA3AF',
                fontSize: 11, fontWeight: 700, cursor: 'pointer', lineHeight: 1,
                transition: 'background-color 0.15s, color 0.15s',
              }}
              onClick={() => setLang(l)}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <div style={S.divider} />
    </>
  );

  const Footer = () => (
    <>
      <div style={S.legalRow}>
        <button style={S.legalLink} onClick={() => { setPrivacyTab('privacy'); setShowPrivacy(true); }}>{t('settingsPrivacy')}</button>
        <span style={S.legalDot}>·</span>
        <button style={S.legalLink} onClick={() => { setPrivacyTab('terms'); setShowPrivacy(true); }}>{t('settingsTerms')}</button>
        <span style={S.legalDot}>·</span>
        <span style={{ fontSize: 11, color: '#9CA3AF' }}>{t('version')}</span>
      </div>
      <div style={{ textAlign: 'center' as const }}>
        <span style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 500 }}>
          {es ? 'Desarrollado por Bright Sky Construction' : 'Powered by Bright Sky Construction'}
        </span>
      </div>
    </>
  );

  // ── "Explore Bright Sky" compact tap-row ─────────────────────────────────
  const ExploreRow = () => (
    <div style={{ margin: '0 20px', borderTop: `1px solid ${BORDER}`, paddingTop: 5 }}>
      <button
        style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', borderRadius: 8 }}
        onClick={() => setShowServicesModal(true)}
      >
        <div style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: 'rgba(22,58,99,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 16 }}>
          🌤️
        </div>
        <div style={{ flex: 1, minWidth: 0, textAlign: 'left' as const }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: NAVY, lineHeight: 1.2 }}>
            {es ? 'Explorar Bright Sky Construction' : 'Explore Bright Sky Construction'}
          </div>
          <div style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 500, marginTop: 1 }}>
            {es ? 'Herramientas próximamente disponibles' : 'Tools coming soon for your team'}
          </div>
        </div>
        <span style={{ fontSize: 20, color: '#9CA3AF', flexShrink: 0, lineHeight: 1 }}>›</span>
      </button>
    </div>
  );

  // ── "Signing you in…" mode ────────────────────────────────────────────────
  if (mode === 'completing') {
    return (
      <div style={S.root}>
        <div style={S.bg} />
        <div style={S.spacer} />
        <div style={S.card}>
          <CardHeader />
          <div style={S.centerBlock}>
            <div style={S.spinner} aria-hidden="true" />
            <p style={S.centerTitle}>{t('completingSignIn')}</p>
          </div>
          <Footer />
        </div>
        <div style={S.spacer} />
        {showPrivacy && <PrivacyPolicyModal initialTab={privacyTab} onClose={() => setShowPrivacy(false)} />}
      </div>
    );
  }

  // ── Confirm email (different-device link) ─────────────────────────────────
  if (mode === 'confirm-email') {
    return (
      <div style={S.root}>
        <div style={S.bg} />
        <div style={S.spacer} />
        <div style={S.card}>
          <CardHeader />
          <div style={{ padding: '2px 20px 0' }}>
            <h2 style={S.title}>{t('confirmEmailTitle')}</h2>
            <p style={S.subtitle}>{t('confirmEmailMsg')}</p>
          </div>
          <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Field label={t('emailLabel')} icon="@" type="email" value={ceEmail}
              onChange={v => { setCeEmail(v); setCeError(''); }}
              placeholder={t('emailPlaceholder')} autoComplete="email" hasError={!!ceError} />
            {ceError && <span style={S.errorMsg}><span style={S.errorDot}>●</span> {ceError}</span>}
          </div>
          <div style={{ padding: '0 20px' }}>
            <button style={{ ...S.btnPrimary, ...(loading ? S.btnLoading : {}) }} onClick={handleConfirmEmail} disabled={loading}>
              {loading ? '…' : t('confirmAndSignIn')}
            </button>
          </div>
          <Footer />
        </div>
        <div style={S.spacer} />
        {showPrivacy && <PrivacyPolicyModal initialTab={privacyTab} onClose={() => setShowPrivacy(false)} />}
      </div>
    );
  }

  // ── Main screen ───────────────────────────────────────────────────────────
  const tabLeft = authTab === 'signin' ? '4px' : '50%';
  const showGuestDivider = forgotPw !== 'form' && forgotPw !== 'sent';

  return (
    <div style={S.root}>
      <div style={S.bg} />
      <div style={{ ...S.spacer, minHeight: 16 }} />

      <div style={S.card}>
        <CardHeader />

        {/* ── Segmented tab control ── */}
        <div style={{ padding: '0 20px' }}>
          <div style={{ position: 'relative', display: 'flex', backgroundColor: '#F3F4F6', borderRadius: 11, padding: 3 }}>
            <div style={{ position: 'absolute', top: 3, bottom: 3, left: tabLeft, width: 'calc(50% - 3px)', backgroundColor: NAVY, borderRadius: 8, transition: 'left 0.22s cubic-bezier(0.4,0,0.2,1)', zIndex: 0 }} />
            <button style={{ ...S.tabBtn, color: authTab === 'signin' ? '#fff' : '#6B7280' }}
              onClick={() => { setAuthTab('signin'); setForgotPw('hidden'); setSiError(''); }}>
              {es ? 'Iniciar Sesión' : 'Sign In'}
            </button>
            <button style={{ ...S.tabBtn, color: authTab === 'signup' ? '#fff' : '#6B7280' }}
              onClick={() => { setAuthTab('signup'); setSuError(''); }}>
              {es ? 'Registrarse' : 'Sign Up'}
            </button>
          </div>
        </div>

        {/* ── Sign In tab ── */}
        {authTab === 'signin' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '0 20px' }}>

            {forgotPw === 'hidden' && (
              <>
                <div style={{ marginBottom: 1 }}>
                  <h2 style={S.title}>{es ? 'Bienvenido' : 'Welcome Back'}</h2>
                  <p style={S.subtitle}>{es ? 'Inicia sesión para continuar.' : 'Sign in to continue using Grade and Elevation Calculator.'}</p>
                </div>
                <Field label={es ? 'Correo Electrónico' : 'Email Address'} icon="@" type="email"
                  value={siEmail} onChange={v => { setSiEmail(v); setSiError(''); }}
                  placeholder={es ? 'tu@ejemplo.com' : 'you@example.com'}
                  autoComplete="email" hasError={!!siError} />
                <Field label={es ? 'Contraseña' : 'Password'} icon="🔒" type={siShowPw ? 'text' : 'password'}
                  value={siPassword} onChange={v => { setSiPassword(v); setSiError(''); }}
                  placeholder={es ? 'Tu contraseña' : 'Your password'}
                  autoComplete="current-password" hasError={!!siError}
                  endNode={<ShowHideBtn visible={siShowPw} onToggle={() => setSiShowPw(p => !p)} es={es} />} />
                {siError && <span style={S.errorMsg}><span style={S.errorDot}>●</span> {siError}</span>}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: -3 }}>
                  <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: NAVY, textDecoration: 'underline', textUnderlineOffset: '2px', padding: '2px 0' }}
                    onClick={() => { setForgotPw('form'); setFpEmail(siEmail); setFpError(''); }}>
                    {es ? '¿Olvidaste tu contraseña?' : 'Forgot Password?'}
                  </button>
                </div>
              </>
            )}

            {forgotPw === 'form' && (
              <>
                <button style={{ alignSelf: 'flex-start', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: NAVY, display: 'flex', alignItems: 'center', gap: 4, padding: '2px 0' }}
                  onClick={() => { setForgotPw('hidden'); setFpError(''); }}>
                  ← {es ? 'Volver' : 'Back to Sign In'}
                </button>
                <div style={{ marginBottom: 1 }}>
                  <h2 style={S.title}>{es ? '¿Olvidaste tu contraseña?' : 'Forgot Password?'}</h2>
                  <p style={S.subtitle}>{es ? 'Ingresa tu correo para recibir un enlace de restablecimiento.' : 'Enter your email to receive a reset link.'}</p>
                </div>
                <Field label={es ? 'Correo Electrónico' : 'Email Address'} icon="@" type="email"
                  value={fpEmail} onChange={v => { setFpEmail(v); setFpError(''); }}
                  placeholder={es ? 'tu@ejemplo.com' : 'you@example.com'}
                  autoComplete="email" hasError={!!fpError} />
                {fpError && <span style={S.errorMsg}><span style={S.errorDot}>●</span> {fpError}</span>}
              </>
            )}

            {forgotPw === 'sent' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '4px 0 6px' }}>
                <div style={{ fontSize: 34, lineHeight: 1 }}>✅</div>
                <h2 style={{ ...S.title, textAlign: 'center' as const }}>{es ? '¡Enlace Enviado!' : 'Reset Link Sent!'}</h2>
                <p style={{ ...S.subtitle, textAlign: 'center' as const }}>{es ? `Revisa tu correo en ${fpEmail}.` : `Check your email at ${fpEmail}.`}</p>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: NAVY, textDecoration: 'underline', textUnderlineOffset: '2px' }}
                  onClick={() => setForgotPw('hidden')}>
                  ← {es ? 'Volver al inicio de sesión' : 'Back to Sign In'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Sign Up tab ── */}
        {authTab === 'signup' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '0 20px' }}>
            <div style={{ marginBottom: 1 }}>
              <h2 style={S.title}>{es ? 'Crea Tu Cuenta' : 'Create Your Account'}</h2>
              <p style={S.subtitle}>{es ? 'Guarda tus datos de topografía en todos tus dispositivos.' : 'Securely save your survey data across devices.'}</p>
            </div>
            <Field label={es ? 'Nombre Completo' : 'Full Name'} icon="👤" type="text"
              value={suName} onChange={v => { setSuName(v); setSuError(''); }}
              placeholder={es ? 'Tu nombre completo' : 'Your full name'}
              autoComplete="name" hasError={!!suError && !suName.trim()} />
            <Field label={es ? 'Correo Electrónico' : 'Email Address'} icon="@" type="email"
              value={suEmail} onChange={v => { setSuEmail(v); setSuError(''); }}
              placeholder={es ? 'tu@ejemplo.com' : 'you@example.com'}
              autoComplete="email" hasError={!!suError} />
            <Field label={es ? 'Contraseña' : 'Password'} icon="🔒" type={suShowPw ? 'text' : 'password'}
              value={suPass} onChange={v => { setSuPass(v); setSuError(''); }}
              placeholder={es ? 'Mín. 6 caracteres' : 'Min. 6 characters'}
              autoComplete="new-password" hasError={!!suError}
              endNode={<ShowHideBtn visible={suShowPw} onToggle={() => setSuShowPw(p => !p)} es={es} />} />
            <Field label={es ? 'Confirmar Contraseña' : 'Confirm Password'} icon="🔒" type={suShowCf ? 'text' : 'password'}
              value={suConfirm} onChange={v => { setSuConfirm(v); setSuError(''); }}
              placeholder={es ? 'Repite la contraseña' : 'Repeat your password'}
              autoComplete="new-password" hasError={!!suError && suPass !== suConfirm}
              endNode={<ShowHideBtn visible={suShowCf} onToggle={() => setSuShowCf(p => !p)} es={es} />} />
            {suError && <span style={S.errorMsg}><span style={S.errorDot}>●</span> {suError}</span>}
          </div>
        )}

        {/* ── Primary CTA ── */}
        <div style={{ padding: '0 20px' }}>
          {authTab === 'signin' && forgotPw === 'hidden' && (
            <button style={{ ...S.btnPrimary, ...(loading ? S.btnLoading : {}) }} onClick={handleSignIn} disabled={loading}>
              {loading ? '…' : (es ? 'Iniciar Sesión' : 'Sign In')}
            </button>
          )}
          {authTab === 'signin' && forgotPw === 'form' && (
            <button style={{ ...S.btnPrimary, ...(loading ? S.btnLoading : {}) }} onClick={handleForgotSend} disabled={loading}>
              {loading ? '…' : (es ? 'Enviar Enlace' : 'Send Reset Link')}
            </button>
          )}
          {authTab === 'signup' && (
            <button style={{ ...S.btnPrimary, ...(loading ? S.btnLoading : {}) }} onClick={handleSignUp} disabled={loading}>
              {loading ? '…' : (es ? 'Crear Cuenta' : 'Create Account')}
            </button>
          )}
        </div>

        {/* ── Already have account (sign-up only) ── */}
        {authTab === 'signup' && (
          <div style={{ textAlign: 'center' as const, padding: '0 20px', marginTop: -4 }}>
            <span style={{ fontSize: 12, color: '#6B7280' }}>{es ? '¿Ya tienes una cuenta? ' : 'Already have an account? '}</span>
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: NAVY, textDecoration: 'underline', textUnderlineOffset: '2px' }}
              onClick={() => { setAuthTab('signin'); setSuError(''); }}>
              {es ? 'Iniciar Sesión' : 'Sign In'}
            </button>
          </div>
        )}

        {/* ── OR + Guest ── */}
        {showGuestDivider && (
          <>
            <div style={S.orRow}>
              <div style={S.orLine} /><span style={S.orText}>or</span><div style={S.orLine} />
            </div>
            <div style={{ padding: '0 20px' }}>
              <button style={S.btnGuest} onClick={onGuestLogin} disabled={loading}>
                {t('continueAsGuest')}
              </button>
            </div>
          </>
        )}

        {/* ── Explore Bright Sky (tap-to-modal row) ── */}
        <ExploreRow />

        {/* ── Footer ── */}
        <Footer />
      </div>

      <div style={{ ...S.spacer, minHeight: 16 }} />

      {/* ── Modals ── */}
      {showServicesModal && (
        <BrightSkyServicesModal es={es} onClose={() => setShowServicesModal(false)} />
      )}
      {showPrivacy && (
        <PrivacyPolicyModal initialTab={privacyTab} onClose={() => setShowPrivacy(false)} />
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  root: {
    position: 'fixed', inset: 0, overflowY: 'auto',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '0 16px', boxSizing: 'border-box',
  },
  bg: {
    position: 'fixed', inset: 0,
    background: `linear-gradient(158deg, ${NAVY} 0%, ${NAVY} 36%, #F0EEE8 36%)`,
    zIndex: 0, pointerEvents: 'none',
  },
  spacer: { flex: '1 0 0', minHeight: 24 },
  card: {
    width: '100%', maxWidth: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    boxShadow: '0 12px 48px rgba(0,0,0,0.16), 0 2px 8px rgba(0,0,0,0.08)',
    display: 'flex', flexDirection: 'column', gap: 5,
    position: 'relative', zIndex: 1,
    overflow: 'hidden', paddingBottom: 12, flexShrink: 0,
  },
  topAccent: {
    height: 5,
    background: `linear-gradient(90deg, ${NAVY}, ${GOLD2} 50%, ${NAVY})`,
    flexShrink: 0,
  },
  tickStrip: { padding: '0 20px', marginTop: -4, opacity: 0.9 },
  logoRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '0 20px', marginTop: 0 },
  logoWrap: {
    width: 50, height: 50, borderRadius: 13, backgroundColor: NAVY,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, boxShadow: '0 2px 10px rgba(22,58,99,0.30)', overflow: 'hidden',
  },
  logoRod: { width: '100%', height: '100%', objectFit: 'contain', mixBlendMode: 'screen', display: 'block' },
  logoText: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
  appName: { fontSize: 16, fontWeight: 800, color: NAVY, letterSpacing: '-0.3px', lineHeight: 1.2 },
  appTag:  { fontSize: 11, color: '#6B7280', lineHeight: 1.3 },
  divider: { height: 1.5, backgroundColor: '#F3F4F6', margin: '0 20px' },
  // Tab control
  tabBtn: {
    flex: 1, height: 36, fontSize: 14, fontWeight: 700,
    border: 'none', background: 'none', borderRadius: 8,
    cursor: 'pointer', position: 'relative', zIndex: 1,
    transition: 'color 0.22s', lineHeight: 1,
  },
  // Typography
  title: {
    margin: 0, fontSize: 20, fontWeight: 800, color: '#111827',
    letterSpacing: '-0.3px', fontFamily: 'inherit',
  },
  subtitle: { margin: '2px 0 0', fontSize: 12, color: '#6B7280', lineHeight: 1.4 },
  // Fields
  label: { fontSize: 11, fontWeight: 700, color: '#374151', letterSpacing: 0.3, textTransform: 'uppercase' as const },
  inputIcon: { position: 'absolute', left: 13, fontSize: 14, fontWeight: 700, color: '#9CA3AF', pointerEvents: 'none', userSelect: 'none', zIndex: 1 },
  input: {
    height: 44, width: '100%', borderRadius: 11,
    border: `1.5px solid ${BORDER}`, padding: '0 14px 0 36px',
    fontSize: 14, color: '#111827', backgroundColor: '#FAFAFA',
    outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s',
  },
  inputErr: { borderColor: ERR, backgroundColor: '#FFF5F5' },
  errorMsg: { fontSize: 11, color: ERR, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 5, marginTop: -3 },
  errorDot: { fontSize: 6 },
  // Buttons
  btnPrimary: {
    height: 46, width: '100%', borderRadius: 13,
    backgroundColor: NAVY, border: `2px solid ${GOLD2}`,
    color: '#FFFFFF', fontSize: 15, fontWeight: 800,
    letterSpacing: 0.8, cursor: 'pointer',
    transition: 'opacity 0.15s', boxShadow: '0 4px 16px rgba(22,58,99,0.28)',
  },
  btnLoading: { opacity: 0.6, cursor: 'default' },
  btnGuest: {
    height: 44, width: '100%', borderRadius: 13,
    backgroundColor: GOLD_LIGHT, border: `1.5px solid ${GOLD2}`,
    color: NAVY, fontSize: 15, fontWeight: 700,
    letterSpacing: 0.4, cursor: 'pointer', transition: 'background-color 0.15s',
  },
  // OR divider
  orRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '0 20px', marginTop: -4, marginBottom: -4 },
  orLine: { flex: 1, height: 1, backgroundColor: BORDER },
  orText: { fontSize: 12, color: '#9CA3AF', fontWeight: 600, letterSpacing: 0.3 },
  // Footer
  legalRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: 7, padding: '0 20px', marginTop: -4,
  },
  legalLink: {
    background: 'none', border: 'none', color: '#9CA3AF', fontSize: 11,
    fontWeight: 600, cursor: 'pointer', padding: '3px 0',
    textDecoration: 'underline', textUnderlineOffset: '2px', letterSpacing: 0.2,
  },
  legalDot: { fontSize: 11, color: '#9CA3AF' },
  // Completing screen
  centerBlock: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 20px 8px', gap: 10 },
  spinner: {
    width: 34, height: 34, borderRadius: '50%',
    border: '3px solid rgba(20,58,99,0.12)', borderTopColor: NAVY,
    animation: 'loginSpin 0.8s linear infinite',
  },
  centerTitle: { margin: 0, fontSize: 14, fontWeight: 700, color: '#374151', textAlign: 'center' },
};

// ─── Keyframe injection ───────────────────────────────────────────────────────
if (typeof document !== 'undefined') {
  const id = 'login-anim-kf';
  if (!document.getElementById(id)) {
    const s = document.createElement('style');
    s.id = id;
    s.textContent = `
      @keyframes loginSpin { to { transform: rotate(360deg); } }
      @keyframes loginModalIn { from{opacity:0;transform:scale(0.92) translateY(6px);}to{opacity:1;transform:scale(1) translateY(0);} }
      .login-modal-in { animation: loginModalIn 0.20s cubic-bezier(0.22,1,0.36,1) both; }
    `;
    document.head.appendChild(s);
  }
}
