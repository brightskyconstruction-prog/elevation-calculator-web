import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSurveyStore } from './stores/surveyStore';
import { LangProvider, useLang } from './LangContext';
import { MainTab, SurveyPoint } from './types';
import AddNewPointScreen, { type AddNewPointScreenAPI } from './screens/AddNewPointScreen';
import ViewPointsScreen   from './screens/ViewPointsScreen';
import ViewSetsScreen     from './screens/ViewSetsScreen';
import CalculatorScreen   from './screens/CalculatorScreen';
import SplashScreenWeb    from './screens/SplashScreenWeb';
import LoginScreenWeb     from './screens/LoginScreenWeb';
import SlopeScreen        from './screens/SlopeScreen';
import TutorialScreen     from './screens/TutorialScreen';
import OfflineIndicator   from './components/OfflineIndicator';
import OnboardingOverlay  from './components/OnboardingOverlay';
import PrivacyPolicyModal from './components/PrivacyPolicyModal';
import ConfirmModal       from './components/ConfirmModal';
import { isFirebaseConfigured, onAuthChanged, signOutFirebase } from './firebase';
import {
  loadUserData,
  saveUserData,
  collectLocalData,
  applyLocalData,
  clearLocalData,
  patchLocalStorage,
  migrateUserData,
} from './services/cloudSync';
import { ensureUserProfile } from './services/userProfile';
import { useProfileStore } from './stores/profileStore';

// Global bridge between the synchronous back-guard in index.html and React.
// The inline script in index.html pushes history entries and registers the
// popstate listener before React mounts (eliminating timing gaps on Android).
// AppInner populates these so the pre-existing listener can call React state.
declare global {
  interface Window {
    /** Navigation logic; set by AppInner's useEffect. */
    __elevHandleBack?: () => void;
    /** Permanently disable re-interception once the user confirms Exit. */
    __elevDead?: boolean;
  }
}

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

  const [email,           setEmail]           = useState<string>(() => readEmail() ?? '');
  const [activeTab,       setActiveTab]       = useState<MainTab>('add');
  const [showPrivacy,     setShowPrivacy]     = useState(false);
  const [privacyInitTab,  setPrivacyInitTab]  = useState<'privacy' | 'terms'>('privacy');
  const addScreenDirty = useRef(false);

  // ── Global back-navigation refs ─────────────────────────────────────────────
  // Imperative handle into AddNewPointScreen so the global handler can close
  // the Manage Point overlay or reset the form without lifting those states.
  const addScreenRef    = useRef<AddNewPointScreenAPI | null>(null);
  // Always-current copy of activeTab for use inside the mount-time handler.
  const activeTabRef    = useRef<MainTab>('add');
  // Tracks whether the Settings panel is open.
  const showSettingsRef = useRef(false);

  // Keep refs in sync with state
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

  const handleDirtyChange = useCallback((dirty: boolean) => {
    addScreenDirty.current = dirty;
  }, []);

  // ── Confirm modal state ─────────────────────────────────────────
  // A single shared confirm modal instance used for logout + unsaved-changes.
  // Declared before handleTabSwitch so showConfirm is in scope when used.
  const [confirmProps, setConfirmProps] = useState<null | {
    message:      string;
    confirmLabel: string;
    cancelLabel:  string;
    danger:       boolean;
    onConfirm:    () => void;
  }>(null);
  const showConfirm = useCallback((opts: {
    message:       string;
    confirmLabel?: string;
    cancelLabel?:  string;
    danger?:       boolean;
    onConfirm:     () => void;
  }) => {
    setConfirmProps({
      message:      opts.message,
      confirmLabel: opts.confirmLabel ?? 'Confirm',
      cancelLabel:  opts.cancelLabel  ?? 'Cancel',
      danger:       opts.danger       ?? false,
      onConfirm:    opts.onConfirm,
    });
  }, []);

  const handleTabSwitch = useCallback((tab: MainTab) => {
    if (activeTab === 'add' && tab !== 'add' && addScreenDirty.current) {
      showConfirm({
        message:      t('unsavedPointConfirm'),
        confirmLabel: t('exitAppConfirm'),
        cancelLabel:  t('continueEditing'),
        danger:       false,
        onConfirm: () => {
          addScreenDirty.current = false;
          setConfirmProps(null);
          setActiveTab(tab);
        },
      });
      return;
    }
    setActiveTab(tab);
  }, [activeTab, t, showConfirm]);
  const [editPoint,     setEditPoint]     = useState<SurveyPoint | undefined>(undefined);
  const [showSettings,  setShowSettings]  = useState(false);
  const [showLauncher,  setShowLauncher]  = useState(false);
  useEffect(() => { showSettingsRef.current = showSettings; }, [showSettings]);
  const [compareFromId, setCompareFromId] = useState<string | null>(null);
  const [compareToId,   setCompareToId]   = useState<string | null>(null);
  const [slopeFromId,   setSlopeFromId]   = useState<string | null>(null);
  const [slopeToId,     setSlopeToId]     = useState<string | null>(null);

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
  // Tracks the Firebase UID of the currently-authenticated user.
  // Set in loginUser and cleared in logoutUser.
  const syncEmailRef  = useRef<string | null>(null); // kept as "syncRef" for compat; now stores UID
  // Debounce timer for writes.
  const syncTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Stable ref to scheduleSync so the patched setItem can always call latest.
  const scheduleSyncFnRef = useRef<() => void>(() => {});

  const scheduleSync = useCallback(() => {
    if (!syncEmailRef.current) return;
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(async () => {
      const uid = syncEmailRef.current; // now stores Firebase UID
      if (!uid) return;
      try {
        const data = collectLocalData();
        await saveUserData(uid, data);
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

  // ── Global back-navigation: wire React logic into the index.html guard ───────
  //
  // The popstate listener and initial history pushes live in index.html and run
  // synchronously before React loads — eliminating the timing gap that caused
  // the handler to be unregistered when a Back press happened during startup.
  //
  // This effect only sets window.__elevHandleBack so the pre-existing listener
  // can call React state setters. All refs are always-current so there is no
  // stale-closure issue despite the empty dependency array.
  useEffect(() => {
    window.__elevHandleBack = () => {
      // 1. Settings panel open → close it.
      if (showSettingsRef.current) {
        setShowSettings(false);
        return;
      }

      const screen = addScreenRef.current;
      const ms = screen?.getManageState() ?? { editingFromManage: false, showManagePoint: false };

      if (ms.showManagePoint) {
        // 2. Manage overlay open → close it and show blank new-point form.
        screen?.closeManage();
      } else if (activeTabRef.current !== 'add') {
        // 3. On any tab other than Point ⊕ → navigate back to Point ⊕ tab.
        setActiveTab('add');
      } else if (screen?.isPointLoaded()) {
        // 4. On the Point ⊕ tab but viewing / editing an existing point
        //    (edit mode OR read-only) → return to blank new-point form.
        screen?.reset();
      }
      // 5. On the Point ⊕ tab with a blank new-point form (the home state)
      //    → do nothing.  The exit dialog has been removed; the Points tab
      //    is the application home screen.
    };

    return () => { window.__elevHandleBack = undefined; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Load a user's cloud data and hydrate the app.
   * Called on login and on mount when already authenticated.
   */
  const loginUser = useCallback(async (userEmail: string, uid: string) => {
    // uid is the Firebase Auth UID — used as the Firestore document key.
    // When Firebase is not configured, uid is '' and cloud sync is skipped.
    syncEmailRef.current = uid || null;
    if (!isFirebaseConfigured() || !uid) return;

    // ── Restore-point fallback ───────────────────────────────────────────────
    // logoutUser saves a uid-tagged snapshot of local data before clearing.
    // If Firestore is unavailable or has no record, we restore from this so
    // sign-out → sign-in never results in a blank screen.
    const applyRestorePoint = () => {
      try {
        const raw = localStorage.getItem('elevCalc:restore');
        if (!raw) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const parsed = JSON.parse(raw) as any;
        // Only restore if this snapshot belongs to the current user.
        if (parsed?.uid !== uid) return;
        const snapshot = parsed.data as Record<string, string>;
        applyLocalData(snapshot);
        const surveyRaw = snapshot['elevation-calculator-v1'];
        if (surveyRaw) {
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
        }
        console.info('[CloudSync] Restored from local restore-point.');
      } catch (restoreErr) {
        console.warn('[CloudSync] Restore-point recovery failed:', restoreErr);
      }
    };

    try {
      // Migrate data from legacy btoa(email) path on first login with new auth
      await migrateUserData(userEmail, uid);

      const cloudData = await loadUserData(uid);
      if (!cloudData) {
        // No Firestore record yet (new user, or flush failed on last logout).
        // Try the restore-point saved during the last logout.
        applyRestorePoint();
        return;
      }

      // Successful cloud load — discard the restore-point (no longer needed).
      try { localStorage.removeItem('elevCalc:restore'); } catch {}

      applyLocalData(cloudData);

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
      // Firestore read failed (network error, permission denied, etc.).
      // Fall back to the local restore-point saved during the last logout.
      console.warn('[CloudSync] load failed, trying restore-point:', err);
      applyRestorePoint();
    }

    // Load / create the user's profile (non-blocking)
    ensureUserProfile(userEmail, uid).then(profile => {
      setProfile(profile);
    }).catch(() => {
      setProfile(null);
    });
  }, [hydrateStore, setProfile]);

  /**
   * Flush any pending sync, clear device-local data, and reset the store.
   * Called on logout. Cloud data is never deleted.
   */
  const logoutUser = useCallback(async () => {
    const uid = syncEmailRef.current;

    // Flush pending debounced sync immediately
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    }

    // Capture a snapshot BEFORE any clearing so the same object
    // is used for both the Firestore flush and the local restore-point.
    const localSnapshot = uid ? collectLocalData() : null;

    if (uid && localSnapshot) {
      try {
        await saveUserData(uid, localSnapshot);
      } catch (err) {
        console.warn('[CloudSync] final flush failed:', err);
      }
    }

    syncEmailRef.current = null;

    // Sign out from Firebase so auth state is cleared
    await signOutFirebase();

    // Save a local restore-point BEFORE wiping device data.
    // loginUser reads this back if Firestore is unavailable on the next sign-in,
    // preventing a blank screen after sign-out → sign-in on the same device.
    // The uid tag ensures it is only restored for the same account.
    if (uid && localSnapshot && Object.keys(localSnapshot).length > 0) {
      try {
        localStorage.setItem('elevCalc:restore', JSON.stringify({ uid, data: localSnapshot }));
      } catch {}
    }

    // Clear device-local cache so next user on this device starts fresh
    clearLocalData();
    resetSurveyData();
    clearProfile();
  }, [resetSurveyData, clearProfile]);

  // On mount: subscribe to Firebase Auth state.
  // If the user has a persisted session (from a previous Email Link sign-in),
  // Firebase fires onAuthStateChanged immediately with the restored user.
  // This wires up cloud sync without requiring a new sign-in link.
  useEffect(() => {
    const storedEmail = readEmail();

    if (!isFirebaseConfigured()) {
      // No Firebase — use local data only (no UID needed)
      if (storedEmail) loginUser(storedEmail, '');
      return;
    }

    // Subscribe to Firebase auth state
    const unsub = onAuthChanged((user) => {
      if (user && !user.isAnonymous && storedEmail) {
        // Persisted real auth — restore cloud sync with their UID
        loginUser(storedEmail, user.uid);
      }
    });

    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally runs once on mount

  // ── Flow handlers ───────────────────────────────────────────────
  const handleSplashDone = useCallback(() => {
    if (!readEmail()) setAppState('login');
    else              setAppState('app');
  }, []);

  const handleLogin = useCallback(async (e: string, uid: string) => {
    setEmail(e);
    // LoginScreenWeb already stored auth:email — just sync cloud data
    await loginUser(e, uid);
    setAppState('app');
  }, [loginUser]);

  const handleGuestLogin = useCallback(() => {
    setEmail('');
    setAppState('app');
    // Guests use local storage only — no sync
    syncEmailRef.current = null;
  }, []);

  const handleLogout = useCallback(() => {
    showConfirm({
      message:      t('logoutConfirm'),
      confirmLabel: t('logout'),
      cancelLabel:  t('cancel'),
      danger:       false,
      onConfirm: async () => {
        setConfirmProps(null);
        await logoutUser();
        try { localStorage.removeItem('auth:email'); } catch {}
        setEmail('');
        setAppState('login');
        setShowSettings(false);
      },
    });
  }, [t, logoutUser, showConfirm]);

  // ── Navigation ──────────────────────────────────────────────────
  const handleEditPoint = useCallback((pt: SurveyPoint) => {
    setEditPoint(pt);
    setActiveTab('add');
  }, []);

  const handleComparePoint = useCallback((fromId: string, toId: string | null) => {
    setCompareFromId(fromId);
    setCompareToId(toId);
    setActiveTab('points');
  }, []);

  const handleFindSlope = useCallback((fromId: string, toId: string | null) => {
    setSlopeFromId(fromId);
    setSlopeToId(toId);
    setActiveTab('slope');
  }, []);

  const handleEditConsumed = useCallback(() => {
    setEditPoint(undefined);
  }, []);

  const projectId = activeProjectId ?? 'default-project';

  // ── Main tab definitions ─────────────────────────────────────────────────────
  // `lines`    → two-line wrapped label (centered).
  // `icon`     → replaces text with an SVG icon component.
  // `flex`     → proportional width (all values sum to 100).
  // `ariaLabel`→ accessible name for screen readers.
  const MAIN_TABS: {
    id:        MainTab;
    label?:    string;
    lines?:    [string, string];
    icon?:     React.ReactNode;
    flex:      number;
    ariaLabel: string;
  }[] = [
    { id: 'add',      label: t('tabAdd'),
      flex: 18, ariaLabel: t('tabAdd') },
    { id: 'points',   label: t('tabPoints'),
      lines: lang === 'en' ? ['Compare', 'Height'] : ['Comparar', 'Altura'],
      flex: 22, ariaLabel: t('tabPoints') },
    { id: 'slope',    label: t('tabSlope'),
      flex: 16, ariaLabel: t('tabSlope') },
    { id: 'sets',     label: t('tabSets'),
      lines: lang === 'en' ? ['View', 'Sets'] : ['Ver', 'Conj.'],
      flex: 20, ariaLabel: t('tabSets') },
    { id: 'calc',     icon: <CalcIcon />,
      flex: 12, ariaLabel: t('tabCalc') },
    { id: 'tutorial', label: '?',
      flex: 12, ariaLabel: 'Help' },
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
          {/* Bright Sky Services launcher */}
          <button
            style={styles.headerBtn}
            onClick={() => setShowLauncher(true)}
            title="Bright Sky Services"
            aria-label="Bright Sky Services"
          >
            <LauncherGridIcon />
          </button>
          {/* Two-button language toggle — abbreviated labels to save space */}
          <div style={styles.langToggle}>
            <button
              style={{ ...styles.langOpt, ...(lang === 'en' ? styles.langOptActive : {}) }}
              onClick={() => setLang('en')}
              aria-pressed={lang === 'en'}
            >
              EN
            </button>
            <button
              style={{ ...styles.langOpt, ...(lang === 'es' ? styles.langOptActive : {}) }}
              onClick={() => setLang('es')}
              aria-pressed={lang === 'es'}
            >
              ES
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
          const isIcon   = !!tab.icon;
          const isHelp   = tab.id === 'tutorial';
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              aria-label={tab.ariaLabel}
              title={tab.ariaLabel}
              style={{
                ...styles.tab,
                flex: tab.flex,
                ...(isActive ? styles.tabActive : {}),
                fontSize: lang === 'en' ? '15px' : '12.5px',
              }}
              onClick={() => handleTabSwitch(tab.id)}
            >
              {isIcon ? (
                tab.icon
              ) : tab.lines ? (
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.2, gap: 0 }}>
                  <span>{tab.lines[0]}</span>
                  <span>{tab.lines[1]}</span>
                </span>
              ) : isHelp ? (
                <span style={{ fontSize: '19px', fontWeight: 800, lineHeight: 1, letterSpacing: 0 }}>?</span>
              ) : (
                tab.label
              )}
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
            onEditPoint={handleEditPoint}
            onFindSlope={handleFindSlope}
            imperativeRef={addScreenRef}
          />
        </div>
        <div style={{ ...styles.screen, display: activeTab === 'points' ? 'flex' : 'none' }}>
          <ViewPointsScreen
            projectId={projectId}
            compareFromId={compareFromId}
            compareToId={compareToId}
          />
        </div>
        <div style={{ ...styles.screen, display: activeTab === 'sets'   ? 'flex' : 'none' }}>
          <ViewSetsScreen projectId={projectId} />
        </div>
        <div style={{ ...styles.screen, display: activeTab === 'calc'   ? 'flex' : 'none' }}>
          <CalculatorScreen />
        </div>
        <div style={{ ...styles.screen, display: activeTab === 'tutorial' ? 'flex' : 'none' }}>
          <TutorialScreen />
        </div>
        <div style={{ ...styles.screen, display: activeTab === 'slope'  ? 'flex' : 'none' }}>
          <SlopeScreen
            projectId={projectId}
            initFromId={slopeFromId}
            initToId={slopeToId}
            onInitConsumed={() => { setSlopeFromId(null); setSlopeToId(null); }}
          />
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
          onOpenPrivacy={() => { setPrivacyInitTab('privacy'); setShowPrivacy(true); }}
          onOpenTerms={() => { setPrivacyInitTab('terms'); setShowPrivacy(true); }}
          t={t}
        />
      )}

      {/* ── Privacy Policy / Terms of Service modal ─────────────── */}
      {showPrivacy && (
        <PrivacyPolicyModal
          initialTab={privacyInitTab}
          onClose={() => setShowPrivacy(false)}
        />
      )}

      {/* ── Bright Sky Services launcher modal ───────────────────── */}
      {showLauncher && (
        <BrightSkyLauncherModal onClose={() => setShowLauncher(false)} />
      )}

      {/* ── First-run onboarding ─────────────────────────────────── */}
      <OnboardingOverlay />

      {/* ── Shared confirm dialog (logout, unsaved-changes) ─────── */}
      {confirmProps && (
        <ConfirmModal
          message={confirmProps.message}
          confirmLabel={confirmProps.confirmLabel}
          cancelLabel={confirmProps.cancelLabel}
          danger={confirmProps.danger}
          onConfirm={confirmProps.onConfirm}
          onCancel={() => setConfirmProps(null)}
        />
      )}

      {/* ── Offline banner (fixed, renders above everything) ────── */}
      <OfflineIndicator />
    </div>
  );
}

// ─── Settings panel (bottom-sheet) ───────────────────────────────────────────
interface SettingsPanelProps {
  email:          string;
  lang:           'en' | 'es';
  onSetLang:      (l: 'en' | 'es') => void;
  onLogout:       () => void;
  onClose:        () => void;
  onOpenPrivacy:  () => void;
  onOpenTerms:    () => void;
  t:              (key: string) => string;
}

function SettingsPanel({ email, lang, onSetLang, onLogout, onClose, onOpenPrivacy, onOpenTerms, t }: SettingsPanelProps) {
  return (
    <div style={spS.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="anp-modal-in" style={spS.sheet}>

        {/* Title row */}
        <div style={spS.titleRow}>
          <span style={spS.title}>{t('settingsTitle')}</span>
          <button style={spS.closeBtn} onClick={onClose} aria-label="Close settings">✕</button>
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
                  aria-pressed={lang === l}
                >
                  {l === 'en' ? t('english') : t('spanish')}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Legal section ────────────────────────────────────── */}
        <div style={{ ...spS.section, borderBottom: 'none' }}>
          <span style={spS.sectionLabel}>{t('settingsLegal')}</span>
          <button style={spS.legalBtn} onClick={onOpenPrivacy}>
            <span>{t('settingsPrivacy')}</span>
            <span style={spS.legalArrow}>›</span>
          </button>
          <button style={spS.legalBtn} onClick={onOpenTerms}>
            <span>{t('settingsTerms')}</span>
            <span style={spS.legalArrow}>›</span>
          </button>
        </div>

        {/* ── App version ──────────────────────────────────────── */}
        <div style={spS.versionRow}>
          <span style={spS.versionText}>Grade and Elevation Calculator · v1.0</span>
        </div>
      </div>
    </div>
  );
}

// ─── Launcher grid icon (3×3 squares) ────────────────────────────────────────
function LauncherGridIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 17 17" fill="currentColor">
      <rect x="1"   y="1"   width="4.5" height="4.5" rx="1.2"/>
      <rect x="6.2" y="1"   width="4.5" height="4.5" rx="1.2"/>
      <rect x="11.5" y="1"  width="4.5" height="4.5" rx="1.2"/>
      <rect x="1"   y="6.2" width="4.5" height="4.5" rx="1.2"/>
      <rect x="6.2" y="6.2" width="4.5" height="4.5" rx="1.2"/>
      <rect x="11.5" y="6.2" width="4.5" height="4.5" rx="1.2"/>
      <rect x="1"   y="11.5" width="4.5" height="4.5" rx="1.2"/>
      <rect x="6.2" y="11.5" width="4.5" height="4.5" rx="1.2"/>
      <rect x="11.5" y="11.5" width="4.5" height="4.5" rx="1.2"/>
    </svg>
  );
}

// ─── Bright Sky Services Launcher Modal ──────────────────────────────────────
interface BrightSkyServiceDef {
  id:       string;
  icon:     string;
  title:    string;
  desc:     string;
  featured: boolean;
  onOpen:   () => void;
}

function BrightSkyLauncherModal({ onClose }: { onClose: () => void }) {
  const services: BrightSkyServiceDef[] = [
    {
      id:       'time-tracker',
      icon:     '🕒',
      title:    'Employee Time Tracker',
      desc:     'Track work hours, attendance and timesheets.',
      featured: true,
      onOpen:   () => { /* navigate to Time Tracker app — placeholder */ },
    },
    {
      id:       'route-tracker',
      icon:     '📍',
      title:    'Employee Route Tracker',
      desc:     'View employee travel routes and GPS history.',
      featured: true,
      onOpen:   () => { /* navigate to Route Tracker app — placeholder */ },
    },
  ];

  return (
    <div
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.58)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 18px', boxSizing: 'border-box' as const }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="anp-modal-in"
        style={{ maxWidth: 420, width: '100%', backgroundColor: '#FFFFFF', borderRadius: 22, overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.34)', display: 'flex', flexDirection: 'column', maxHeight: '88vh' }}
      >
        {/* ── Header ── */}
        <div style={{ backgroundColor: NAVY, padding: '18px 18px 16px', display: 'flex', alignItems: 'center', gap: 13, flexShrink: 0 }}>
          {/* Company icon */}
          <div style={{ width: 46, height: 46, borderRadius: 12, backgroundColor: 'rgba(244,176,42,0.15)', border: '1.5px solid rgba(244,176,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 24 }}>
            🌤️
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#FFFFFF', letterSpacing: 0.1, lineHeight: 1.2 }}>Bright Sky Services</div>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.62)', marginTop: 3, lineHeight: 1.35 }}>
              Access tools and services by Bright Sky Construction.
            </div>
          </div>
          <button
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.78)', fontSize: 22, cursor: 'pointer', padding: '4px 6px', lineHeight: 1, flexShrink: 0 }}
            onClick={onClose}
          >✕</button>
        </div>

        {/* ── Scrollable service list ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 6px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: '#9CA3AF', letterSpacing: 0.9, textTransform: 'uppercase' as const, marginBottom: 2 }}>
            Available Services
          </div>
          {services.map(svc => (
            <button
              key={svc.id}
              style={{ display: 'flex', alignItems: 'center', gap: 14, backgroundColor: '#F8FAFC', border: '1.5px solid #E5E7EB', borderRadius: 14, padding: '13px 13px', cursor: 'pointer', textAlign: 'left' as const, width: '100%', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
              onClick={svc.onOpen}
            >
              {/* Service icon */}
              <div style={{ width: 48, height: 48, borderRadius: 13, backgroundColor: '#EFF6FF', border: '1px solid #BFDBFE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 24 }}>
                {svc.icon}
              </div>
              {/* Text block */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' as const, marginBottom: 3 }}>
                  <span style={{ fontSize: 15, fontWeight: 800, color: '#111827', lineHeight: 1.2 }}>{svc.title}</span>
                  {svc.featured && (
                    <span style={{ fontSize: 9, fontWeight: 800, color: '#92400E', backgroundColor: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 20, padding: '2px 8px', letterSpacing: 0.5, textTransform: 'uppercase' as const, whiteSpace: 'nowrap' as const, lineHeight: 1.6 }}>
                      Coming Soon
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#6B7280', lineHeight: 1.4 }}>{svc.desc}</div>
              </div>
              {/* Arrow */}
              <span style={{ fontSize: 22, color: '#CBD5E1', flexShrink: 0, lineHeight: 1, fontWeight: 300 }}>›</span>
            </button>
          ))}
        </div>

        {/* ── Footer ── */}
        <div style={{ padding: '12px 14px 16px', textAlign: 'center' as const, borderTop: '1px solid #F3F4F6', flexShrink: 0, marginTop: 4 }}>
          <span style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 500 }}>Powered by Bright Sky Construction</span>
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

// ─── Calculator tab icon (Material-style, stroke-based) ──────────────────────
function CalcIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
         aria-hidden="true">
      {/* Body */}
      <rect x="4" y="2" width="16" height="20" rx="2" />
      {/* Display — filled */}
      <rect x="7" y="5" width="10" height="4" rx="0.75"
            fill="currentColor" stroke="none" />
      {/* Button grid: 2 rows × 2 cols + 1 tall right key */}
      <rect x="7"    y="11" width="3" height="3" rx="0.75" />
      <rect x="10.5" y="11" width="3" height="3" rx="0.75" />
      <rect x="14"   y="11" width="3" height="7" rx="0.75" />
      <rect x="7"    y="15" width="3" height="3" rx="0.75" />
      <rect x="10.5" y="15" width="3" height="3" rx="0.75" />
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
    borderBottom:    '1px solid #E5E7EB',
    flexShrink:      0,
    width:           '100%',
    boxSizing:       'border-box' as const,
    padding:         '3px 4px',
    gap:             2,
  },
  tab: {
    // flex is set per-tab inline (proportional widths)
    minWidth:        0,
    padding:         '5px 3px',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    fontSize:        '15px',
    fontWeight:      '600',
    lineHeight:      '1.2',
    letterSpacing:   '0.01em',
    textAlign:       'center' as const,
    color:           '#6B7280',
    backgroundColor: 'transparent',
    border:          'none',
    borderRadius:    16,
    cursor:          'pointer',
    whiteSpace:      'normal' as const,
    minHeight:       44,
    transition:      'background-color 0.2s, color 0.2s, box-shadow 0.2s',
  },
  tabActive: {
    color:           NAVY,
    backgroundColor: '#DBEAFE',
    fontWeight:      '700',
    boxShadow:       '0 1px 4px rgba(20,58,99,0.12)',
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
    alignItems:      'center',
    justifyContent:  'center',
    padding:         '0 20px',
    boxSizing:       'border-box' as const,
    zIndex:          500,
  },
  sheet: {
    maxWidth:        440,
    width:           '100%',
    backgroundColor: '#FFFFFF',
    borderRadius:    18,
    overflow:        'hidden',
    boxShadow:       '0 20px 60px rgba(0,0,0,0.28)',
    display:         'flex',
    flexDirection:   'column' as const,
    gap:             0,
  },
  titleRow: {
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'space-between',
    padding:         '16px 20px',
    backgroundColor: NAVY2,
    flexShrink:      0,
  },
  title: {
    fontSize:   18,
    fontWeight:  800,
    color:      '#FFFFFF',
    lineHeight:  1.2,
  },
  closeBtn: {
    background:  'none',
    border:      'none',
    color:       '#FFFFFF',
    fontSize:    24,
    fontWeight:  700,
    lineHeight:  1,
    cursor:      'pointer',
    padding:     '4px 6px',
    opacity:     0.85,
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
  legalBtn: {
    height:          44,
    borderRadius:    10,
    backgroundColor: SURF,
    border:          `1px solid ${BDR}`,
    color:           '#374151',
    fontSize:        14,
    fontWeight:      600,
    cursor:          'pointer',
    padding:         '0 14px',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'space-between',
    transition:      'background-color 0.15s',
  },
  legalArrow: {
    fontSize:   18,
    color:      '#9CA3AF',
    lineHeight: 1,
  },
  versionRow: {
    padding:    '12px 20px',
    textAlign:  'center' as const,
  },
  versionText: {
    fontSize:   11,
    color:      '#9CA3AF',
    fontWeight: 500,
  },
};

