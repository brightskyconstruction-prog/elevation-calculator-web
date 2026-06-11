import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useSurveyStore } from '../stores/surveyStore';
import { SurveyPoint, SurveySet, PointsTab } from '../types';
import { useLang } from '../LangContext';
import { strings } from '../i18n';

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
  onEditPoint?:   (pt: SurveyPoint) => void;
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
// SELECT MODAL  (set-grouped two-point picker)
// ═══════════════════════════════════════════════════════════════════════════════
interface SelectModalProps {
  visible:  boolean;
  points:   SurveyPoint[];
  sets:     SurveySet[];
  tempA:    string | null;
  tempB:    string | null;
  onSelect: (id: string) => void;
  onGo:     () => void;
  onClose:  () => void;
}

function SelectModal({ visible, points, sets, tempA, tempB, onSelect, onGo, onClose }: SelectModalProps) {
  const { t } = useLang();
  const [setIdx, setSetIdx] = useState(0);

  // Build groups
  const groups = useMemo(() => {
    const gs: Array<{ label: string; setLabel: string; pts: SurveyPoint[]; createdAt?: number; createdBy?: string }> = [];
    sets.forEach(s => {
      const pts = points.filter(p => p.setId === s.id);
      const creator = pts.find(p => p.takenBy)?.takenBy;
      if (pts.length > 0) gs.push({ label: s.name, setLabel: s.setLabel ?? '', pts, createdAt: s.createdAt, createdBy: creator });
    });
    const unset = points.filter(p => !p.setId);
    if (unset.length > 0) gs.unshift({ label: 'No Set', setLabel: '', pts: unset });
    return gs;
  }, [points, sets]);

  useEffect(() => { if (visible) setSetIdx(0); }, [visible]);

  const totalGroups = groups.length;
  const safeIdx     = Math.min(setIdx, Math.max(0, totalGroups - 1));
  const current     = groups[safeIdx];
  const canGo       = !!(tempA && tempB);
  const selCount    = [tempA, tempB].filter(Boolean).length;

  if (!visible) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'flex-end', zIndex: 200 }}>
      <div style={{ width: '100%', maxWidth: 480, margin: '0 auto', backgroundColor: CARD, borderRadius: '20px 20px 0 0', padding: '4px 16px 28px', display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '78vh' }}>
        {/* Handle */}
        <div style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: BORDER_B, marginTop: 10 }} />
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: TEXT_PRI, textAlign: 'center' }}>{t('selectTwoPoints')}</h3>

        {/* Set navigation */}
        {totalGroups > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              style={{ width: 34, height: 34, borderRadius: 6, backgroundColor: SURFACE, border: `1px solid ${BORDER}`, fontSize: 20, color: TEXT_PRI, cursor: safeIdx === 0 ? 'default' : 'pointer', opacity: safeIdx === 0 ? 0.25 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, flexShrink: 0 }}
              onClick={() => setSetIdx(Math.max(0, safeIdx - 1))}
              disabled={safeIdx === 0}
            >‹</button>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
              {current?.setLabel ? (
                <div style={{ backgroundColor: BLUE, borderRadius: 3, padding: '1px 6px' }}>
                  <span style={{ fontSize: 9, fontWeight: 800, color: '#fff', letterSpacing: 0.5 }}>{current.setLabel}</span>
                </div>
              ) : null}
              <span style={{ fontSize: 14, fontWeight: 700, color: TEXT_PRI, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{current?.label ?? '—'}</span>
              <span style={{ fontSize: 11, color: TEXT_DIS }}>{safeIdx + 1} / {totalGroups}</span>
              {current?.createdAt ? (
                <span style={{ fontSize: 9, color: TEXT_DIS, textAlign: 'center', marginTop: 1 }}>
                  {new Date(current.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  {current.createdBy ? `  ·  ${current.createdBy}` : ''}
                </span>
              ) : null}
            </div>

            <button
              style={{ width: 34, height: 34, borderRadius: 6, backgroundColor: SURFACE, border: `1px solid ${BORDER}`, fontSize: 20, color: TEXT_PRI, cursor: safeIdx >= totalGroups - 1 ? 'default' : 'pointer', opacity: safeIdx >= totalGroups - 1 ? 0.25 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, flexShrink: 0 }}
              onClick={() => setSetIdx(Math.min(totalGroups - 1, safeIdx + 1))}
              disabled={safeIdx >= totalGroups - 1}
            >›</button>
          </div>
        )}

        {/* Dots */}
        {totalGroups > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 5 }}>
            {groups.map((_, i) => (
              <div
                key={i}
                style={{ height: 7, width: i === safeIdx ? 14 : 7, borderRadius: 4, backgroundColor: i === safeIdx ? BLUE_ACC : BORDER, cursor: 'pointer', transition: 'width 0.15s' }}
                onClick={() => setSetIdx(i)}
              />
            ))}
          </div>
        )}

        {/* Points list */}
        <div style={{ maxHeight: 230, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {(current?.pts ?? []).length === 0 ? (
            <p style={{ textAlign: 'center', color: TEXT_DIS, fontSize: 13, padding: 16 }}>{t('noPointsInSet')}</p>
          ) : (current?.pts ?? []).map(pt => {
            const isA = tempA === pt.id;
            const isB = tempB === pt.id;
            const sel = isA || isB;
            return (
              <div
                key={pt.id}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 4px', borderRadius: 6, backgroundColor: sel ? BLUE_DEEP : 'transparent', cursor: 'pointer' }}
                onClick={() => onSelect(pt.id)}
              >
                {/* Selection circle */}
                <div style={{
                  width: 22, height: 22, borderRadius: 11, border: `1.5px solid ${isA ? BLUE : isB ? GREEN : BORDER}`,
                  backgroundColor: isA ? BLUE : isB ? GREEN : SURFACE,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  {(isA || isB) && <span style={{ fontSize: 10, fontWeight: 800, color: '#fff' }}>{isA ? '1' : '2'}</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: sel ? BLUE_ACC : TEXT_PRI, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {pt.pointName || pt.label}
                  </div>
                  <div style={{ fontSize: 11, color: TEXT_DIS, marginTop: 1 }}>
                    {pt.label}{'  ·  '}{pt.bmElevation > 0 ? pt.bmElevation.toFixed(2) : pt.engineeringFeet.toFixed(2)} ft
                  </div>
                </div>
                <span style={{ fontSize: 11, color: TEXT_SEC, fontFamily: 'monospace' }}>{pt.engineeringFeet.toFixed(2)}</span>
              </div>
            );
          })}
        </div>

        {/* Selection count pill */}
        <div style={{ backgroundColor: RAISED, borderRadius: 4, padding: '6px 12px', textAlign: 'center', border: `1px solid ${BORDER}` }}>
          <span style={{ fontSize: 11, color: TEXT_SEC, fontWeight: 600 }}>
            {selCount === 0 ? t('tapTwoPoints') : selCount === 1 ? t('oneOfTwo') : t('twoSelected')}
          </span>
        </div>

        {/* Go button */}
        <button
          style={{ height: 46, backgroundColor: BLUE, border: 'none', borderRadius: 8, color: '#fff', fontSize: 16, fontWeight: 700, letterSpacing: 0.5, cursor: canGo ? 'pointer' : 'default', opacity: canGo ? 1 : 0.35 }}
          onClick={onGo}
          disabled={!canGo}
        >{t('goBtn')}</button>

        {/* Cancel button */}
        <button
          style={{ height: 40, backgroundColor: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT_SEC, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          onClick={onClose}
        >{t('cancel')}</button>
      </div>
    </div>
  );
}

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
      <div style={{ position: 'relative', width: '100%', maxWidth: 480, margin: '0 auto', backgroundColor: CARD, borderRadius: '20px 20px 0 0', padding: '4px 16px 32px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Handle */}
        <div style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: BORDER_B, marginTop: 10 }} />
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: BLUE_ACC, letterSpacing: 0.4 }}>
            {goalField === 'rod' ? t('goalHeightTitle') : t('goalElevTitle')}{'  ·  '}{goalPt.pointName ?? goalPt.label}
          </span>
          <button style={{ background: 'none', border: 'none', fontSize: 16, color: TEXT_DIS, cursor: 'pointer', padding: '0 0 0 8px' }} onClick={onClose}>✕</button>
        </div>

        {/* Current value — full-width dark box, both formats */}
        <div style={{ backgroundColor: '#1A2D35', borderRadius: 8, padding: '10px 14px' }}>
          <span style={{ fontSize: 8, fontWeight: 800, color: 'rgba(255,255,255,0.55)', letterSpacing: 0.5, textTransform: 'uppercase' }}>
            {goalField === 'rod' ? t('currentRodReading') : t('currentElevation')}
          </span>
          <div style={{ display: 'flex', gap: 14, marginTop: 6, alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={{ fontSize: 8, fontWeight: 700, color: 'rgba(255,255,255,0.45)', letterSpacing: 0.4 }}>{t('goalCurrentDecFt')}</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
                <span style={{ fontSize: 21, fontWeight: 700, color: '#fff', fontFamily: 'monospace' }}>{existingVal.toFixed(2)}</span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>ft</span>
              </div>
            </div>
            <div style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.18)', alignSelf: 'stretch' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={{ fontSize: 8, fontWeight: 700, color: 'rgba(255,255,255,0.45)', letterSpacing: 0.4 }}>{t('goalCurrentFIF')}</span>
              <span style={{ fontSize: 17, fontWeight: 700, color: 'rgba(255,255,255,0.88)', fontFamily: 'monospace' }}>{exFIFStr}</span>
            </div>
          </div>
        </div>

        {/* Format toggle */}
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            style={{ flex: 1, height: 30, backgroundColor: inputMode === 'dec' ? BLUE_ACC : 'rgba(30,87,153,0.08)', border: `1.5px solid ${inputMode === 'dec' ? BLUE_ACC : BORDER}`, borderRadius: 6, fontSize: 11, fontWeight: 700, color: inputMode === 'dec' ? '#fff' : TEXT_SEC, cursor: 'pointer' }}
            onClick={() => handleSwitchMode('dec')}
          >{t('goalInputDec')}</button>
          <button
            style={{ flex: 1, height: 30, backgroundColor: inputMode === 'fif' ? BLUE_ACC : 'rgba(30,87,153,0.08)', border: `1.5px solid ${inputMode === 'fif' ? BLUE_ACC : BORDER}`, borderRadius: 6, fontSize: 11, fontWeight: 700, color: inputMode === 'fif' ? '#fff' : TEXT_SEC, cursor: 'pointer' }}
            onClick={() => handleSwitchMode('fif')}
          >{t('goalInputFIF')}</button>
        </div>

        {/* Goal label */}
        <span style={{ fontSize: 8, fontWeight: 800, color: BLUE_ACC, letterSpacing: 0.5, textTransform: 'uppercase', textAlign: 'center', marginBottom: -6 }}>
          {goalField === 'rod' ? t('goalRodReading') : t('goalElevInput')}
        </span>

        {/* Decimal input */}
        {inputMode === 'dec' && (
          <input
            style={{ width: '100%', height: 52, backgroundColor: '#1A2D35', borderRadius: 8, border: `2px solid ${BLUE_ACC}`, fontSize: 22, fontWeight: 700, color: '#fff', textAlign: 'center', outline: 'none', boxSizing: 'border-box' }}
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
              <span style={{ fontSize: 8, fontWeight: 800, color: BLUE_ACC, textAlign: 'center', letterSpacing: 0.4 }}>{t('feetLabel')}</span>
              <input
                style={{ width: '100%', height: 48, backgroundColor: '#1A2D35', borderRadius: 6, border: `2px solid ${BLUE_ACC}`, fontSize: 20, fontWeight: 700, color: '#fff', textAlign: 'center', outline: 'none', boxSizing: 'border-box' }}
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
              <span style={{ fontSize: 8, fontWeight: 800, color: BLUE_ACC, textAlign: 'center', letterSpacing: 0.4 }}>{t('inchesLabel')}</span>
              <select
                style={{ width: '100%', height: 48, backgroundColor: '#1A2D35', borderRadius: 6, border: `2px solid ${BLUE_ACC}`, fontSize: 18, fontWeight: 700, color: '#fff', textAlign: 'center', outline: 'none', boxSizing: 'border-box' }}
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
              <span style={{ fontSize: 8, fontWeight: 800, color: BLUE_ACC, textAlign: 'center', letterSpacing: 0.4 }}>{t('fracLabel')}</span>
              <select
                style={{ width: '100%', height: 48, backgroundColor: '#1A2D35', borderRadius: 6, border: `2px solid ${BLUE_ACC}`, fontSize: 13, fontWeight: 700, color: '#fff', textAlign: 'center', outline: 'none', boxSizing: 'border-box' }}
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
          <div style={{ borderRadius: 6, padding: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, border: `1.5px solid ${diffBdr}`, backgroundColor: diffBg }}>
            <span style={{ fontSize: 8, fontWeight: 800, color: TEXT_DIS, letterSpacing: 0.5, textTransform: 'uppercase' }}>{t('difference')}</span>
            <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: 0.3, textAlign: 'center', color: diffClr }}>
              {goalDiffSigned > 0 ? '+' : ''}{goalDiffSigned.toFixed(2)} ft{'  '}
              {goalDiffSigned >  0.00005 ? t('fillRequired') :
               goalDiffSigned < -0.00005 ? t('cutRequired') : t('atGrade')}
            </span>
          </div>
        )}

        {/* Submit */}
        <button
          style={{ height: 50, backgroundColor: canSubmit ? BLUE : SURFACE, border: 'none', borderRadius: 8, color: canSubmit ? '#fff' : TEXT_DIS, fontSize: 14, fontWeight: 700, letterSpacing: 0.3, cursor: canSubmit ? 'pointer' : 'default', opacity: canSubmit ? 1 : 0.35 }}
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
  const [showModal,     setShowModal]     = useState(false);
  const [tempA,         setTempA]         = useState<string | null>(null);
  const [tempB,         setTempB]         = useState<string | null>(null);
  const [selA,          setSelA]          = useState<string | null>(fromId);
  const [selB,          setSelB]          = useState<string | null>(toId);

  useEffect(() => {
    if (fromId) {
      setSelA(fromId);
      setSelB(toId ?? null);
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

  const ptA = selA ? (points.find(p => p.id === selA) ?? null) : null;
  const ptB = selB ? (points.find(p => p.id === selB) ?? null) : null;
  const hasSelection = !!(ptA && ptB);

  const displayA = ptA ? (ptA.pointName ? `${ptA.label} (${ptA.pointName})` : ptA.label) : '';
  const displayB = ptB ? (ptB.pointName ? `${ptB.label} (${ptB.pointName})` : ptB.label) : '';
  const diff     = ptA && ptB ? ptA.engineeringFeet - ptB.engineeringFeet : null;
  const absDiff  = diff != null ? Math.abs(diff) : null;
  const dirWord  = diff != null ? (Math.abs(diff) < 0.00005 ? t('dirSameLevel') : diff > 0 ? t('dirAbove') : t('dirBelow')) : '';
  const compColor= diff != null ? (Math.abs(diff) < 0.00005 ? BLUE_ACC : diff > 0 ? GREEN : RED) : TEXT_PRI;
  const compText = ptA && ptB ? strings[lang].comparisonSentence(displayA, absDiff?.toFixed(2) ?? '0', dirWord, displayB) : '';

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
    }
    setShowModal(false);
  };

  const handleSwap = () => {
    const a = selA, b = selB;
    setSelA(b); setSelB(a);
    setFromId(b ?? null); setToId(a ?? null);
  };

  const handleOpenModal = () => { setTempA(selA); setTempB(selB); setShowModal(true); };

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
  const diffWord  = (d: number) => d > 0.00005 ? t('dirAbove') : d < -0.00005 ? t('dirBelow') : t('atGrade');

  // Render one data row + optional difference sub-row
  const renderRow = (pt: SurveyPoint, role: 'A' | 'B') => {
    const rodKey  = `${pt.id}-rod`;
    const elevKey = `${pt.id}-elev`;
    const rodGoal  = goalValues[rodKey];
    const elevGoal = goalValues[elevKey];
    const rodDiff  = rodGoal  != null ? rodGoal  - pt.engineeringFeet : null;
    const elevBm   = pt.bmElevation > 0 ? pt.bmElevation : null;
    const elevDiff = (elevGoal != null && elevBm != null) ? elevGoal - elevBm : null;
    const rowBg = role === 'A' ? 'rgba(47,127,191,0.07)' : 'rgba(31,138,77,0.07)';
    const roleBg = role === 'A' ? BLUE : GREEN;

    return (
      <React.Fragment key={pt.id}>
        {/* Main data row */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '8px 8px', backgroundColor: rowBg }}>
          {/* Col 1: Point */}
          <div style={{ flex: 3, display: 'flex', alignItems: 'center', paddingRight: 8 }}>
            <div style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: roleBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginRight: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: '#fff' }}>{role}</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: TEXT_PRI, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pt.pointName || pt.label}</div>
              {pt.pointName && <div style={{ fontSize: 10, color: TEXT_DIS, marginTop: 1 }}>{pt.label}</div>}
            </div>
          </div>

          {/* Vertical divider */}
          <div style={{ width: 1, backgroundColor: '#D5D8DE', alignSelf: 'stretch', flexShrink: 0 }} />

          {/* Col 2: Rod Reading */}
          <div style={{ flex: 2.8, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, padding: '0 8px' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: TEXT_PRI, fontFamily: 'monospace' }}>{pt.engineeringFeet.toFixed(2)}</span>
            {rodGoal != null ? (
              <div
                style={{ borderRadius: 4, backgroundColor: 'rgba(31,138,77,0.13)', border: `1.5px solid ${GREEN}`, padding: '3px 5px', cursor: 'pointer', textAlign: 'center', minWidth: 52 }}
                onClick={() => openGoal(pt.id, 'rod')}
              >
                <div style={{ fontSize: 7, fontWeight: 800, color: GREEN, letterSpacing: 0.4, textTransform: 'uppercase' }}>{t('goalHeight')}</div>
                <div style={{ fontSize: 12, fontWeight: 800, color: GREEN, fontFamily: 'monospace' }}>{rodGoal.toFixed(2)} ft</div>
              </div>
            ) : (
              <div
                style={{ borderRadius: 4, backgroundColor: SURFACE, border: `1px solid ${BORDER}`, padding: '4px 6px', cursor: 'pointer', textAlign: 'center', marginTop: 3 }}
                onClick={() => openGoal(pt.id, 'rod')}
              >
                <span style={{ fontSize: 8, fontWeight: 800, color: TEXT_SEC, letterSpacing: 0.2, whiteSpace: 'nowrap' }}>{t('goalHeightBtn')}</span>
              </div>
            )}
          </div>

          {/* Vertical divider */}
          <div style={{ width: 1, backgroundColor: '#D5D8DE', alignSelf: 'stretch', flexShrink: 0 }} />

          {/* Col 3: Elevation */}
          <div style={{ flex: 2.8, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, paddingLeft: 8 }}>
            {pt.bmElevation > 0 ? (
              <>
                <span style={{ fontSize: 12, fontWeight: 700, color: TEXT_PRI, fontFamily: 'monospace' }}>{pt.bmElevation.toFixed(2)}</span>
                {elevGoal != null ? (
                  <div
                    style={{ borderRadius: 4, backgroundColor: 'rgba(31,138,77,0.13)', border: `1.5px solid ${GREEN}`, padding: '3px 5px', cursor: 'pointer', textAlign: 'center', minWidth: 52 }}
                    onClick={() => openGoal(pt.id, 'elev')}
                  >
                    <div style={{ fontSize: 7, fontWeight: 800, color: GREEN, letterSpacing: 0.4, textTransform: 'uppercase' }}>{t('goalElev')}</div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: GREEN, fontFamily: 'monospace' }}>{elevGoal.toFixed(2)} ft</div>
                  </div>
                ) : (
                  <div
                    style={{ borderRadius: 4, backgroundColor: SURFACE, border: `1px solid ${BORDER}`, padding: '4px 6px', cursor: 'pointer', textAlign: 'center', marginTop: 3 }}
                    onClick={() => openGoal(pt.id, 'elev')}
                  >
                    <span style={{ fontSize: 8, fontWeight: 800, color: TEXT_SEC, letterSpacing: 0.2, whiteSpace: 'nowrap' }}>{t('goalElevBtn')}</span>
                  </div>
                )}
              </>
            ) : (
              <span style={{ fontSize: 12, fontWeight: 700, color: TEXT_PRI, fontFamily: 'monospace' }}>—</span>
            )}
          </div>
        </div>

        {/* Difference sub-row */}
        {(rodDiff != null || elevDiff != null) && (
          <div style={{ display: 'flex', alignItems: 'center', padding: '5px 8px', backgroundColor: rowBg, borderTop: `1px solid ${BORDER_S}88` }}>
            <div style={{ flex: 3, paddingRight: 8 }}>
              <span style={{ fontSize: 7, fontWeight: 800, color: TEXT_DIS, letterSpacing: 0.4, textTransform: 'uppercase' }}>{t('difference')}</span>
            </div>
            <div style={{ width: 1, backgroundColor: '#D5D8DE', alignSelf: 'stretch' }} />
            <div style={{ flex: 2.8, display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', padding: '0 8px' }}>
              {rodDiff != null && (
                <span style={{ fontSize: 12, fontWeight: 700, lineHeight: '15px', textAlign: 'right', color: diffColor(rodDiff) }}>
                  {rodDiff > 0 ? '+' : ''}{rodDiff.toFixed(2)} ft {diffWord(rodDiff)} {t('diffRodLabel')}
                </span>
              )}
            </div>
            <div style={{ width: 1, backgroundColor: '#D5D8DE', alignSelf: 'stretch' }} />
            <div style={{ flex: 2.8, display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', paddingLeft: 8 }}>
              {elevDiff != null && (
                <span style={{ fontSize: 12, fontWeight: 700, lineHeight: '15px', textAlign: 'right', color: diffColor(elevDiff) }}>
                  {elevDiff > 0 ? '+' : ''}{elevDiff.toFixed(2)} ft {diffWord(elevDiff)} {t('diffElevLabel')}
                </span>
              )}
            </div>
          </div>
        )}
      </React.Fragment>
    );
  };

  return (
    <div style={{ flex: 1, backgroundColor: SCREEN, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {!hasSelection ? (
        /* Empty state */
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
          <span style={{ fontSize: 40 }}>📐</span>
          <span style={{ fontSize: 18, fontWeight: 700, color: TEXT_PRI, textAlign: 'center' }}>{t('compareTwoPoints')}</span>
          <span style={{ fontSize: 13, color: TEXT_SEC, textAlign: 'center', lineHeight: 1.5, maxWidth: 280 }}>
            {t('compareDesc')}
          </span>
          <button
            style={{ height: 50, backgroundColor: BLUE, border: 'none', borderRadius: 8, padding: '0 24px', color: '#fff', fontSize: 14, fontWeight: 700, letterSpacing: 0.3, cursor: 'pointer', marginTop: 8 }}
            onClick={handleOpenModal}
          >{t('selectTwoPointsBtn')}</button>
        </div>
      ) : (
        /* Comparison view */
        <div style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Comparison card */}
          <div style={{ backgroundColor: CARD, borderRadius: 8, border: `1px solid ${BORDER}`, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.55, color: compColor }}>{compText}</span>
            <div style={{ display: 'flex', alignItems: 'stretch', gap: 8 }}>
              <button
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, backgroundColor: BLUE_DEEP, border: `1px solid ${BLUE}`, borderRadius: 6, padding: '0 12px', height: 44, minWidth: 60, cursor: 'pointer' }}
                onClick={handleSwap}
              >
                <span style={{ fontSize: 17, color: BLUE_ACC, fontWeight: 700, lineHeight: 1 }}>⇆</span>
                <span style={{ fontSize: 9, color: BLUE_ACC, fontWeight: 800, letterSpacing: 0.5 }}>{t('swapPoints')}</span>
              </button>
              <button
                style={{ flex: 1, height: 44, backgroundColor: BLUE, border: 'none', borderRadius: 6, color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: 0.2, cursor: 'pointer', textAlign: 'center', padding: '0 8px' }}
                onClick={handleOpenModal}
              >{t('compareAnother')}</button>
            </div>
          </div>

          {/* 3-column table card */}
          <div style={{ backgroundColor: CARD, borderRadius: 8, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', padding: '8px 8px', backgroundColor: RAISED }}>
              <div style={{ flex: 3, paddingRight: 8 }}>
                <span style={{ fontSize: 9, fontWeight: 800, color: TEXT_DIS, letterSpacing: 0.7, textTransform: 'uppercase' }}>{t('pointCol')}</span>
              </div>
              <div style={{ width: 1, backgroundColor: '#D5D8DE', alignSelf: 'stretch' }} />
              <div style={{ flex: 2.8, padding: '0 8px' }}>
                <span style={{ fontSize: 9, fontWeight: 800, color: TEXT_DIS, letterSpacing: 0.7, textTransform: 'uppercase' }}>{t('rodReadingCol')}</span>
              </div>
              <div style={{ width: 1, backgroundColor: '#D5D8DE', alignSelf: 'stretch' }} />
              <div style={{ flex: 2.8, paddingLeft: 8 }}>
                <span style={{ fontSize: 9, fontWeight: 800, color: TEXT_DIS, letterSpacing: 0.7, textTransform: 'uppercase' }}>{t('elevationCol')}</span>
              </div>
            </div>

            <div style={{ height: 1, backgroundColor: BORDER }} />
            {ptA && renderRow(ptA, 'A')}
            <div style={{ height: 1, backgroundColor: BORDER_S, margin: '0 8px' }} />
            {ptB && renderRow(ptB, 'B')}
          </div>
        </div>
      )}

      <SelectModal
        visible={showModal}
        points={points}
        sets={sets}
        tempA={tempA}
        tempB={tempB}
        onSelect={handleTempSelect}
        onGo={handleGo}
        onClose={() => setShowModal(false)}
      />

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
  const [selectedSet, setSelectedSet] = useState('all');

  const filtered = useMemo(() => {
    const base = selectedSet === 'all' ? points : points.filter(p => p.setId === selectedSet);
    return [...base]
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
      .slice(0, 20);
  }, [points, selectedSet]);

  // Reference set name for header
  const refSetName = useMemo(() => {
    if (selectedSet !== 'all') return sets.find(s => s.id === selectedSet)?.name ?? '';
    const firstSetId = filtered.find(p => p.setId)?.setId;
    return firstSetId ? sets.find(s => s.id === firstSetId)?.name ?? '' : '';
  }, [selectedSet, sets, filtered]);

  // Set filter chips
  const setChips: Array<{ id: string; label: string }> = [{ id: 'all', label: t('allSets') }];
  sets.forEach(s => {
    if (points.some(p => p.setId === s.id))
      setChips.push({ id: s.id, label: s.setLabel ? `${s.setLabel} ${s.name}` : s.name });
  });

  const ChipsRow = setChips.length > 1 ? (
    <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 4, marginBottom: 8 }}>
      {setChips.map(chip => {
        const active = selectedSet === chip.id;
        return (
          <button
            key={chip.id}
            style={{ height: 30, padding: '0 8px', borderRadius: 6, border: `1px solid ${active ? BLUE : BORDER}`, backgroundColor: active ? BLUE : SURFACE, color: active ? '#fff' : TEXT_SEC, fontSize: 11, fontWeight: active ? 700 : 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
            onClick={() => setSelectedSet(chip.id)}
          >{chip.label}</button>
        );
      })}
    </div>
  ) : null;

  if (filtered.length === 0) {
    return (
      <div style={{ flex: 1, padding: 12, display: 'flex', flexDirection: 'column' }}>
        {ChipsRow}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 40 }}>
          <span style={{ fontSize: 36 }}>📡</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: TEXT_PRI }}>{t('noPointsDisplay')}</span>
          <span style={{ fontSize: 13, color: TEXT_DIS, textAlign: 'center' }}>
            {selectedSet === 'all' ? t('addPointsToGraph') : t('noPointsInSetYet')}
          </span>
        </div>
      </div>
    );
  }

  // ── SVG chart geometry ────────────────────────────────────────────────────
  const n      = filtered.length;
  const W      = 380;
  // Bottom padding scales: more points → more label space needed (labels truncated)
  const PAD_B  = n <= 6 ? 52 : 46;
  const PAD_L  = 44, PAD_R = 10, PAD_T = 28;
  const H      = 320 + PAD_B;
  const PLOT_W = W - PAD_L - PAD_R;
  const PLOT_H = H - PAD_T - PAD_B;

  const vals   = filtered.map(p => p.engineeringFeet);
  const rawMax = Math.max(...vals);
  const rawMin = Math.min(...vals);
  const range  = Math.max(rawMax - rawMin, 0.5);

  // Y range: bars grow up from baseline; add padding above/below
  const maxVal = rawMax + range * 0.20;
  const minVal = Math.max(0, rawMin - range * 0.08);

  // Y maps value → SVG y (large value → small y = higher up)
  const yFor = (v: number) => {
    if (maxVal === minVal) return PAD_T + PLOT_H / 2;
    return PAD_T + PLOT_H * (maxVal - v) / (maxVal - minVal);
  };

  const baseY  = PAD_T + PLOT_H; // actual bottom edge of plot canvas
  const colW   = PLOT_W / n;
  const barW   = Math.max(6, Math.min(34, colW * 0.58));

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

  // Font sizes scale with point count
  const valFontSz = n <= 5 ? 8.5 : n <= 10 ? 7.5 : 6.5;
  const lblFontSz = n <= 5 ? 8.5 : n <= 10 ? 7.5 : 6.5;
  const nameFontSz = n <= 5 ? 7.5 : n <= 10 ? 6.5 : 5.5;
  const maxNameChars = n <= 5 ? 10 : n <= 10 ? 7 : 5;

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column' }}>
      {ChipsRow}

      <div style={{ backgroundColor: CARD, borderRadius: 12, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
        {/* Card header */}
        <div style={{ padding: '10px 12px', borderBottom: `1px solid ${BORDER_S}` }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: BLUE, letterSpacing: 1.1, textTransform: 'uppercase' }}>
            {t('rodReadingAnalysis')}
          </div>
          {refSetName ? (
            <div style={{ fontSize: 10, color: TEXT_SEC, marginTop: 2 }}>{t('referenceSet')}: {refSetName}</div>
          ) : null}
        </div>

        {/* SVG — width=100%, no overflow, no minWidth */}
        <div style={{ padding: '4px 0 8px' }}>
          <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
            <defs />

            {/* Plot area background */}
            <rect x={PAD_L} y={PAD_T} width={PLOT_W} height={PLOT_H} fill="#FAFBFE" rx="3" />
            <rect x={PAD_L} y={PAD_T} width={PLOT_W} height={PLOT_H} fill="none" stroke="#E2E8F0" strokeWidth="0.75" rx="3" />

            {/* Y-axis unit label */}
            <text x={PAD_L - 6} y={PAD_T - 7} textAnchor="end" fontSize="7" fontWeight="700" fill="#94A3B8">ft</text>

            {/* Y-axis grid ticks */}
            {axisTicks.map((tick, i) => {
              const ty = yFor(tick);
              if (ty < PAD_T - 1 || ty > baseY + 1) return null;
              return (
                <g key={`tk${i}`}>
                  <line x1={PAD_L} y1={ty} x2={PAD_L + PLOT_W} y2={ty}
                    stroke="#E4EAF2" strokeWidth="0.75" strokeDasharray="3,4" />
                  <text x={PAD_L - 4} y={ty + 3.5} textAnchor="end" fontSize="7.5" fontWeight="600" fill="#94A3B8">
                    {tick.toFixed(2)}
                  </text>
                </g>
              );
            })}

            {/* Bars + labels */}
            {filtered.map((pt, i) => {
              const cx   = PAD_L + colW * i + colW / 2;
              const yTop = yFor(pt.engineeringFeet);
              const barH = Math.max(2, baseY - yTop);
              const bX   = cx - barW / 2;
              // Value label: above bar, or below top if bar too short
              const valY = yTop > PAD_T + 12 ? yTop - 4 : yTop + 9;

              return (
                <g key={pt.id}>
                  {/* Subtle vertical guide */}
                  <line x1={cx} y1={PAD_T} x2={cx} y2={baseY}
                    stroke="#EBF0F7" strokeWidth="0.5" strokeDasharray="3,4" />

                  {/* Bar body — flat bottom so it firmly touches the baseline */}
                  <rect x={bX} y={yTop + 3} width={barW} height={Math.max(1, barH - 3)}
                    fill={BLUE_ACC} opacity="0.82" />
                  {/* Rounded top cap */}
                  <rect x={bX} y={yTop} width={barW} height={Math.min(6, barH)}
                    fill={BLUE_MID} rx="3" opacity="0.90" />

                  {/* Rod reading value above bar */}
                  <text x={cx} y={valY} textAnchor="middle"
                    fontSize={valFontSz} fontWeight="800" fill={NAVY}>
                    {pt.engineeringFeet.toFixed(2)}
                  </text>

                  {/* Point label (ID) below baseline */}
                  <text x={cx} y={baseY + 11} textAnchor="middle"
                    fontSize={lblFontSz} fontWeight="700" fill={TEXT_PRI}>
                    {pt.label}
                  </text>
                  {/* Point name (optional, truncated) */}
                  {pt.pointName ? (
                    <text x={cx} y={baseY + 11 + lblFontSz + 2} textAnchor="middle"
                      fontSize={nameFontSz} fill={TEXT_DIS}>
                      {pt.pointName.slice(0, maxNameChars)}
                    </text>
                  ) : null}
                </g>
              );
            })}

            {/* Baseline */}
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

// ── label style helper ──────────────────────────────────────────────────────
function SpDetailLabel({ text }: { text: string }) {
  return (
    <div style={{ fontSize: 9, fontWeight: 800, color: TEXT_DIS, letterSpacing: 0.8,
      textTransform: 'uppercase', marginBottom: 3 }}>
      {text}
    </div>
  );
}

// ── section card wrapper ────────────────────────────────────────────────────
function SpSection({ children, accent }: { children: React.ReactNode; accent?: string }) {
  return (
    <div style={{
      backgroundColor: CARD,
      borderRadius: 10,
      border: `1px solid ${BORDER}`,
      borderLeft: `4px solid ${accent ?? BORDER_B}`,
      padding: '12px 14px',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    }}>
      {children}
    </div>
  );
}

// ── key-value row ───────────────────────────────────────────────────────────
function SpRow({ label, value, mono, valueColor }: {
  label: string; value: string | React.ReactNode;
  mono?: boolean; valueColor?: string;
}) {
  return (
    <div>
      <SpDetailLabel text={label} />
      <div style={{
        fontSize: 13, fontWeight: 700,
        color: valueColor ?? TEXT_PRI,
        fontFamily: mono ? 'monospace' : undefined,
        lineHeight: 1.4,
      }}>
        {value}
      </div>
    </div>
  );
}

function SinglePointTab({ points, sets, projectId, onEditPoint }: SinglePointTabProps) {
  const { t } = useLang();
  const { deletePoint, deletePoints } = useSurveyStore();

  const [search,       setSearch]       = useState('');
  const [detailPt,     setDetailPt]     = useState<SurveyPoint | null>(null);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds,  setSelectedIds]  = useState<Set<string>>(new Set());

  // ── derived maps ──────────────────────────────────────────────────────────
  const setMap = useMemo(() => {
    const m: Record<string, SurveySet> = {};
    sets.forEach(s => { m[s.id] = s; });
    return m;
  }, [sets]);

  const typeMap = useMemo(() => resolvePointTypes(points, sets), [points, sets]);

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

  // Keep detailPt in sync: if the point is deleted elsewhere, close detail
  useEffect(() => {
    if (detailPt && !points.find(p => p.id === detailPt.id)) {
      setDetailPt(null);
    }
  }, [points, detailPt]);

  // ── actions ───────────────────────────────────────────────────────────────
  const toggleSelect = (id: string) =>
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const selectAll   = () => setSelectedIds(new Set(sorted.map(p => p.id)));
  const clearSelect = () => { setSelectedIds(new Set()); setIsSelectMode(false); };

  const handleDeleteSingle = useCallback((pt: SurveyPoint) => {
    if (!window.confirm(`Delete ${pt.label}${pt.pointName ? ` ("${pt.pointName}")` : ''}? This action cannot be undone.`)) return;
    setDetailPt(null);
    deletePoint(projectId, pt.id);
  }, [projectId, deletePoint]);

  const handleBulkDelete = () => {
    const count = selectedIds.size;
    if (!count || !window.confirm(`Delete ${count} point${count > 1 ? 's' : ''}? This action cannot be undone.`)) return;
    deletePoints(projectId, [...selectedIds]);
    setSelectedIds(new Set());
    setIsSelectMode(false);
  };

  // ── date formatter ────────────────────────────────────────────────────────
  const fmtMs = (ms: number) =>
    new Date(ms).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });

  // ══════════════════════════════════════════════════════════════════════════
  // DETAIL VIEW
  // ══════════════════════════════════════════════════════════════════════════
  if (detailPt) {
    const pt      = detailPt;
    const ptType  = typeMap.get(pt.id) ?? 'standalone';
    const theme   = TYPE_THEME[ptType];
    const setObj  = pt.setId ? setMap[pt.setId] : null;
    const hasBm   = (pt.bmElevation ?? 0) > 0;
    const lat     = pt.createdLatitude;
    const lon     = pt.createdLongitude;
    const addr    = pt.createdAddress ? pt.createdAddress.replace(/,?\n/g, ', ') : null;

    // FIF string: prefer stored fields, fall back to engToFIF
    const fif     = engToFIF(pt.engineeringFeet);
    const rFeet   = pt.rodFeet   ?? fif.feet;
    const rInch   = pt.rodInches != null ? String(pt.rodInches) : fif.inches;
    const rFrac   = (pt.rodFractionLabel && pt.rodFractionLabel !== '0')
                    ? pt.rodFractionLabel
                    : (fif.frac !== '0' ? fif.frac : '');
    const fifStr  = `${rFeet}' ${rInch}${rFrac ? ` ${rFrac}` : ''}"`;

    // Badge label via i18n
    const badgeLabel = ptType === 'benchmark'
      ? t('spBenchmarkBadge')
      : ptType === 'derived'
      ? t('spDerivedBadge')
      : t('spStandaloneBadge');

    // Find the benchmark source for derived points
    const bmSource = ptType === 'derived' && pt.setId
      ? points.find(p => p.setId === pt.setId && typeMap.get(p.id) === 'benchmark')
      : null;

    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Detail nav bar */}
        <div style={{
          backgroundColor: CARD,
          borderBottom: `1px solid ${BORDER_S}`,
          padding: '9px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          gap: 8,
        }}>
          <button
            onClick={() => setDetailPt(null)}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              backgroundColor: SURFACE, border: `1px solid ${BORDER}`,
              borderRadius: 6, padding: '6px 10px',
              fontSize: 12, fontWeight: 700, color: BLUE, cursor: 'pointer',
            }}
          >
            ← {t('spBack')}
          </button>
          <div style={{ display: 'flex', gap: 6 }}>
            {onEditPoint && (
              <button
                onClick={() => onEditPoint(pt)}
                style={{
                  backgroundColor: BLUE_DEEP, border: `1px solid ${BLUE}`,
                  borderRadius: 6, padding: '6px 12px',
                  fontSize: 12, fontWeight: 700, color: BLUE_ACC, cursor: 'pointer',
                }}
              >{t('edit')}</button>
            )}
            <button
              onClick={() => handleDeleteSingle(pt)}
              style={{
                backgroundColor: 'rgba(231,76,60,0.08)', border: '1px solid rgba(231,76,60,0.35)',
                borderRadius: 6, padding: '6px 12px',
                fontSize: 12, fontWeight: 700, color: RED, cursor: 'pointer',
              }}
            >{t('delete')}</button>
          </div>
        </div>

        {/* Scrollable detail content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 24 }}>

          {/* ── Header card ─────────────────────────────────────── */}
          <div style={{
            backgroundColor: CARD,
            borderRadius: 10,
            border: `1px solid ${BORDER}`,
            borderLeft: `4px solid ${theme.border}`,
            padding: '12px 14px',
          }}>
            {/* ID + name */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              <span style={{ fontSize: 20, fontWeight: 900, color: BLUE_ACC, letterSpacing: 0.4 }}>
                {pt.label}
              </span>
              {pt.pointName && (
                <span style={{ fontSize: 15, fontWeight: 700, color: TEXT_PRI }}>• {pt.pointName}</span>
              )}
            </div>
            {/* Badges */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
              <div style={{
                borderRadius: 4, border: `1px solid ${theme.badgeBdr}`,
                backgroundColor: theme.badgeBg, padding: '3px 8px',
              }}>
                <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.7, color: theme.badgeTxt }}>
                  {badgeLabel}
                </span>
              </div>
              {setObj && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 3,
                  backgroundColor: BLUE_DEEP, borderRadius: 4, padding: '3px 7px',
                }}>
                  {setObj.setLabel && (
                    <span style={{ fontSize: 9, fontWeight: 800, color: BLUE_ACC, letterSpacing: 0.4 }}>
                      {setObj.setLabel}
                    </span>
                  )}
                  <span style={{ fontSize: 9, fontWeight: 700, color: NAVY }}>{setObj.name}</span>
                </div>
              )}
            </div>
          </div>

          {/* ── Identity section ────────────────────────────────── */}
          <SpSection accent={BLUE}>
            <SpRow label={t('spPointId')} value={pt.label} mono />
            {pt.pointName && (
              <SpRow label={t('pointName')} value={pt.pointName} />
            )}
            <SpRow label={t('spPointType')} value={badgeLabel} />
            {setObj && (
              <SpRow label={t('spSet')}
                value={`${setObj.setLabel ? setObj.setLabel + ' · ' : ''}${setObj.name}`} />
            )}
            <SpRow label={t('spCreated')}     value={fmtMs(pt.createdAt)} />
            <SpRow label={t('spLastUpdated')} value={fmtMs(pt.updatedAt)} />
          </SpSection>

          {/* ── Rod Reading section ──────────────────────────────── */}
          <SpSection accent={NAVY}>
            <div style={{ fontSize: 10, fontWeight: 800, color: NAVY, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 2 }}>
              {t('rodReading')}
            </div>
            <SpRow label={t('spFeetInches')}  value={fifStr}                           mono />
            <SpRow label={t('spDecimalFeet')} value={`${pt.engineeringFeet.toFixed(2)} ft`} mono />
          </SpSection>

          {/* ── Elevation section ────────────────────────────────── */}
          {hasBm && (
            <SpSection accent={ptType === 'benchmark' ? GOLD_SVG : BLUE_ACC}>
              <div style={{ fontSize: 10, fontWeight: 800, color: ptType === 'benchmark' ? '#B8730A' : BLUE_ACC, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 2 }}>
                {t('elevation')}
              </div>
              <SpRow
                label={ptType === 'benchmark' ? t('spBenchmarkElev') : t('elevation')}
                value={`${(pt.bmElevation ?? 0).toFixed(2)} ft`}
                mono
                valueColor={ptType === 'benchmark' ? '#92610A' : TEXT_PRI}
              />
              {pt.elevation != null && pt.elevation !== pt.bmElevation && (
                <SpRow label={t('elevation')} value={`${pt.elevation.toFixed(2)} ft`} mono />
              )}
              {ptType === 'derived' && bmSource && (
                <SpRow
                  label={t('spDerivedFrom')}
                  value={bmSource.pointName ? `${bmSource.label} (${bmSource.pointName})` : bmSource.label}
                  valueColor={BLUE_ACC}
                />
              )}
            </SpSection>
          )}

          {/* ── Assignment section (only if takenBy or setObj exists) ── */}
          {(pt.takenBy || setObj) && (
            <SpSection accent={GREEN}>
              {pt.takenBy && (
                <SpRow label={t('spAssignedTo')} value={pt.takenBy} />
              )}
              {setObj && (
                <SpRow label={t('spSet')}
                  value={`${setObj.setLabel ? setObj.setLabel + ' · ' : ''}${setObj.name}`} />
              )}
            </SpSection>
          )}

          {/* ── Location section ─────────────────────────────────── */}
          <SpSection accent={addr ? BLUE_MID : BORDER_B}>
            <div style={{ fontSize: 10, fontWeight: 800, color: TEXT_DIS, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 2 }}>
              {t('location')}
            </div>
            {addr ? (
              <>
                <SpRow label={t('location')} value={`📍 ${addr}`} />
                {lat != null && lon != null && (
                  <>
                    <SpRow label={t('spCoordinates')} value={
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span>{t('spLatitude')}:  {lat.toFixed(6)}°</span>
                        <span>{t('spLongitude')}: {lon.toFixed(6)}°</span>
                      </div>
                    } mono />
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${lat},${lon}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: 'inline-block', alignSelf: 'flex-start',
                        backgroundColor: BLUE, borderRadius: 6,
                        padding: '6px 12px', color: '#fff',
                        fontSize: 11, fontWeight: 700, textDecoration: 'none',
                      }}
                    >{t('viewOnMaps')}</a>
                  </>
                )}
              </>
            ) : (
              <div style={{ fontSize: 13, fontWeight: 600, color: TEXT_DIS }}>
                {t('spLocationNA')}
              </div>
            )}
          </SpSection>

        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LIST VIEW
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>

      {/* Top bar */}
      <div style={{
        backgroundColor: CARD,
        borderBottom: `1px solid ${BORDER_S}`,
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: TEXT_SEC, letterSpacing: 0.8, textTransform: 'uppercase' }}>
            {points.length} {t('surveyPoints')}
          </span>
          {!isSelectMode ? (
            <button
              style={{ backgroundColor: BLUE_DEEP, borderRadius: 4, padding: '4px 8px', border: `1px solid ${BLUE}`, fontSize: 11, fontWeight: 700, color: BLUE_ACC, cursor: 'pointer' }}
              onClick={() => setIsSelectMode(true)}
            >{t('selectMode')}</button>
          ) : (
            <div style={{ display: 'flex', gap: 4 }}>
              <button style={{ backgroundColor: SURFACE, borderRadius: 4, padding: '4px 8px', border: `1px solid ${BORDER}`, fontSize: 11, fontWeight: 600, color: TEXT_SEC, cursor: 'pointer' }} onClick={selectAll}>{t('selectAll')}</button>
              <button style={{ backgroundColor: SURFACE, borderRadius: 4, padding: '4px 8px', border: `1px solid ${BORDER}`, fontSize: 11, fontWeight: 600, color: TEXT_SEC, cursor: 'pointer' }} onClick={clearSelect}>{t('cancel')}</button>
            </div>
          )}
        </div>
        <input
          style={{ height: 38, backgroundColor: SURFACE, borderRadius: 6, border: `1.5px solid ${BORDER}`, padding: '0 12px', fontSize: 13, color: TEXT_PRI, outline: 'none', boxSizing: 'border-box' }}
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('searchPlaceholder')}
        />
      </div>

      {/* Hint strip */}
      {points.length > 0 && !isSelectMode && (
        <div style={{
          backgroundColor: BLUE_DEEP,
          borderBottom: `1px solid rgba(30,87,153,0.15)`,
          padding: '6px 14px',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 10.5, fontWeight: 600, color: BLUE_ACC }}>
            {t('spSelectHint')}
          </span>
        </div>
      )}

      {/* Scroll area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 80 }}>

        {/* Empty state */}
        {sorted.length === 0 && (
          <div style={{ backgroundColor: CARD, borderRadius: 8, padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginTop: 8 }}>
            <span style={{ fontSize: 44 }}>📄</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: TEXT_PRI }}>
              {search ? t('noMatchingPoints') : t('noPointsRecorded')}
            </span>
            <span style={{ fontSize: 13, color: TEXT_SEC, textAlign: 'center', lineHeight: 1.55 }}>
              {search ? t('tryDifferentSearch') : t('addPointsToSee')}
            </span>
          </div>
        )}

        {/* Compact tappable rows */}
        {sorted.map((pt, i) => {
          const ptType     = typeMap.get(pt.id) ?? 'standalone';
          const theme      = TYPE_THEME[ptType];
          const setObj     = pt.setId ? setMap[pt.setId] : null;
          const isSelected = selectedIds.has(pt.id);

          return (
            <div
              key={`${pt.id}-${i}`}
              style={{
                backgroundColor: isSelected ? 'rgba(47,127,191,0.06)' : CARD,
                borderRadius: 8,
                border: `1px solid ${isSelected ? BLUE : BORDER}`,
                borderLeft: `4px solid ${theme.border}`,
                padding: '9px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
                userSelect: 'none',
              }}
              onClick={() => {
                if (isSelectMode) { toggleSelect(pt.id); return; }
                setDetailPt(pt);
              }}
            >
              {/* Checkbox (select mode) */}
              {isSelectMode && (
                <div style={{
                  width: 20, height: 20, borderRadius: 4,
                  border: `2px solid ${isSelected ? BLUE : BORDER}`,
                  backgroundColor: isSelected ? BLUE : SURFACE,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {isSelected && <span style={{ color: '#fff', fontSize: 11, fontWeight: 900, lineHeight: 1 }}>✓</span>}
                </div>
              )}

              {/* Main content */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                {/* Label + name */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: BLUE_ACC, letterSpacing: 0.4 }}>
                    {pt.label}
                  </span>
                  {pt.pointName && (
                    <span style={{ fontSize: 13, fontWeight: 600, color: TEXT_PRI }}>• {pt.pointName}</span>
                  )}
                </div>
                {/* Badges + rod reading preview */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                  <div style={{
                    borderRadius: 3, border: `1px solid ${theme.badgeBdr}`,
                    backgroundColor: theme.badgeBg, padding: '1px 6px',
                  }}>
                    <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: 0.5, color: theme.badgeTxt }}>
                      {ptType === 'benchmark' ? t('spBenchmarkBadge') : ptType === 'derived' ? t('spDerivedBadge') : t('spStandaloneBadge')}
                    </span>
                  </div>
                  {setObj && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 2,
                      backgroundColor: BLUE_DEEP, borderRadius: 3, padding: '1px 5px',
                    }}>
                      {setObj.setLabel && <span style={{ fontSize: 8, fontWeight: 800, color: BLUE_ACC }}>{setObj.setLabel}</span>}
                      <span style={{ fontSize: 8, fontWeight: 700, color: NAVY }}>{setObj.name}</span>
                    </div>
                  )}
                  <span style={{ fontSize: 10, fontWeight: 600, color: TEXT_DIS, fontFamily: 'monospace' }}>
                    {pt.engineeringFeet.toFixed(2)} ft
                  </span>
                </div>
              </div>

              {/* Chevron (non-select mode) */}
              {!isSelectMode && (
                <span style={{ fontSize: 16, color: TEXT_DIS, flexShrink: 0, lineHeight: 1 }}>›</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Bulk action floating bar */}
      {isSelectMode && selectedIds.size > 0 && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          backgroundColor: CARD, borderTop: `1px solid ${BORDER}`,
          padding: '12px 16px',
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: TEXT_PRI }}>
            {selectedIds.size} {t('selected')}
          </span>
          <button
            style={{ backgroundColor: '#C0392B', borderRadius: 6, padding: '10px 16px', color: '#fff', fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}
            onClick={handleBulkDelete}
          >{t('deleteSelected')}</button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// VIEW POINTS SCREEN — gold sub-tab shell
// ═══════════════════════════════════════════════════════════════════════════════
export default function ViewPointsScreen({ projectId, onEditPoint, compareFromId, compareToId }: Props) {
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

  const SUB_TABS: { id: PointsTab; label: string }[] = [
    { id: 'compare', label: t('comparePoints') },
    { id: 'graph',   label: t('graph')         },
    { id: 'single',  label: t('singlePoint')   },
  ];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Gold sub-tab bar */}
      <div style={{ display: 'flex', backgroundColor: GOLD, padding: '6px 8px', gap: 6, flexShrink: 0 }}>
        {SUB_TABS.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              style={{
                flex: 1, height: 40, borderRadius: 10,
                border: `1.5px solid ${isActive ? 'rgba(0,0,0,0.07)' : 'rgba(140,95,0,0.20)'}`,
                backgroundColor: isActive ? '#FFFFFF' : GOLD,
                color: '#163A63', fontSize: 12, fontWeight: 700,
                cursor: 'pointer',
                boxShadow: isActive ? '0 1px 4px rgba(0,0,0,0.10)' : 'none',
                whiteSpace: 'nowrap', overflow: 'hidden',
                transition: 'background-color 0.15s, border-color 0.15s, box-shadow 0.15s',
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
      <div style={{ flex: 1, overflow: 'hidden', display: activeTab === 'single' ? 'flex' : 'none', flexDirection: 'column' }}>
        <SinglePointTab points={points} sets={sets} projectId={projectId} onEditPoint={onEditPoint} />
      </div>
    </div>
  );
}
