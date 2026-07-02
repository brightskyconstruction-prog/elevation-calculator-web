import { useState, useMemo, useCallback, useEffect, type CSSProperties, type ReactNode } from 'react';
import { useSurveyStore } from '../stores/surveyStore';
import { useLang } from '../LangContext';
import { SurveyPoint, SurveySet } from '../types';

// ─── Design tokens ─────────────────────────────────────────────────────────────
const NAVY      = '#143A63';
const BLUE      = '#1E5799';
const BLUE_ACC  = '#3B82F6';
const BLUE_DEEP = 'rgba(30,87,153,0.10)';
const GOLD      = '#F4B02A';
const GREEN_DARK = '#1A7A3F';
const RED_DARK   = '#B83228';
const TEXT_PRI  = '#111827';
const TEXT_SEC  = '#374151';
const TEXT_DIS  = '#9CA3AF';
const SURFACE   = '#F0EEE8';
const CARD      = '#FFFFFF';
const BORDER    = '#E5E7EB';
const BORDER_B  = '#D1D5DB';

const MAX_HISTORY = 20;
const HISTORY_VISIBLE = 4; // cards shown on History tab before "View All"

// 'profile' key retained for tab ID — its label now reads "History"
type SlopeSubTab = 'find' | 'profile' | 'target';
interface Props {
  projectId:   string;
  initFromId?: string | null;
  initToId?:   string | null;
  onInitConsumed?: () => void;
}

// ─── Saved calculation ────────────────────────────────────────────────────────
interface SavedCalc {
  id:        string;
  fromId:    string;
  fromLabel: string;
  fromName:  string;
  fromElev:  number;
  toId:      string;
  toLabel:   string;
  toName:    string;
  toElev:    number;
  distance:  number;
  slopePct:  number;
  diff:      number;
  ratio:     number | null;
  angle:     number;
  dir:       'uphill' | 'downhill' | 'flat';
  savedAt:   number;
}

// ─── Math helpers ─────────────────────────────────────────────────────────────
function calcSlope(elevA: number, elevB: number, dist: number) {
  const diff  = elevB - elevA;
  const pct   = dist > 0 ? (diff / dist) * 100 : 0;
  const ratio = dist > 0 && Math.abs(diff) > 0.0001 ? dist / Math.abs(diff) : null;
  const angle = dist > 0 ? (Math.atan(Math.abs(diff) / dist) * 180) / Math.PI : 0;
  const dir: 'uphill' | 'downhill' | 'flat' =
    diff > 0.001 ? 'uphill' : diff < -0.001 ? 'downhill' : 'flat';
  return { diff, pct, ratio, angle, dir };
}

function dirColor(dir: string) {
  return dir === 'uphill' ? GREEN_DARK : dir === 'downhill' ? RED_DARK : TEXT_DIS;
}
function dirIcon(dir: string) {
  return dir === 'uphill' ? '↗' : dir === 'downhill' ? '↘' : '→';
}
function sign(n: number) { return n >= 0 ? '+' : ''; }

function fmtDateTime(ms: number) {
  return new Date(ms).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

// ─── Shared label style ───────────────────────────────────────────────────────
const LBL: CSSProperties = {
  fontSize: 15,
  fontWeight: 800,
  color: TEXT_PRI,
  letterSpacing: 0.5,
  textTransform: 'uppercase',
  marginBottom: 3,
};

// ─── Centered modal overlay ───────────────────────────────────────────────────
function CenteredOverlay({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', boxSizing: 'border-box' as const }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {children}
    </div>
  );
}

// ─── SVG Profile Chart ────────────────────────────────────────────────────────
function CalcProfileChart({ elevA, elevB, distN, labelA, labelB }: {
  elevA: number; elevB: number; distN: number; labelA: string; labelB: string;
}) {
  const result = calcSlope(elevA, elevB, distN);
  const dc = dirColor(result.dir);
  const W = 340, H = 180;
  const PL = 50, PR = 14, PT = 26, PB = 36;
  const PW = W - PL - PR;
  const PH = H - PT - PB;

  const minE   = Math.min(elevA, elevB);
  const maxE   = Math.max(elevA, elevB);
  const rangeE = Math.max(maxE - minE, 0.5);
  const padE   = rangeE * 0.32;
  const yMin   = minE - padE;
  const yMax   = maxE + padE;

  const yFor = (e: number) => PT + PH * (1 - (e - yMin) / (yMax - yMin));
  const xA = PL, xB = PL + PW;
  const yA = yFor(elevA), yB = yFor(elevB);

  const ticks: number[] = [];
  for (let i = 0; i <= 4; i++) ticks.push(yMin + (yMax - yMin) * (i / 4));

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      <rect x={PL} y={PT} width={PW} height={PH} fill="#F8FAFF" rx="3" />
      <rect x={PL} y={PT} width={PW} height={PH} fill="none" stroke="#DCE3F0" strokeWidth="0.75" rx="3" />
      {ticks.map((tick, i) => {
        const ty = yFor(tick);
        if (ty < PT - 1 || ty > PT + PH + 1) return null;
        return (
          <g key={i}>
            <line x1={PL} y1={ty} x2={PL + PW} y2={ty} stroke="#D1D8E4" strokeWidth="0.5" strokeDasharray="3,4" />
            <text x={PL - 3} y={ty + 3.5} textAnchor="end" fontSize="8" fontWeight="700" fill={TEXT_SEC}>{tick.toFixed(1)}</text>
          </g>
        );
      })}
      <text x={8} y={PT + PH / 2} textAnchor="middle" fontSize="7.5" fontWeight="700" fill={TEXT_DIS}
        transform={`rotate(-90 8 ${PT + PH / 2})`}>ft</text>
      <polygon points={`${xA},${yA} ${xB},${yB} ${xB},${PT + PH} ${xA},${PT + PH}`} fill={`${dc}1A`} />
      {result.dir !== 'flat' && (
        <line x1={xB} y1={yA} x2={xB} y2={yB} stroke={dc} strokeWidth="1" strokeDasharray="4,3" opacity="0.35" />
      )}
      <line x1={xA} y1={yA} x2={xB} y2={yB} stroke={dc} strokeWidth="2.5" />
      <circle cx={xA} cy={yA} r={5} fill={BLUE} />
      <circle cx={xA} cy={yA} r={2.5} fill={BLUE_ACC} />
      <text x={xA} y={yA - 9} textAnchor="middle" fontSize="9.5" fontWeight="900" fill={NAVY}>{labelA}</text>
      <text x={xA} y={PT + PH + 14} textAnchor="middle" fontSize="8" fontWeight="700" fill={TEXT_SEC}>{elevA.toFixed(2)}</text>
      <circle cx={xB} cy={yB} r={5} fill={BLUE} />
      <circle cx={xB} cy={yB} r={2.5} fill={BLUE_ACC} />
      <text x={xB} y={yB - 9} textAnchor="middle" fontSize="9.5" fontWeight="900" fill={NAVY}>{labelB}</text>
      <text x={xB} y={PT + PH + 14} textAnchor="middle" fontSize="8" fontWeight="700" fill={TEXT_SEC}>{elevB.toFixed(2)}</text>
      <text x={PL + PW / 2} y={H - 1} textAnchor="middle" fontSize="8" fontWeight="700" fill={TEXT_DIS}>
        {distN.toFixed(1)} ft horizontal
      </text>
      <text x={PL + PW / 2} y={(yA + yB) / 2 - 8} textAnchor="middle" fontSize="11" fontWeight="900" fill={dc}>
        {sign(result.pct)}{result.pct.toFixed(2)}% {dirIcon(result.dir)}
      </text>
    </svg>
  );
}

// ─── Calculation Detail Popup ─────────────────────────────────────────────────
function CalcDetailModal({ calc, onClose, onEdit, onDelete }: {
  calc: SavedCalc;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useLang();
  const dc = dirColor(calc.dir);

  function dirLabel(dir: string) {
    if (dir === 'uphill')   return t('slopeUphill');
    if (dir === 'downhill') return t('slopeDownhill');
    return t('slopeFlat');
  }

  const handleDelete = () => {
    if (window.confirm(t('slopeDeleteCalcConfirm'))) onDelete();
  };

  // Data rows: [label, value, highlight?]
  const rows: [string, string, boolean][] = [
    [t('slopeFrom'),        `${calc.fromLabel}${calc.fromName ? ' · ' + calc.fromName : ''}`, false],
    [t('slopeFromElev'),    `${calc.fromElev.toFixed(3)} ft`,                                 false],
    [t('slopeTo'),          `${calc.toLabel}${calc.toName ? ' · ' + calc.toName : ''}`,       false],
    [t('slopeToElev'),      `${calc.toElev.toFixed(3)} ft`,                                   false],
    [t('slopeElevDiff'),    `${sign(calc.diff)}${calc.diff.toFixed(3)} ft`,                   true ],
    [t('slopeDistanceLbl'), `${calc.distance.toFixed(2)} ft`,                                 false],
    [t('slopeSlopePct'),    `${sign(calc.slopePct)}${calc.slopePct.toFixed(2)}%`,             true ],
    [t('slopeRatioLbl'),    calc.ratio != null ? `1 : ${calc.ratio.toFixed(1)}` : '—',        false],
    [t('slopeAngleLbl'),    `${calc.angle.toFixed(2)}°`,                                      false],
    [t('slopeDirection'),   dirLabel(calc.dir),                                               true ],
    [t('slopeDateTimeLbl'), fmtDateTime(calc.savedAt),                                        false],
  ];

  return (
    <CenteredOverlay onClose={onClose}>
      <div style={{ width: '100%', maxWidth: 430, maxHeight: '92vh', backgroundColor: CARD, borderRadius: 14, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.28)' }}>

        {/* Header */}
        <div style={{ backgroundColor: NAVY, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: '#fff', letterSpacing: 0.2 }}>{t('slopeCalcDetail')}</span>
          <button style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.8)', fontSize: 22, cursor: 'pointer', padding: 0, lineHeight: 1 }} onClick={onClose}>✕</button>
        </div>

        {/* Direction banner */}
        <div style={{ backgroundColor: dc, padding: '7px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 900, color: '#fff' }}>{dirIcon(calc.dir)} {dirLabel(calc.dir)}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>{calc.fromLabel} → {calc.toLabel}</span>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>

          {/* Graph */}
          <div style={{ backgroundColor: SURFACE, borderRadius: 9, padding: '6px 4px 2px' }}>
            <CalcProfileChart
              elevA={calc.fromElev} elevB={calc.toElev} distN={calc.distance}
              labelA={calc.fromLabel} labelB={calc.toLabel}
            />
          </div>

          {/* 4 stat chips */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 5 }}>
            {([
              { lbl: t('slopeElevDiff'), val: `${sign(calc.diff)}${calc.diff.toFixed(3)}ft`, c: dc },
              { lbl: t('slopeSlopePct'), val: `${sign(calc.slopePct)}${calc.slopePct.toFixed(2)}%`, c: dc },
              { lbl: t('slopeRatioLbl'), val: calc.ratio != null ? `1:${calc.ratio.toFixed(1)}` : '—', c: TEXT_PRI },
              { lbl: t('slopeAngleLbl'), val: `${calc.angle.toFixed(2)}°`, c: TEXT_PRI },
            ]).map(({ lbl, val, c }) => (
              <div key={lbl} style={{ backgroundColor: SURFACE, borderRadius: 7, border: `1px solid ${BORDER}`, padding: '6px 7px' }}>
                <div style={{ fontSize: 8.5, fontWeight: 800, color: TEXT_SEC, letterSpacing: 0.4, textTransform: 'uppercase' as const, marginBottom: 2 }}>{lbl}</div>
                <div style={{ fontSize: 13, fontWeight: 900, color: c, fontFamily: 'monospace', lineHeight: 1.2 }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Data rows — high-contrast labels */}
          <div style={{ backgroundColor: SURFACE, borderRadius: 9, border: `1px solid ${BORDER}`, padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 7 }}>
            {rows.map(([lbl, val, hl]) => (
              <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: TEXT_SEC, flexShrink: 0 }}>{lbl}</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: hl ? dc : TEXT_PRI, fontFamily: 'monospace', textAlign: 'right' as const }}>{val}</span>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, marginTop: 2, paddingBottom: 4 }}>
            <button style={{ flex: 1, height: 38, backgroundColor: NAVY, border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }} onClick={onEdit}>{t('edit')}</button>
            <button style={{ flex: 1, height: 38, backgroundColor: RED_DARK, border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }} onClick={handleDelete}>{t('delete')}</button>
          </div>
        </div>
      </div>
    </CenteredOverlay>
  );
}

// ─── Point Picker Modal ───────────────────────────────────────────────────────
interface PickerProps {
  points: SurveyPoint[]; setMap: Record<string, SurveySet>;
  selectedId: string | null; title: string;
  onSelect: (id: string) => void; onClose: () => void;
}

function PointPickerModal({ points, setMap, selectedId, title, onSelect, onClose }: PickerProps) {
  const { t } = useLang();
  const [q, setQ] = useState('');

  const eligible = useMemo(() => points.filter(p => (p.bmElevation ?? 0) > 0), [points]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return (query
      ? eligible.filter(p =>
          p.label.toLowerCase().includes(query) ||
          (p.pointName ?? '').toLowerCase().includes(query) ||
          (setMap[p.setId ?? '']?.name ?? '').toLowerCase().includes(query))
      : eligible
    ).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  }, [eligible, q, setMap]);

  return (
    <div
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.52)', zIndex: 300, display: 'flex', alignItems: 'flex-end' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ width: '100%', maxWidth: 480, margin: '0 auto', backgroundColor: CARD, borderRadius: '16px 16px 0 0', maxHeight: '82vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ alignSelf: 'center', width: 36, height: 4, backgroundColor: BORDER_B, borderRadius: 2, margin: '10px auto 0' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px 8px', borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: TEXT_PRI }}>{title}</span>
          <button style={{ background: 'none', border: 'none', fontSize: 22, color: TEXT_SEC, cursor: 'pointer', padding: 0, lineHeight: 1 }} onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: '8px 12px', flexShrink: 0 }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={t('slopeSearchPts')} autoFocus
            style={{ width: '100%', height: 36, borderRadius: 7, border: `1.5px solid ${BORDER}`, padding: '0 10px', fontSize: 13, color: TEXT_PRI, backgroundColor: SURFACE, outline: 'none', boxSizing: 'border-box' as const }} />
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 10px 14px', display: 'flex', flexDirection: 'column', gap: 5 }}>
          {filtered.length === 0 && (
            <div style={{ padding: '28px 0', textAlign: 'center', color: TEXT_DIS, fontSize: 13 }}>
              {eligible.length === 0 ? t('slopeNoElevPts') : t('slopeNoMatchPts')}
            </div>
          )}
          {filtered.map(pt => {
            const setObj = pt.setId ? setMap[pt.setId] : null;
            const isSel  = pt.id === selectedId;
            return (
              <div key={pt.id}
                style={{ backgroundColor: isSel ? BLUE_DEEP : SURFACE, border: `1px solid ${isSel ? BLUE_ACC : BORDER}`, borderRadius: 8, padding: '8px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                onClick={() => { onSelect(pt.id); onClose(); }}>
                <div style={{ width: 38, height: 38, backgroundColor: isSel ? BLUE_ACC : BLUE, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#fff', letterSpacing: 0.3 }}>{pt.label}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: TEXT_PRI, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                    {pt.label}{pt.pointName ? ` · ${pt.pointName}` : ''}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: TEXT_SEC }}>
                    {(pt.bmElevation ?? 0).toFixed(3)} {t('slopeFtElev')}
                    {setObj ? ` · ${setObj.setLabel ? setObj.setLabel + ' ' : ''}${setObj.name}` : ''}
                  </div>
                </div>
                {isSel && <span style={{ fontSize: 15, color: BLUE_ACC, fontWeight: 900 }}>✓</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Point selector card ───────────────────────────────────────────────────────
function PointSelectCard({ pt, label, onPick }: { pt: SurveyPoint | null; label: string; onPick: () => void }) {
  const { t } = useLang();
  const hasElev = (pt?.bmElevation ?? 0) > 0;
  return (
    <div style={{ flex: 1 }}>
      <div style={LBL}>{label}</div>
      <div
        style={{ backgroundColor: pt ? BLUE_DEEP : SURFACE, border: `1.5px solid ${pt ? BLUE_ACC : BORDER}`, borderRadius: 8, padding: '7px 10px', cursor: 'pointer', minHeight: 48 }}
        onClick={onPick}
      >
        {pt ? (
          <>
            <div style={{ fontSize: 15, fontWeight: 900, color: BLUE_ACC, lineHeight: 1.3 }}>
              {pt.label}{pt.pointName ? ` · ${pt.pointName}` : ''}
            </div>
            {hasElev
              ? <div style={{ fontSize: 13, fontWeight: 700, color: TEXT_SEC, marginTop: 2 }}>{pt.bmElevation!.toFixed(3)} {t('slopeFtElev')}</div>
              : <div style={{ fontSize: 13, color: RED_DARK, marginTop: 2, fontWeight: 700 }}>{t('slopeNoElevPt')}</div>
            }
          </>
        ) : (
          <div style={{ fontSize: 14, fontWeight: 700, color: '#6B7280', marginTop: 5 }}>{t('slopeTapSelect')}</div>
        )}
      </div>
    </div>
  );
}

// ─── 1. Find Slope Tab ────────────────────────────────────────────────────────
interface FindSlopeProps {
  points:     SurveyPoint[];
  setMap:     Record<string, SurveySet>;
  onSave:     (c: SavedCalc) => void;
  pendingEdit: SavedCalc | null;
  onPendingEditConsumed: () => void;
  /** Pre-populate from a Point Details "Find Slope" tap */
  pendingFromId?: string | null;
  pendingToId?:   string | null;
  onPendingFromToConsumed?: () => void;
}

function FindSlopeTab({ points, setMap, onSave, pendingEdit, onPendingEditConsumed, pendingFromId, pendingToId, onPendingFromToConsumed }: FindSlopeProps) {
  const { t, lang } = useLang();
  const [fromId, setFromId] = useState<string | null>(null);
  const [toId,   setToId]   = useState<string | null>(null);
  const [dist,   setDist]   = useState('');
  const [picker, setPicker] = useState<'from' | 'to' | null>(null);
  const [showSlopeTip, setShowSlopeTip] = useState(false);

  // Track the exact combo (fromId:toId:dist) that was last saved to prevent duplicates
  const [savedCombo, setSavedCombo] = useState<string | null>(null);
  const currentCombo = `${fromId ?? ''}:${toId ?? ''}:${dist}`;
  const alreadySaved = savedCombo !== null && savedCombo === currentCombo;

  // Load a pending edit from the History tab
  useEffect(() => {
    if (pendingEdit) {
      setFromId(pendingEdit.fromId);
      setToId(pendingEdit.toId);
      setDist(pendingEdit.distance.toString());
      setSavedCombo(null); // allow re-save with (possibly) edited values
      onPendingEditConsumed();
    }
  }, [pendingEdit, onPendingEditConsumed]);

  // Load from/to pre-population triggered by "Find Slope" button on Point Details
  useEffect(() => {
    if (pendingFromId) {
      setFromId(pendingFromId);
      setToId(pendingToId ?? null);
      setDist('');
      setSavedCombo(null);
      onPendingFromToConsumed?.();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingFromId, pendingToId]);

  const fromPt = fromId ? points.find(p => p.id === fromId) ?? null : null;
  const toPt   = toId   ? points.find(p => p.id === toId)   ?? null : null;
  const distN  = parseFloat(dist);

  const validDist = !isNaN(distN) && distN > 0;
  const validFrom = fromPt != null && (fromPt.bmElevation ?? 0) > 0;
  const validTo   = toPt   != null && (toPt.bmElevation   ?? 0) > 0;
  const samePoint = !!fromId && fromId === toId;
  const canCalc   = validFrom && validTo && validDist && !samePoint;

  const result = canCalc ? calcSlope(fromPt!.bmElevation!, toPt!.bmElevation!, distN) : null;
  const dc = result ? dirColor(result.dir) : TEXT_DIS;

  const handleSwap = useCallback(() => { setFromId(toId); setToId(fromId); setSavedCombo(null); }, [fromId, toId]);

  const handleSave = useCallback(() => {
    if (!result || !fromPt || !toPt || !fromId || !toId || alreadySaved) return;
    onSave({
      id:        Date.now().toString(),
      fromId,    fromLabel: fromPt.label,  fromName: fromPt.pointName ?? '',  fromElev: fromPt.bmElevation!,
      toId,      toLabel:   toPt.label,    toName:   toPt.pointName ?? '',    toElev:   toPt.bmElevation!,
      distance:  distN,
      slopePct:  result.pct,
      diff:      result.diff,
      ratio:     result.ratio,
      angle:     result.angle,
      dir:       result.dir,
      savedAt:   Date.now(),
    });
    setSavedCombo(currentCombo);
  }, [result, fromPt, toPt, fromId, toId, distN, alreadySaved, currentCombo, onSave]);

  function dirLabel(dir: string) {
    if (dir === 'uphill')   return t('slopeUphill');
    if (dir === 'downhill') return t('slopeDownhill');
    return t('slopeFlat');
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>

      {/* Inputs card */}
      <div style={{ backgroundColor: CARD, borderRadius: 10, border: `1px solid ${BORDER}`, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>

        {/* ⓘ button — top-right of card */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: -4, marginTop: -2 }}>
          <button
            style={{ background: 'none', border: 'none', color: '#1D4ED8', fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: '4px 6px', minWidth: 36, minHeight: 36, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', filter: 'drop-shadow(0 0 0.5px #1D4ED8)' }}
            onClick={() => setShowSlopeTip(true)}
          >ⓘ</button>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 7 }}>
          <PointSelectCard pt={fromPt} label={t('slopeFromPoint')} onPick={() => setPicker('from')} />
          <button
            style={{ width: 32, height: 32, backgroundColor: NAVY, border: 'none', borderRadius: 7, color: '#fff', fontSize: 17, fontWeight: 800, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, marginBottom: 1 }}
            onClick={handleSwap} title={t('slopeSwapTip')}
          >⇆</button>
          <PointSelectCard pt={toPt} label={t('slopeToPoint')} onPick={() => setPicker('to')} />
        </div>
        <div>
          <div style={LBL}>{t('slopeHorizDist')}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="number" inputMode="decimal" value={dist}
              onChange={e => { setDist(e.target.value); setSavedCombo(null); }}
              onFocus={() => { if (dist === '0' || dist === '0.00') { setDist(''); } }}
              placeholder="0.00"
              style={{ flex: 1, height: 36, borderRadius: 7, border: `1.5px solid ${validDist ? BLUE_ACC : BORDER}`, padding: '0 10px', fontSize: 16, fontWeight: 700, color: TEXT_PRI, backgroundColor: SURFACE, outline: 'none', boxSizing: 'border-box' as const }}
            />
            <span style={{ fontSize: 15, fontWeight: 800, color: TEXT_PRI, minWidth: 22 }}>{t('slopeFtUnit')}</span>
          </div>
        </div>
        {samePoint && <div style={{ fontSize: 14, fontWeight: 700, color: RED_DARK }}>{t('slopeSamePointErr')}</div>}
        {fromPt && !validFrom && <div style={{ fontSize: 14, fontWeight: 700, color: RED_DARK }}>{t('slopeNoElevFrom')}</div>}
        {toPt   && !validTo   && <div style={{ fontSize: 14, fontWeight: 700, color: RED_DARK }}>{t('slopeNoElevTo')}</div>}
      </div>

      {/* Results */}
      {result && (
        <>
          <div style={{ backgroundColor: dc, borderRadius: 8, padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 18, fontWeight: 900, color: '#fff', letterSpacing: 0.2 }}>
              {dirIcon(result.dir)} {dirLabel(result.dir)}
            </span>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.88)', textAlign: 'right' as const }}>
              {fromPt!.label} → {toPt!.label}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 5 }}>
            {([
              { key: 'slopeElevDiff', value: `${sign(result.diff)}${result.diff.toFixed(3)}ft`, color: dc },
              { key: 'slopeSlopePct', value: `${sign(result.pct)}${result.pct.toFixed(2)}%`,    color: dc },
              { key: 'slopeRatioLbl', value: result.ratio != null ? `1:${result.ratio.toFixed(1)}` : '—', color: TEXT_PRI },
              { key: 'slopeAngleLbl', value: `${result.angle.toFixed(2)}°`, color: TEXT_PRI },
            ] as const).map(({ key, value, color }) => (
              <div key={key} style={{ backgroundColor: CARD, borderRadius: 7, border: `1px solid ${BORDER}`, padding: '7px 8px' }}>
                <div style={{ fontSize: 11.5, fontWeight: 800, color: TEXT_PRI, letterSpacing: 0.4, textTransform: 'uppercase' as const, marginBottom: 3 }}>{t(key)}</div>
                <div style={{ fontSize: 17, fontWeight: 900, color, fontFamily: 'monospace', lineHeight: 1.2 }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Clear + Save buttons */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              style={{ flex: '0 0 auto', height: 36, paddingLeft: 16, paddingRight: 16, backgroundColor: SURFACE, border: `1.5px solid ${BORDER_B}`, borderRadius: 8, color: TEXT_SEC, fontSize: 15, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.2 }}
              onClick={() => { setFromId(null); setToId(null); setDist(''); setSavedCombo(null); }}
            >{t('slopeClearBtn')}</button>
            <button
              style={{
                flex: 1, height: 36,
                backgroundColor: alreadySaved ? '#6B7280' : NAVY,
                border: 'none', borderRadius: 8,
                color: '#fff', fontSize: 15, fontWeight: 800,
                cursor: alreadySaved ? 'default' : 'pointer',
                letterSpacing: 0.3,
                boxShadow: alreadySaved ? 'none' : '0 2px 6px rgba(20,58,99,0.25)',
                opacity: alreadySaved ? 0.55 : 1,
                transition: 'background-color 0.2s, opacity 0.2s',
              }}
              onClick={handleSave}
              disabled={alreadySaved}
            >{alreadySaved ? t('slopeSavedCalc') : t('slopeSaveCalc')}</button>
          </div>
        </>
      )}

      {/* Info tip modal */}
      {showSlopeTip && (
        <CenteredOverlay onClose={() => setShowSlopeTip(false)}>
          <div style={{ width: '100%', maxWidth: 380, backgroundColor: CARD, borderRadius: 14, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.28)' }}>
            <div style={{ backgroundColor: NAVY, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>
                {lang === 'es' ? 'Cómo Usar Calcular Pendiente' : 'How to Use Find Slope'}
              </span>
              <button style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.8)', fontSize: 22, cursor: 'pointer', padding: 0, lineHeight: 1 }} onClick={() => setShowSlopeTip(false)}>✕</button>
            </div>
            <div style={{ padding: '14px 16px', fontSize: 14, color: TEXT_SEC, lineHeight: 1.65, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {lang === 'es' ? (
                <>
                  <p style={{ margin: 0 }}><strong style={{ color: TEXT_PRI }}>Punto de Origen</strong> — Toca el campo "PUNTO DE ORIGEN" y selecciona el punto de inicio. Solo se muestran puntos con datos de elevación.</p>
                  <p style={{ margin: 0 }}><strong style={{ color: TEXT_PRI }}>Punto de Destino</strong> — Toca el campo "PUNTO DE DESTINO" y selecciona el punto final.</p>
                  <p style={{ margin: 0 }}><strong style={{ color: TEXT_PRI }}>Distancia Horizontal</strong> — Ingresa la distancia horizontal entre los dos puntos en pies.</p>
                  <p style={{ margin: 0 }}><strong style={{ color: TEXT_PRI }}>Resultados</strong> — La pendiente se calcula como la diferencia de elevación dividida entre la distancia. Verás la diferencia de elevación, el porcentaje de pendiente, la razón y el ángulo.</p>
                  <p style={{ margin: 0 }}><strong style={{ color: TEXT_PRI }}>Guardar</strong> — Toca "Guardar Cálculo" para guardarlo en el Historial. Usa el botón ⇆ para intercambiar el origen y el destino.</p>
                </>
              ) : (
                <>
                  <p style={{ margin: 0 }}><strong style={{ color: TEXT_PRI }}>From Point</strong> — Tap the FROM POINT field and select your starting point. Only points with elevation data are shown.</p>
                  <p style={{ margin: 0 }}><strong style={{ color: TEXT_PRI }}>To Point</strong> — Tap the TO POINT field and select the ending point.</p>
                  <p style={{ margin: 0 }}><strong style={{ color: TEXT_PRI }}>Horizontal Distance</strong> — Enter the horizontal distance between the two points in feet.</p>
                  <p style={{ margin: 0 }}><strong style={{ color: TEXT_PRI }}>Results</strong> — Slope is calculated as the elevation difference divided by horizontal distance. You'll see Elevation Difference, Slope %, Ratio, and Angle.</p>
                  <p style={{ margin: 0 }}><strong style={{ color: TEXT_PRI }}>Save</strong> — Tap "Save Calculation" to save to History. Use the ⇆ button to swap From and To points.</p>
                </>
              )}
              <button
                style={{ alignSelf: 'flex-start', marginTop: 4, background: BLUE, color: '#fff', border: 'none', borderRadius: 6, padding: '7px 18px', fontSize: 14, cursor: 'pointer', fontWeight: 700 }}
                onClick={() => setShowSlopeTip(false)}
              >{t('gotIt')}</button>
            </div>
          </div>
        </CenteredOverlay>
      )}

      {/* Point pickers */}
      {picker === 'from' && (
        <PointPickerModal points={points} setMap={setMap} selectedId={fromId}
          title={t('slopeSelectFrom')}
          onSelect={id => { setFromId(id); setSavedCombo(null); }}
          onClose={() => setPicker(null)} />
      )}
      {picker === 'to' && (
        <PointPickerModal points={points} setMap={setMap} selectedId={toId}
          title={t('slopeSelectTo')}
          onSelect={id => { setToId(id); setSavedCombo(null); }}
          onClose={() => setPicker(null)} />
      )}
    </div>
  );
}

// ─── 2. History Tab ───────────────────────────────────────────────────────────
interface HistoryTabProps {
  savedCalcs: SavedCalc[];
  onDelete:   (id: string) => void;
  onEdit:     (c: SavedCalc) => void;
}

function HistoryTab({ savedCalcs, onDelete, onEdit }: HistoryTabProps) {
  const { t } = useLang();
  // 'list' = 4-entry preview, 'all' = full-page scrollable history
  const [view,       setView]       = useState<'list' | 'all'>('list');
  const [detailCalc, setDetailCalc] = useState<SavedCalc | null>(null);
  const [menuId,     setMenuId]     = useState<string | null>(null);

  const visibleCalcs = savedCalcs.slice(0, HISTORY_VISIBLE);
  const hasMore      = savedCalcs.length > HISTORY_VISIBLE;

  const handleEdit = (c: SavedCalc) => {
    setDetailCalc(null);
    setView('list');
    onEdit(c);
  };

  // Shared entry row used in both views
  function HistoryEntry({ c }: { c: SavedCalc }) {
    const dc = dirColor(c.dir);
    const isMenu = menuId === c.id;
    return (
      <div style={{ position: 'relative' }}>
        <div
          style={{ backgroundColor: CARD, borderRadius: 9, border: `1px solid ${BORDER}`, padding: '9px 11px', display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }}
          onClick={() => { setMenuId(null); setDetailCalc(c); }}
        >
          <div style={{ width: 34, height: 34, backgroundColor: dc, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 16, color: '#fff' }}>{dirIcon(c.dir)}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: TEXT_PRI }}>{c.fromLabel} → {c.toLabel}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: dc }}>{sign(c.slopePct)}{c.slopePct.toFixed(2)}%</span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: TEXT_SEC, marginTop: 2 }}>
              {c.distance.toFixed(1)} ft · <span style={{ color: dc }}>{c.dir === 'uphill' ? '▲' : c.dir === 'downhill' ? '▼' : 'Δ'}</span> {sign(c.diff)}{c.diff.toFixed(3)} ft
            </div>
          </div>
          <button
            style={{ background: 'none', border: 'none', color: TEXT_DIS, fontSize: 20, cursor: 'pointer', padding: '2px 4px', lineHeight: 1, flexShrink: 0 }}
            onClick={e => { e.stopPropagation(); setMenuId(isMenu ? null : c.id); }}
          >⋮</button>
        </div>
        {isMenu && (
          <div style={{ position: 'absolute', right: 4, top: 42, backgroundColor: CARD, borderRadius: 8, border: `1px solid ${BORDER}`, boxShadow: '0 4px 14px rgba(0,0,0,0.14)', zIndex: 10, minWidth: 120, overflow: 'hidden' }}>
            <button style={{ display: 'block', width: '100%', textAlign: 'left' as const, padding: '9px 14px', fontSize: 13, fontWeight: 700, color: NAVY, background: 'none', border: 'none', borderBottom: `1px solid ${BORDER}`, cursor: 'pointer' }}
              onClick={e => { e.stopPropagation(); setMenuId(null); handleEdit(c); }}>{t('edit')}</button>
            <button style={{ display: 'block', width: '100%', textAlign: 'left' as const, padding: '9px 14px', fontSize: 13, fontWeight: 700, color: RED_DARK, background: 'none', border: 'none', cursor: 'pointer' }}
              onClick={e => { e.stopPropagation(); setMenuId(null); if (window.confirm(t('slopeDeleteCalcConfirm'))) onDelete(c.id); }}>{t('delete')}</button>
          </div>
        )}
      </div>
    );
  }

  // ── Full-page "All Calculations" view ──────────────────────────────────────
  if (view === 'all') {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: '#F5F4F0' }}>

        {/* Page header */}
        <div style={{ backgroundColor: NAVY, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <button
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: 700, cursor: 'pointer', padding: '2px 0', display: 'flex', alignItems: 'center', gap: 4 }}
            onClick={() => { setMenuId(null); setView('list'); }}
          >‹ {t('slopeBackBtn')}</button>
          <span style={{ fontSize: 15, fontWeight: 800, color: '#fff', flex: 1, textAlign: 'center' as const }}>
            {t('slopeHistoryTitle')} ({savedCalcs.length})
          </span>
          {/* spacer to balance the back button */}
          <div style={{ width: 60 }} />
        </div>

        {/* Scrollable full list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 5 }}>
          {savedCalcs.length === 0 ? (
            <div style={{ padding: '36px 20px', textAlign: 'center', color: TEXT_DIS, fontSize: 13, fontWeight: 600 }}>
              {t('slopeNoHistory')}
            </div>
          ) : (
            savedCalcs.map(c => <HistoryEntry key={c.id} c={c} />)
          )}
        </div>

        {/* Detail modal renders over the full-page view */}
        {detailCalc && (
          <CalcDetailModal
            calc={detailCalc}
            onClose={() => setDetailCalc(null)}
            onEdit={() => handleEdit(detailCalc)}
            onDelete={() => { onDelete(detailCalc.id); setDetailCalc(null); }}
          />
        )}
      </div>
    );
  }

  // ── Default: 4-entry preview list ─────────────────────────────────────────
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 5 }}>

      {savedCalcs.length === 0 ? (
        <div style={{ backgroundColor: CARD, borderRadius: 10, border: `1px solid ${BORDER}`, padding: '36px 20px', textAlign: 'center', color: TEXT_DIS, fontSize: 13, fontWeight: 600, marginTop: 8 }}>
          {t('slopeNoHistory')}
        </div>
      ) : (
        <>
          {/* 4 most recent — no section header */}
          {visibleCalcs.map(c => <HistoryEntry key={c.id} c={c} />)}

          {/* View All navigation row */}
          <div
            style={{ backgroundColor: CARD, borderRadius: 9, border: `1px solid ${BORDER}`, padding: '10px 13px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
            onClick={() => { setMenuId(null); setView('all'); }}
          >
            <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>
              {t('slopeViewAllCalcs')}{hasMore ? ` (${savedCalcs.length})` : ''}
            </span>
            <span style={{ fontSize: 16, color: NAVY }}>›</span>
          </div>
        </>
      )}

      {/* Detail Modal */}
      {detailCalc && (
        <CalcDetailModal
          calc={detailCalc}
          onClose={() => setDetailCalc(null)}
          onEdit={() => handleEdit(detailCalc)}
          onDelete={() => { onDelete(detailCalc.id); setDetailCalc(null); }}
        />
      )}
    </div>
  );
}

// ─── 3. Target Slope Tab ──────────────────────────────────────────────────────
function TargetSlopeTab({ points, setMap }: { points: SurveyPoint[]; setMap: Record<string, SurveySet> }) {
  const { t } = useLang();
  const [startId,    setStartId]    = useState<string | null>(null);
  const [slopePct,   setSlopePct]   = useState('');
  const [distance,   setDistance]   = useState('');
  const [dir,        setDir]        = useState<'uphill' | 'downhill'>('downhill');
  const [showPicker, setShowPicker] = useState(false);

  const handleClear = useCallback(() => {
    setStartId(null);
    setSlopePct('');
    setDistance('');
    setDir('downhill');
  }, []);

  const startPt   = startId ? points.find(p => p.id === startId) ?? null : null;
  const startElev = startPt?.bmElevation ?? 0;
  const slopeN    = parseFloat(slopePct);
  const distN     = parseFloat(distance);

  const valid = startPt != null && startElev > 0 &&
    !isNaN(slopeN) && slopeN >= 0 &&
    !isNaN(distN)  && distN  > 0;

  const elevChange = valid ? distN * (slopeN / 100) : 0;
  const reqElev    = valid ? (dir === 'uphill' ? startElev + elevChange : startElev - elevChange) : 0;
  const rc         = dir === 'uphill' ? GREEN_DARK : RED_DARK;

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ backgroundColor: CARD, borderRadius: 10, border: `1px solid ${BORDER}`, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            style={{ height: 28, paddingLeft: 12, paddingRight: 12, backgroundColor: SURFACE, border: `1.5px solid ${BORDER_B}`, borderRadius: 7, color: TEXT_SEC, fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.2 }}
            onClick={handleClear}
          >{t('slopeClearBtn')}</button>
        </div>
        <div>
          <div style={LBL}>{t('slopeStartPoint')}</div>
          <div
            style={{ backgroundColor: startPt ? BLUE_DEEP : SURFACE, border: `1.5px solid ${startPt ? BLUE_ACC : BORDER}`, borderRadius: 8, padding: '7px 10px', cursor: 'pointer', minHeight: 48 }}
            onClick={() => setShowPicker(true)}
          >
            {startPt ? (
              <>
                <div style={{ fontSize: 13, fontWeight: 900, color: BLUE_ACC }}>{startPt.label}{startPt.pointName ? ` · ${startPt.pointName}` : ''}</div>
                {startElev > 0
                  ? <div style={{ fontSize: 11, fontWeight: 700, color: TEXT_SEC, marginTop: 2 }}>{t('slopeCurrElev')} {startElev.toFixed(3)} {t('slopeFtUnit')}</div>
                  : <div style={{ fontSize: 11, color: RED_DARK, marginTop: 2, fontWeight: 700 }}>{t('slopeStartNoElev')}</div>
                }
              </>
            ) : (
              <div style={{ fontSize: 12, fontWeight: 700, color: '#6B7280', marginTop: 5 }}>{t('slopeTapSelectStart')}</div>
            )}
          </div>
        </div>
        <div>
          <div style={LBL}>{t('slopeTargetSlope')}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="number" inputMode="decimal" value={slopePct} onChange={e => setSlopePct(e.target.value)} placeholder="2.00"
              style={{ flex: 1, height: 38, borderRadius: 7, border: `1.5px solid ${BORDER}`, padding: '0 10px', fontSize: 16, fontWeight: 700, color: TEXT_PRI, backgroundColor: SURFACE, outline: 'none', boxSizing: 'border-box' as const }} />
            <span style={{ fontSize: 14, fontWeight: 800, color: TEXT_PRI }}>%</span>
          </div>
        </div>
        <div>
          <div style={LBL}>{t('slopeHorizDist')}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="number" inputMode="decimal" value={distance} onChange={e => setDistance(e.target.value)} placeholder="0.00"
              style={{ flex: 1, height: 38, borderRadius: 7, border: `1.5px solid ${BORDER}`, padding: '0 10px', fontSize: 16, fontWeight: 700, color: TEXT_PRI, backgroundColor: SURFACE, outline: 'none', boxSizing: 'border-box' as const }} />
            <span style={{ fontSize: 14, fontWeight: 800, color: TEXT_PRI }}>{t('slopeFtUnit')}</span>
          </div>
        </div>
        <div>
          <div style={LBL}>{t('slopeDirection')}</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['downhill', 'uphill'] as const).map(d => {
              const active = dir === d;
              const btnC   = d === 'uphill' ? GREEN_DARK : RED_DARK;
              return (
                <button key={d}
                  style={{ flex: 1, height: 36, borderRadius: 7, border: `1.5px solid ${active ? btnC : BORDER}`, backgroundColor: active ? `${btnC}14` : SURFACE, fontSize: 13, fontWeight: 800, color: active ? btnC : TEXT_SEC, cursor: 'pointer' }}
                  onClick={() => setDir(d)}
                >{d === 'downhill' ? `↘ ${t('slopeDownhill')}` : `↗ ${t('slopeUphill')}`}</button>
              );
            })}
          </div>
        </div>
      </div>

      {valid && (
        /* Single 3-column row: Start Elevation | Elev. Change | Required Elevation */
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, alignItems: 'stretch' }}>

          {/* Start Elevation */}
          <div style={{ backgroundColor: CARD, borderRadius: 9, border: `1px solid ${BORDER}`, padding: '8px 9px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 9, fontWeight: 800, color: TEXT_SEC, letterSpacing: 0.4, textTransform: 'uppercase' as const, marginBottom: 4 }}>{t('slopeStartElev')}</div>
            <div style={{ fontSize: 14, fontWeight: 900, color: TEXT_PRI, fontFamily: 'monospace', lineHeight: 1.2 }}>{startElev.toFixed(3)}<span style={{ fontSize: 10, fontWeight: 700, marginLeft: 2 }}>{t('slopeFtUnit')}</span></div>
          </div>

          {/* Elevation Change */}
          <div style={{ backgroundColor: CARD, borderRadius: 9, border: `1px solid ${BORDER}`, padding: '8px 9px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 9, fontWeight: 800, color: TEXT_SEC, letterSpacing: 0.4, textTransform: 'uppercase' as const, marginBottom: 4 }}>{t('slopeElevChange')}</div>
            <div style={{ fontSize: 14, fontWeight: 900, color: rc, fontFamily: 'monospace', lineHeight: 1.2 }}>
              {dir === 'uphill' ? '+' : '−'}{elevChange.toFixed(3)}<span style={{ fontSize: 10, fontWeight: 700, marginLeft: 2 }}>{t('slopeFtUnit')}</span>
            </div>
          </div>

          {/* Required Elevation — color-coded to match direction */}
          <div style={{ backgroundColor: rc, borderRadius: 9, padding: '8px 9px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxShadow: `0 2px 8px ${rc}44` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: 'rgba(255,255,255,0.80)', letterSpacing: 0.4, textTransform: 'uppercase' as const }}>{t('slopeReqElev')}</div>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)' }}>{dir === 'uphill' ? '↗' : '↘'}</span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 900, color: '#fff', fontFamily: 'monospace', lineHeight: 1.2, marginTop: 4 }}>
              {reqElev.toFixed(3)}<span style={{ fontSize: 10, fontWeight: 700, marginLeft: 2 }}>{t('slopeFtUnit')}</span>
            </div>
          </div>

        </div>
      )}

      {showPicker && (
        <PointPickerModal points={points} setMap={setMap} selectedId={startId}
          title={t('slopeSelectStart')} onSelect={setStartId} onClose={() => setShowPicker(false)} />
      )}
    </div>
  );
}

// ─── Main SlopeScreen ─────────────────────────────────────────────────────────
export default function SlopeScreen({ projectId, initFromId, initToId, onInitConsumed }: Props) {
  const { t } = useLang();
  const { getPoints, getSets } = useSurveyStore();
  const points = getPoints(projectId);
  const sets   = getSets(projectId);

  const setMap = useMemo<Record<string, SurveySet>>(() => {
    const m: Record<string, SurveySet> = {};
    sets.forEach(s => { m[s.id] = s; });
    return m;
  }, [sets]);

  const [activeTab,   setActiveTab]   = useState<SlopeSubTab>('find');
  const LS_KEY = `slope:calcs:${projectId}`;

  const [savedCalcs,  setSavedCalcs]  = useState<SavedCalc[]>(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? (JSON.parse(raw) as SavedCalc[]) : [];
    } catch { return []; }
  });
  const [pendingEdit,   setPendingEdit]   = useState<SavedCalc | null>(null);
  const [pendingFromId, setPendingFromId] = useState<string | null>(null);
  const [pendingToId,   setPendingToId]   = useState<string | null>(null);

  // React to initFromId prop (set by App when "Find Slope" is tapped on Point Details)
  useEffect(() => {
    if (initFromId) {
      setPendingFromId(initFromId);
      setPendingToId(initToId ?? null);
      setActiveTab('find');
      onInitConsumed?.();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initFromId, initToId]);

  // Persist on every change
  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(savedCalcs)); } catch {}
  }, [savedCalcs, LS_KEY]);

  const handleSave   = useCallback((c: SavedCalc) =>
    setSavedCalcs(prev => [c, ...prev].slice(0, MAX_HISTORY)), []);
  const handleDelete = useCallback((id: string) =>
    setSavedCalcs(prev => prev.filter(c => c.id !== id)), []);

  // Called from HistoryTab when user taps Edit — switches to Find Slope with values loaded
  const handleEditCalc = useCallback((c: SavedCalc) => {
    setPendingEdit(c);
    setActiveTab('find');
  }, []);

  const TABS: { id: SlopeSubTab; label: string }[] = [
    { id: 'find',    label: t('slopeTabFind')    },
    { id: 'profile', label: t('slopeTabProfile') }, // label now reads "History"
    { id: 'target',  label: t('slopeTabTarget')  },
  ];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: '#F5F4F0' }}>

      <div style={{ display: 'flex', backgroundColor: GOLD, padding: '4px 7px', gap: 5, flexShrink: 0 }}>
        {TABS.map(tab => {
          const active = activeTab === tab.id;
          return (
            <button key={tab.id}
              style={{ flex: 1, height: 34, borderRadius: 8, border: `1.5px solid ${active ? 'rgba(0,0,0,0.07)' : 'rgba(140,95,0,0.20)'}`, backgroundColor: active ? '#FFFFFF' : GOLD, color: NAVY, fontSize: 16, fontWeight: 700, cursor: 'pointer', boxShadow: active ? '0 1px 4px rgba(0,0,0,0.10)' : 'none', transition: 'background-color 0.15s, border-color 0.15s' }}
              onClick={() => setActiveTab(tab.id)}
            >{tab.label}</button>
          );
        })}
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: activeTab === 'find'    ? 'flex' : 'none', flexDirection: 'column' as const }}>
        <FindSlopeTab
          points={points} setMap={setMap}
          onSave={handleSave}
          pendingEdit={pendingEdit}
          onPendingEditConsumed={() => setPendingEdit(null)}
          pendingFromId={pendingFromId}
          pendingToId={pendingToId}
          onPendingFromToConsumed={() => { setPendingFromId(null); setPendingToId(null); }}
        />
      </div>
      <div style={{ flex: 1, overflow: 'hidden', display: activeTab === 'profile' ? 'flex' : 'none', flexDirection: 'column' as const }}>
        <HistoryTab
          savedCalcs={savedCalcs}
          onDelete={handleDelete}
          onEdit={handleEditCalc}
        />
      </div>
      <div style={{ flex: 1, overflow: 'hidden', display: activeTab === 'target'  ? 'flex' : 'none', flexDirection: 'column' as const }}>
        <TargetSlopeTab points={points} setMap={setMap} />
      </div>
    </div>
  );
}
