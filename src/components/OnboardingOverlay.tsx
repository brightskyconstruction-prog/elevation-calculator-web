import React, { useState, useEffect } from 'react';
import { useLang } from '../LangContext';
import { strings } from '../i18n';

const NAVY = '#143A63';
const GOLD = '#F4B02A';
const ONBOARDING_KEY = 'app:onboarding_done';

/**
 * OnboardingOverlay
 * Shown once to first-time users (keyed by localStorage 'app:onboarding_done').
 * Renders a 3-step walkthrough modal. Dismissed via "Get Started" or tapping outside.
 * All text is translated via the app's i18n system.
 */
export default function OnboardingOverlay() {
  const { t, lang } = useLang();
  const [visible, setVisible] = useState(false);
  const [step,    setStep]    = useState(0);
  const [animKey, setAnimKey] = useState(0);

  useEffect(() => {
    try {
      const done = localStorage.getItem(ONBOARDING_KEY);
      if (!done) setVisible(true);
    } catch { /* ignore */ }
  }, []);

  const dismiss = () => {
    try { localStorage.setItem(ONBOARDING_KEY, '1'); } catch {}
    setVisible(false);
  };

  const goNext = () => {
    if (step < STEPS.length - 1) {
      setStep(s => s + 1);
      setAnimKey(k => k + 1);
    } else {
      dismiss();
    }
  };

  const goPrev = () => {
    if (step > 0) {
      setStep(s => s - 1);
      setAnimKey(k => k + 1);
    }
  };

  // STEPS built inside render so they react to language changes
  const STEPS = [
    { icon: '📍', title: t('onbStep1Title'), body: t('onbStep1Body') },
    { icon: '📐', title: t('onbStep2Title'), body: t('onbStep2Body') },
    { icon: '📊', title: t('onbStep3Title'), body: t('onbStep3Body') },
  ];

  if (!visible) return null;

  const current = STEPS[step];
  const isLast  = step === STEPS.length - 1;

  return (
    <div
      style={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={t('onbAriaLabel')}
      onClick={e => { if (e.target === e.currentTarget) dismiss(); }}
    >
      <div className="anp-modal-in" style={styles.card}>
        {/* Gold top bar */}
        <div style={styles.topBar} />

        {/* Skip button */}
        <button style={styles.skipBtn} onClick={dismiss} aria-label={t('onbSkip')}>
          {t('onbSkip')}
        </button>

        {/* Step icon */}
        <div key={`icon-${animKey}`} style={{ ...styles.iconWrap, animation: 'onbFadeIn 0.3s ease both' }}>
          <span style={styles.icon} role="img" aria-hidden="true">{current.icon}</span>
        </div>

        {/* Progress dots */}
        <div style={styles.dotsRow} role="tablist" aria-label="Step indicator">
          {STEPS.map((_, i) => (
            <button
              key={i}
              role="tab"
              aria-selected={i === step}
              aria-label={strings[lang].onbStepDot(i + 1)}
              style={{ ...styles.dot, ...(i === step ? styles.dotActive : {}) }}
              onClick={() => { setStep(i); setAnimKey(k => k + 1); }}
            />
          ))}
        </div>

        {/* Step content */}
        <div key={`content-${animKey}`} style={{ animation: 'onbFadeIn 0.3s ease both' }}>
          <h2 style={styles.title}>{current.title}</h2>
          <p  style={styles.body}>{current.body}</p>
        </div>

        {/* Navigation */}
        <div style={styles.navRow}>
          {step > 0 ? (
            <button style={styles.prevBtn} onClick={goPrev} aria-label={t('onbBack')}>
              {t('onbBack')}
            </button>
          ) : (
            <div />
          )}
          <button style={styles.nextBtn} onClick={goNext}>
            {isLast ? t('onbGetStarted') : t('onbNext')}
          </button>
        </div>

        {/* Step counter */}
        <p style={styles.counter}>{strings[lang].onbStepOf(step + 1, STEPS.length)}</p>
      </div>

      <style>{`
        @keyframes onbFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position:        'fixed',
    inset:           0,
    backgroundColor: 'rgba(0,0,0,0.62)',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    padding:         '20px',
    boxSizing:       'border-box',
    zIndex:          5000,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius:    20,
    maxWidth:        360,
    width:           '100%',
    overflow:        'hidden',
    boxShadow:       '0 20px 60px rgba(0,0,0,0.3)',
    display:         'flex',
    flexDirection:   'column',
    alignItems:      'center',
    paddingBottom:   28,
    position:        'relative',
  },
  topBar: {
    height:     5,
    width:      '100%',
    background: `linear-gradient(90deg, ${NAVY}, ${GOLD} 50%, ${NAVY})`,
    flexShrink: 0,
    marginBottom: 8,
  },
  skipBtn: {
    position:        'absolute',
    top:             16,
    right:           16,
    background:      'none',
    border:          'none',
    color:           '#9CA3AF',
    fontSize:        13,
    fontWeight:      600,
    cursor:          'pointer',
    padding:         '4px 8px',
    letterSpacing:   0.2,
  },
  iconWrap: {
    width:           80,
    height:          80,
    borderRadius:    '50%',
    backgroundColor: 'rgba(20,58,99,0.07)',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    margin:          '8px 0 16px',
  },
  icon: {
    fontSize: 36,
    lineHeight: 1,
  },
  dotsRow: {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            8,
    marginBottom:   20,
  },
  dot: {
    width:           10,
    height:          10,
    borderRadius:    '50%',
    backgroundColor: '#E5E7EB',
    border:          'none',
    cursor:          'pointer',
    padding:         0,
    transition:      'background-color 0.2s, transform 0.2s',
  },
  dotActive: {
    backgroundColor: NAVY,
    transform:       'scale(1.25)',
  },
  title: {
    margin:        '0 24px 10px',
    fontSize:      20,
    fontWeight:    800,
    color:         '#111827',
    textAlign:     'center',
    letterSpacing: '-0.2px',
    lineHeight:    1.2,
    fontFamily:    'inherit',
  },
  body: {
    margin:     '0 28px 24px',
    fontSize:   14,
    color:      '#4B5563',
    lineHeight: 1.6,
    textAlign:  'center',
  },
  navRow: {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'space-between',
    width:          '100%',
    padding:        '0 24px',
    boxSizing:      'border-box',
    gap:            12,
  },
  prevBtn: {
    height:          44,
    padding:         '0 18px',
    borderRadius:    12,
    border:          '1.5px solid #E5E7EB',
    backgroundColor: 'transparent',
    color:           '#6B7280',
    fontSize:        14,
    fontWeight:      700,
    cursor:          'pointer',
    transition:      'background-color 0.15s',
  },
  nextBtn: {
    height:          48,
    flex:            1,
    borderRadius:    12,
    border:          `2px solid ${GOLD}`,
    backgroundColor: NAVY,
    color:           '#FFFFFF',
    fontSize:        15,
    fontWeight:      800,
    letterSpacing:   0.5,
    cursor:          'pointer',
    transition:      'opacity 0.15s',
  },
  counter: {
    margin:        '14px 0 0',
    fontSize:      11,
    color:         '#9CA3AF',
    fontWeight:    600,
    letterSpacing: 0.3,
  },
};
