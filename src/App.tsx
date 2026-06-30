import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSurveyStore } from './stores/surveyStore';
import { LangProvider, useLang } from './LangContext';
import { MainTab, SurveyPoint } from './types';
import AddNewPointScreen  from './screens/AddNewPointScreen';
import ViewPointsScreen   from './screens/ViewPointsScreen';
import ViewSetsScreen     from './screens/ViewSetsScreen';
import CalculatorScreen   from './screens/CalculatorScreen';
import SplashScreenWeb    from './screens/SplashScreenWeb';
import LoginScreenWeb     from './screens/LoginScreenWeb';
import SlopeScreen        from './screens/SlopeScreen';
import { isFirebaseConfigured } from './firebase';
import {
  loadUserData,
  saveUserData,
  collectLocalData,
  applyLocalData,
  clearLocalData,
  patchLocalStorage,
} from './services/cloudSync';
import { ensureUserProfile } from './services/userProfile';
import { useProfileStore } from './stores/profileStore';

// ─── Root: wraps everything in the language provider ─────────────────────────
export default function App() {
  return (
    <LangProvider>
      <AppInner />
    </LangProvider>
  );
}

// ─── App state ────────────────────────────────────────────────────────────────
type AppState = 'splash' | 'login' | 'app';

function readEmail(): string | null {
  try { return localStorage.getItem('auth:email'); } catch { return null; }
}
function splashAlreadyShown(): boolean {
  try { return sessionStorage.getItem('splash:shown') === '1'; } catch { return false; }
}

// ─── Inner app (has access to useLang) ───────────────────────────────────────
function AppInner() {
  const { t, lang, setLang } = useLang();

  // Determine initial app state
  const [appState, setAppState] = useState<AppState>(() => {
    if (!splashAlreadyShown()) return 'splash';
    if (!readEmail())          return 'login';
    return 'app';
  });

  const [email,        setEmail]        = useState<string>(() => readEmail() ?? '');
  const [activeTab,    setActiveTab]    = useState<MainTab>('add');
  const addScreenDirty = useRef(false);

  const handleDirtyChange = useCallback((dirty: boolean) => {
    addScreenDirty.current = dirty;
  }, []);

  const handleTabSwitch = useCallback((tab: MainTab) => {
    if (activeTab === 'add' && tab !== 'add' && addScreenDirty.current) {
      if (!window.confirm(t('unsavedPointConfirm'))) return;
      addScreenDirty.current = false;
    }
    if (tab !== 'points') setShowSinglePoint(false);
    setActiveTab(tab);
  }, [activeTab, t]);
  const [editPoint,       setEditPoint]       = useState<SurveyPoint | undefined>(undefined);
  const [showSettings,    setShowSettings]    = useState(false);
  const [compareFromId,   setCompareFromId]   = useState<string | null>(null);
  const [compareToId,     setCompareToId]     = useState<string | null>(null);
  const [showSinglePoint, setShowSinglePoint] = useState(false);

  const { ensureDefaultProject, activeProjectId } = useSurveyStore();
  // Stable action references — selected individually so callbacks don't
  // recreate on every state change.
  const hydrateStore    = useSurveyStore(s => s.hydrate);
  const resetSurveyData = useSurveyStore(s => s.resetStore);

  // Profile store — holds subscription / permission data for this session
  const setProfile   = useProfileStore(s => s.setProfile);
  const clearProfile = useProfileStore(s => s.clearProfile);

  useEffect(() => { ensureDefaultProject(); }, []);

  // ── Cloud sync ──────────────────────────────────────────────────
  // Tracks the currently-authenticated email for sync operations.
  const syncEmailRef  = useRef<string | null>(null);
  // Debounce timer for writes.
  const syncTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Stable ref to scheduleSync so the patched setItem can always call latest.
  const scheduleSyncFnRef = useRef<() => void>(() => {});

  const scheduleSync = useCallback(() => {
    if (!syncEmailRef.current) return;
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(async () => {
      const email = syncEmailRef.current;
      if (!email) return;
      try {
        const data = collectLocalData();
        await saveUserData(email, data);
      } catch (err) {
        console.warn('[CloudSync] write failed:', err);
      }
    }, 1500);
  }, []);

  // Keep the ref in sync with latest closure.
  scheduleSyncFnRef.current = scheduleSync;

  // Patch localStorage.setItem once on mount so every write (from any screen)
  // automatically triggers a debounced cloud sync.
  useEffect(() => {
    if (!isFirebaseConfigured()) return; // no-op if Firebase not set up
    const restore = patchLocalStorage((_key) => scheduleSyncFnRef.current());
    return restore;
  }, []);

  // Also subscribe to Zustand mutations (catches in-memory writes that don't
  // hit localStorage until the next Zustand persist flush).
  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    return useSurveyStore.subscribe(() => {
      scheduleSyncFnRef.current();
    });
  }, []);

  /**
   * Load a user's cloud data and hydrate the app.
   * Called on login and on mount when already authenticated.
   */
  const loginUser = useCallback(async (userEmail: string) => {
    syncEmailRef.current = userEmail;
    if (!isFirebaseConfigured()) return;

    try {
      const cloudData = await loadUserData(userEmail);
      if (!cloudData) return; // first-time user — local (empty) state is fine

      // Restore all localStorage entries (calc history, conv history, slope calcs)
      applyLocalData(cloudData);

      // Hydrate the Zustand store in-memory from the survey store key
      const surveyRaw = cloudData['elevation-calculator-v1'];
      if (surveyRaw) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const s = (JSON.parse(surveyRaw) as any)?.state;
          if (s) {
            hydrateStore({
              projects:        s.projects        ?? [],
              points:          s.points          ?? [],
              sets:            s.sets            ?? [],
              history:         s.history         ?? [],
              activeProjectId: s.activeProjectId ?? 'default-project',
            });
          }
        } catch (parseErr) {
          console.warn('[CloudSync] failed to parse survey store:', parseErr);
        }
      }
    } catch (err) {
      console.warn('[CloudSync] load failed, using local data:', err);
    }

    // Load / create the user's profile (subscription + feature flags).
    // Non-blocking — runs in parallel with data hydration above.
    // The profile store starts with isLoaded=false so usePermissions()
    // returns full access until the profile arrives.
    ensureUserProfile(userEmail).then(profile => {
      setProfile(profile);
    }).catch(() => {
      // If profile fetch fails, set isLoaded=true with null so the app
      // doesn't stay in a perpetual loading state.
      setProfile(null);
    });
  }, [hydrateStore, setProfile]);

  /**
   * Flush any pending sync, clear device-local data, and reset the store.
   * Called on logout. Cloud data is never deleted.
   */
  const logoutUser = useCallback(async () => {
    const userEmail = syncEmailRef.current;

    // Flush pending debounced sync immediately
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    }
    if (userEmail) {
      try {
        const data = collectLocalData();
        await saveUserData(userEmail, data);
      } catch (err) {
        console.warn('[CloudSync] final flush failed:', err);
      }
    }

    syncEmailRef.current = null;

    // Clear device-local cache so next user on this device starts fresh
    clearLocalData();
    resetSurveyData();
    clearProfile();
  }, [resetSurveyData, clearProfile]);

  // On mount: if the user is already authenticated, load their cloud data.
  useEffect(() => {
    const storedEmail = readEmail();
    if (storedEmail) loginUser(storedEmail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally runs once on mount

  // ── Flow handlers ───────────────────────────────────────────────
  const handleSplashDone = useCallback(() => {
    if (!readEmail()) setAppState('login');
    else              setAppState('app');
  }, []);

  const handleLogin = useCallback(async (e: string) => {
    setEmail(e);
    setAppState('app');
    await loginUser(e);
  }, [loginUser]);

  const handleGuestLogin = useCallback(() => {
    setEmail('');
    setAppState('app');
    // Guests use local storage only — no sync
    syncEmailRef.current = null;
  }, []);

  const handleLogout = useCallback(async () => {
    if (!window.confirm(t('logoutConfirm'))) return;
    await logoutUser();
    try { localStorage.removeItem('auth:email'); } catch {}
    setEmail('');
    setAppState('login');
    setShowSettings(false);
  }, [t, logoutUser]);

  // ── Navigation ──────────────────────────────────────────────────
  const handleEditPoint = useCallback((pt: SurveyPoint) => {
    setEditPoint(pt);
    setActiveTab('add');
  }, []);

  const handleComparePoint = useCallback((fromId: string, toId: string | null) => {
    setCompareFromId(fromId);
    setCompareToId(toId);
    setShowSinglePoint(false);
    setActiveTab('points');
  }, []);

  const handleShowSinglePoint = useCallback(() => {
    setShowSinglePoint(true);
    setActiveTab('points');
  }, []);

  const handleEditConsumed = useCallback(() => {
    setEditPoint(undefined);
  }, []);

  const projectId = activeProjectId ?? 'default-project';

  // ── Main tab definitions (translated) ───────────────────────────
  const MAIN_TABS: { id: MainTab; label: string }[] = [
    { id: 'add',    label: t('tabAdd')    },
    { id: 'points', label: t('tabPoints') },
    { id: 'slope',  label: t('tabSlope')  },
    { id: 'sets',   label: t('tabSets')   },
    { id: 'calc',   label: t('tabCalc')   },
  ];

  // ── Render ──────────────────────────────────────────────────────
  if (appState === 'splash') {
    return <SplashScreenWeb onDone={handleSplashDone} />;
  }
  if (appState === 'login') {
    return <LoginScreenWeb onLogin={handleLogin} onGuestLogin={handleGuestLogin} />;
  }

  return (
    <div style={styles.root}>
      {/* ── Top header ──────────────────────────────────────────── */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          {/* Rod image in a gold-bordered rounded container */}
          <div style={styles.headerRodBox}>
            <img src="/rod.png" alt="" style={styles.headerRod} />
          </div>
          {/* Title wraps naturally — no truncation */}
          <div style={styles.headerTitleWrap}>
            <span style={styles.headerTitle}>{t('appTitle')}</span>
          </div>
        </div>
        <div style={styles.headerRight}>
          {/* Two-button language toggle */}
          <div style={styles.langToggle}>
            <button
              style={{ ...styles.langOpt, ...(lang === 'en' ? styles.langOptActive : {}) }}
              onClick={() => setLang('en')}
              aria-pressed={lang === 'en'}
            >
              {t('english')}
            </button>
            <button
              style={{ ...styles.langOpt, ...(lang === 'es' ? styles.langOptActive : {}) }}
              onClick={() => setLang('es')}
              aria-pressed={lang === 'es'}
            >
              {t('spanish')}
            </button>
          </div>
          {/* Settings */}
          <button
            style={styles.headerBtn}
            onClick={() => setShowSettings(true)}
            title={t('settings')}
            aria-label={t('settings')}
          >
            <SettingsIcon />
          </button>
        </div>
      </header>

      {/* ── Main tab bar ────────────────────────────────────────── */}
      <nav style={styles.tabBar} role="tablist">
        {MAIN_TABS.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              style={{
                ...styles.tab,
                ...(isActive ? styles.tabActive : {}),
              }}
              onClick={() => handleTabSwitch(tab.id)}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* ── Screen content ──────────────────────────────────────── */}
      <main style={styles.content}>
        <div style={{ ...styles.screen, display: activeTab === 'add'    ? 'flex' : 'none' }}>
          <AddNewPointScreen
            projectId={projectId}
            isVisible={activeTab === 'add'}
            onViewPoints={() => setActiveTab('points')}
            editPoint={editPoint}
            onEditConsumed={handleEditConsumed}
            onComparePoint={handleComparePoint}
            onDirtyChange={handleDirtyChange}
            onShowSinglePoint={handleShowSinglePoint}
          />
        </div>
        <div style={{ ...styles.screen, display: activeTab === 'points' ? 'flex' : 'none' }}>
          <ViewPointsScreen
            projectId={projectId}
            onEditPoint={handleEditPoint}
            compareFromId={compareFromId}
            compareToId={compareToId}
            showSinglePoint={showSinglePoint}
          />
        </div>
        <div style={{ ...styles.screen, display: activeTab === 'sets'   ? 'flex' : 'none' }}>
          <ViewSetsScreen projectId={projectId} />
        </div>
        <div style={{ ...styles.screen, display: activeTab === 'calc'   ? 'flex' : 'none' }}>
          <CalculatorScreen />
        </div>
        <div style={{ ...styles.screen, display: activeTab === 'slope'  ? 'flex' : 'none' }}>
          <SlopeScreen projectId={projectId} />
        </div>
      </main>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <footer style={styles.footer}>
        <span>{t('appTitle')} · {t('appTagline')}</span>
      </footer>

      {/* ── Settings panel ──────────────────────────────────────── */}
      {showSettings && (
        <SettingsPanel
          email={email}
          lang={lang}
          onSetLang={setLang}
          onLogout={handleLogout}
          onClose={() => setShowSettings(false)}
          t={t}
        />
      )}
    </div>
  );
}

// ─── Settings panel (bottom-sheet) ───────────────────────────────────────────
interface SettingsPanelProps {
  email:     string;
  lang:      'en' | 'es';
  onSetLang: (l: 'en' | 'es') => void;
  onLogout:  () => void;
  onClose:   () => void;
  t:         (key: string) => string;
}

function SettingsPanel({ email, lang, onSetLang, onLogout, onClose, t }: SettingsPanelProps) {
  return (
    <div style={spS.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={spS.sheet}>
        {/* Drag handle */}
        <div style={spS.handle} />

        {/* Title row */}
        <div style={spS.titleRow}>
          <span style={spS.title}>{t('settingsTitle')}</span>
          <button style={spS.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* ── Account section ─────────────────────────────────── */}
        <div style={spS.section}>
          <span style={spS.sectionLabel}>{t('settingsAccount')}</span>
          <div style={spS.emailRow}>
            <div style={spS.emailIcon}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 20c0-3.5 3.6-6 8-6s8 2.5 8 6" />
              </svg>
            </div>
            <div style={spS.emailBlock}>
              <span style={spS.emailMeta}>{email ? t('loggedInAs') : 'Session'}</span>
              <span style={spS.emailVal}>{email || 'Guest Session'}</span>
            </div>
          </div>
          <button style={spS.logoutBtn} onClick={onLogout}>
            {email ? t('logout') : 'Sign In'}
          </button>
        </div>

        {/* ── Language section ─────────────────────────────────── */}
        <div style={spS.section}>
          <span style={spS.sectionLabel}>{t('settingsAppearance')}</span>
          <div style={spS.langRow}>
            <span style={spS.langLabel}>{t('language')}</span>
            <div style={spS.langToggleWrap}>
              {(['en', 'es'] as const).map(l => (
                <button
                  key={l}
                  style={{
                    ...spS.langOpt,
                    ...(lang === l ? spS.langOptActive : {}),
                  }}
                  onClick={() => onSetLang(l)}
                >
                  {l === 'en' ? t('english') : t('spanish')}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Settings icon ────────────────────────────────────────────────────────────
function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const GOLD = '#F4B02A';
const NAVY = '#143A63';

const styles: Record<string, React.CSSProperties> = {
  root: {
    display:       'flex',
    flexDirection: 'column',
    minHeight:     '100vh',
    width:         '100%',        // lock to viewport width
    maxWidth:      '480px',
    margin:        '0 auto',
    backgroundColor: '#F5F4F0',
    boxShadow:     '0 0 40px rgba(0,0,0,0.12)',
    overflowX:     'hidden',      // prevent any child from pushing us wider
  },
  header: {
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'space-between',
    backgroundColor: NAVY,
    padding:         '6px 10px',
    gap:             '6px',
    flexShrink:      0,
    width:           '100%',
    boxSizing:       'border-box' as const,
  },
  headerLeft: {
    display:    'flex',
    alignItems: 'center',
    gap:        '7px',
    flex:       1,
    minWidth:   0,
  },
  headerRodBox: {
    width:           38,
    height:          38,
    borderRadius:    9,
    backgroundColor: 'rgba(255,255,255,0.08)',
    border:          '1.5px solid rgba(244,176,42,0.55)',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
    overflow:        'hidden',
    boxShadow:       '0 1px 4px rgba(0,0,0,0.30)',
  },
  headerRod: {
    width:        '88%',
    height:       '88%',
    display:      'block',
    mixBlendMode: 'screen' as const,
    objectFit:    'contain' as const,
  },
  headerTitleWrap: {
    flex:     1,
    minWidth: 0,
  },
  headerTitle: {
    fontSize:      '13px',
    fontWeight:    '700',
    color:         '#FFFFFF',
    letterSpacing: '-0.2px',
    lineHeight:    '1.25',
    display:       'block',
    // wraps naturally — no truncation
  },
  headerRight: {
    display:    'flex',
    alignItems: 'center',
    gap:        '5px',
    flexShrink: 0,
  },
  langToggle: {
    display:         'flex',
    alignItems:      'center',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius:    8,
    padding:         '2px',
    gap:             '2px',
  },
  langOpt: {
    height:          26,
    padding:         '0 7px',
    borderRadius:    6,
    border:          'none',
    backgroundColor: 'transparent',
    color:           'rgba(255,255,255,0.52)',
    fontSize:        '10.5px',
    fontWeight:      700,
    letterSpacing:   0.2,
    cursor:          'pointer',
    transition:      'background-color 0.15s, color 0.15s',
    whiteSpace:      'nowrap' as const,
  },
  langOptActive: {
    backgroundColor: GOLD,
    color:           NAVY,
  },
  headerBtn: {
    width:           34,
    height:          34,
    borderRadius:    '50%',
    backgroundColor: 'rgba(255,255,255,0.12)',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    color:           '#FFFFFF',
    border:          '1px solid rgba(255,255,255,0.15)',
    cursor:          'pointer',
    flexShrink:      0,
    transition:      'background-color 0.15s',
  },
  tabBar: {
    display:         'flex',
    flexDirection:   'row',
    backgroundColor: '#FFFFFF',
    borderBottom:    '1.5px solid #E5E7EB',
    flexShrink:      0,
    width:           '100%',
    boxSizing:       'border-box' as const,
    // no overflow:hidden — tabs grow to fit wrapped text
  },
  tab: {
    flex:            1,
    minWidth:        0,
    // no fixed height — pad vertically so two-line labels fit
    padding:         '5px 2px',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    fontSize:        '13.5px',
    fontWeight:      '700',
    lineHeight:      '1.2',
    textAlign:       'center' as const,
    color:           '#4B5563',
    backgroundColor: 'transparent',
    border:          'none',
    borderBottom:    '2.5px solid transparent',
    cursor:          'pointer',
    // allow text to wrap onto two lines
    transition:      'background-color 0.15s, color 0.15s, border-color 0.15s',
  },
  tabActive: {
    color:             NAVY,
    backgroundColor:   GOLD,
    borderBottomColor: GOLD,
  },
  content: {
    flex:          1,
    display:       'flex',
    flexDirection: 'column',
    overflow:      'hidden',
    position:      'relative',
    width:         '100%',       // explicit width so children can't push it wider
    minWidth:      0,            // allow shrinking below content size
    boxSizing:     'border-box',
  },
  screen: {
    flex:          1,
    flexDirection: 'column',
    overflow:      'auto',
    width:         '100%',       // explicit width so it fills content exactly
    minWidth:      0,            // prevent flex blowout from inner content
    boxSizing:     'border-box',
  },
  footer: {
    textAlign:       'center',
    fontSize:        '11px',
    color:           '#9CA3AF',
    padding:         '10px 16px',
    borderTop:       '1px solid #F3F4F6',
    backgroundColor: '#FFFFFF',
    flexShrink:      0,
    width:           '100%',
    boxSizing:       'border-box',
  },
};

// ─── Settings panel styles ────────────────────────────────────────────────────
const NAVY2 = '#143A63';
const BDR   = '#E5E7EB';
const SURF  = '#F0EEE8';

const spS: Record<string, React.CSSProperties> = {
  overlay: {
    position:        'fixed',
    inset:           0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    display:         'flex',
    alignItems:      'flex-end',
    zIndex:          500,
  },
  sheet: {
    width:           '100%',
    maxWidth:        480,
    margin:          '0 auto',
    backgroundColor: '#FFFFFF',
    borderRadius:    '20px 20px 0 0',
    padding:         '0 0 24px',
    display:         'flex',
    flexDirection:   'column',
    gap:             0,
  },
  handle: {
    alignSelf:       'center',
    width:           40,
    height:          4,
    backgroundColor: BDR,
    borderRadius:    2,
    margin:          '10px auto 0',
  },
  titleRow: {
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'space-between',
    padding:         '14px 20px 10px',
    borderBottom:    `1px solid ${BDR}`,
  },
  title: {
    fontSize:  18,
    fontWeight: 800,
    color:     '#111827',
  },
  closeBtn: {
    width:           32,
    height:          32,
    borderRadius:    16,
    backgroundColor: SURF,
    border:          `1px solid ${BDR}`,
    color:           '#374151',
    fontSize:        14,
    fontWeight:      700,
    cursor:          'pointer',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
  },
  section: {
    padding:         '16px 20px',
    display:         'flex',
    flexDirection:   'column',
    gap:             10,
    borderBottom:    `1px solid ${BDR}`,
  },
  sectionLabel: {
    fontSize:    11,
    fontWeight:  800,
    color:       '#1F2937',
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
  },
  emailRow: {
    display:         'flex',
    alignItems:      'center',
    gap:             12,
    backgroundColor: SURF,
    borderRadius:    10,
    padding:         '10px 14px',
    border:          `1px solid ${BDR}`,
  },
  emailIcon: {
    width:           36,
    height:          36,
    borderRadius:    18,
    backgroundColor: NAVY2,
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    color:           '#F5C542',
    fontSize:        16,
    fontWeight:      800,
    flexShrink:      0,
  },
  emailBlock: {
    display:       'flex',
    flexDirection: 'column',
    gap:           2,
    minWidth:      0,
  },
  emailMeta: {
    fontSize:  10,
    fontWeight: 700,
    color:     '#374151',
    letterSpacing: 0.3,
    textTransform: 'uppercase' as const,
  },
  emailVal: {
    fontSize:     14,
    fontWeight:   700,
    color:        '#111827',
    overflow:     'hidden',
    textOverflow: 'ellipsis',
    whiteSpace:   'nowrap',
  },
  logoutBtn: {
    height:          48,
    borderRadius:    10,
    backgroundColor: 'rgba(192,57,43,0.08)',
    border:          '1.5px solid rgba(192,57,43,0.3)',
    color:           '#C0392B',
    fontSize:        14,
    fontWeight:      800,
    letterSpacing:   0.5,
    cursor:          'pointer',
    transition:      'background-color 0.15s',
  },
  langRow: {
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'space-between',
  },
  langLabel: {
    fontSize:   14,
    fontWeight: 600,
    color:      '#374151',
  },
  langToggleWrap: {
    display:         'flex',
    borderRadius:    8,
    border:          `1.5px solid ${BDR}`,
    overflow:        'hidden',
  },
  langOpt: {
    height:          36,
    minWidth:        64,
    border:          'none',
    backgroundColor: SURF,
    color:           '#374151',
    fontSize:        13,
    fontWeight:      600,
    cursor:          'pointer',
    padding:         '0 12px',
    // Only animate colors
    transition:      'background-color 0.15s, color 0.15s',
  },
  langOptActive: {
    backgroundColor: NAVY2,
    color:           '#FFFFFF',
    fontWeight:      800,
  },
};
