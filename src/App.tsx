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
import { isFirebaseConfigured, onAuthChanged, signOutFirebase, getDb } from './firebase';
import { collection, addDoc, serverTimestamp, getDocs, query, orderBy, updateDoc, doc as fsDoc } from 'firebase/firestore';
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
  const [showAdmin,     setShowAdmin]     = useState(false);
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

  const [logoutModal, setLogoutModal] = useState<'none' | 'auth' | 'guest'>('none');

  const doLogout = useCallback(async () => {
    setLogoutModal('none');
    await logoutUser();
    try { localStorage.removeItem('auth:email'); } catch {}
    setEmail('');
    setAppState('login');
    setShowSettings(false);
  }, [logoutUser]);

  const handleLogout = useCallback(() => {
    setLogoutModal(email ? 'auth' : 'guest');
  }, [email]);

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
    { id: 'tutorial', icon: <HelpIcon />,
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
                fontSize: lang === 'en' ? '15px' : '13.5px',
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
          <ViewSetsScreen projectId={projectId} onEditPoint={handleEditPoint} />
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
          onOpenAdmin={() => { setShowSettings(false); setShowAdmin(true); }}
          t={t}
        />
      )}

      {/* ── Logout modal (auth or guest flow) ───────────────────── */}
      {logoutModal !== 'none' && (
        <LogoutModal
          mode={logoutModal}
          email={email}
          t={t}
          onClose={() => setLogoutModal('none')}
          onLogout={doLogout}
          onSignIn={() => { setLogoutModal('none'); setShowSettings(false); setAppState('login'); }}
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

      {/* ── Admin feedback dashboard ─────────────────────────────── */}
      {showAdmin && (
        <AdminPanel onClose={() => setShowAdmin(false)} />
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

// ─── Feedback form (sub-view within Settings sheet) ───────────────────────────
type FbkType   = 'report' | 'general';
type FbkStatus = 'idle' | 'submitting' | 'success' | 'error';

interface FeedbackFormProps {
  feedbackType: FbkType;
  userEmail:    string;
  onBack:       () => void;
  onClose:      () => void;
}

function FeedbackForm({ feedbackType, userEmail, onBack, onClose }: FeedbackFormProps) {
  const ISSUE_OPTS = [
    { v: 'bug',     l: 'Bug Report'        },
    { v: 'calc',    l: 'Calculation Issue' },
    { v: 'ui',      l: 'UI/UX Issue'       },
    { v: 'perf',    l: 'Performance Issue' },
    { v: 'feature', l: 'Feature Request'   },
    { v: 'general', l: 'General Feedback'  },
    { v: 'other',   l: 'Other'             },
  ];

  const [issueType, setIssueType] = useState(feedbackType === 'report' ? 'bug' : 'feature');
  const [subject,   setSubject]   = useState('');
  const [desc,      setDesc]      = useState('');
  const [email,     setEmail]     = useState(userEmail);
  const [imgB64,    setImgB64]    = useState<string | null>(null);
  const [imgErr,    setImgErr]    = useState('');
  const [status,    setStatus]    = useState<FbkStatus>('idle');
  const [errs,      setErrs]      = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) { setImgErr('Please select an image file.'); return; }
    if (f.size > 1024 * 1024) { setImgErr('Image must be under 1 MB.'); return; }
    setImgErr('');
    const r = new FileReader();
    r.onload = ev => setImgB64(ev.target?.result as string);
    r.readAsDataURL(f);
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!subject.trim()) e.subject = 'Subject is required.';
    if (desc.trim().length < 10) e.desc = 'Please provide at least 10 characters.';
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = 'Enter a valid email address.';
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setStatus('submitting');
    try {
      const payload: Record<string, unknown> = {
        feedbackType, issueType,
        subject:       subject.trim(),
        description:   desc.trim(),
        email:         email.trim(),
        appVersion:    'v1.0',
        deviceInfo:    `${navigator.platform} · ${window.screen.width}×${window.screen.height}`,
        browserInfo:   navigator.userAgent,
        screenshotB64: imgB64 ?? null,
        status:        'new',
        submittedAt:   serverTimestamp(),
      };
      if (isFirebaseConfigured()) {
        await addDoc(collection(getDb(), 'feedback'), payload);
      } else {
        // offline fallback
        const list = JSON.parse(localStorage.getItem('feedback:q') ?? '[]') as unknown[];
        list.push({ ...payload, submittedAt: new Date().toISOString() });
        localStorage.setItem('feedback:q', JSON.stringify(list));
      }
      setStatus('success');
    } catch (err) {
      console.error('Feedback error:', err);
      setStatus('error');
    }
  };

  // shared micro-styles
  const inp: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', height: 44, padding: '0 12px',
    borderRadius: 10, border: `1px solid ${BDR}`, backgroundColor: '#F9FAFB',
    fontSize: 14, fontWeight: 500, color: '#111827', fontFamily: 'inherit', outline: 'none',
  };
  const lbl: React.CSSProperties = {
    fontSize: 11, fontWeight: 800, color: '#374151',
    letterSpacing: 0.5, textTransform: 'uppercase' as const,
  };
  const errTxt: React.CSSProperties  = { fontSize: 11, color: '#EF4444', fontWeight: 600, marginTop: 2 };
  const fld: React.CSSProperties     = { display: 'flex', flexDirection: 'column' as const, gap: 5 };
  const titleH = feedbackType === 'report' ? 'Report an Issue' : 'Share Feedback';

  /* ── success screen ─────────────────────────────────────────────────────── */
  if (status === 'success') {
    return (
      <>
        <div style={{ ...spS.titleRow, gap: 8 }}>
          <span style={{ ...spS.title, flex: 1 }}>{titleH}</span>
          <button style={spS.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 28px', textAlign: 'center', gap: 16 }}>
          <div style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#DCFCE7', border: '2px solid #86EFAC', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <p style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#111827' }}>Thank you!</p>
          <p style={{ margin: 0, fontSize: 14, color: '#6B7280', lineHeight: 1.6 }}>
            {feedbackType === 'report'
              ? 'Your report has been submitted. Our team will investigate and work on a fix.'
              : 'Your feedback has been received. We appreciate your suggestions and ideas!'}
          </p>
          <button
            style={{ marginTop: 6, height: 46, minWidth: 160, borderRadius: 10, backgroundColor: NAVY2, color: '#fff', border: 'none', fontSize: 15, fontWeight: 800, cursor: 'pointer', letterSpacing: 0.3 }}
            onClick={onClose}
          >Done</button>
        </div>
      </>
    );
  }

  /* ── form screen ────────────────────────────────────────────────────────── */
  return (
    <>
      {/* header */}
      <div style={{ ...spS.titleRow, gap: 4 }}>
        <button style={{ ...spS.closeBtn, marginRight: 4, fontSize: 22, opacity: 0.9 }} onClick={onBack} aria-label="Back">‹</button>
        <span style={{ ...spS.title, flex: 1 }}>{titleH}</span>
        <button style={spS.closeBtn} onClick={onClose} aria-label="Close">✕</button>
      </div>

      {/* scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px 4px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Issue type */}
        <div style={fld}>
          <label style={lbl}>Issue Type</label>
          <select
            value={issueType}
            onChange={e => setIssueType(e.target.value)}
            style={{ ...inp, paddingLeft: 10, cursor: 'pointer' }}
          >
            {ISSUE_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
        </div>

        {/* Subject */}
        <div style={fld}>
          <label style={lbl}>Subject <span style={{ color: '#EF4444' }}>*</span></label>
          <input
            type="text"
            value={subject}
            placeholder="Brief summary"
            onChange={e => { setSubject(e.target.value); if (errs.subject) setErrs(p => ({ ...p, subject: '' })); }}
            style={{ ...inp, borderColor: errs.subject ? '#EF4444' : BDR }}
          />
          {errs.subject && <span style={errTxt}>{errs.subject}</span>}
        </div>

        {/* Description */}
        <div style={fld}>
          <label style={lbl}>Description <span style={{ color: '#EF4444' }}>*</span></label>
          <textarea
            value={desc}
            placeholder={feedbackType === 'report'
              ? 'Describe what happened, what you expected, and steps to reproduce…'
              : 'Share your ideas, suggestions, or overall experience…'}
            onChange={e => { setDesc(e.target.value); if (errs.desc) setErrs(p => ({ ...p, desc: '' })); }}
            style={{ ...inp, height: 'auto', minHeight: 96, padding: '10px 12px', resize: 'vertical', lineHeight: 1.55, borderColor: errs.desc ? '#EF4444' : BDR } as React.CSSProperties}
          />
          {errs.desc && <span style={errTxt}>{errs.desc}</span>}
        </div>

        {/* Email */}
        <div style={fld}>
          <label style={lbl}>Email Address</label>
          <input
            type="email"
            value={email}
            placeholder="your@email.com"
            onChange={e => { setEmail(e.target.value); if (errs.email) setErrs(p => ({ ...p, email: '' })); }}
            style={{ ...inp, borderColor: errs.email ? '#EF4444' : BDR }}
          />
          {errs.email && <span style={errTxt}>{errs.email}</span>}
        </div>

        {/* Screenshot */}
        <div style={fld}>
          <label style={lbl}>
            Screenshot&nbsp;
            <span style={{ fontSize: 10, fontWeight: 500, color: '#9CA3AF', textTransform: 'none' as const, letterSpacing: 0 }}>— optional</span>
          </label>
          {imgB64 ? (
            <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', border: `1px solid ${BDR}` }}>
              <img src={imgB64} alt="Preview" style={{ width: '100%', maxHeight: 150, objectFit: 'cover', display: 'block' }} />
              <button
                style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.55)', border: 'none', color: '#fff', borderRadius: 20, width: 26, height: 26, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onClick={() => { setImgB64(null); if (fileRef.current) fileRef.current.value = ''; }}
              >✕</button>
            </div>
          ) : (
            <button
              style={{ ...inp, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', border: `1.5px dashed ${BDR}`, backgroundColor: '#FAFAFA', color: '#6B7280', fontSize: 13, fontWeight: 600, padding: '0 14px' }}
              onClick={() => fileRef.current?.click()}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
              Attach a screenshot
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
          {imgErr && <span style={errTxt}>{imgErr}</span>}
        </div>

        {/* Auto-collected info */}
        <div style={{ backgroundColor: '#F3F4F6', borderRadius: 10, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: '#9CA3AF', letterSpacing: 0.6, textTransform: 'uppercase' as const }}>Auto-collected with submission</span>
          <span style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 500 }}>
            App v1.0 · {navigator.platform} · {window.screen.width}×{window.screen.height}
          </span>
          <span style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
            {navigator.userAgent}
          </span>
        </div>

        {status === 'error' && (
          <div style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#DC2626', fontWeight: 600 }}>
            Submission failed. Please check your connection and try again.
          </div>
        )}

        <div style={{ height: 4 }} />
      </div>

      {/* sticky submit */}
      <div style={{ padding: '12px 20px 16px', borderTop: `1px solid ${BDR}`, flexShrink: 0 }}>
        <button
          style={{ width: '100%', height: 48, borderRadius: 10, backgroundColor: NAVY2, color: '#fff', border: 'none', fontSize: 15, fontWeight: 800, letterSpacing: 0.3, cursor: status === 'submitting' ? 'wait' : 'pointer', opacity: status === 'submitting' ? 0.7 : 1, transition: 'opacity 0.15s' }}
          onClick={handleSubmit}
          disabled={status === 'submitting'}
        >
          {status === 'submitting' ? 'Submitting…' : 'Submit'}
        </button>
      </div>
    </>
  );
}

// ─── Admin dashboard — feedback & report review ───────────────────────────────
const ADMIN_EMAIL = 'sahilswarajjena456@gmail.com';

type AdminView = 'list' | 'detail';
type FbStatus  = 'new' | 'in-progress' | 'resolved';

interface FbDoc {
  id:            string;
  feedbackType:  string;
  issueType:     string;
  subject:       string;
  description:   string;
  email:         string;
  appVersion:    string;
  deviceInfo:    string;
  browserInfo:   string;
  screenshotB64: string | null;
  status:        FbStatus;
  submittedAt:   any; // Firestore Timestamp
}

const FB_STATUS_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  'new':         { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE' },
  'in-progress': { bg: '#FEF3C7', text: '#92400E', border: '#FCD34D' },
  'resolved':    { bg: '#DCFCE7', text: '#166534', border: '#86EFAC' },
};

const ISSUE_LABEL: Record<string, string> = {
  bug: 'Bug', calc: 'Calc Issue', ui: 'UI/UX', perf: 'Performance',
  feature: 'Feature Req.', general: 'Feedback', other: 'Other',
};

function relTime(ts: any): string {
  if (!ts?.toDate) return '';
  const diff = Date.now() - ts.toDate().getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days < 7 ? `${days}d ago` : ts.toDate().toLocaleDateString();
}

function AdminPanel({ onClose }: { onClose: () => void }) {
  const [fbDocs,    setFbDocs]    = useState<FbDoc[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [loadErr,   setLoadErr]   = useState('');
  const [statusFlt, setStatusFlt] = useState<FbStatus | 'all'>('all');
  const [typeFlt,   setTypeFlt]   = useState('all');
  const [adminView, setAdminView] = useState<AdminView>('list');
  const [selected,  setSelected]  = useState<FbDoc | null>(null);
  const [updating,  setUpdating]  = useState(false);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true); setLoadErr('');
    try {
      const q    = query(collection(getDb(), 'feedback'), orderBy('submittedAt', 'desc'));
      const snap = await getDocs(q);
      setFbDocs(snap.docs.map(d => ({ id: d.id, ...d.data() } as FbDoc)));
    } catch (err) {
      console.error(err);
      setLoadErr('Failed to load submissions. Check your Firestore security rules allow admin reads.');
    } finally {
      setLoading(false);
    }
  };

  const changeStatus = async (id: string, next: FbStatus) => {
    setUpdating(true);
    try {
      await updateDoc(fsDoc(getDb(), 'feedback', id), { status: next });
      setFbDocs(prev => prev.map(d => d.id === id ? { ...d, status: next } : d));
      if (selected?.id === id) setSelected(s => s ? { ...s, status: next } : s);
    } catch (err) { console.error(err); }
    finally { setUpdating(false); }
  };

  const filtered = fbDocs.filter(d =>
    (statusFlt === 'all' || d.status === statusFlt) &&
    (typeFlt   === 'all' || d.issueType === typeFlt)
  );
  const newCount = fbDocs.filter(d => d.status === 'new').length;

  const PANEL: React.CSSProperties = {
    position: 'fixed', inset: 0, backgroundColor: '#F8FAFC',
    display: 'flex', flexDirection: 'column', zIndex: 550, fontFamily: 'inherit',
  };
  const HDR: React.CSSProperties = {
    backgroundColor: NAVY2, padding: '14px 18px',
    display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
  };
  const HDR_BTN: React.CSSProperties = {
    background: 'none', border: 'none', color: 'rgba(255,255,255,0.82)',
    fontSize: 22, cursor: 'pointer', padding: '2px 6px', lineHeight: 1,
  };

  /* ── Detail view ──────────────────────────────────────────────── */
  if (adminView === 'detail' && selected) {
    const sc = FB_STATUS_STYLE[selected.status] ?? FB_STATUS_STYLE['new'];
    return (
      <div style={PANEL}>
        {/* header */}
        <div style={HDR}>
          <button style={{ ...HDR_BTN, fontSize: 24, marginRight: 2 }} onClick={() => setAdminView('list')}>‹</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.subject}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>{relTime(selected.submittedAt)}</div>
          </div>
          <button style={HDR_BTN} onClick={onClose}>✕</button>
        </div>

        {/* body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 16px 32px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* status controls */}
          <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: '14px 16px', border: `1px solid ${BDR}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: '#9CA3AF', letterSpacing: 0.6, textTransform: 'uppercase' }}>Status</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(['new', 'in-progress', 'resolved'] as FbStatus[]).map(s => {
                const c = FB_STATUS_STYLE[s];
                const active = selected.status === s;
                return (
                  <button key={s} disabled={updating}
                    onClick={() => changeStatus(selected.id, s)}
                    style={{ height: 32, padding: '0 14px', borderRadius: 20, border: `1.5px solid ${active ? c.border : BDR}`, backgroundColor: active ? c.bg : '#F9FAFB', color: active ? c.text : '#6B7280', fontSize: 12, fontWeight: 700, cursor: updating ? 'wait' : 'pointer', letterSpacing: 0.2, transition: 'all 0.15s' }}>
                    {s === 'in-progress' ? 'In Progress' : s[0].toUpperCase() + s.slice(1)}{active ? ' ✓' : ''}
                  </button>
                );
              })}
            </div>
          </div>

          {/* badges */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, backgroundColor: '#F3F4F6', color: '#374151', borderRadius: 20, padding: '3px 10px' }}>{ISSUE_LABEL[selected.issueType] ?? selected.issueType}</span>
            <span style={{ fontSize: 11, fontWeight: 700, backgroundColor: sc.bg, color: sc.text, border: `1px solid ${sc.border}`, borderRadius: 20, padding: '3px 10px' }}>{selected.feedbackType === 'report' ? 'Bug Report' : 'Feedback'}</span>
            <span style={{ fontSize: 11, fontWeight: 700, backgroundColor: '#F3F4F6', color: '#374151', borderRadius: 20, padding: '3px 10px' }}>{selected.appVersion}</span>
          </div>

          {/* description */}
          <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: '14px 16px', border: `1px solid ${BDR}` }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: '#9CA3AF', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 }}>Description</div>
            <p style={{ margin: 0, fontSize: 14, color: '#111827', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{selected.description}</p>
          </div>

          {/* contact */}
          <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: '14px 16px', border: `1px solid ${BDR}` }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: '#9CA3AF', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 }}>Contact</div>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#2563EB' }}>{selected.email || '—'}</span>
          </div>

          {/* device */}
          <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: '14px 16px', border: `1px solid ${BDR}` }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: '#9CA3AF', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 }}>Device &amp; Browser</div>
            <p style={{ margin: '0 0 5px', fontSize: 13, color: '#374151', fontWeight: 500 }}>{selected.deviceInfo || '—'}</p>
            <p style={{ margin: 0, fontSize: 11, color: '#9CA3AF', fontWeight: 400, wordBreak: 'break-all' }}>{selected.browserInfo || '—'}</p>
          </div>

          {/* screenshot */}
          {selected.screenshotB64 && (
            <div style={{ backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden', border: `1px solid ${BDR}` }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: '#9CA3AF', letterSpacing: 0.6, textTransform: 'uppercase', padding: '12px 16px 8px' }}>Screenshot</div>
              <img src={selected.screenshotB64} alt="Screenshot" style={{ width: '100%', display: 'block' }} />
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ── List view ────────────────────────────────────────────────── */
  return (
    <div style={PANEL}>
      {/* header */}
      <div style={HDR}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#fff' }}>Feedback &amp; Reports</div>
          {newCount > 0 && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>{newCount} new submission{newCount !== 1 ? 's' : ''}</div>}
        </div>
        <button
          style={{ background: 'rgba(255,255,255,0.18)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', marginRight: 4 }}
          onClick={loadAll}
        >↻ Refresh</button>
        <button style={HDR_BTN} onClick={onClose}>✕</button>
      </div>

      {/* filter bar */}
      <div style={{ padding: '12px 14px 10px', borderBottom: `1px solid ${BDR}`, backgroundColor: '#fff', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 9 }}>
        {/* status chips */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(['all', 'new', 'in-progress', 'resolved'] as const).map(s => {
            const active = statusFlt === s;
            const c = s !== 'all' ? FB_STATUS_STYLE[s] : null;
            return (
              <button key={s} onClick={() => setStatusFlt(s)}
                style={{ height: 28, padding: '0 12px', borderRadius: 20, border: `1.5px solid ${active && c ? c.border : active ? NAVY2 : BDR}`, backgroundColor: active && c ? c.bg : active ? NAVY2 : '#F3F4F6', color: active && c ? c.text : active ? '#fff' : '#6B7280', fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.2, transition: 'all 0.15s' }}>
                {s === 'all' ? 'All' : s === 'in-progress' ? 'In Progress' : s[0].toUpperCase() + s.slice(1)}
                {s !== 'all' && <span style={{ marginLeft: 5, opacity: 0.75 }}>{fbDocs.filter(d => d.status === s).length}</span>}
              </button>
            );
          })}
        </div>
        {/* type filter */}
        <select value={typeFlt} onChange={e => setTypeFlt(e.target.value)}
          style={{ height: 32, borderRadius: 8, border: `1px solid ${BDR}`, backgroundColor: '#F9FAFB', fontSize: 12, fontWeight: 600, color: '#374151', padding: '0 8px', outline: 'none', cursor: 'pointer' }}>
          <option value="all">All issue types</option>
          <option value="bug">Bug Report</option>
          <option value="calc">Calculation Issue</option>
          <option value="ui">UI/UX Issue</option>
          <option value="perf">Performance Issue</option>
          <option value="feature">Feature Request</option>
          <option value="general">General Feedback</option>
          <option value="other">Other</option>
        </select>
      </div>

      {/* submission list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#9CA3AF', fontSize: 14 }}>Loading submissions…</div>
        )}
        {loadErr && (
          <div style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, padding: '14px 16px', fontSize: 13, color: '#DC2626', fontWeight: 600 }}>{loadErr}</div>
        )}
        {!loading && !loadErr && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#9CA3AF', fontSize: 14 }}>
            No submissions{statusFlt !== 'all' ? ` with status "${statusFlt}"` : ''}.
          </div>
        )}
        {!loading && !loadErr && filtered.map(d => {
          const sc = FB_STATUS_STYLE[d.status] ?? FB_STATUS_STYLE['new'];
          return (
            <button key={d.id}
              style={{ display: 'flex', flexDirection: 'column', gap: 6, backgroundColor: '#fff', border: `1px solid ${BDR}`, borderRadius: 14, padding: '13px 14px', cursor: 'pointer', textAlign: 'left', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', width: '100%' }}
              onClick={() => { setSelected(d); setAdminView('detail'); }}
            >
              {/* top row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10, fontWeight: 700, backgroundColor: '#F3F4F6', color: '#374151', borderRadius: 20, padding: '2px 8px' }}>{ISSUE_LABEL[d.issueType] ?? d.issueType}</span>
                <span style={{ fontSize: 10, fontWeight: 700, backgroundColor: sc.bg, color: sc.text, border: `1px solid ${sc.border}`, borderRadius: 20, padding: '2px 8px' }}>
                  {d.status === 'in-progress' ? 'In Progress' : d.status === 'new' ? 'New' : 'Resolved'}
                </span>
                <span style={{ fontSize: 11, color: '#9CA3AF', marginLeft: 'auto', flexShrink: 0 }}>{relTime(d.submittedAt)}</span>
              </div>
              {/* subject */}
              <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.subject}</div>
              {/* preview */}
              <div style={{ fontSize: 12, color: '#6B7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.description}</div>
              {/* user email */}
              {d.email && <div style={{ fontSize: 11, color: '#9CA3AF' }}>{d.email}</div>}
            </button>
          );
        })}
      </div>

      {/* footer count */}
      {!loading && !loadErr && (
        <div style={{ padding: '8px 14px 14px', borderTop: `1px solid ${BDR}`, textAlign: 'center', flexShrink: 0, backgroundColor: '#fff' }}>
          <span style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 500 }}>
            {filtered.length} of {fbDocs.length} submission{fbDocs.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}
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
  onOpenAdmin:    () => void;
  t:              (key: string) => string;
}

function SettingsPanel({ email, lang, onSetLang, onLogout, onClose, onOpenPrivacy, onOpenTerms, onOpenAdmin, t }: SettingsPanelProps) {
  const [view,         setView]         = useState<'settings' | 'feedback'>('settings');
  const [feedbackType, setFeedbackType] = useState<FbkType>('report');

  return (
    <div style={spS.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="anp-modal-in" style={{ ...spS.sheet, maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>

        {view === 'feedback' ? (
          <FeedbackForm
            feedbackType={feedbackType}
            userEmail={email}
            onBack={() => setView('settings')}
            onClose={onClose}
          />
        ) : (
          <>
            {/* Title row */}
            <div style={spS.titleRow}>
              <span style={spS.title}>{t('settingsTitle')}</span>
              <button style={spS.closeBtn} onClick={onClose} aria-label="Close settings">✕</button>
            </div>

            {/* Scrollable settings content */}
            <div style={{ flex: 1, overflowY: 'auto' }}>

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
                    <span style={spS.emailMeta}>{email ? t('loggedInAs') : t('settingsSession')}</span>
                    <span style={spS.emailVal}>{email || t('settingsGuestLabel')}</span>
                  </div>
                </div>
                <button style={spS.logoutBtn} onClick={onLogout}>
                  {email ? t('logout') : t('guestSignInBtn')}
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
              <div style={spS.section}>
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

              {/* ── Feedback & Support section ──────────────────────── */}
              <div style={spS.section}>
                <span style={spS.sectionLabel}>Feedback &amp; Support</span>
                <button
                  style={spS.legalBtn}
                  onClick={() => { setFeedbackType('report'); setView('feedback'); }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                      <line x1="12" y1="9" x2="12" y2="13"/>
                      <line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    Report an Issue
                  </span>
                  <span style={spS.legalArrow}>›</span>
                </button>
                <button
                  style={spS.legalBtn}
                  onClick={() => { setFeedbackType('general'); setView('feedback'); }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                    Share Feedback
                  </span>
                  <span style={spS.legalArrow}>›</span>
                </button>
              </div>

              {/* ── Admin section (admin email only) ─────────────── */}
              {email.toLowerCase() === ADMIN_EMAIL && (
                <div style={{ ...spS.section, borderBottom: 'none' }}>
                  <span style={spS.sectionLabel}>Admin</span>
                  <button style={spS.legalBtn} onClick={onOpenAdmin}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={NAVY2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                      </svg>
                      Feedback Dashboard
                    </span>
                    <span style={spS.legalArrow}>›</span>
                  </button>
                </div>
              )}

              {/* ── App version ──────────────────────────────────────── */}
              <div style={spS.versionRow}>
                <span style={spS.versionText}>Grade and Elevation Calculator · v1.0</span>
              </div>

            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Logout modal ────────────────────────────────────────────────────────────
interface LogoutModalProps {
  mode:     'auth' | 'guest';
  email:    string;
  t:        (key: string) => string;
  onClose:  () => void;
  onLogout: () => void;
  onSignIn: () => void;
}

function LogoutModal({ mode, email, t, onClose, onLogout, onSignIn }: LogoutModalProps) {
  const NAVY_L = '#143A63';
  const BTN_H  = 52;

  const btnBase: React.CSSProperties = {
    height: BTN_H, borderRadius: 10, fontSize: 16, fontWeight: 800,
    letterSpacing: 0.3, cursor: 'pointer', border: 'none', transition: 'opacity 0.15s',
  };
  const btnPrimary: React.CSSProperties = {
    ...btnBase, backgroundColor: NAVY_L, color: '#fff',
  };
  const btnOutline: React.CSSProperties = {
    ...btnBase, backgroundColor: 'transparent',
    border: `1.5px solid #D1D5DB`, color: '#374151',
  };

  const body: React.CSSProperties = {
    padding: '20px 20px 26px',
    display: 'flex', flexDirection: 'column', gap: 14,
  };
  const para: React.CSSProperties = {
    margin: 0, fontSize: 15, lineHeight: 1.65, color: '#374151',
  };

  let title = '';
  let content: React.ReactNode = null;

  if (mode === 'auth') {
    title = t('logoutAuthTitle');
    content = (
      <>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <p style={{ ...para, fontWeight: 600, color: '#111827' }}>{t('logoutAuthWith')}</p>
          <p style={{ ...para, fontWeight: 800, color: NAVY_L, fontSize: 15 }}>{email}</p>
        </div>
        <p style={para}>{t('logoutAuthBody')}</p>
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button style={{ ...btnOutline, flex: 1 }} onClick={onClose}>{t('cancel')}</button>
          <button style={{ ...btnPrimary, flex: 1 }} onClick={onLogout}>{t('logout')}</button>
        </div>
      </>
    );
  } else {
    // guest — two actions only: Sign In (primary) + Continue as Guest (closes dialog)
    title = t('guestLogoutTitle');
    content = (
      <>
        <p style={{ ...para, fontWeight: 700, color: '#111827' }}>{t('guestLogoutIntro')}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {(['guestLogoutLine1', 'guestLogoutLine2', 'guestLogoutLine3'] as const).map(k => (
            <p key={k} style={para}>• {t(k)}</p>
          ))}
          <p style={{ ...para, fontWeight: 700, color: NAVY_L }}>• {t('guestLogoutLine4')}</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6 }}>
          <button style={{ ...btnPrimary, width: '100%' }} onClick={onSignIn}>{t('guestSignInBtn')}</button>
          <button style={{ ...btnOutline, width: '100%' }} onClick={onClose}>{t('guestContinueBtn')}</button>
        </div>
      </>
    );
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px', boxSizing: 'border-box', zIndex: 600 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="anp-modal-in" style={{ maxWidth: 420, width: '100%', backgroundColor: '#fff', borderRadius: 18, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.32)', display: 'flex', flexDirection: 'column' }}>
        {/* NAVY header */}
        <div style={{ backgroundColor: NAVY_L, padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>Grade &amp; Elevation Calculator</span>
          <button style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.85)', fontSize: 22, fontWeight: 700, lineHeight: 1, cursor: 'pointer', padding: '2px 4px' }} onClick={onClose}>✕</button>
        </div>
        {/* Body */}
        <div style={body}>
          <p style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#111827' }}>{title}</p>
          {content}
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

// ─── Calculator tab icon — left: + / − stacked squares; right: = tall rect ───
// Gap engineering (strokeWidth 1.4):
//   row gap  path=3.0 → visible ≈1.6 units (strokes never touch)
//   col gap  path=2.5 → visible ≈1.1 units
//   = bars   path=3.0 → visible ≈1.6 units
function CalcIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
         aria-hidden="true">
      {/* Left top — + square: x 0.5–10.5, y 0.5–10 */}
      <rect x="0.5" y="0.5"  width="10"   height="9.5" rx="2.2" />
      {/* Left bottom — − square: x 0.5–10.5, y 13–22.5  (path gap = 3) */}
      <rect x="0.5" y="13"   width="10"   height="9.5" rx="2.2" />
      {/* Right — = tall rect: x 13–23.5, y 0.5–22.5  (col path gap = 2.5) */}
      <rect x="13"  y="0.5"  width="10.5" height="22"  rx="2.6" />
      {/* + symbol, center (5.5, 5.25) */}
      <line x1="5.5"  y1="3.05" x2="5.5"  y2="7.45" />
      <line x1="3.3"  y1="5.25" x2="7.7"  y2="5.25" />
      {/* = symbol, center (18.25, 11.5), bars at y 10 / 13  (path gap = 3) */}
      <line x1="15.25" y1="10"   x2="21.25" y2="10"   />
      <line x1="15.25" y1="13"   x2="21.25" y2="13"   />
      {/* − symbol, center (5.5, 17.75) */}
      <line x1="3.3"  y1="17.75" x2="7.7"  y2="17.75" />
    </svg>
  );
}

// ─── Help tab icon — two overlapping circular speech bubbles ─────────────────
// SVG: 24×24 px display, 24×24 viewBox (1 px/unit)
// Left bubble  (back):  cx=9    cy=15.5  r=8    tail lower-left
// Right bubble (front): cx=13.5 cy=9.5   r=8.5  tail lower-right, fill=white
//
// = lines centered at left bubble's geometric centre (9, 15.5):
//   y=14 and y=17 straddle cy by ±1.5; x=4.5–13.5 centred at x=9 (≈3.4 u padding per side).
//   Right-bubble white fill masks the portion of each line that falls inside the right bubble —
//   this is intentional: the lines appear to "go behind" the front bubble.
//
// ? arc: 238° CCW large-arc (A 4 4 0 1 0) from (10,10) to (17,10) — no inner circle.
//   SVG centre≈(13.5,8.06); arc top y≈4.06; stem Q→(13.5,12); dot cy=13.8.
//   Vertically centred ≈(4.06+14.65)/2=9.36 vs bubble cy=9.5.
function HelpIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
         aria-hidden="true">
      {/* Left bubble — back layer */}
      <path d="M 5 22.4 A 8 8 0 1 0 2.9 20.6 L 0.5 23.8 Z" />
      {/* = lines — centred at left-bubble geometric centre (9, 15.5) */}
      <line x1="4.5" y1="14"  x2="13.5" y2="14"  />
      <line x1="4.5" y1="17"  x2="13.5" y2="17"  />
      {/* Right bubble — front layer, white fill masks left bubble and portions of = lines */}
      <path d="M 18.4 16.5 A 8.5 8.5 0 1 0 16.1 17.6 L 22.5 22 Z" fill="white" />
      {/* ? — three quadratic beziers forming a clean C-hook, centered at bubble cx=13.5 cy≈9.5
             Entry (10,8.7) → top (13.5,5) → right (17,8.7) → stem (13.5,12)
             Vertical centre ≈ (5 + 14.65) / 2 = 9.8 ≈ bubble cy=9.5          */}
      <path d="M 10 8.7 Q 10 5 13.5 5 Q 17 5 17 8.7 Q 17 11.5 13.5 12" />
      {/* ? dot — centred below stem gap */}
      <circle cx="13.5" cy="13.8" r="0.85" fill="currentColor" stroke="none" />
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

