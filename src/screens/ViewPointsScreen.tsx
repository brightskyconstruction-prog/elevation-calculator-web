import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useSurveyStore } from '../stores/surveyStore';
import { SurveyPoint, SurveySet, PointsTab } from '../types';
import { useLang } from '../LangContext';
import { strings } from '../i18n';

// ─── Modal animation CSS (shared with AddNewPointScreen, injected once) ───────
if (typeof document !== 'undefined' && !document.getElementById('anp-modal-anim')) {
  const _vs = document.createElement('style');
  _vs.id = 'anp-modal-anim';
  _vs.textContent = `
    @keyframes anpModalIn {
      from { opacity: 0; transform: scale(0.92) translateY(6px); }
      to   { opacity: 1; transform: scale(1) translateY(0); }
    }
    .anp-modal-in { animation: anpModalIn 0.20s cubic-bezier(0.22,1,0.36,1) both; }
  `;
  document.head.appendChild(_vs);
}

// ─── Design tokens ─────────────────────────────────────────────────────────────
const GOLD      = '#F4B02A';
const NAVY      = '#143A63';
const BLUE      = '#1E5799';
const BLUE_ACC  = '#3B82F6';
const BLUE_DEEP = 'rgba(30,87,153,0.12)';
const BLUE_MID  = '#2563EB';
const BORDER    = '#E5E7EB';
const BORDER_S  = '#F3F4F6';
const BORDER_B  = '#D1D5DB';
const SURFACE   = '#F0EEE8';
const RAISED    = '#F8F9FA';
const CARD      = '#FFFFFF';
const SCREEN    = '#F5F4F0';
const TEXT_PRI  = '#111827';
const TEXT_SEC  = '#374151';
const TEXT_DIS  = '#9CA3AF';
const GREEN     = '#1F8A4D';
const RED       = '#E74C3C';
const GOLD_SVG  = '#F5A623';

// ─── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  projectId:      string;
  compareFromId?: string | null;
  compareToId?:   string | null;
}

// ─── Point type resolution ──────────────────────────────────────────────────────
type PointType = 'benchmark' | 'derived' | 'standalone';

function resolvePointTypes(points: SurveyPoint[], sets: SurveySet[]): Map<string, PointType> {
  const referenceIds = new Set<string>();
  sets.forEach(s => {
    const cands = points
      .filter(p => p.setId === s.id && (p.bmElevation ?? 0) > 0)
      .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
    if (cands.length > 0) referenceIds.add(cands[0].id);
  });
  const typeMap = new Map<string, PointType>();
  points.forEach(pt => {
    const hasBm = (pt.bmElevation ?? 0) > 0;
    if (referenceIds.has(pt.id))    typeMap.set(pt.id, 'benchmark');
    else if (hasBm && pt.setId)     typeMap.set(pt.id, 'derived');
    else if (hasBm)                 typeMap.set(pt.id, 'benchmark');
    else                            typeMap.set(pt.id, 'standalone');
  });
  return typeMap;
}

const TYPE_THEME = {
  benchmark: { border: GOLD_SVG,  badgeBg: '#FFF3CD', badgeBdr: GOLD_SVG,  badgeTxt: '#92610A', label: 'BENCHMARK', elevLbl: 'ELEVATION',         elevLblClr: '#B8730A', elevClr: '#92610A' },
  derived:   { border: BLUE,      badgeBg: BLUE_DEEP,  badgeBdr: BLUE,      badgeTxt: BLUE_ACC,  label: 'DERIVED',    elevLbl: 'DERIVED BENCHMARK',  elevLblClr: BLUE_ACC,  elevClr: TEXT_PRI  },
  standalone:{ border: BORDER,    badgeBg: SURFACE,    badgeBdr: BORDER,    badgeTxt: TEXT_DIS,  label: 'STANDALONE', elevLbl: '',                   elevLblClr: TEXT_DIS,  elevClr: TEXT_PRI  },
} as const;

// ─── Helpers ────────────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════════════════
// FIF CONVERSION HELPERS (used by GoalModal)
// ═══════════════════════════════════════════════════════════════════════════════
const FRAC_OPTIONS = ['0','1/16','1/8','3/16','1/4','5/16','3/8','7/16','1/2','9/16','5/8','11/16','3/4','13/16','7/8','15/16'];
const FRAC_VALS: Record<string, number> = {
  '0':0,'1/16':1/16,'1/8':1/8,'3/16':3/16,'1/4':1/4,'5/16':5/16,'3/8':3/8,'7/16':7/16,
  '1/2':1/2,'9/16':9/16,'5/8':5/8,'11/16':11/16,'3/4':3/4,'13/16':13/16,'7/8':7/8,'15/16':15/16,
};

function engToFIF(eng: number): { feet: string; inches: string; frac: string } {
  if (eng <= 0) return { feet: '0', inches: '0', frac: '0' };
  const totalInches = eng * 12;
  const feet = Math.floor(totalInches / 12);
  const remInches = totalInches - feet * 12;
  let wi = Math.floor(remInches);
  let ff = Math.round((remInches - wi) * 16);
  if (ff >= 16) { wi += 1; ff = 0; }
  if (wi >= 12) return { feet: String(feet + 1), inches: '0', frac: '0' };
  return { feet: String(feet), inches: String(wi), frac: FRAC_OPTIONS[ff] };
}

function fifToEng(feet: string, inches: string, frac: string): number {
  const f = parseInt(feet)  || 0;
  const i = parseInt(inches) || 0;
  const fr = FRAC_VALS[frac] ?? 0;
  return (f * 12 + i + fr) / 12;
}

function toFIFStr(eng: number): string {
  const { feet, inches, frac } = engToFIF(Math.abs(eng));
  return `${feet}'-${inches}${frac && frac !== '0' ? ` ${frac}` : ''}"`;
}

// ─── Stacked fraction display for FIF values ──────────────────────────────────
function StackedFIFSpan({ feet, inches, frac, color = '#111827', size = 14 }: {
  feet: string | number; inches: string | number; frac: string;
  color?: string; size?: number;
}) {
  const hasFrac  = !!(frac && frac !== '0');
  const parts    = hasFrac ? frac.split('/') : [];
  const num      = parts.length === 2 ? parseInt(parts[0], 10) : NaN;
  const den      = parts.length === 2 ? parseInt(parts[1], 10) : NaN;
  const showFrac = hasFrac && !isNaN(num) && !isNaN(den);
  const tiny     = Math.max(8, Math.round(size * 0.62));

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
      <span style={{ fontSize: size, fontWeight: 700, color }}>{feet}' - {inches}{showFrac ? ' ' : '"'}</span>
      {showFrac && (
        <>
          <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1 }}>
            <span style={{ fontSize: tiny, fontWeight: 700, color, lineHeight: 1.1 }}>{num}</span>
            <span style={{ width: '100%', height: 1.5, backgroundColor: color, display: 'block' }} />
            <span style={{ fontSize: tiny, fontWeight: 700, color, lineHeight: 1.1 }}>{den}</span>
          </span>
          <span style={{ fontSize: size, fontWeight: 700, color }}>"</span>
        </>
      )}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// GOAL ENTRY MODAL
// ═══════════════════════════════════════════════════════════════════════════════
interface GoalModalProps {
  visible:      boolean;
  goalField:    'rod' | 'elev' | null;
  goalPt:       SurveyPoint | null;
  goalInput:    string;
  existingVal:  number;
  onChangeInput:(v: string) => void;
  onSubmit:     () => void;
  onClose:      () => void;
}

function GoalModal({ visible, goalField, goalPt, goalInput, existingVal, onChangeInput, onSubmit, onClose }: GoalModalProps) {
  const { t } = useLang();
  const [inputMode, setInputMode] = useState<'dec' | 'fif'>('dec');
  const [fifFeet,   setFifFeet]   = useState('0');
  const [fifInches, setFifInches] = useState('0');
  const [fifFrac,   setFifFrac]   = useState('0');

  // Sync FIF state when modal opens/closes
  useEffect(() => {
    if (visible) {
      const n = parseFloat(goalInput);
      if (!isNaN(n) && n > 0) {
        const fif = engToFIF(n);
        setFifFeet(fif.feet); setFifInches(fif.inches); setFifFrac(fif.frac);
      } else {
        setFifFeet('0'); setFifInches('0'); setFifFrac('0');
      }
    } else {
      setInputMode('dec');
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!visible || !goalField || !goalPt) return null;
  const goalNum        = parseFloat(goalInput);
  const goalDiffSigned = !isNaN(goalNum) ? goalNum - existingVal : null;
  const canSubmit      = !isNaN(goalNum);

  const diffBg  = goalDiffSigned == null ? 'rgba(100,100,100,0.08)'
    : goalDiffSigned >  0.00005 ? 'rgba(31,138,77,0.12)'
    : goalDiffSigned < -0.00005 ? 'rgba(231,76,60,0.12)'
    : 'rgba(100,100,100,0.08)';
  const diffBdr = goalDiffSigned == null ? BORDER
    : goalDiffSigned >  0.00005 ? GREEN
    : goalDiffSigned < -0.00005 ? RED
    : BORDER;
  const diffClr = goalDiffSigned == null ? TEXT_SEC
    : goalDiffSigned >  0.00005 ? GREEN
    : goalDiffSigned < -0.00005 ? RED
    : TEXT_SEC;

  // Build FIF string for existing value display
  const exFIF = engToFIF(existingVal);
  const exFIFStr = `${exFIF.feet}' - ${exFIF.inches}" ${exFIF.frac === '0' ? '' : exFIF.frac}`.trim();

  const handleSwitchMode = (mode: 'dec' | 'fif') => {
    if (mode === 'fif' && inputMode === 'dec') {
      // sync decimal → FIF
      const n = parseFloat(goalInput);
      if (!isNaN(n) && n > 0) {
        const fif = engToFIF(n);
        setFifFeet(fif.feet); setFifInches(fif.inches); setFifFrac(fif.frac);
      }
    }
    setInputMode(mode);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', zIndex: 250 }}>
      <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)' }} onClick={onClose} />
      <div style={{ position: 'relative', width: '100%', maxWidth: 480, margin: '0 auto', backgroundColor: CARD, borderRadius: '20px 20px 0 0', padding: '4px 16px 28px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Handle */}
        <div style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: BORDER_B, marginTop: 10 }} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: NAVY, letterSpacing: 0.3 }}>
            {goalField === 'rod' ? t('goalHeightTitle') : t('goalElevTitle')}
            <span style={{ fontSize: 13, fontWeight: 700, color: TEXT_SEC }}> · {goalPt.pointName ?? goalPt.label}</span>
          </span>
          <button style={{ background: 'none', border: 'none', fontSize: 20, color: TEXT_SEC, cursor: 'pointer', padding: '0 0 0 8px', lineHeight: 1 }} onClick={onClose}>✕</button>
        </div>

        {/* Current value card */}
        <div style={{ backgroundColor: '#0F2130', borderRadius: 10, padding: '10px 14px' }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.70)', letterSpacing: 0.8, textTransform: 'uppercase' as const }}>
            {goalField === 'rod' ? t('currentRodReading') : t('currentElevation')}
          </span>
          <div style={{ display: 'flex', gap: 14, marginTop: 6, alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.65)', letterSpacing: 0.4 }}>{t('goalCurrentDecFt')}</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                <span style={{ fontSize: 24, fontWeight: 800, color: '#fff', fontFamily: 'monospace' }}>{existingVal.toFixed(2)}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.75)' }}>ft</span>
              </div>
            </div>
            <div style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.22)', alignSelf: 'stretch' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.65)', letterSpacing: 0.4 }}>{t('goalCurrentFIF')}</span>
              <span style={{ fontSize: 18, fontWeight: 700, color: '#fff', fontFamily: 'monospace' }}>{exFIFStr}</span>
            </div>
          </div>
        </div>

        {/* Format toggle */}
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            style={{ flex: 1, height: 36, backgroundColor: inputMode === 'dec' ? BLUE_ACC : SURFACE, border: `1.5px solid ${inputMode === 'dec' ? BLUE_ACC : BORDER}`, borderRadius: 8, fontSize: 13, fontWeight: 700, color: inputMode === 'dec' ? '#fff' : TEXT_SEC, cursor: 'pointer' }}
            onClick={() => handleSwitchMode('dec')}
          >{t('goalInputDec')}</button>
          <button
            style={{ flex: 1, height: 36, backgroundColor: inputMode === 'fif' ? BLUE_ACC : SURFACE, border: `1.5px solid ${inputMode === 'fif' ? BLUE_ACC : BORDER}`, borderRadius: 8, fontSize: 13, fontWeight: 700, color: inputMode === 'fif' ? '#fff' : TEXT_SEC, cursor: 'pointer' }}
            onClick={() => handleSwitchMode('fif')}
          >{t('goalInputFIF')}</button>
        </div>

        {/* Goal section label */}
        <span style={{ fontSize: 11, fontWeight: 800, color: BLUE_ACC, letterSpacing: 0.6, textTransform: 'uppercase' as const, textAlign: 'center', marginBottom: -4 }}>
          {goalField === 'rod' ? t('goalRodReading') : t('goalElevInput')}
        </span>

        {/* Decimal input */}
        {inputMode === 'dec' && (
          <input
            style={{ width: '100%', height: 52, backgroundColor: '#fff', borderRadius: 8, border: `2px solid ${BLUE_ACC}`, fontSize: 24, fontWeight: 700, color: '#000', textAlign: 'center', outline: 'none', boxSizing: 'border-box' as const }}
            value={goalInput}
            onChange={e => {
              const v = e.target.value;
              onChangeInput(v);
              const n = parseFloat(v);
              if (!isNaN(n) && n > 0) {
                const fif = engToFIF(n);
                setFifFeet(fif.feet); setFifInches(fif.inches); setFifFrac(fif.frac);
              }
            }}
            inputMode="decimal"
            placeholder="0.00"
            autoFocus
          />
        )}

        {/* FIF input */}
        {inputMode === 'fif' && (
          <div style={{ display: 'flex', gap: 6, width: '100%' }}>
            {/* Feet */}
            <div style={{ flex: 5, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: BLUE_ACC, textAlign: 'center', letterSpacing: 0.4 }}>{t('feetLabel')}</span>
              <input
                style={{ width: '100%', height: 50, backgroundColor: '#fff', borderRadius: 6, border: `2px solid ${BLUE_ACC}`, fontSize: 22, fontWeight: 700, color: '#000', textAlign: 'center', outline: 'none', boxSizing: 'border-box' as const }}
                type="text" inputMode="numeric" pattern="[0-9]*"
                value={fifFeet}
                onChange={e => {
                  const v = e.target.value;
                  if (v === '' || /^\d+$/.test(v)) {
                    setFifFeet(v);
                    const eng = fifToEng(v || '0', fifInches, fifFrac);
                    onChangeInput(eng > 0 ? eng.toFixed(2) : '');
                  }
                }}
                onKeyDown={e => {
                  const allowed = ['Backspace','Delete','ArrowLeft','ArrowRight','Tab','Home','End'];
                  if (!allowed.includes(e.key) && !/^\d$/.test(e.key)) e.preventDefault();
                }}
                placeholder="0"
                autoFocus
              />
            </div>
            {/* Inches */}
            <div style={{ flex: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: BLUE_ACC, textAlign: 'center', letterSpacing: 0.4 }}>{t('inchesLabel')}</span>
              <select
                style={{ width: '100%', height: 50, backgroundColor: '#fff', borderRadius: 6, border: `2px solid ${BLUE_ACC}`, fontSize: 20, fontWeight: 700, color: '#000', textAlign: 'center', outline: 'none', boxSizing: 'border-box' as const }}
                value={fifInches}
                onChange={e => {
                  setFifInches(e.target.value);
                  const eng = fifToEng(fifFeet, e.target.value, fifFrac);
                  onChangeInput(eng > 0 ? eng.toFixed(2) : '');
                }}
              >
                {Array.from({ length: 12 }, (_, i) => <option key={i} value={String(i)}>{i}</option>)}
              </select>
            </div>
            {/* Fraction */}
            <div style={{ flex: 5, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: BLUE_ACC, textAlign: 'center', letterSpacing: 0.4 }}>{t('fracLabel')}</span>
              <select
                style={{ width: '100%', height: 50, backgroundColor: '#fff', borderRadius: 6, border: `2px solid ${BLUE_ACC}`, fontSize: 15, fontWeight: 700, color: '#000', textAlign: 'center', outline: 'none', boxSizing: 'border-box' as const }}
                value={fifFrac}
                onChange={e => {
                  setFifFrac(e.target.value);
                  const eng = fifToEng(fifFeet, fifInches, e.target.value);
                  onChangeInput(eng > 0 ? eng.toFixed(2) : '');
                }}
              >
                {FRAC_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* Live diff preview */}
        {goalDiffSigned != null && (
          <div style={{ borderRadius: 8, padding: '8px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, border: `2px solid ${diffBdr}`, backgroundColor: diffBg }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: TEXT_SEC, letterSpacing: 0.6, textTransform: 'uppercase' as const }}>{t('difference')}</span>
            <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: 0.3, textAlign: 'center', color: diffClr }}>
              {goalDiffSigned > 0 ? '+' : ''}{goalDiffSigned.toFixed(2)} ft{'  '}
              {goalDiffSigned >  0.00005 ? t('fillRequired') :
               goalDiffSigned < -0.00005 ? t('cutRequired') : t('atGrade')}
            </span>
          </div>
        )}

        {/* Submit */}
        <button
          style={{ height: 50, backgroundColor: canSubmit ? NAVY : SURFACE, border: 'none', borderRadius: 10, color: canSubmit ? '#fff' : TEXT_DIS, fontSize: 16, fontWeight: 800, letterSpacing: 0.4, cursor: canSubmit ? 'pointer' : 'default', opacity: canSubmit ? 1 : 0.35, boxShadow: canSubmit ? '0 3px 8px rgba(20,58,99,0.35)' : 'none' }}
          onClick={onSubmit}
          disabled={!canSubmit}
        >{t('setGoal')}</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPARE TAB  (matches PointsTab from ViewPointsView.tsx)
// ═══════════════════════════════════════════════════════════════════════════════
interface CompareTabProps {
  projectId: string;
  points:    SurveyPoint[];
  sets:      SurveySet[];
  fromId:    string | null;
  toId:      string | null;
  setFromId: (id: string | null) => void;
  setToId:   (id: string | null) => void;
}

function CompareTab({ projectId, points, sets, fromId, toId, setFromId, setToId }: CompareTabProps) {
  const { t, lang } = useLang();

  // showComparison: true = results view, false = picker view
  const [showComparison, setShowComparison] = useState(!!(fromId && toId));
  const [tempA,          setTempA]          = useState<string | null>(fromId);
  const [tempB,          setTempB]          = useState<string | null>(toId);
  const [selA,           setSelA]           = useState<string | null>(fromId);
  const [selB,           setSelB]           = useState<string | null>(toId);
  const [setIdx,         setSetIdx]         = useState(0);
  const [cardPage,       setCardPage]       = useState(0);
  const [showSetPicker,  setShowSetPicker]  = useState(false);

  // Auto-load when triggered from Point+ "Compare This Reading"
  useEffect(() => {
    if (fromId) {
      setSelA(fromId);
      setSelB(toId ?? null);
      setTempA(fromId);
      setTempB(toId ?? null);
      setShowComparison(!!(fromId && toId));
    }
  }, [fromId, toId]);

  // Goal state
  const [goalCard,      setGoalCard]      = useState<{ ptId: string; field: 'rod' | 'elev' } | null>(null);
  const [goalInput,     setGoalInput]     = useState('');
  const [goalValues,    setGoalValues]    = useState<Record<string, number>>({});
  const [showGoalModal, setShowGoalModal] = useState(false);

  const GOAL_KEY = `@goals_${projectId}`;

  useEffect(() => {
    try { const raw = localStorage.getItem(GOAL_KEY); if (raw) setGoalValues(JSON.parse(raw)); } catch {}
  }, [GOAL_KEY]);

  useEffect(() => {
    if (Object.keys(goalValues).length > 0) {
      try { localStorage.setItem(GOAL_KEY, JSON.stringify(goalValues)); } catch {}
    }
  }, [goalValues, GOAL_KEY]);

  // Build set groups for inline picker
  const groups = useMemo(() => {
    const gs: Array<{ setObj: SurveySet | null; pts: SurveyPoint[]; setLabel: string; name: string; createdAt?: number }> = [];
    sets.forEach(s => {
      const pts = points.filter(p => p.setId === s.id);
      if (pts.length > 0) gs.push({ setObj: s, pts, setLabel: s.setLabel ?? '', name: s.name, createdAt: s.createdAt });
    });
    const unset = points.filter(p => !p.setId);
    if (unset.length > 0) gs.unshift({ setObj: null, pts: unset, setLabel: '', name: 'No Set' });
    return gs;
  }, [points, sets]);

  const totalGroups = groups.length;
  const safeIdx     = Math.min(setIdx, Math.max(0, totalGroups - 1));
  const currentGroup = groups[safeIdx];

  // Reset card page when the active set changes
  useEffect(() => { setCardPage(0); }, [safeIdx]); // eslint-disable-line react-hooks/exhaustive-deps
  const canGo       = !!(tempA && tempB);
  const selCount    = [tempA, tempB].filter(Boolean).length;

  const ptA = selA ? (points.find(p => p.id === selA) ?? null) : null;
  const ptB = selB ? (points.find(p => p.id === selB) ?? null) : null;
  const hasSelection = !!(ptA && ptB);

  const displayA = ptA ? (ptA.pointName ? `${ptA.label} (${ptA.pointName})` : ptA.label) : '';
  const displayB = ptB ? (ptB.pointName ? `${ptB.label} (${ptB.pointName})` : ptB.label) : '';
  // Larger rod reading = lower ground elevation, so flip direction vs raw subtraction
  const diff     = ptA && ptB ? ptB.engineeringFeet - ptA.engineeringFeet : null;
  const absDiff  = diff != null ? Math.abs(diff) : null;
  const dirWord  = diff != null ? (Math.abs(diff) < 0.00005 ? t('dirSameLevel') : diff > 0 ? t('dirAbove') : t('dirBelow')) : '';
  const compColor= diff != null ? (Math.abs(diff) < 0.00005 ? BLUE_ACC : diff > 0 ? GREEN : RED) : TEXT_PRI;
  const absFIFStr= absDiff != null ? toFIFStr(absDiff) : '';
  const compText = ptA && ptB ? strings[lang].comparisonFIF(displayA, absDiff?.toFixed(2) ?? '0', absFIFStr, dirWord, displayB) : '';

  const handleTempSelect = useCallback((ptId: string) => {
    if (tempA === ptId) { setTempA(null); return; }
    if (tempB === ptId) { setTempB(null); return; }
    if (!tempA)  { setTempA(ptId); return; }
    if (!tempB)  { setTempB(ptId); return; }
    setTempB(ptId);
  }, [tempA, tempB]);

  const handleGo = () => {
    if (tempA && tempB) {
      setSelA(tempA); setSelB(tempB);
      setFromId(tempA); setToId(tempB);
      setShowComparison(true);
    }
  };

  const handleSwap = () => {
    const a = selA, b = selB;
    setSelA(b); setSelB(a);
    setFromId(b ?? null); setToId(a ?? null);
  };

  // Cancel: return to picker, restore pending selection to last committed
  const handleCancel = () => {
    setTempA(selA); setTempB(selB);
    setShowComparison(false);
  };

  // Goal helpers
  const goalPt      = goalCard ? (points.find(p => p.id === goalCard.ptId) ?? null) : null;
  const existingVal = goalCard?.field === 'rod'
    ? (goalPt?.engineeringFeet ?? 0)
    : (goalPt?.bmElevation ?? 0);

  const openGoal = (ptId: string, field: 'rod' | 'elev') => {
    const existing = goalValues[`${ptId}-${field}`];
    setGoalCard({ ptId, field });
    setGoalInput(existing?.toString() ?? '');
    setShowGoalModal(true);
  };

  const handleGoalSubmit = () => {
    if (!goalCard || isNaN(parseFloat(goalInput))) return;
    const num = parseFloat(goalInput);
    setGoalValues(prev => ({ ...prev, [`${goalCard.ptId}-${goalCard.field}`]: num }));
    setShowGoalModal(false); setGoalCard(null); setGoalInput('');
  };

  const closeGoalModal = () => { setShowGoalModal(false); setGoalCard(null); setGoalInput(''); };

  const diffColor = (d: number) => d > 0.00005 ? GREEN : d < -0.00005 ? RED : TEXT_SEC;

  // Render one data row + optional difference sub-row
  const renderRow = (pt: SurveyPoint, role: 'A' | 'B') => {
    const rodKey   = `${pt.id}-rod`;
    const elevKey  = `${pt.id}-elev`;
    const rodGoal  = goalValues[rodKey];
    const elevGoal = goalValues[elevKey];
    const rodDiff  = rodGoal  != null ? rodGoal - pt.engineeringFeet : null;
    const elevBm   = pt.bmElevation > 0 ? pt.bmElevation : null;
    const elevDiff = (elevGoal != null && elevBm != null) ? elevGoal - elevBm : null;
    const rowBg  = role === 'A' ? 'rgba(47,127,191,0.07)' : 'rgba(31,138,77,0.07)';


    return (
      <React.Fragment key={pt.id}>
        <div style={{ display: 'flex', alignItems: 'stretch', padding: '6px 6px', backgroundColor: rowBg }}>
          {/* POINT col — narrower */}
          <div style={{ flex: 1.8, display: 'flex', alignItems: 'center', paddingRight: 6 }}>
            <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: TEXT_PRI, wordBreak: 'break-word' as const, lineHeight: 1.25 }}>{pt.pointName || pt.label}</div>
              {pt.pointName && <div style={{ fontSize: 13, fontWeight: 700, color: TEXT_PRI, marginTop: 1 }}>{pt.label}</div>}
            </div>
          </div>
          <div style={{ width: 1, backgroundColor: '#D5D8DE', alignSelf: 'stretch', flexShrink: 0 }} />
          {/* ROD READING col — decimal + FIF + goal */}
          <div style={{ flex: 3.1, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, padding: '0 6px' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: TEXT_PRI, fontFamily: 'monospace' }}>{pt.engineeringFeet.toFixed(2)} ft</div>
              <StackedFIFSpan {...engToFIF(pt.engineeringFeet)} color={TEXT_SEC} size={15} />
            </div>
            {rodGoal != null ? (
              <div style={{ borderRadius: 4, backgroundColor: 'rgba(31,138,77,0.13)', border: `1.5px solid ${GREEN}`, padding: '2px 5px', cursor: 'pointer', textAlign: 'right' }} onClick={() => openGoal(pt.id, 'rod')}>
                <div style={{ fontSize: 9, fontWeight: 800, color: GREEN, letterSpacing: 0.4, textTransform: 'uppercase' as const }}>{t('goalHeight')}</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: GREEN, fontFamily: 'monospace' }}>{rodGoal.toFixed(2)} ft</div>
                <StackedFIFSpan {...engToFIF(rodGoal!)} color={GREEN} size={11} />
              </div>
            ) : (
              <div style={{ borderRadius: 4, backgroundColor: SURFACE, border: `1px solid ${BORDER}`, padding: '3px 8px', cursor: 'pointer', textAlign: 'center' }} onClick={() => openGoal(pt.id, 'rod')}>
                <span style={{ fontSize: 13, fontWeight: 800, color: TEXT_SEC, letterSpacing: 0.2, whiteSpace: 'nowrap' as const }}>{t('goalHeightBtn')}</span>
              </div>
            )}
          </div>
          <div style={{ width: 1, backgroundColor: '#D5D8DE', alignSelf: 'stretch', flexShrink: 0 }} />
          {/* ELEVATION col — decimal + FIF + goal */}
          <div style={{ flex: 3.1, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, paddingLeft: 6 }}>
            {pt.bmElevation > 0 ? (
              <>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: TEXT_PRI, fontFamily: 'monospace' }}>{pt.bmElevation.toFixed(2)} ft</div>
                  <StackedFIFSpan {...engToFIF(pt.bmElevation)} color={TEXT_SEC} size={15} />
                </div>
                {elevGoal != null ? (
                  <div style={{ borderRadius: 4, backgroundColor: 'rgba(31,138,77,0.13)', border: `1.5px solid ${GREEN}`, padding: '2px 5px', cursor: 'pointer', textAlign: 'right' }} onClick={() => openGoal(pt.id, 'elev')}>
                    <div style={{ fontSize: 9, fontWeight: 800, color: GREEN, letterSpacing: 0.4, textTransform: 'uppercase' as const }}>{t('goalElev')}</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: GREEN, fontFamily: 'monospace' }}>{elevGoal.toFixed(2)} ft</div>
                    <StackedFIFSpan {...engToFIF(elevGoal!)} color={GREEN} size={11} />
                  </div>
                ) : (
                  <div style={{ borderRadius: 4, backgroundColor: SURFACE, border: `1px solid ${BORDER}`, padding: '3px 8px', cursor: 'pointer', textAlign: 'center' }} onClick={() => openGoal(pt.id, 'elev')}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: TEXT_SEC, letterSpacing: 0.2, whiteSpace: 'nowrap' as const }}>{t('goalElevBtn')}</span>
                  </div>
                )}
              </>
            ) : (
              <span style={{ fontSize: 15, fontWeight: 700, color: TEXT_PRI, fontFamily: 'monospace' }}>—</span>
            )}
          </div>
        </div>
        {/* Difference row — numbers only, no directional words */}
        {(rodDiff != null || elevDiff != null) && (
          <div style={{ display: 'flex', alignItems: 'stretch', padding: '3px 6px', backgroundColor: rowBg, borderTop: `1px solid ${BORDER_S}88` }}>
            <div style={{ flex: 1.8, paddingRight: 6, display: 'flex', alignItems: 'center', minWidth: 0, overflow: 'hidden' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#111111', letterSpacing: 0.5, textTransform: 'uppercase' as const, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>{t('difference')}</span>
            </div>
            <div style={{ width: 1, backgroundColor: '#D5D8DE', alignSelf: 'stretch' }} />
            <div style={{ flex: 3.1, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', padding: '0 6px' }}>
              {rodDiff != null && (
                <>
                  <span style={{ fontSize: 14, fontWeight: 700, color: diffColor(rodDiff), fontFamily: 'monospace' }}>{Math.abs(rodDiff).toFixed(2)} ft</span>
                  <StackedFIFSpan {...engToFIF(Math.abs(rodDiff))} color={diffColor(rodDiff)} size={11} />
                </>
              )}
            </div>
            <div style={{ width: 1, backgroundColor: '#D5D8DE', alignSelf: 'stretch' }} />
            <div style={{ flex: 3.1, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', paddingLeft: 6 }}>
              {elevDiff != null && (
                <>
                  <span style={{ fontSize: 14, fontWeight: 700, color: diffColor(elevDiff), fontFamily: 'monospace' }}>{Math.abs(elevDiff).toFixed(2)} ft</span>
                  <StackedFIFSpan {...engToFIF(Math.abs(elevDiff))} color={diffColor(elevDiff)} size={11} />
                </>
              )}
            </div>
          </div>
        )}
      </React.Fragment>
    );
  };

  return (
    <div style={{ flex: 1, backgroundColor: SCREEN, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {showComparison && hasSelection ? (
        /* ── Comparison results view ── */
        <div style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Summary card — swap left, result text right */}
          <div style={{ backgroundColor: CARD, borderRadius: 8, border: `1px solid ${BORDER}`, padding: '7px 10px 6px', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <button
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, backgroundColor: NAVY, border: 'none', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', flexShrink: 0, boxShadow: '0 2px 6px rgba(20,58,99,0.30)', minWidth: 62 }}
              onClick={handleSwap}
            >
              <span style={{ fontSize: 17, color: '#fff', fontWeight: 800, lineHeight: 1 }}>⇆</span>
              <span style={{ fontSize: 14, color: '#fff', fontWeight: 800, lineHeight: 1.2, textAlign: 'center' }}>{t('swapPoints')}</span>
            </button>
            <span style={{ flex: 1, fontSize: 17, fontWeight: 700, lineHeight: 1.4, color: compColor }}>{compText}</span>
          </div>

          {/* 3-column table card */}
          <div style={{ backgroundColor: CARD, borderRadius: 8, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '6px 6px', backgroundColor: RAISED }}>
              <div style={{ flex: 1.8, paddingRight: 6 }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: '#111111', letterSpacing: 0.5, textTransform: 'uppercase' as const }}>{t('pointCol')}</span>
              </div>
              <div style={{ width: 1, backgroundColor: '#D5D8DE', alignSelf: 'stretch' }} />
              <div style={{ flex: 3.1, padding: '0 6px', textAlign: 'right' }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: '#111111', letterSpacing: 0.5, textTransform: 'uppercase' as const }}>{t('rodReadingCol')}</span>
              </div>
              <div style={{ width: 1, backgroundColor: '#D5D8DE', alignSelf: 'stretch' }} />
              <div style={{ flex: 3.1, paddingLeft: 6, textAlign: 'right' }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: '#111111', letterSpacing: 0.5, textTransform: 'uppercase' as const }}>{t('elevationCol')}</span>
              </div>
            </div>
            <div style={{ height: 1, backgroundColor: BORDER }} />
            {ptA && renderRow(ptA, 'A')}
            <div style={{ height: 1, backgroundColor: BORDER_S, margin: '0 6px' }} />
            {ptB && renderRow(ptB, 'B')}
          </div>

          {/* Compare Another — below table, above ad */}
          <button
            style={{ width: '100%', height: 36, backgroundColor: NAVY, border: 'none', borderRadius: 8, color: '#fff', fontSize: 15, fontWeight: 800, letterSpacing: 0.2, cursor: 'pointer', boxShadow: '0 2px 6px rgba(20,58,99,0.30)' }}
            onClick={handleCancel}
          >{t('compareAnother')}</button>

          {/* Ad space */}
          <div style={{ height: 54, borderTop: `1px dashed ${BORDER_B}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 4 }}>
            <span style={{ fontSize: 10, color: TEXT_DIS, letterSpacing: 0.8, fontWeight: 600 }}>AD SPACE</span>
          </div>
        </div>
      ) : (
        /* ── Inline picker view ── */
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {totalGroups === 0 ? (
            /* No points at all */
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
              <span style={{ fontSize: 40 }}>📐</span>
              <span style={{ fontSize: 18, fontWeight: 700, color: TEXT_PRI, textAlign: 'center' }}>{t('compareTwoPoints')}</span>
              <span style={{ fontSize: 15, color: TEXT_SEC, textAlign: 'center', lineHeight: 1.5, maxWidth: 280 }}>{t('compareDesc')}</span>
            </div>
          ) : (
            <>
              {/* Compact single-row set header */}
              <div style={{ padding: '3px 6px', backgroundColor: CARD, borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {/* Left arrow */}
                  <button
                    style={{ width: 26, height: 26, borderRadius: 5, backgroundColor: safeIdx === 0 ? SURFACE : NAVY, border: 'none', fontSize: 18, fontWeight: 800, color: safeIdx === 0 ? TEXT_DIS : '#fff', cursor: safeIdx === 0 ? 'default' : 'pointer', opacity: safeIdx === 0 ? 0.3 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 0 }}
                    onClick={() => setSetIdx(Math.max(0, safeIdx - 1))}
                    disabled={safeIdx === 0}
                  >‹</button>

                  {/* Center: SET badge | Name | Date | count — single line */}
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, overflow: 'hidden', minWidth: 0 }}>
                    {currentGroup?.setLabel ? (
                      <div style={{ backgroundColor: BLUE, borderRadius: 3, padding: '1px 6px', flexShrink: 0 }}>
                        <span style={{ fontSize: 14, fontWeight: 800, color: '#fff', letterSpacing: 0.4 }}>{currentGroup.setLabel}</span>
                      </div>
                    ) : null}
                    {currentGroup?.setLabel && (
                      <span style={{ color: BORDER_B, fontSize: 14, flexShrink: 0 }}>|</span>
                    )}
                    <span style={{ fontSize: 16, fontWeight: 800, color: TEXT_PRI, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{currentGroup?.name ?? '—'}</span>
                    {currentGroup?.createdAt ? (
                      <>
                        <span style={{ color: BORDER_B, fontSize: 14, flexShrink: 0 }}>|</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: TEXT_SEC, whiteSpace: 'nowrap' as const, flexShrink: 0 }}>
                          {new Date(currentGroup.createdAt).toLocaleDateString(lang === 'es' ? 'es-MX' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </>
                    ) : null}
                    {totalGroups > 1 && (
                      <span style={{ fontSize: 14, fontWeight: 700, color: TEXT_SEC, whiteSpace: 'nowrap' as const, flexShrink: 0 }}>{safeIdx + 1}/{totalGroups}</span>
                    )}
                  </div>

                  {/* Right arrow */}
                  <button
                    style={{ width: 26, height: 26, borderRadius: 5, backgroundColor: safeIdx >= totalGroups - 1 ? SURFACE : NAVY, border: 'none', fontSize: 18, fontWeight: 800, color: safeIdx >= totalGroups - 1 ? TEXT_DIS : '#fff', cursor: safeIdx >= totalGroups - 1 ? 'default' : 'pointer', opacity: safeIdx >= totalGroups - 1 ? 0.3 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 0 }}
                    onClick={() => setSetIdx(Math.min(totalGroups - 1, safeIdx + 1))}
                    disabled={safeIdx >= totalGroups - 1}
                  >›</button>
                </div>

                {/* Dot indicators */}
                {totalGroups > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 3 }}>
                    {groups.map((_, i) => (
                      <div
                        key={i}
                        style={{ height: 4, width: i === safeIdx ? 10 : 4, borderRadius: 2, backgroundColor: i === safeIdx ? BLUE_ACC : BORDER, cursor: 'pointer', transition: 'width 0.15s' }}
                        onClick={() => setSetIdx(i)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Unified scrollable body: grid → status → buttons → ad */}
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {/* 3-column point grid — fixed 2 rows × 3 cols, paginated */}
                <div style={{ padding: '6px 6px 4px' }}>
                  {(currentGroup?.pts ?? []).length === 0 ? (
                    <p style={{ textAlign: 'center', color: TEXT_DIS, fontSize: 16, padding: 24 }}>{t('noPointsInSet')}</p>
                  ) : (() => {
                    const allPts = currentGroup?.pts ?? [];
                    const CARDS_PER_PAGE = 6;
                    const totalCardPages = Math.ceil(allPts.length / CARDS_PER_PAGE);
                    const safePage = Math.min(cardPage, Math.max(0, totalCardPages - 1));
                    const pagePts = allPts.slice(safePage * CARDS_PER_PAGE, (safePage + 1) * CARDS_PER_PAGE);
                    return (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, overflow: 'hidden' }}>
                          {pagePts.map(pt => {
                            const isA = tempA === pt.id;
                            const isB = tempB === pt.id;
                            const sel = isA || isB;
                            const selColor = isA ? BLUE : GREEN;
                            return (
                              <div
                                key={pt.id}
                                style={{
                                  borderRadius: 9,
                                  border: `2px solid ${isA ? BLUE : isB ? GREEN : '#D1D5DB'}`,
                                  backgroundColor: isA ? 'rgba(30,87,153,0.07)' : isB ? 'rgba(31,138,77,0.07)' : CARD,
                                  padding: '5px 8px 5px',
                                  cursor: 'pointer',
                                  position: 'relative',
                                  userSelect: 'none' as const,
                                  transition: 'border-color 0.15s, box-shadow 0.15s, background-color 0.15s',
                                  boxShadow: isA
                                    ? '0 0 0 3px rgba(30,87,153,0.12), 0 2px 8px rgba(30,87,153,0.22)'
                                    : isB
                                    ? '0 0 0 3px rgba(31,138,77,0.12), 0 2px 8px rgba(31,138,77,0.22)'
                                    : '0 1px 3px rgba(0,0,0,0.06)',
                                }}
                                onClick={() => handleTempSelect(pt.id)}
                              >
                                {/* Role chip — A or B */}
                                {sel && (
                                  <div
                                    style={{ position: 'absolute', top: 5, right: 5, width: 18, height: 18, borderRadius: 9, backgroundColor: selColor, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1, boxShadow: `0 1px 4px ${isA ? 'rgba(30,87,153,0.4)' : 'rgba(31,138,77,0.4)'}` }}
                                    onClick={e => { e.stopPropagation(); handleTempSelect(pt.id); }}
                                  >
                                    <span style={{ fontSize: 11, fontWeight: 900, color: '#fff', lineHeight: 1 }}>✕</span>
                                  </div>
                                )}
                                {/* PT label + name */}
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, paddingRight: sel ? 26 : 0, overflow: 'hidden', marginBottom: 2 }}>
                                  <span style={{ fontSize: 17, fontWeight: 900, color: isA ? BLUE : isB ? GREEN : NAVY, letterSpacing: 0.1, flexShrink: 0 }}>{pt.label}</span>
                                  {pt.pointName && (
                                    <span style={{ fontSize: 14, fontWeight: 700, color: TEXT_SEC, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>| {pt.pointName}</span>
                                  )}
                                </div>
                                {/* Divider */}
                                <div style={{ height: 1, backgroundColor: sel ? `${selColor}28` : BORDER_S, marginBottom: 2 }} />
                                {/* Rod — decimal ft | FIF, both at size 12 */}
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, lineHeight: 1.2, flexWrap: 'nowrap' as const, overflow: 'hidden' }}>
                                  <span style={{ fontSize: 13, color: TEXT_SEC, fontWeight: 700, flexShrink: 0 }}>{t('pickerRod')} -</span>
                                  <span style={{ fontSize: 12, fontWeight: 800, color: TEXT_PRI, fontFamily: 'monospace', flexShrink: 0 }}>{pt.engineeringFeet.toFixed(2)} ft</span>
                                  <span style={{ fontSize: 10, color: TEXT_DIS, fontWeight: 400, flexShrink: 0 }}>|</span>
                                  <StackedFIFSpan {...engToFIF(pt.engineeringFeet)} color={TEXT_PRI} size={12} />
                                </div>
                                {/* Elev — decimal ft only */}
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, flexWrap: 'nowrap' as const, lineHeight: 1.2 }}>
                                  <span style={{ fontSize: 14, color: TEXT_SEC, fontWeight: 700, flexShrink: 0 }}>{t('pickerElev')} -</span>
                                  <span style={{ fontSize: 16, fontWeight: 800, color: TEXT_PRI, fontFamily: 'monospace' }}>{pt.bmElevation > 0 ? pt.bmElevation.toFixed(2) : '—'}</span>
                                  {pt.bmElevation > 0 && <span style={{ fontSize: 14, color: TEXT_SEC, fontWeight: 600 }}>ft</span>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {/* Card page navigation: arrows + dots */}
                        {totalCardPages > 1 && (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 6 }}>
                            <button
                              disabled={safePage === 0}
                              onClick={() => setCardPage(Math.max(0, safePage - 1))}
                              style={{ width: 24, height: 24, borderRadius: 5, backgroundColor: safePage === 0 ? SURFACE : NAVY, border: 'none', fontSize: 17, fontWeight: 800, color: safePage === 0 ? TEXT_DIS : '#fff', cursor: safePage === 0 ? 'default' : 'pointer', opacity: safePage === 0 ? 0.3 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0 }}
                            >‹</button>
                            <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                              {Array.from({ length: totalCardPages }).map((_, pi) => (
                                <div
                                  key={pi}
                                  style={{ height: 7, width: pi === safePage ? 16 : 7, borderRadius: 4, backgroundColor: pi === safePage ? BLUE_ACC : BORDER_B, cursor: 'pointer', transition: 'width 0.15s, background-color 0.15s' }}
                                  onClick={() => setCardPage(pi)}
                                />
                              ))}
                            </div>
                            <button
                              disabled={safePage >= totalCardPages - 1}
                              onClick={() => setCardPage(Math.min(totalCardPages - 1, safePage + 1))}
                              style={{ width: 24, height: 24, borderRadius: 5, backgroundColor: safePage >= totalCardPages - 1 ? SURFACE : NAVY, border: 'none', fontSize: 17, fontWeight: 800, color: safePage >= totalCardPages - 1 ? TEXT_DIS : '#fff', cursor: safePage >= totalCardPages - 1 ? 'default' : 'pointer', opacity: safePage >= totalCardPages - 1 ? 0.3 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0 }}
                            >›</button>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>

                {/* Status + buttons — immediately after grid, in the flow */}
                <div style={{ padding: '4px 8px 6px', borderTop: `1px solid ${BORDER}` }}>
                  <div style={{ marginBottom: 5 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: selCount === 2 ? GREEN : TEXT_SEC }}>
                      {selCount === 0 ? t('tapTwoPoints') : selCount === 1 ? t('oneOfTwo') : t('twoSelected')}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'row', gap: 6 }}>
                    {totalGroups > 1 && (
                      <button
                        style={{ flex: 1.4, height: 34, backgroundColor: NAVY, border: 'none', borderRadius: 8, color: '#fff', fontSize: 16, fontWeight: 800, cursor: 'pointer', padding: '0 6px', boxShadow: '0 2px 6px rgba(20,58,99,0.35)', letterSpacing: 0.2 }}
                        onClick={() => setShowSetPicker(true)}
                      >{t('chooseFromAnotherSet')}</button>
                    )}
                    <button
                      style={{ flex: 1, height: 34, backgroundColor: canGo ? BLUE : NAVY, border: 'none', borderRadius: 8, color: canGo ? '#fff' : 'rgba(255,255,255,0.35)', fontSize: 17, fontWeight: 800, cursor: canGo ? 'pointer' : 'default', letterSpacing: 0.3, opacity: canGo ? 1 : 0.5, boxShadow: canGo ? '0 2px 6px rgba(30,87,153,0.40)' : 'none' }}
                      onClick={handleGo}
                      disabled={!canGo}
                    >{t('goBtn')}</button>
                  </div>
                </div>

                {/* Ad space — clean, no container */}
                <div style={{ height: 60, borderTop: `1px dashed ${BORDER_B}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 10, color: TEXT_DIS, letterSpacing: 0.8, fontWeight: 600 }}>AD SPACE</span>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      <GoalModal
        visible={showGoalModal && goalCard != null && goalPt != null}
        goalField={goalCard?.field ?? null}
        goalPt={goalPt}
        goalInput={goalInput}
        existingVal={existingVal}
        onChangeInput={setGoalInput}
        onSubmit={handleGoalSubmit}
        onClose={closeGoalModal}
      />

      {/* Set picker bottom-sheet modal */}
      {showSetPicker && (
        <div
          style={{ position: 'fixed' as const, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.46)', zIndex: 200, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'flex-end' }}
          onClick={() => setShowSetPicker(false)}
        >
          <div
            style={{ backgroundColor: CARD, borderRadius: '16px 16px 0 0', width: '100%', maxWidth: 480, maxHeight: '70vh', display: 'flex', flexDirection: 'column' as const, overflow: 'hidden' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ padding: '13px 16px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: TEXT_PRI }}>{t('chooseFromAnotherSet')}</span>
              <button onClick={() => setShowSetPicker(false)}
                style={{ background: 'none', border: 'none', fontSize: 20, color: TEXT_DIS, cursor: 'pointer', lineHeight: 1, padding: 0 }}
              >✕</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {groups.map((g, gi) => {
                const isActive = gi === safeIdx;
                return (
                  <div key={gi}
                    style={{ backgroundColor: isActive ? '#EEF4FF' : SURFACE, borderRadius: 8, border: `1px solid ${isActive ? BLUE : BORDER}`, padding: '10px 12px', cursor: 'pointer' }}
                    onClick={() => { setSetIdx(gi); setCardPage(0); setShowSetPicker(false); }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      {g.setLabel ? (
                        <div style={{ backgroundColor: BLUE, borderRadius: 3, padding: '1px 6px', flexShrink: 0 }}>
                          <span style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>{g.setLabel}</span>
                        </div>
                      ) : null}
                      <span style={{ fontSize: 15, fontWeight: 700, color: TEXT_PRI, flex: 1 }}>{g.name}</span>
                      {isActive && <span style={{ fontSize: 13, color: BLUE, flexShrink: 0 }}>✓</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {g.createdAt ? (
                        <span style={{ fontSize: 12, color: TEXT_DIS }}>
                          {new Date(g.createdAt).toLocaleDateString(lang === 'es' ? 'es-MX' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      ) : null}
                      <span style={{ fontSize: 12, color: TEXT_SEC, fontWeight: 600 }}>{g.pts.length} {g.pts.length === 1 ? 'pt' : 'pts'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// GRAPH TAB  — Rod Reading Bar Chart
// ═══════════════════════════════════════════════════════════════════════════════
interface GraphTabProps {
  points: SurveyPoint[];
  sets:   SurveySet[];
}

function GraphTab({ points, sets }: GraphTabProps) {
  const { t } = useLang();
  const [selectedSet, setSelectedSet] = useState('');
  const [showMoreSets, setShowMoreSets] = useState(false);

  // Sets that contain at least one point
  const availableSets = useMemo(() =>
    sets.filter(s => points.some(p => p.setId === s.id)),
    [sets, points]
  );

  // Auto-select first set when sets become available
  useEffect(() => {
    if (!selectedSet && availableSets.length > 0) {
      setSelectedSet(availableSets[0].id);
    }
  }, [availableSets.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Effective set — fallback to first available if none committed yet
  const effectiveSet = selectedSet || availableSets[0]?.id || '';

  const filtered = useMemo(() => {
    const base = effectiveSet ? points.filter(p => p.setId === effectiveSet) : points;
    return [...base]
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
      .slice(0, 20);
  }, [points, effectiveSet]);

  const refSetName = useMemo(() => {
    return sets.find(s => s.id === effectiveSet)?.name ?? '';
  }, [effectiveSet, sets]);

  // First 2 sets visible; rest accessible via "More Sets" overlay
  const VISIBLE = 2;
  const visibleChips = availableSets.slice(0, VISIBLE);
  const hiddenChips  = availableSets.slice(VISIBLE);

  // Number of columns: up to 2 chips + "More Sets" button (if any hidden)
  const chipCols = visibleChips.length + (hiddenChips.length > 0 ? 1 : 0);
  const chipBtnStyle: React.CSSProperties = { minHeight: 38, padding: '6px 8px', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer', whiteSpace: 'normal', textAlign: 'center', lineHeight: 1.25, wordBreak: 'break-word', border: `1px solid ${BORDER}`, backgroundColor: SURFACE, color: TEXT_SEC };

  const ChipsRow = availableSets.length > 0 ? (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${chipCols}, 1fr)`, gap: 6, marginBottom: 10 }}>
        {visibleChips.map(s => {
          const active = effectiveSet === s.id;
          const label  = s.setLabel ? `${s.setLabel} ${s.name}` : s.name;
          return (
            <button key={s.id}
              style={{ ...chipBtnStyle, border: `1px solid ${active ? BLUE : BORDER}`, backgroundColor: active ? BLUE : SURFACE, color: active ? '#fff' : TEXT_SEC, fontWeight: active ? 700 : 600 }}
              onClick={() => setSelectedSet(s.id)}
            >{label}</button>
          );
        })}
        {hiddenChips.length > 0 && (
          <button
            style={chipBtnStyle}
            onClick={() => setShowMoreSets(true)}
          >▲ {t('moreSets')}</button>
        )}
      </div>

      {/* More Sets centered overlay */}
      {showMoreSets && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px', boxSizing: 'border-box' as const }}
          onClick={() => setShowMoreSets(false)}>
          <div className="anp-modal-in"
            style={{ backgroundColor: CARD, borderRadius: 18, maxWidth: 440, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.28)', overflow: 'hidden', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}>
            <div style={{ backgroundColor: NAVY, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <span style={{ color: '#FFFFFF', fontSize: 18, fontWeight: 800, lineHeight: 1.2 }}>{t('moreSets')}</span>
              <button style={{ background: 'none', border: 'none', color: '#FFFFFF', fontSize: 24, fontWeight: 700, lineHeight: 1, cursor: 'pointer', padding: '4px 6px', opacity: 0.85 }} onClick={() => setShowMoreSets(false)}>✕</button>
            </div>
            <div style={{ overflowY: 'auto' as const, padding: '6px 0' }}>
              {hiddenChips.map(s => {
                const active = effectiveSet === s.id;
                const label  = s.setLabel ? `${s.setLabel} ${s.name}` : s.name;
                return (
                  <button key={s.id}
                    style={{ display: 'flex', width: '100%', padding: '13px 20px', textAlign: 'left' as const, background: active ? '#EEF4FF' : 'none', border: 'none', borderBottom: `1px solid #F0F2F5`, color: active ? BLUE : TEXT_PRI, fontSize: 16, fontWeight: active ? 700 : 500, cursor: 'pointer', alignItems: 'center', gap: 10, boxSizing: 'border-box' as const }}
                    onClick={() => { setSelectedSet(s.id); setShowMoreSets(false); }}
                  >
                    {s.setLabel && (
                      <span style={{ backgroundColor: BLUE, borderRadius: 4, padding: '2px 7px', fontSize: 12, fontWeight: 800, color: '#fff', flexShrink: 0 }}>{s.setLabel}</span>
                    )}
                    <span style={{ flex: 1 }}>{s.name || label}</span>
                    {active && <span style={{ fontSize: 16, color: BLUE, flexShrink: 0 }}>✓</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  ) : null;

  if (filtered.length === 0) {
    return (
      <div style={{ flex: 1, padding: 12, display: 'flex', flexDirection: 'column' }}>
        {ChipsRow}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 40 }}>
          <span style={{ fontSize: 36 }}>📡</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: TEXT_PRI }}>{t('noPointsDisplay')}</span>
          <span style={{ fontSize: 15, color: TEXT_DIS, textAlign: 'center' }}>{t('addPointsToGraph')}</span>
        </div>
      </div>
    );
  }

  // ── SVG chart geometry ─────────────────────────────────────────────────────
  const n       = filtered.length;
  const W       = 380;
  const PAD_B   = n <= 6 ? 62 : 56;   // extra room: point labels + x-axis title
  const PAD_L   = 46, PAD_R = 10, PAD_T = 32;
  const H       = 265 + PAD_B;
  const PLOT_W  = W - PAD_L - PAD_R;
  const PLOT_H  = H - PAD_T - PAD_B;

  const vals    = filtered.map(p => p.engineeringFeet);
  const rawMax  = Math.max(...vals);
  const rawMin  = Math.min(...vals);
  const range   = Math.max(rawMax - rawMin, 0.5);

  // INVERTED Y: small rod reading (high ground) → TOP of chart
  //             large rod reading (low ground)  → BOTTOM of chart
  const minVal  = rawMin - range * 0.12;  // small rod, pad above
  const maxVal  = rawMax + range * 0.20;  // large rod, pad below

  const yFor = (v: number) => {
    if (maxVal === minVal) return PAD_T + PLOT_H / 2;
    return PAD_T + PLOT_H * (v - minVal) / (maxVal - minVal);
  };

  const baseY   = PAD_T + PLOT_H;
  const laserY  = PAD_T;              // laser reference line at top
  const colW    = PLOT_W / n;
  const dotR    = Math.max(4, Math.min(6, colW * 0.20));

  // Nice Y-axis ticks
  const axisTicks = (() => {
    const r = maxVal - minVal;
    if (r < 0.01) return [rawMin];
    const rawStep = r / 5;
    const steps   = [0.1, 0.25, 0.5, 1, 2, 5, 10, 25];
    const step    = steps.find(s => s >= rawStep) ?? 1;
    const ticks: number[] = [];
    let v = Math.ceil((minVal - 0.0001) / step) * step;
    while (v <= maxVal + step * 0.01) {
      ticks.push(Math.round(v * 1000) / 1000);
      v += step;
      if (ticks.length > 8) break;
    }
    return ticks;
  })();

  // Font sizes — larger than before
  const valFontSz    = n <= 5 ? 13   : n <= 10 ? 11 : 9;
  const lblFontSz    = n <= 5 ? 12   : n <= 10 ? 11 : 9;
  const nameFontSz   = n <= 5 ? 10.5 : n <= 10 ? 9.5 : 8;
  const maxNameChars = n <= 5 ? 10   : n <= 10 ? 7   : 5;

  // Word-wrap helper: splits a name into lines of at most maxChars characters
  const wrapName = (text: string, maxChars: number): string[] => {
    const words = text.split(' ');
    const lines: string[] = [];
    let cur = '';
    for (const word of words) {
      if (!cur) { cur = word; }
      else if ((cur + ' ' + word).length <= maxChars) { cur += ' ' + word; }
      else { lines.push(cur); cur = word; }
    }
    if (cur) lines.push(cur);
    return lines;
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column' }}>
      {ChipsRow}

      <div style={{ backgroundColor: CARD, borderRadius: 12, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
        {/* Card header */}
        <div style={{ padding: '10px 12px', borderBottom: `1px solid ${BORDER_S}` }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: BLUE, letterSpacing: 1, textTransform: 'uppercase' as const }}>
            {t('rodReadingAnalysis')}
          </div>
          {refSetName ? (
            <div style={{ fontSize: 13, fontWeight: 500, color: TEXT_SEC, marginTop: 3 }}>{t('referenceSet')}: {refSetName}</div>
          ) : null}
        </div>

        {/* SVG chart */}
        <div style={{ padding: '4px 0 8px' }}>
          <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
            <defs />

            {/* Plot background */}
            <rect x={PAD_L} y={PAD_T} width={PLOT_W} height={PLOT_H} fill="#FAFBFE" rx="3" />
            <rect x={PAD_L} y={PAD_T} width={PLOT_W} height={PLOT_H} fill="none" stroke="#E2E8F0" strokeWidth="0.75" rx="3" />

            {/* Y-axis unit */}
            <text x={PAD_L - 6} y={PAD_T - 8} textAnchor="end" fontSize="11" fontWeight="800" fill={TEXT_SEC}>ft</text>

            {/* Y-axis grid + tick labels */}
            {axisTicks.map((tick, i) => {
              const ty = yFor(tick);
              if (ty < PAD_T - 1 || ty > baseY + 1) return null;
              return (
                <g key={`tk${i}`}>
                  <line x1={PAD_L} y1={ty} x2={PAD_L + PLOT_W} y2={ty}
                    stroke="#D1D8E4" strokeWidth="0.75" strokeDasharray="3,4" />
                  <text x={PAD_L - 4} y={ty + 3.5} textAnchor="end" fontSize="11.5" fontWeight="700" fill={TEXT_SEC}>
                    {tick.toFixed(2)}
                  </text>
                </g>
              );
            })}

            {/* Laser reference line at top (represents the laser plane) */}
            <line x1={PAD_L} y1={laserY} x2={PAD_L + PLOT_W} y2={laserY}
              stroke={GOLD} strokeWidth="2.5" strokeDasharray="7,4" opacity="0.95" />

            {/* LASER label — right side, aligned with laser line */}
            <text x={PAD_L + PLOT_W - 3} y={laserY - 5} textAnchor="end"
              fontSize="15" fontWeight="800" fill="#C47D0A" letterSpacing="1.5">
              {t('laserLabel')}
            </text>

            {/* Points: thin grade-rod line + dot */}
            {filtered.map((pt, i) => {
              const cx   = PAD_L + colW * i + colW / 2;
              const dotY = yFor(pt.engineeringFeet);
              const lineH = dotY - laserY - dotR;

              // Value label: above dot if near bottom, else below dot
              const nearBottom = dotY > baseY - valFontSz * 3;
              const valY = nearBottom ? dotY - dotR - 3 : dotY + dotR + valFontSz + 1;

              return (
                <g key={pt.id}>
                  {/* Subtle column guide */}
                  <line x1={cx} y1={PAD_T} x2={cx} y2={baseY}
                    stroke="#E2E8F4" strokeWidth="0.5" strokeDasharray="3,4" />

                  {/* Grade rod line from laser down to dot — darker, thicker */}
                  {lineH > 0 && (
                    <line x1={cx} y1={laserY} x2={cx} y2={dotY - dotR}
                      stroke={BLUE_MID} strokeWidth="2.5" opacity="0.85" />
                  )}

                  {/* Measurement dot — solid, higher contrast */}
                  <circle cx={cx} cy={dotY} r={dotR + 0.5} fill={BLUE} opacity="1" />
                  <circle cx={cx} cy={dotY} r={dotR - 0.5} fill={BLUE_ACC} opacity="1" />

                  {/* Rod reading value */}
                  <text x={cx} y={valY} textAnchor="middle"
                    fontSize={valFontSz} fontWeight="800" fill={NAVY}>
                    {pt.engineeringFeet.toFixed(2)}
                  </text>

                  {/* Point label below baseline */}
                  <text x={cx} y={baseY + 13} textAnchor="middle"
                    fontSize={lblFontSz} fontWeight="700" fill={TEXT_PRI}>
                    {pt.label}
                  </text>
                  {pt.pointName ? (() => {
                    const nameLines = wrapName(pt.pointName, maxNameChars);
                    const nameStartY = baseY + 13 + lblFontSz + 2;
                    return (
                      <text textAnchor="middle" fontSize={nameFontSz} fontWeight="700" fill={TEXT_SEC}>
                        {nameLines.map((line, li) => (
                          <tspan key={li} x={cx} y={nameStartY + li * (nameFontSz + 1.5)}>{line}</tspan>
                        ))}
                      </text>
                    );
                  })() : null}
                </g>
              );
            })}

            {/* Bottom baseline */}
            <line x1={PAD_L} y1={baseY} x2={PAD_L + PLOT_W} y2={baseY}
              stroke={NAVY} strokeWidth="1.5" />
          </svg>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLE POINT TAB  — list view + tap-to-detail
// ═══════════════════════════════════════════════════════════════════════════════
interface SinglePointTabProps {
  points:       SurveyPoint[];
  sets:         SurveySet[];
  projectId:    string;
  onEditPoint?: (pt: SurveyPoint) => void;
}


// ─── CSV export helper ────────────────────────────────────────────────────────
function exportPointsCSV(pts: SurveyPoint[], sets: SurveySet[]): void {
  const setMap: Record<string, SurveySet> = {};
  sets.forEach(s => { setMap[s.id] = s; });

  const headers = [
    'Label', 'Name', 'Type',
    'Rod Feet', 'Rod Inches', 'Rod Fraction', 'Engineering Feet',
    'BM Elevation (ft)', 'Elevation (ft)',
    'Set Label', 'Set Name',
    'GPS Lat', 'GPS Lon',
    'Created At',
  ];

  const rows = pts
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
    .map(pt => {
      const setObj = pt.setId ? setMap[pt.setId] : null;
      const hasBm  = (pt.bmElevation ?? 0) > 0;
      return [
        pt.label,
        pt.pointName ?? '',
        hasBm && setObj ? 'derived'
          : hasBm ? 'benchmark'
          : 'standalone',
        pt.rodFeet     ?? 0,
        pt.rodInches   ?? 0,
        pt.rodFractionLabel ?? '',
        pt.engineeringFeet.toFixed(4),
        hasBm ? (pt.bmElevation ?? 0).toFixed(4) : '',
        pt.elevation   != null ? pt.elevation.toFixed(4) : '',
        setObj?.setLabel ?? '',
        setObj?.name    ?? '',
        pt.createdLatitude  ?? '',
        pt.createdLongitude ?? '',
        pt.createdAt ? new Date(pt.createdAt).toISOString() : '',
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });

  const csv  = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `survey-points-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function SinglePointTab({ points, sets, projectId, onEditPoint }: SinglePointTabProps) {
  const { t, lang } = useLang();
  const { deletePoint } = useSurveyStore();

  const [search,       setSearch]       = useState('');
  const [rawIdx,        setRawIdx]        = useState<number | null>(null);
  const [showAllModal,  setShowAllModal]  = useState(false);
  const [viewDetailsPt, setViewDetailsPt] = useState<SurveyPoint | null>(null);

  // ── derived maps ──────────────────────────────────────────────────────────
  const setMap = useMemo(() => {
    const m: Record<string, SurveySet> = {};
    sets.forEach(s => { m[s.id] = s; });
    return m;
  }, [sets]);

  const typeMap = useMemo(() => resolvePointTypes(points, sets), [points, sets]);

  // Sorted + filtered list — used for both single-card nav and "View All" modal
  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...points]
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
      .filter(pt => {
        if (!q) return true;
        const setObj = pt.setId ? setMap[pt.setId] : null;
        return (
          pt.label.toLowerCase().includes(q) ||
          (pt.pointName ?? '').toLowerCase().includes(q) ||
          (pt.takenBy ?? '').toLowerCase().includes(q) ||
          (setObj?.name ?? '').toLowerCase().includes(q)
        );
      });
  }, [points, setMap, search]);

  // Default to most recently updated point
  const defaultIdx = useMemo(() => {
    if (sorted.length === 0) return 0;
    let best = 0;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].updatedAt > sorted[best].updatedAt) best = i;
    }
    return best;
  }, [sorted]);

  // Reset nav when search changes
  useEffect(() => { setRawIdx(null); }, [search]);

  const curIdx = rawIdx !== null
    ? Math.max(0, Math.min(rawIdx, sorted.length - 1))
    : defaultIdx;

  // ── date formatter ────────────────────────────────────────────────────────
  const fmtMs = (ms: number) =>
    new Date(ms).toLocaleDateString(lang === 'es' ? 'es-MX' : 'en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  // ── current point derived values ──────────────────────────────────────────
  const pt      = sorted[curIdx] ?? null;
  const ptType  = pt ? (typeMap.get(pt.id) ?? 'standalone') : 'standalone';
  const theme   = TYPE_THEME[ptType];
  const setObj  = pt?.setId ? setMap[pt.setId] : null;
  const hasBm   = (pt?.bmElevation ?? 0) > 0;

  const fif    = pt ? engToFIF(pt.engineeringFeet) : { feet: 0, inches: '0', frac: '0' };
  const rFeet  = pt?.rodFeet ?? fif.feet;
  const rInch  = pt?.rodInches != null ? String(pt.rodInches) : fif.inches;
  const rFrac  = (pt?.rodFractionLabel && pt.rodFractionLabel !== '0')
                 ? pt.rodFractionLabel : (fif.frac !== '0' ? fif.frac : '');

  const badgeLabel = ptType === 'benchmark' ? t('spBenchmarkBadge')
                   : ptType === 'derived'   ? t('spDerivedBadge')
                   : t('spStandaloneBadge');

  // ── View Details modal derived values ──────────────────────────────────────
  const dpType   = viewDetailsPt ? (typeMap.get(viewDetailsPt.id) ?? 'standalone') : 'standalone';
  const dpTheme  = TYPE_THEME[dpType];
  const dpSet    = viewDetailsPt?.setId ? setMap[viewDetailsPt.setId] : null;
  const dpHasBm  = (viewDetailsPt?.bmElevation ?? 0) > 0;
  const dpBadge  = dpType === 'benchmark' ? t('spBenchmarkBadge') : dpType === 'derived' ? t('spDerivedBadge') : t('spStandaloneBadge');
  const dpFif    = viewDetailsPt ? engToFIF(viewDetailsPt.engineeringFeet) : { feet: 0, inches: '0', frac: '0' };
  const dpRFeet  = viewDetailsPt?.rodFeet ?? dpFif.feet;
  const dpRInch  = viewDetailsPt?.rodInches != null ? String(viewDetailsPt.rodInches) : dpFif.inches;
  const dpRFrac  = (viewDetailsPt?.rodFractionLabel && viewDetailsPt.rodFractionLabel !== '0')
                    ? viewDetailsPt.rodFractionLabel : (dpFif.frac !== '0' ? dpFif.frac : '');
  const dpHasGps = viewDetailsPt?.createdLatitude != null && viewDetailsPt?.createdLongitude != null;

  const handleDeleteSingle = useCallback((delPt: SurveyPoint) => {
    if (!window.confirm(strings[lang].deletePointConfirmLabel(delPt.label, delPt.pointName))) return;
    const prevLen = sorted.length;
    deletePoint(projectId, delPt.id);
    setRawIdx(prev => {
      const newLen = prevLen - 1;
      if (newLen <= 0) return 0;
      return Math.min(prev ?? 0, newLen - 1);
    });
  }, [projectId, deletePoint, sorted.length]);

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' as const }}>

      {/* ── Compact top bar ── */}
      <div style={{ backgroundColor: CARD, borderBottom: `1px solid ${BORDER_S}`, padding: '5px 10px 6px', display: 'flex', flexDirection: 'column', gap: 5, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: TEXT_PRI, letterSpacing: 0.7, textTransform: 'uppercase' as const, flex: 1, minWidth: 0 }}>
            {points.length} {t('surveyPoints')}
          </span>
          {points.length > 0 && (
            <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
              <button
                title={t('csvExportLabel')}
                aria-label={t('csvExportLabel')}
                style={{ height: 28, padding: '0 10px', backgroundColor: 'rgba(26,122,63,0.10)', border: '1px solid rgba(26,122,63,0.35)', borderRadius: 6, fontSize: 12, fontWeight: 800, color: '#1A7A3F', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' as const }}
                onClick={() => exportPointsCSV(points, sets)}
              >
                {t('csvExportBtn')}
              </button>
              <button
                style={{ height: 28, padding: '0 12px', backgroundColor: BLUE_DEEP, border: `1px solid ${BLUE}`, borderRadius: 6, fontSize: 14, fontWeight: 800, color: BLUE_ACC, cursor: 'pointer', whiteSpace: 'nowrap' as const }}
                onClick={() => setShowAllModal(true)}
              >{t('viewAllPoints')}</button>
            </div>
          )}
        </div>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: TEXT_DIS, pointerEvents: 'none' }}>🔍</span>
          <input
            style={{ height: 38, backgroundColor: SURFACE, borderRadius: 6, border: `1.5px solid ${BORDER}`, padding: '0 36px 0 30px', fontSize: 15, color: TEXT_PRI, outline: 'none', boxSizing: 'border-box' as const, width: '100%' }}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('searchPlaceholder')}
            aria-label="Search survey points"
            type="search"
          />
          {search.length > 0 && (
            <button
              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', fontSize: 16, color: TEXT_DIS, cursor: 'pointer', padding: '4px', lineHeight: 1, display: 'flex', alignItems: 'center' }}
              onClick={() => setSearch('')}
              aria-label="Clear search"
            >✕</button>
          )}
        </div>
      </div>

      {/* ── Main scrollable body ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>

        {/* Empty state */}
        {sorted.length === 0 && (
          <div style={{ backgroundColor: CARD, borderRadius: 8, padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginTop: 8 }}>
            <span style={{ fontSize: 44 }}>📄</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: TEXT_PRI }}>
              {search ? t('noMatchingPoints') : t('noPointsRecorded')}
            </span>
            <span style={{ fontSize: 13, color: TEXT_SEC, textAlign: 'center', lineHeight: 1.5 }}>
              {search ? t('tryDifferentSearch') : t('addPointsToSee')}
            </span>
          </div>
        )}

        {/* ── Single point card (compact) ── */}
        {pt && (
          <div style={{ backgroundColor: CARD, borderRadius: 8, border: `1px solid ${BORDER}`, borderLeft: `4px solid ${theme.border}`, overflow: 'hidden' }}>

            {/* Identity row: label · name · badge · set */}
            <div style={{ padding: '10px 12px 8px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: NAVY, letterSpacing: 0.3 }}>{pt.label}</span>
              {pt.pointName && <span style={{ fontSize: 15, fontWeight: 700, color: TEXT_PRI }}>• {pt.pointName}</span>}
              <div style={{ borderRadius: 4, border: `1px solid ${theme.badgeBdr}`, backgroundColor: theme.badgeBg, padding: '2px 7px' }}>
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, color: theme.badgeTxt }}>{badgeLabel}</span>
              </div>
              {setObj && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 3, backgroundColor: BLUE_DEEP, borderRadius: 4, padding: '2px 7px' }}>
                  {setObj.setLabel && <span style={{ fontSize: 11, fontWeight: 800, color: BLUE_ACC }}>{setObj.setLabel}</span>}
                  <span style={{ fontSize: 11, fontWeight: 700, color: NAVY }}>{setObj.name}</span>
                </div>
              )}
            </div>

            {/* Action row: Edit | View Details | Delete */}
            <div style={{ padding: '0 12px 10px', display: 'flex', gap: 6 }}>
              {onEditPoint && (
                <button onClick={() => onEditPoint(pt)}
                  style={{ flex: 1, height: 32, backgroundColor: BLUE_DEEP, border: `1px solid ${BLUE}`, borderRadius: 6, fontSize: 13, fontWeight: 800, color: BLUE_ACC, cursor: 'pointer' }}
                >{t('edit')}</button>
              )}
              <button onClick={() => setViewDetailsPt(pt)}
                style={{ flex: 2, height: 32, backgroundColor: SURFACE, border: `1px solid ${BORDER_B}`, borderRadius: 6, fontSize: 13, fontWeight: 800, color: TEXT_SEC, cursor: 'pointer' }}
              >{t('viewDetailsBtn')}</button>
              <button onClick={() => handleDeleteSingle(pt)}
                style={{ flex: 1, height: 32, backgroundColor: 'rgba(231,76,60,0.08)', border: '1px solid rgba(231,76,60,0.30)', borderRadius: 6, fontSize: 13, fontWeight: 800, color: RED, cursor: 'pointer' }}
              >{t('delete')}</button>
            </div>
          </div>
        )}

        {/* ── Compact Prev / Next navigation ── */}
        {sorted.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              disabled={curIdx === 0}
              style={{ flex: 1, height: 32, backgroundColor: curIdx === 0 ? SURFACE : CARD, border: `1px solid ${curIdx === 0 ? BORDER : BLUE}`, borderRadius: 8, fontSize: 15, fontWeight: 800, color: curIdx === 0 ? TEXT_DIS : BLUE, cursor: curIdx === 0 ? 'default' : 'pointer', opacity: curIdx === 0 ? 0.4 : 1 }}
              onClick={() => setRawIdx(curIdx - 1)}
            >← {t('prevPoint')}</button>
            <span style={{ fontSize: 14, fontWeight: 800, color: TEXT_PRI, whiteSpace: 'nowrap' as const }}>
              {curIdx + 1}/{sorted.length}
            </span>
            <button
              disabled={curIdx === sorted.length - 1}
              style={{ flex: 1, height: 32, backgroundColor: curIdx === sorted.length - 1 ? SURFACE : CARD, border: `1px solid ${curIdx === sorted.length - 1 ? BORDER : BLUE}`, borderRadius: 8, fontSize: 15, fontWeight: 800, color: curIdx === sorted.length - 1 ? TEXT_DIS : BLUE, cursor: curIdx === sorted.length - 1 ? 'default' : 'pointer', opacity: curIdx === sorted.length - 1 ? 0.4 : 1 }}
              onClick={() => setRawIdx(curIdx + 1)}
            >{t('nextPoint')} →</button>
          </div>
        )}

        {/* Ad space */}
        <div style={{ height: 54, borderTop: `1px dashed ${BORDER_B}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 4 }}>
          <span style={{ fontSize: 10, color: TEXT_DIS, letterSpacing: 0.8, fontWeight: 600 }}>AD SPACE</span>
        </div>
      </div>

      {/* ── Point Detail Modal ── */}
      {viewDetailsPt && (
        <div
          style={{ position: 'fixed' as const, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 16px', boxSizing: 'border-box' as const }}
          onClick={() => setViewDetailsPt(null)}
        >
          <div
            className="anp-modal-in"
            style={{ backgroundColor: CARD, borderRadius: 18, width: '100%', maxWidth: 440, maxHeight: '88vh', display: 'flex', flexDirection: 'column' as const, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.28)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div style={{ backgroundColor: NAVY, padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, borderLeft: `5px solid ${dpTheme.border}` }}>
              <div>
                <span style={{ color: '#FFFFFF', fontSize: 18, fontWeight: 800 }}>{viewDetailsPt.label}</span>
                {viewDetailsPt.pointName && (
                  <span style={{ color: 'rgba(255,255,255,0.72)', fontSize: 14, fontWeight: 600, marginLeft: 8 }}>• {viewDetailsPt.pointName}</span>
                )}
              </div>
              <button onClick={() => setViewDetailsPt(null)}
                style={{ background: 'none', border: 'none', color: '#FFFFFF', fontSize: 24, fontWeight: 700, lineHeight: 1, cursor: 'pointer', padding: '4px 6px', opacity: 0.85 }}
                aria-label="Close"
              >✕</button>
            </div>

            {/* Scrollable body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>

              {/* Type + Set badges */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
                <div style={{ borderRadius: 6, border: `1px solid ${dpTheme.badgeBdr}`, backgroundColor: dpTheme.badgeBg, padding: '4px 10px' }}>
                  <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.8, color: dpTheme.badgeTxt }}>{dpBadge}</span>
                </div>
                {dpSet && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, backgroundColor: BLUE_DEEP, borderRadius: 6, padding: '4px 10px', border: `1px solid ${BLUE}` }}>
                    {dpSet.setLabel && <span style={{ fontSize: 12, fontWeight: 800, color: BLUE_ACC }}>{dpSet.setLabel} ·</span>}
                    <span style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>{dpSet.name}</span>
                  </div>
                )}
              </div>

              {/* Rod Reading card */}
              <div style={{ backgroundColor: SURFACE, borderRadius: 10, padding: '12px 14px', border: `1px solid ${BORDER}` }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: NAVY, letterSpacing: 1, textTransform: 'uppercase' as const, marginBottom: 10 }}>{t('rodReading')}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: TEXT_SEC, letterSpacing: 0.5, textTransform: 'uppercase' as const, marginBottom: 4 }}>{t('spFeetInches')}</div>
                    <StackedFIFSpan feet={dpRFeet} inches={dpRInch} frac={dpRFrac} color={TEXT_PRI} size={18} />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: TEXT_SEC, letterSpacing: 0.5, textTransform: 'uppercase' as const, marginBottom: 4 }}>{t('spDecimalFeet')}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: TEXT_PRI, fontFamily: 'monospace' }}>{viewDetailsPt.engineeringFeet.toFixed(2)} ft</div>
                  </div>
                </div>
              </div>

              {/* Elevation card */}
              {dpHasBm && (
                <div style={{ backgroundColor: dpType === 'benchmark' ? 'rgba(146,97,10,0.08)' : SURFACE, borderRadius: 10, padding: '12px 14px', border: `1px solid ${dpType === 'benchmark' ? 'rgba(146,97,10,0.28)' : BORDER}` }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: NAVY, letterSpacing: 1, textTransform: 'uppercase' as const, marginBottom: 6 }}>{t('elevation')}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: dpType === 'benchmark' ? '#92610A' : TEXT_PRI, fontFamily: 'monospace' }}>{(viewDetailsPt.bmElevation ?? 0).toFixed(2)} ft</div>
                </div>
              )}

              {/* Dates card */}
              <div style={{ backgroundColor: SURFACE, borderRadius: 10, padding: '12px 14px', border: `1px solid ${BORDER}` }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: TEXT_SEC, letterSpacing: 0.5, textTransform: 'uppercase' as const, marginBottom: 4 }}>{t('spCreated')}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: TEXT_PRI }}>{fmtMs(viewDetailsPt.createdAt)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: TEXT_SEC, letterSpacing: 0.5, textTransform: 'uppercase' as const, marginBottom: 4 }}>{t('spLastUpdated')}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: TEXT_PRI }}>{fmtMs(viewDetailsPt.updatedAt)}</div>
                  </div>
                </div>
              </div>

              {/* GPS card */}
              {dpHasGps && (
                <div style={{ backgroundColor: SURFACE, borderRadius: 10, padding: '12px 14px', border: `1px solid ${BORDER}` }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: NAVY, letterSpacing: 1, textTransform: 'uppercase' as const, marginBottom: 8 }}>{t('location')}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: TEXT_SEC, letterSpacing: 0.5, textTransform: 'uppercase' as const, marginBottom: 4 }}>{t('spLatitude')}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: TEXT_PRI, fontFamily: 'monospace' }}>{viewDetailsPt.createdLatitude?.toFixed(6)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: TEXT_SEC, letterSpacing: 0.5, textTransform: 'uppercase' as const, marginBottom: 4 }}>{t('spLongitude')}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: TEXT_PRI, fontFamily: 'monospace' }}>{viewDetailsPt.createdLongitude?.toFixed(6)}</div>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* ── View All Modal (centered overlay) ── */}
      {showAllModal && (
        <div
          style={{ position: 'fixed' as const, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px', boxSizing: 'border-box' as const }}
          onClick={() => setShowAllModal(false)}
        >
          <div
            className="anp-modal-in"
            style={{ backgroundColor: CARD, borderRadius: 18, width: '100%', maxWidth: 440, maxHeight: '85vh', display: 'flex', flexDirection: 'column' as const, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.28)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Navy header */}
            <div style={{ backgroundColor: NAVY, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <span style={{ color: '#FFFFFF', fontSize: 18, fontWeight: 800, lineHeight: 1.2 }}>
                {t('allSurveyPoints')}
              </span>
              <button onClick={() => setShowAllModal(false)}
                style={{ background: 'none', border: 'none', color: '#FFFFFF', fontSize: 24, fontWeight: 700, lineHeight: 1, cursor: 'pointer', padding: '4px 6px', flexShrink: 0, opacity: 0.85 }}
                aria-label="Close"
              >✕</button>
            </div>
            {/* Modal list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {sorted.map((mpt, i) => {
                const mType  = typeMap.get(mpt.id) ?? 'standalone';
                const mTheme = TYPE_THEME[mType];
                const mSet   = mpt.setId ? setMap[mpt.setId] : null;
                const mBadge = mType === 'benchmark' ? t('spBenchmarkBadge') : mType === 'derived' ? t('spDerivedBadge') : t('spStandaloneBadge');
                const isCur  = curIdx === i;
                return (
                  <div key={mpt.id}
                    style={{ backgroundColor: isCur ? '#EEF4FF' : SURFACE, borderRadius: 8, border: `1px solid ${isCur ? BLUE : BORDER}`, borderLeft: `3px solid ${mTheme.border}`, padding: '7px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                    onClick={() => { setRawIdx(i); setShowAllModal(false); }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Row 1: PT label + point name */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                        <span style={{ fontSize: 18, fontWeight: 900, color: BLUE_ACC }}>{mpt.label}</span>
                        {mpt.pointName && <span style={{ fontSize: 15, fontWeight: 700, color: TEXT_PRI }}>• {mpt.pointName}</span>}
                      </div>
                      {/* Row 2: badges + values */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' as const }}>
                        <div style={{ borderRadius: 4, border: `1px solid ${mTheme.badgeBdr}`, backgroundColor: mTheme.badgeBg, padding: '2px 7px' }}>
                          <span style={{ fontSize: 13, fontWeight: 800, color: mTheme.badgeTxt }}>{mBadge}</span>
                        </div>
                        {mSet && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 3, backgroundColor: BLUE_DEEP, borderRadius: 4, padding: '2px 7px' }}>
                            {mSet.setLabel && <span style={{ fontSize: 13, fontWeight: 800, color: BLUE_ACC }}>{mSet.setLabel}</span>}
                            <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{mSet.name}</span>
                          </div>
                        )}
                        <span style={{ fontSize: 14, fontWeight: 700, color: TEXT_PRI, fontFamily: 'monospace' }}>{mpt.engineeringFeet.toFixed(2)} ft</span>
                        {(mpt.bmElevation ?? 0) > 0 && (
                          <span style={{ fontSize: 14, fontWeight: 700, color: TEXT_SEC, fontFamily: 'monospace' }}>· {(mpt.bmElevation ?? 0).toFixed(2)} ft elev</span>
                        )}
                      </div>
                    </div>
                    {isCur && <span style={{ fontSize: 20, color: BLUE, flexShrink: 0 }}>✓</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// VIEW POINTS SCREEN — gold sub-tab shell
// ═══════════════════════════════════════════════════════════════════════════════
export default function ViewPointsScreen({ projectId, compareFromId, compareToId }: Props) {
  const [activeTab, setActiveTab] = useState<PointsTab>('compare');
  const [fromId,    setFromId]    = useState<string | null>(null);
  const [toId,      setToId]      = useState<string | null>(null);

  // Auto-load comparison when triggered from Point+ tab
  useEffect(() => {
    if (compareFromId) {
      setFromId(compareFromId);
      setToId(compareToId ?? null);
      setActiveTab('compare');
    }
  }, [compareFromId, compareToId]);

  const { t } = useLang();
  const { getPoints, getSets } = useSurveyStore();
  const points = getPoints(projectId);
  const sets   = getSets(projectId);

  // 'single' intentionally omitted — accessed via ⋮ button in the Point⊕ tab
  const SUB_TABS: { id: PointsTab; label: string }[] = [
    { id: 'compare', label: t('comparePoints') },
    { id: 'graph',   label: t('graph')         },
  ];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Segmented sub-tab control */}
      <div style={{ display: 'flex', backgroundColor: '#EEF4FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: 3, margin: '6px 8px', gap: 3, flexShrink: 0 }}>
        {SUB_TABS.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              style={{
                flex: 1, height: 34, borderRadius: 7,
                border: 'none',
                backgroundColor: isActive ? NAVY : 'transparent',
                color: isActive ? '#FFFFFF' : '#6B7280',
                fontSize: 15, fontWeight: isActive ? 700 : 600,
                cursor: 'pointer',
                boxShadow: isActive ? '0 1px 4px rgba(20,58,99,0.30)' : 'none',
                whiteSpace: 'nowrap', overflow: 'hidden',
                transition: 'background-color 0.2s, color 0.2s, box-shadow 0.2s',
              }}
              onClick={() => setActiveTab(tab.id)}
            >{tab.label}</button>
          );
        })}
      </div>

      {/* Sub-tab content — permanently mounted, hidden when inactive */}
      <div style={{ flex: 1, overflow: 'hidden', display: activeTab === 'compare' ? 'flex' : 'none', flexDirection: 'column' }}>
        <CompareTab
          projectId={projectId}
          points={points}
          sets={sets}
          fromId={fromId}
          toId={toId}
          setFromId={setFromId}
          setToId={setToId}
        />
      </div>
      <div style={{ flex: 1, overflow: 'hidden', display: activeTab === 'graph' ? 'flex' : 'none', flexDirection: 'column' }}>
        <GraphTab points={points} sets={sets} />
      </div>
    </div>
  );
}
