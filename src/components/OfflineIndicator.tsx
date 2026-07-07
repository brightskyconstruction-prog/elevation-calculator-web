import { useState, useEffect } from 'react';
import { useLang } from '../LangContext';

/**
 * OfflineIndicator
 * Shows a persistent banner at the top of the viewport when the device loses
 * internet connectivity. Hides automatically when connectivity is restored.
 * Uses the browser's online/offline events — no polling, zero network overhead.
 * Message text respects the app's current language setting.
 */
export default function OfflineIndicator() {
  const { t } = useLang();
  const [isOffline,    setIsOffline]    = useState(!navigator.onLine);
  const [justCameBack, setJustCameBack] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const goOffline = () => {
      setJustCameBack(false);
      setIsOffline(true);
    };

    const goOnline = () => {
      setJustCameBack(true);
      setIsOffline(false);
      // Show "back online" message briefly, then hide
      timer = setTimeout(() => setJustCameBack(false), 3000);
    };

    window.addEventListener('offline', goOffline);
    window.addEventListener('online',  goOnline);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online',  goOnline);
    };
  }, []);

  if (!isOffline && !justCameBack) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position:        'fixed',
        top:             0,
        left:            0,
        right:           0,
        zIndex:          10000,
        backgroundColor: justCameBack ? '#065F46' : '#78350F',
        color:           '#FFFFFF',
        fontSize:        12,
        fontWeight:      700,
        textAlign:       'center',
        padding:         '7px 16px',
        letterSpacing:   0.3,
        lineHeight:      1.4,
        boxShadow:       '0 2px 8px rgba(0,0,0,0.25)',
        transition:      'background-color 0.3s',
        fontFamily:      '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      {justCameBack ? t('backOnlineMsg') : t('offlineMsg')}
    </div>
  );
}
