import { useState, useMemo, useCallback, useEffect, type CSSProperties, type ReactNode } from 'react';
import { useSurveyStore } from '../stores/surveyStore';
import { useLang } from '../LangContext';
import { SurveyPoint, SurveySet } from '../types';
import ConfirmModal from '../components/ConfirmModal';

// ─── Modal animation (shared id — injected once across all screens) ────────────
if (typeof document !== 'undefined' && !document.getElementById('anp-modal-anim')) {
  const _ss = document.createElement('style');
  _ss.id = 'anp-modal-anim';
  _ss.textContent = `
    @keyframes anpModalIn {
      from { opacity: 0; transform: scale(0.92) translateY(6px); }
      to   { opacity: 1; transform: scale(1) translateY(0); }
    }
    .anp-modal-in { animation: anpModalIn 0.20s cubic-bezier(0.22,1,0.36,1) both; }
    @keyframes targetResultsIn {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .target-results-in { animation: targetResultsIn 0.28s cubic-bezier(0.22,1,0.36,1) both; }
  `;
  document.head.appendChild(_ss);
}

// ─── Design tokens ─────────────────────────────────────────────────────────────
const NAVY      = '#143A63';
const BLUE      = '#1E5799';
const BLUE_ACC  = '#3B82F6';
const BLUE_DEEP = 'rgba(30,87,153,0.10)';
// const GOLD removed — no longer used after tab redesign
const GREEN_DARK = '#1A7A3F';
const RED_DARK   = '#B83228';
const TEXT_PRI  = '#111827';
const TEXT_SEC  = '#374151';
const TEXT_DIS  = '#9CA3AF';
const SURFACE   = '#F0EEE8';
const CARD      = '#FFFFFF';
const BORDER    = '#E5E7EB';

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
  const W = 340, H = 232;
  const PL = 50, PR = 14, PT = 22, PB = 22;
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
      <text x={PL + PW / 2} y={PT + PH + 20} textAnchor="middle" fontSize="8" fontWeight="700" fill={TEXT_DIS}>
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
  const [detailConfirm, setDetailConfirm] = useState<null | { onConfirm: () => void }>(null);

  function dirLabel(dir: string) {
    if (dir === 'uphill')   return t('slopeUphill');
    if (dir === 'downhill') return t('slopeDownhill');
    return t('slopeFlat');
  }

  const handleDelete = () => {
    setDetailConfirm({
      onConfirm: () => {
        setDetailConfirm(null);
        onDelete();
      },
    });
  };

  return (
    <CenteredOverlay onClose={onClose}>
      <div style={{ width: '100%', maxWidth: 430, maxHeight: '92vh', backgroundColor: CARD, borderRadius: 14, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.28)' }}>

        {/* Header */}
        <div style={{ backgroundColor: NAVY, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontSize: 17, fontWeight: 800, color: '#fff', letterSpacing: 0.2 }}>{t('slopeCalcDetail')}</span>
          <button style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.8)', fontSize: 22, cursor: 'pointer', padding: 0, lineHeight: 1 }} onClick={onClose}>✕</button>
        </div>

        {/* Direction banner */}
        <div style={{ backgroundColor: dc, padding: '7px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontSize: 17, fontWeight: 900, color: '#fff' }}>{dirIcon(calc.dir)} {dirLabel(calc.dir)}</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>{calc.fromLabel} → {calc.toLabel}</span>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>

          {/* Graph — primary focal point */}
          <div style={{ backgroundColor: SURFACE, borderRadius: 9, padding: '8px 4px 4px' }}>
            <CalcProfileChart
              elevA={calc.fromElev} elevB={calc.toElev} distN={calc.distance}
              labelA={calc.fromLabel} labelB={calc.toLabel}
            />
          </div>

          {/* Horizontal Distance card */}
          <div style={{ backgroundColor: SURFACE, borderRadius: 7, border: `1px solid ${BORDER}`, padding: '9px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: TEXT_SEC, letterSpacing: 0.5, textTransform: 'uppercase' as const }}>{t('slopeDistanceLbl')}</span>
            <span style={{ fontSize: 17, fontWeight: 900, color: TEXT_PRI, fontFamily: 'monospace' }}>{calc.distance.toFixed(2)} ft</span>
          </div>

          {/* 4 metric cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 5 }}>
            {([
              { lbl: t('slopeElevDiff'), val: `${sign(calc.diff)}${calc.diff.toFixed(3)}ft`, c: dc },
              { lbl: t('slopeSlopePct'), val: `${sign(calc.slopePct)}${calc.slopePct.toFixed(2)}%`, c: dc },
              { lbl: t('slopeRatioLbl'), val: calc.ratio != null ? `1:${calc.ratio.toFixed(1)}` : '—', c: TEXT_PRI },
              { lbl: t('slopeAngleLbl'), val: `${calc.angle.toFixed(2)}°`, c: TEXT_PRI },
            ]).map(({ lbl, val, c }) => (
              <div key={lbl} style={{ backgroundColor: SURFACE, borderRadius: 7, border: `1px solid ${BORDER}`, padding: '6px 7px' }}>
                <div style={{ fontSize: 10.5, fontWeight: 800, color: TEXT_SEC, letterSpacing: 0.4, textTransform: 'uppercase' as const, marginBottom: 2 }}>{lbl}</div>
                <div style={{ fontSize: 15, fontWeight: 900, color: c, fontFamily: 'monospace', lineHeight: 1.2 }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Date & Time */}
          <div style={{ backgroundColor: SURFACE, borderRadius: 7, border: `1px solid ${BORDER}`, padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: TEXT_SEC }}>{t('slopeDateTimeLbl')}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: TEXT_PRI, fontFamily: 'monospace' }}>{fmtDateTime(calc.savedAt)}</span>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, paddingBottom: 4 }}>
            <button style={{ flex: 1, height: 42, backgroundColor: NAVY, border: 'none', borderRadius: 8, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' }} onClick={onEdit}>{t('edit')}</button>
            <button style={{ flex: 1, height: 42, backgroundColor: RED_DARK, border: 'none', borderRadius: 8, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' }} onClick={handleDelete}>{t('delete')}</button>
          </div>
        </div>
      </div>
      {detailConfirm && (
        <ConfirmModal
          message={t('slopeDeleteCalcConfirm')}
          confirmLabel={t('delete')}
          cancelLabel={t('cancel')}
          danger
          onConfirm={detailConfirm.onConfirm}
          onCancel={() => setDetailConfirm(null)}
        />
      )}
    </CenteredOverlay>
  );
}

// ─── Stacked fraction for rod reading in picker ───────────────────────────────
function PickerFrac({ feet, inches, fracLbl }: { feet: string; inches: number; fracLbl: string }) {
  const hasFrac = !!(fracLbl && fracLbl !== 'None' && fracLbl !== '');
  const clean   = hasFrac ? fracLbl.replace(/"/g, '') : '';
  const parts   = clean.split('/');
  const num     = parts.length === 2 ? parseInt(parts[0], 10) : NaN;
  const den     = parts.length === 2 ? parseInt(parts[1], 10) : NaN;
  const sz      = 11;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 1, fontSize: sz, fontWeight: 700, color: TEXT_PRI, fontFamily: 'monospace' }}>
      <span>{feet}′ {inches}″</span>
      {hasFrac && !isNaN(num) && !isNaN(den) && (
        <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.1, marginLeft: 2 }}>
          <span style={{ fontSize: sz - 2, fontWeight: 800, lineHeight: 1 }}>{num}</span>
          <span style={{ display: 'block', height: 1, width: '100%', backgroundColor: TEXT_PRI }} />
          <span style={{ fontSize: sz - 2, fontWeight: 800, lineHeight: 1 }}>{den}</span>
        </span>
      )}
    </span>
  );
}

// ─── Point Picker Modal ───────────────────────────────────────────────────────
interface PickerProps {
  points: SurveyPoint[]; setMap: Record<string, SurveySet>;
  selectedId: string | null; title: string;
  onSelect: (id: string) => void; onClose: () => void;
}

type SortOrder = 'label' | 'newest' | 'oldest';

function PointPickerModal({ points, setMap, selectedId, title, onSelect, onClose }: PickerProps) {
  const { t } = useLang();
  const [q,          setQ]          = useState('');
  const [sortOrder,  setSortOrder]  = useState<SortOrder>('label');
  const [showFilter, setShowFilter] = useState(false);

  const eligible = useMemo(() => points.filter(p => (p.bmElevation ?? 0) > 0), [points]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    const base  = query
      ? eligible.filter(p =>
          p.label.toLowerCase().includes(query) ||
          (p.pointName ?? '').toLowerCase().includes(query) ||
          (setMap[p.setId ?? '']?.name ?? '').toLowerCase().includes(query))
      : eligible;
    return [...base].sort((a, b) => {
      if (sortOrder === 'newest') return b.createdAt - a.createdAt;
      if (sortOrder === 'oldest') return a.createdAt - b.createdAt;
      return a.label.localeCompare(b.label, undefined, { numeric: true });
    });
  }, [eligible, q, setMap, sortOrder]);

  const filterActive = sortOrder !== 'label';

  return (
    <div
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px', boxSizing: 'border-box' as const }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="anp-modal-in"
        style={{ backgroundColor: CARD, borderRadius: 18, maxWidth: 440, width: '100%', maxHeight: '82vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.28)' }}>

        {/* Header */}
        <div style={{ backgroundColor: NAVY, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: '#FFFFFF', lineHeight: 1.2 }}>{title}</span>
          <button style={{ background: 'none', border: 'none', color: '#FFFFFF', fontSize: 24, fontWeight: 700, lineHeight: 1, cursor: 'pointer', padding: '4px 6px', opacity: 0.85 }} onClick={onClose}>✕</button>
        </div>

        {/* Search + Filter row */}
        <div style={{ padding: '8px 12px', flexShrink: 0, position: 'relative' }}>
          <div style={{ display: 'flex', gap: 7 }}>
            <input
              value={q} onChange={e => setQ(e.target.value)}
              placeholder={t('slopeSearchPts')}
              style={{ flex: 1, height: 36, borderRadius: 7, border: `1.5px solid ${BORDER}`, padding: '0 10px', fontSize: 13, color: TEXT_PRI, backgroundColor: SURFACE, outline: 'none', boxSizing: 'border-box' as const }}
            />
            <button
              onClick={() => setShowFilter(f => !f)}
              style={{
                height: 36, paddingLeft: 11, paddingRight: 11, flexShrink: 0,
                borderRadius: 7,
                border: `1.5px solid ${filterActive ? BLUE_ACC : BORDER}`,
                backgroundColor: filterActive ? BLUE_DEEP : SURFACE,
                color: filterActive ? BLUE_ACC : TEXT_SEC,
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 4,
                whiteSpace: 'nowrap' as const,
              }}
            >
              Filter {showFilter ? '▲' : '▼'}
            </button>
          </div>

          {/* Filter dropdown */}
          {showFilter && (
            <div style={{
              position: 'absolute', right: 12, top: 46, zIndex: 20,
              backgroundColor: CARD, borderRadius: 8, border: `1px solid ${BORDER}`,
              boxShadow: '0 4px 16px rgba(0,0,0,0.14)', overflow: 'hidden', minWidth: 172,
            }}>
              {([
                { key: 'newest' as SortOrder, label: 'Newest to Oldest' },
                { key: 'oldest' as SortOrder, label: 'Oldest to Newest' },
              ]).map((opt, i, arr) => (
                <button key={opt.key}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left' as const,
                    padding: '10px 14px', fontSize: 13,
                    fontWeight: sortOrder === opt.key ? 800 : 600,
                    color: sortOrder === opt.key ? NAVY : TEXT_SEC,
                    backgroundColor: sortOrder === opt.key ? BLUE_DEEP : 'transparent',
                    border: 'none',
                    borderBottom: i < arr.length - 1 ? `1px solid ${BORDER}` : 'none',
                    cursor: 'pointer',
                  }}
                  onClick={() => { setSortOrder(opt.key); setShowFilter(false); }}
                >
                  {sortOrder === opt.key ? '✓ ' : ''}{opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Point list */}
        <div
          style={{ flex: 1, overflowY: 'auto', padding: '0 10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}
          onClick={() => { if (showFilter) setShowFilter(false); }}
        >
          {filtered.length === 0 && (
            <div style={{ padding: '28px 0', textAlign: 'center', color: TEXT_DIS, fontSize: 13 }}>
              {eligible.length === 0 ? t('slopeNoElevPts') : t('slopeNoMatchPts')}
            </div>
          )}
          {filtered.map(pt => {
            const setObj   = pt.setId ? setMap[pt.setId] : null;
            const isSel    = pt.id === selectedId;
            const hasRod   = pt.rodFeet !== undefined && pt.rodFeet !== '';
            const rodDec   = pt.engineeringFeet ?? 0;
            const setLbl   = setObj?.setLabel ?? null;
            const setName  = setObj?.name ?? null;

            return (
              <div key={pt.id}
                style={{ backgroundColor: isSel ? BLUE_DEEP : SURFACE, border: `1.5px solid ${isSel ? BLUE_ACC : BORDER}`, borderRadius: 10, padding: '9px 11px', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 9 }}
                onClick={() => { onSelect(pt.id); onClose(); }}>

                {/* Badge */}
                <div style={{ width: 40, height: 40, backgroundColor: isSel ? BLUE_ACC : BLUE, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: '#fff', letterSpacing: 0.2, textAlign: 'center' as const, lineHeight: 1.2 }}>{pt.label}</span>
                </div>

                {/* 4-row content */}
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>

                  {/* Row 1: PT7 • Sewer 1 */}
                  <div style={{ fontSize: 14, fontWeight: 800, color: TEXT_PRI, lineHeight: 1.3 }}>
                    {pt.label} • {pt.pointName ? pt.pointName : 'Unnamed Point'}
                  </div>

                  {/* Row 2: Elev. 986.500 ft */}
                  <div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: TEXT_SEC }}>Elev. </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: TEXT_PRI, fontFamily: 'monospace' }}>{(pt.bmElevation ?? 0).toFixed(3)} ft</span>
                  </div>

                  {/* Row 3: Rod. 12.71 ft | 12'-8 9/16" */}
                  {hasRod && (
                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0 4px' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: TEXT_SEC }}>Rod. </span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: TEXT_PRI, fontFamily: 'monospace' }}>{rodDec.toFixed(2)} ft</span>
                      <span style={{ fontSize: 11, color: TEXT_DIS }}>|</span>
                      <PickerFrac
                        feet={pt.rodFeet!}
                        inches={pt.rodInches ?? 0}
                        fracLbl={pt.rodFractionLabel ?? 'None'}
                      />
                    </div>
                  )}

                  {/* Row 4: SET-1 • Fence Start */}
                  {setObj && (setLbl || setName) && (
                    <div style={{ fontSize: 12, fontWeight: 600, color: TEXT_SEC, lineHeight: 1.35 }}>
                      <span style={{ whiteSpace: 'nowrap' as const, fontWeight: 700, color: NAVY }}>
                        {setLbl ?? 'SET'} •{' '}
                      </span>
                      <span>{setName}</span>
                    </div>
                  )}
                </div>

                {/* Selected checkmark */}
                {isSel && <span style={{ fontSize: 15, color: BLUE_ACC, fontWeight: 900, flexShrink: 0 }}>✓</span>}
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
  const [fromId,       setFromId]       = useState<string | null>(null);
  const [toId,         setToId]         = useState<string | null>(null);
  const [dist,         setDist]         = useState('');
  const [distFocused,  setDistFocused]  = useState(false);
  const [picker,       setPicker]       = useState<'from' | 'to' | null>(null);
  const [showSlopeTip, setShowSlopeTip] = useState(false);
  const [showResults,  setShowResults]  = useState(false);
  const [committed,    setCommitted]    = useState<{
    result: ReturnType<typeof calcSlope>;
    fromPt: SurveyPoint;
    toPt:   SurveyPoint;
    distN:  number;
  } | null>(null);

  // Show '0.00' as a visual default when field is empty AND not focused.
  const distDisplay = (!dist && !distFocused) ? '0.00' : dist;

  // Load a pending edit from the History tab — return to input view with pre-filled values
  useEffect(() => {
    if (pendingEdit) {
      setFromId(pendingEdit.fromId);
      setToId(pendingEdit.toId);
      setDist(pendingEdit.distance.toString());
      setShowResults(false);
      setCommitted(null);
      onPendingEditConsumed();
    }
  }, [pendingEdit, onPendingEditConsumed]);

  // Load from/to pre-population triggered by "Find Slope" button on Point Details
  useEffect(() => {
    if (pendingFromId) {
      setFromId(pendingFromId);
      setToId(pendingToId ?? null);
      setDist('');
      setShowResults(false);
      setCommitted(null);
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

  const handleSwap = useCallback(() => { setFromId(toId); setToId(fromId); }, [fromId, toId]);

  const handleCalculate = useCallback(() => {
    if (!canCalc || !fromPt || !toPt || !fromId || !toId) return;
    const r = calcSlope(fromPt.bmElevation!, toPt.bmElevation!, distN);
    setCommitted({ result: r, fromPt, toPt, distN });
    setShowResults(true);
    onSave({
      id:        Date.now().toString(),
      fromId,    fromLabel: fromPt.label,  fromName: fromPt.pointName ?? '',  fromElev: fromPt.bmElevation!,
      toId,      toLabel:   toPt.label,    toName:   toPt.pointName ?? '',    toElev:   toPt.bmElevation!,
      distance:  distN,
      slopePct:  r.pct,
      diff:      r.diff,
      ratio:     r.ratio,
      angle:     r.angle,
      dir:       r.dir,
      savedAt:   Date.now(),
    });
  }, [canCalc, fromPt, toPt, fromId, toId, distN, onSave]);

  const handleCalcAnother = useCallback(() => {
    setShowResults(false);
    setFromId(null);
    setToId(null);
    setDist('');
    setCommitted(null);
  }, []);

  function dirLabel(dir: string) {
    if (dir === 'uphill')   return t('slopeUphill');
    if (dir === 'downhill') return t('slopeDownhill');
    return t('slopeFlat');
  }

  // ── Info tip modal (shared between both views) ────────────────────────────
  const infoTipModal = showSlopeTip ? (
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
              <p style={{ margin: 0 }}><strong style={{ color: TEXT_PRI }}>Calcular</strong> — Toca "Calcular" para ver los resultados. El cálculo se guarda automáticamente en el Historial. Usa el botón ⇆ para intercambiar el origen y el destino.</p>
            </>
          ) : (
            <>
              <p style={{ margin: 0 }}><strong style={{ color: TEXT_PRI }}>From Point</strong> — Tap the FROM POINT field and select your starting point. Only points with elevation data are shown.</p>
              <p style={{ margin: 0 }}><strong style={{ color: TEXT_PRI }}>To Point</strong> — Tap the TO POINT field and select the ending point.</p>
              <p style={{ margin: 0 }}><strong style={{ color: TEXT_PRI }}>Horizontal Distance</strong> — Enter the horizontal distance between the two points in feet.</p>
              <p style={{ margin: 0 }}><strong style={{ color: TEXT_PRI }}>Results</strong> — Slope is calculated as the elevation difference divided by horizontal distance. You'll see Elevation Difference, Slope %, Ratio, and Angle.</p>
              <p style={{ margin: 0 }}><strong style={{ color: TEXT_PRI }}>Calculate</strong> — Tap "Calculate" to view the results. The calculation is automatically saved to History. Use the ⇆ button to swap From and To points.</p>
            </>
          )}
          <button
            style={{ alignSelf: 'flex-start', marginTop: 4, background: BLUE, color: '#fff', border: 'none', borderRadius: 6, padding: '7px 18px', fontSize: 14, cursor: 'pointer', fontWeight: 700 }}
            onClick={() => setShowSlopeTip(false)}
          >{t('gotIt')}</button>
        </div>
      </div>
    </CenteredOverlay>
  ) : null;

  // ── RESULTS VIEW ──────────────────────────────────────────────────────────
  if (showResults && committed) {
    const { result, fromPt: cFromPt, toPt: cToPt, distN: cDistN } = committed;
    const dc = dirColor(result.dir);
    return (
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>

        {/* Banner + Summary + Graph — single connected card, no gap between them */}
        <div style={{ borderRadius: 10, overflow: 'hidden', border: `1px solid ${BORDER}`, flexShrink: 0 }}>
          {/* Banner */}
          <div style={{ backgroundColor: dc, padding: '4px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 16, fontWeight: 900, color: '#fff', letterSpacing: 0.2 }}>
              {dirIcon(result.dir)} {dirLabel(result.dir)}
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.88)' }}>
              {cFromPt.label} → {cToPt.label}
            </span>
          </div>
          {/* Summary rows */}
          <div style={{ backgroundColor: CARD, padding: '8px 14px 6px', display: 'flex', flexDirection: 'column', gap: 5 }}>
            {/* From Point */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: TEXT_SEC, textTransform: 'uppercase' as const, letterSpacing: 0.5, flexShrink: 0 }}>{t('slopeFromPoint')}</span>
              <div style={{ textAlign: 'right' as const, fontSize: 13, fontWeight: 700, color: NAVY }}>
                <b>{cFromPt.label}{cFromPt.pointName ? ` (${cFromPt.pointName})` : ''}</b>{' '}
                <span style={{ whiteSpace: 'nowrap' as const }}><b>• {(cFromPt.bmElevation ?? 0).toFixed(3)} ft Elevation</b></span>
              </div>
            </div>
            {/* To Point */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: TEXT_SEC, textTransform: 'uppercase' as const, letterSpacing: 0.5, flexShrink: 0 }}>{t('slopeToPoint')}</span>
              <div style={{ textAlign: 'right' as const, fontSize: 13, fontWeight: 700, color: NAVY }}>
                <b>{cToPt.label}{cToPt.pointName ? ` (${cToPt.pointName})` : ''}</b>{' '}
                <span style={{ whiteSpace: 'nowrap' as const }}><b>• {(cToPt.bmElevation ?? 0).toFixed(3)} ft Elevation</b></span>
              </div>
            </div>
            {/* Horizontal Distance */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: TEXT_SEC, textTransform: 'uppercase' as const, letterSpacing: 0.5, flexShrink: 0 }}>{t('slopeHorizDist')}</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: TEXT_PRI, fontFamily: '"Courier New", Courier, monospace' }}>{cDistN.toFixed(2)} ft</span>
            </div>
          </div>
          {/* Graph — lives inside the card, zero gap above */}
          <div style={{ lineHeight: 0 }}>
            <CalcProfileChart
              elevA={cFromPt.bmElevation!} elevB={cToPt.bmElevation!} distN={cDistN}
              labelA={cFromPt.label} labelB={cToPt.label}
            />
          </div>
        </div>

        {/* 4 metric cards */}
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

        {/* Calculate Another Slope */}
        <button
          style={{ height: 38, width: '100%', backgroundColor: NAVY, border: 'none', borderRadius: 10, color: '#fff', fontSize: 16, fontWeight: 800, cursor: 'pointer', letterSpacing: 0.3 }}
          onClick={handleCalcAnother}
        >{t('slopeCalcAnotherBtn')}</button>

        {infoTipModal}
      </div>
    );
  }

  // ── INPUT VIEW ────────────────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>

      {/* Inputs card */}
      <div style={{ backgroundColor: CARD, borderRadius: 10, border: `1px solid ${BORDER}`, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 8, position: 'relative' }}>

        {/* ⓘ button — absolutely positioned top-right, no layout impact */}
        <button
          style={{ position: 'absolute', top: 4, right: 4, background: 'none', border: 'none', color: '#1D4ED8', fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: '4px 6px', minWidth: 36, minHeight: 36, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', filter: 'drop-shadow(0 0 0.5px #1D4ED8)', zIndex: 1 }}
          onClick={() => setShowSlopeTip(true)}
        >ⓘ</button>

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
              type="text" inputMode="decimal" value={distDisplay}
              onChange={e => { setDist(e.target.value); }}
              onFocus={() => setDistFocused(true)}
              onBlur={() => setDistFocused(false)}
              style={{ flex: 1, height: 36, borderRadius: 7, border: `1.5px solid ${validDist ? BLUE_ACC : BORDER}`, padding: '0 10px', fontSize: 16, fontWeight: 700, color: (!dist && !distFocused) ? TEXT_DIS : TEXT_PRI, backgroundColor: SURFACE, outline: 'none', boxSizing: 'border-box' as const }}
            />
            <span style={{ fontSize: 15, fontWeight: 800, color: TEXT_PRI, minWidth: 22 }}>{t('slopeFtUnit')}</span>
          </div>
        </div>
        {samePoint && <div style={{ fontSize: 14, fontWeight: 700, color: RED_DARK }}>{t('slopeSamePointErr')}</div>}
        {fromPt && !validFrom && <div style={{ fontSize: 14, fontWeight: 700, color: RED_DARK }}>{t('slopeNoElevFrom')}</div>}
        {toPt   && !validTo   && <div style={{ fontSize: 14, fontWeight: 700, color: RED_DARK }}>{t('slopeNoElevTo')}</div>}
      </div>

      {/* Clear + Calculate buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          style={{ flex: '0 0 auto', height: 44, paddingLeft: 18, paddingRight: 18, backgroundColor: canCalc ? NAVY : SURFACE, border: canCalc ? 'none' : `1.5px solid ${BORDER}`, borderRadius: 10, color: canCalc ? '#fff' : TEXT_SEC, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}
          onClick={() => { setFromId(null); setToId(null); setDist(''); }}
        >{t('slopeClearBtn')}</button>
        <button
          style={{
            flex: 1, height: 44,
            backgroundColor: canCalc ? NAVY : '#CBD5E1',
            border: 'none', borderRadius: 10,
            color: canCalc ? '#fff' : '#9CA3AF',
            fontSize: 16, fontWeight: 800,
            cursor: canCalc ? 'pointer' : 'default',
            letterSpacing: 0.3,
            transition: 'background-color 0.2s',
          }}
          disabled={!canCalc}
          onClick={handleCalculate}
        >{t('slopeCalculateBtn')}</button>
      </div>

      {infoTipModal}

      {/* Point pickers */}
      {picker === 'from' && (
        <PointPickerModal points={points} setMap={setMap} selectedId={fromId}
          title={t('slopeSelectFrom')}
          onSelect={id => { setFromId(id); }}
          onClose={() => setPicker(null)} />
      )}
      {picker === 'to' && (
        <PointPickerModal points={points} setMap={setMap} selectedId={toId}
          title={t('slopeSelectTo')}
          onSelect={id => { setToId(id); }}
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
  const { t, lang } = useLang();
  // 'list' = 4-entry preview, 'all' = full-page scrollable history
  const [view,           setView]           = useState<'list' | 'all'>('list');
  const [detailCalc,     setDetailCalc]     = useState<SavedCalc | null>(null);
  const [menuId,         setMenuId]         = useState<string | null>(null);
  const [showHistoryTip, setShowHistoryTip] = useState(false);
  const [histConfirm,    setHistConfirm]    = useState<null | { onConfirm: () => void }>(null);

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
          <div style={{ width: 40, height: 40, backgroundColor: dc, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 20, color: '#fff' }}>{dirIcon(c.dir)}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const }}>
              <span style={{ fontSize: 17, fontWeight: 800, color: TEXT_PRI }}>{c.fromLabel} → {c.toLabel}</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: dc }}>{sign(c.slopePct)}{c.slopePct.toFixed(2)}%</span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: TEXT_SEC, marginTop: 2 }}>
              {c.distance.toFixed(1)} ft · <span style={{ color: dc }}>{c.dir === 'uphill' ? '▲' : c.dir === 'downhill' ? '▼' : 'Δ'}</span> {sign(c.diff)}{c.diff.toFixed(3)} ft
            </div>
          </div>
          <button
            style={{ background: 'none', border: 'none', color: TEXT_DIS, fontSize: 24, cursor: 'pointer', padding: '2px 4px', lineHeight: 1, flexShrink: 0 }}
            onClick={e => { e.stopPropagation(); setMenuId(isMenu ? null : c.id); }}
          >⋮</button>
        </div>
        {isMenu && (
          <div style={{ position: 'absolute', right: 4, top: 42, backgroundColor: CARD, borderRadius: 8, border: `1px solid ${BORDER}`, boxShadow: '0 4px 14px rgba(0,0,0,0.14)', zIndex: 10, minWidth: 120, overflow: 'hidden' }}>
            <button style={{ display: 'block', width: '100%', textAlign: 'left' as const, padding: '11px 16px', fontSize: 15, fontWeight: 700, color: NAVY, background: 'none', border: 'none', borderBottom: `1px solid ${BORDER}`, cursor: 'pointer' }}
              onClick={e => { e.stopPropagation(); setMenuId(null); handleEdit(c); }}>{t('edit')}</button>
            <button style={{ display: 'block', width: '100%', textAlign: 'left' as const, padding: '11px 16px', fontSize: 15, fontWeight: 700, color: RED_DARK, background: 'none', border: 'none', cursor: 'pointer' }}
              onClick={e => { e.stopPropagation(); setMenuId(null); setHistConfirm({ onConfirm: () => { onDelete(c.id); setHistConfirm(null); } }); }}>{t('delete')}</button>
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
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.85)', fontSize: 16, fontWeight: 700, cursor: 'pointer', padding: '2px 0', display: 'flex', alignItems: 'center', gap: 4 }}
            onClick={() => { setMenuId(null); setView('list'); }}
          >‹ {t('slopeBackBtn')}</button>
          <span style={{ fontSize: 17, fontWeight: 800, color: '#fff', flex: 1, textAlign: 'center' as const }}>
            {t('slopeHistoryTitle')} ({savedCalcs.length})
          </span>
          {/* spacer to balance the back button */}
          <div style={{ width: 60 }} />
        </div>

        {/* Scrollable full list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 5 }}>
          {savedCalcs.length === 0 ? (
            <div style={{ padding: '36px 20px', textAlign: 'center', color: TEXT_DIS, fontSize: 15, fontWeight: 600 }}>
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
        {histConfirm && (
          <ConfirmModal
            message={t('slopeDeleteCalcConfirm')}
            confirmLabel={t('delete')}
            cancelLabel={t('cancel')}
            danger
            onConfirm={histConfirm.onConfirm}
            onCancel={() => setHistConfirm(null)}
          />
        )}
      </div>
    );
  }

  // ── Default: 4-entry preview list ─────────────────────────────────────────
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ⓘ button row */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '2px 8px 0', flexShrink: 0 }}>
        <button
          style={{ background: 'none', border: 'none', color: '#1D4ED8', fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: '4px 6px', minWidth: 36, minHeight: 36, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', filter: 'drop-shadow(0 0 0.5px #1D4ED8)' }}
          onClick={() => setShowHistoryTip(true)}
        >ⓘ</button>
      </div>

      {/* Scrollable list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '2px 8px 6px', display: 'flex', flexDirection: 'column', gap: 5 }}>
        {savedCalcs.length === 0 ? (
          <div style={{ backgroundColor: CARD, borderRadius: 10, border: `1px solid ${BORDER}`, padding: '36px 20px', textAlign: 'center', color: TEXT_DIS, fontSize: 15, fontWeight: 600, marginTop: 8 }}>
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
              <span style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>
                {t('slopeViewAllCalcs')}{hasMore ? ` (${savedCalcs.length})` : ''}
              </span>
              <span style={{ fontSize: 18, color: NAVY }}>›</span>
            </div>
          </>
        )}
      </div>

      {/* Detail Modal */}
      {detailCalc && (
        <CalcDetailModal
          calc={detailCalc}
          onClose={() => setDetailCalc(null)}
          onEdit={() => handleEdit(detailCalc)}
          onDelete={() => { onDelete(detailCalc.id); setDetailCalc(null); }}
        />
      )}

      {histConfirm && (
        <ConfirmModal
          message={t('slopeDeleteCalcConfirm')}
          confirmLabel={t('delete')}
          cancelLabel={t('cancel')}
          danger
          onConfirm={histConfirm.onConfirm}
          onCancel={() => setHistConfirm(null)}
        />
      )}

      {/* History info tip modal */}
      {showHistoryTip && (
        <CenteredOverlay onClose={() => setShowHistoryTip(false)}>
          <div style={{ width: '100%', maxWidth: 390, maxHeight: '88vh', backgroundColor: CARD, borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.28)' }}>
            <div style={{ backgroundColor: NAVY, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>
                {lang === 'es' ? 'Cómo Usar el Historial' : 'How to Use History'}
              </span>
              <button style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.8)', fontSize: 22, cursor: 'pointer', padding: 0, lineHeight: 1 }} onClick={() => setShowHistoryTip(false)}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', fontSize: 14, color: TEXT_SEC, lineHeight: 1.65, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {lang === 'es' ? (
                <>
                  <p style={{ margin: 0 }}><strong style={{ color: TEXT_PRI }}>¿Qué muestra el Historial?</strong> — El Historial muestra tus cálculos de pendiente guardados recientemente. Cada tarjeta representa un cálculo guardado.</p>
                  <p style={{ margin: 0 }}><strong style={{ color: TEXT_PRI }}>Información de cada tarjeta</strong> — Verás los puntos de origen y destino (p. ej., PT3 → PT9), el porcentaje de pendiente (+ para subida, − para bajada), la distancia horizontal y la diferencia de elevación.</p>
                  <p style={{ margin: 0 }}><strong style={{ color: TEXT_PRI }}>Abrir un cálculo</strong> — Toca cualquier tarjeta para ver el Resumen de Cálculo completo, que incluye: gráfico visual, Punto de Origen y Destino, valores de elevación, diferencia de elevación, distancia, pendiente %, razón, ángulo, dirección (Subida/Bajada) y la fecha y hora en que se guardó.</p>
                  <p style={{ margin: 0 }}><strong style={{ color: TEXT_PRI }}>Editar o eliminar</strong> — Desde el Resumen de Cálculo, toca <strong style={{ color: TEXT_PRI }}>Editar</strong> para cargar el cálculo de nuevo en Calcular Pendiente y hacer cambios, o <strong style={{ color: TEXT_PRI }}>Eliminar</strong> para borrarlo. También puedes usar el menú de tres puntos (⋮) en cualquier tarjeta para editar o eliminar rápidamente.</p>
                  <p style={{ margin: 0 }}><strong style={{ color: TEXT_PRI }}>Ver todo el historial</strong> — Toca <em>Ver Todos los Cálculos</em> en la parte inferior para ver la lista completa de todos los cálculos guardados.</p>
                </>
              ) : (
                <>
                  <p style={{ margin: 0 }}><strong style={{ color: TEXT_PRI }}>What does History show?</strong> — History displays your most recently saved slope calculations. Each card represents one saved calculation.</p>
                  <p style={{ margin: 0 }}><strong style={{ color: TEXT_PRI }}>What each card shows</strong> — You'll see the From and To points (e.g. PT3 → PT9), the slope percentage (+ for uphill, − for downhill), the horizontal distance, and the elevation difference.</p>
                  <p style={{ margin: 0 }}><strong style={{ color: TEXT_PRI }}>Opening a calculation</strong> — Tap any card to open the full Calculation Summary, which includes: a visual chart, From Point, To Point, elevation values, elevation difference, distance, slope %, ratio, angle, direction (Uphill/Downhill), and the date & time it was saved.</p>
                  <p style={{ margin: 0 }}><strong style={{ color: TEXT_PRI }}>Edit or Delete</strong> — From the Calculation Summary, tap <strong style={{ color: TEXT_PRI }}>Edit</strong> to load the calculation back into Find Slope for changes, or <strong style={{ color: TEXT_PRI }}>Delete</strong> to remove it. You can also use the three-dot menu (⋮) on any card to quickly edit or delete without opening the summary.</p>
                  <p style={{ margin: 0 }}><strong style={{ color: TEXT_PRI }}>View all history</strong> — Tap <em>View All Calculations</em> at the bottom to see your complete list of saved calculations.</p>
                </>
              )}
              <button
                style={{ alignSelf: 'flex-start', marginTop: 4, background: BLUE, color: '#fff', border: 'none', borderRadius: 6, padding: '7px 18px', fontSize: 14, cursor: 'pointer', fontWeight: 700 }}
                onClick={() => setShowHistoryTip(false)}
              >{t('gotIt')}</button>
            </div>
          </div>
        </CenteredOverlay>
      )}
    </div>
  );
}

// ─── Target Elevation Graph ───────────────────────────────────────────────────
function TargetElevGraph({ startElev, reqElev, distN, dir }: {
  startElev: number; reqElev: number; distN: number; dir: 'uphill' | 'downhill';
}) {
  const dc  = dir === 'uphill' ? GREEN_DARK : RED_DARK;
  const W = 340, H = 188;
  const PL = 56, PR = 18, PT = 18, PB = 24;
  const PW = W - PL - PR;
  const PH = H - PT - PB;

  const minE   = Math.min(startElev, reqElev);
  const maxE   = Math.max(startElev, reqElev);
  const rangeE = Math.max(maxE - minE, 0.5);
  const padE   = rangeE * 0.28;
  const yMin   = minE - padE;
  const yMax   = maxE + padE;

  const yFor = (e: number) => PT + PH * (1 - (e - yMin) / (yMax - yMin));
  const xA = PL, xB = PL + PW;
  const yA = yFor(startElev);
  const yB = yFor(reqElev);

  const elevChange = Math.abs(reqElev - startElev);
  const slopePct   = distN > 0 ? (elevChange / distN) * 100 : 0;

  const ticks: number[] = [];
  for (let i = 0; i <= 4; i++) ticks.push(yMin + (yMax - yMin) * (i / 4));

  // Arrow head along slope line direction
  const dx = xB - xA, dy = yB - yA;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / len, uy = dy / len;
  const as = 9;
  const ax1 = xB - ux * as - uy * as * 0.5;
  const ay1 = yB - uy * as + ux * as * 0.5;
  const ax2 = xB - ux * as + uy * as * 0.5;
  const ay2 = yB - uy * as - ux * as * 0.5;

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      {/* Chart area */}
      <rect x={PL} y={PT} width={PW} height={PH} fill="#F8FAFF" rx="3" />
      <rect x={PL} y={PT} width={PW} height={PH} fill="none" stroke="#DCE3F0" strokeWidth="0.75" rx="3" />

      {/* Y-axis ticks + labels */}
      {ticks.map((tick, i) => {
        const ty = yFor(tick);
        if (ty < PT - 2 || ty > PT + PH + 2) return null;
        return (
          <g key={i}>
            <line x1={PL} y1={ty} x2={PL + PW} y2={ty}
              stroke="#D1D8E4" strokeWidth="0.5" strokeDasharray="3,4" />
            <text x={PL - 4} y={ty + 3.5} textAnchor="end"
              fontSize="7.5" fontWeight="700" fill={TEXT_SEC}>{tick.toFixed(1)}</text>
          </g>
        );
      })}

      {/* Y axis unit label */}
      <text x={9} y={PT + PH / 2} textAnchor="middle" fontSize="7" fontWeight="700" fill={TEXT_DIS}
        transform={`rotate(-90 9 ${PT + PH / 2})`}>Elev (ft)</text>

      {/* Fill */}
      <polygon
        points={`${xA},${yA} ${xB},${yB} ${xB},${PT + PH} ${xA},${PT + PH}`}
        fill={`${dc}18`}
      />

      {/* Baseline at start elevation */}
      <line x1={xA} y1={yA} x2={xB} y2={yA}
        stroke={TEXT_DIS} strokeWidth="0.8" strokeDasharray="3,5" opacity="0.5" />

      {/* Vertical diff line at end */}
      {Math.abs(yA - yB) > 5 && (
        <line x1={xB} y1={yA} x2={xB} y2={yB}
          stroke={dc} strokeWidth="1" strokeDasharray="4,3" opacity="0.4" />
      )}

      {/* Main slope line */}
      <line x1={xA} y1={yA} x2={xB} y2={yB} stroke={dc} strokeWidth="2.5" />

      {/* Arrow head */}
      <polygon points={`${xB},${yB} ${ax1},${ay1} ${ax2},${ay2}`} fill={dc} />

      {/* START marker */}
      <circle cx={xA} cy={yA} r={5.5} fill={BLUE} />
      <circle cx={xA} cy={yA} r={2.8} fill={BLUE_ACC} />
      <text x={xA} y={Math.max(yA - 9, PT + 8)} textAnchor="middle" fontSize="9" fontWeight="900" fill={NAVY}>START</text>
      <text x={xA} y={PT + PH + 12} textAnchor="middle" fontSize="7.5" fontWeight="700" fill={TEXT_PRI}>{startElev.toFixed(2)} ft</text>

      {/* TARGET marker */}
      <circle cx={xB} cy={yB} r={5.5} fill={dc} />
      <circle cx={xB} cy={yB} r={2.8} fill="#fff" />
      <text x={xB} y={Math.max(yB - 9, PT + 8)} textAnchor="middle" fontSize="9" fontWeight="900" fill={dc}>TARGET</text>
      <text x={xB} y={PT + PH + 12} textAnchor="middle" fontSize="7.5" fontWeight="700" fill={dc}>{reqElev.toFixed(2)} ft</text>

      {/* Grade label on the slope */}
      <text x={PL + PW / 2} y={(yA + yB) / 2 - 8} textAnchor="middle"
        fontSize="12" fontWeight="900" fill={dc}>
        {dir === 'uphill' ? '↗' : '↘'} {slopePct.toFixed(2)}%
      </text>

      {/* Distance label */}
      <text x={PL + PW / 2} y={PT + PH + 21} textAnchor="middle"
        fontSize="7.5" fontWeight="700" fill={TEXT_DIS}>
        {'← '}{distN.toFixed(1)} ft horizontal{' →'}
      </text>
    </svg>
  );
}

// ─── 3. Target Slope Tab ──────────────────────────────────────────────────────
function TargetSlopeTab({ points, setMap }: { points: SurveyPoint[]; setMap: Record<string, SurveySet> }) {
  const { t, lang } = useLang();

  // Form state
  const [startId,       setStartId]       = useState<string | null>(null);
  const [slopePct,      setSlopePct]      = useState('');
  const [distance,      setDistance]      = useState('');
  const [dir,           setDir]           = useState<'uphill' | 'downhill'>('downhill');
  const [showPicker,    setShowPicker]    = useState(false);
  const [showTargetTip, setShowTargetTip] = useState(false);

  // UI mode
  const [showResults, setShowResults] = useState(false);
  const [resultsKey,  setResultsKey]  = useState(0);   // re-triggers CSS animation on direction change

  // Touch tracking for inline validation
  const [touched, setTouched] = useState({ slope: false, dist: false });

  // Snapshot of inputs at Calculate time
  const [committed, setCommitted] = useState<{ startElev: number; distN: number; slopeN: number } | null>(null);

  const startPt   = startId ? points.find(p => p.id === startId) ?? null : null;
  const startElev = startPt?.bmElevation ?? 0;
  const slopeN    = parseFloat(slopePct);
  const distN     = parseFloat(distance);

  const validStart = startPt != null && startElev > 0;
  const validSlope = !isNaN(slopeN) && slopeN > 0;
  const validDist  = !isNaN(distN)  && distN  > 0;
  const canCalc    = validStart && validSlope && validDist;

  // Live calculation from committed snapshot + current direction toggle
  const liveResult = useMemo(() => {
    if (!committed) return null;
    const elevChange = committed.distN * (committed.slopeN / 100);
    const reqElev    = dir === 'uphill'
      ? committed.startElev + elevChange
      : committed.startElev - elevChange;
    return { startElev: committed.startElev, elevChange, reqElev, distN: committed.distN, slopeN: committed.slopeN };
  }, [committed, dir]);

  const handleCalculate = useCallback(() => {
    if (!canCalc) return;
    setCommitted({ startElev, distN, slopeN });
    setShowResults(true);
    setResultsKey(k => k + 1);
  }, [canCalc, startElev, distN, slopeN]);

  const handleCalcAnother = useCallback(() => {
    setShowResults(false);
    setCommitted(null);
    setSlopePct('');
    setDistance('');
    setTouched({ slope: false, dist: false });
    // preserve startId and dir
  }, []);

  const handleClear = useCallback(() => {
    setStartId(null);
    setSlopePct('');
    setDistance('');
    setDir('downhill');
    setShowResults(false);
    setCommitted(null);
    setTouched({ slope: false, dist: false });
  }, []);

  const handleDirChange = (newDir: 'uphill' | 'downhill') => {
    setDir(newDir);
    if (showResults) setResultsKey(k => k + 1);   // re-animate results on direction flip
  };

  const rc = dir === 'uphill' ? GREEN_DARK : RED_DARK;

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px', display: 'flex', flexDirection: 'column', gap: 5 }}>

      {/* ── Input fields (collapses after Calculate) ───────────── */}
      <div style={{
        maxHeight:    showResults ? 0 : 1400,
        opacity:      showResults ? 0 : 1,
        overflow:     'hidden',
        transition:   'max-height 0.32s cubic-bezier(0.4,0,0.2,1), opacity 0.24s ease',
        pointerEvents: showResults ? 'none' : 'auto',
      }}>
        <div style={{ backgroundColor: CARD, borderRadius: 10, border: `1px solid ${BORDER}`, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 7 }}>

          {/* START POINT */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ ...LBL, marginBottom: 0 }}>{t('slopeStartPoint')}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  style={{ height: 32, paddingLeft: 14, paddingRight: 14, backgroundColor: NAVY, border: 'none', borderRadius: 7, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
                  onClick={handleClear}
                >{t('slopeClearBtn')}</button>
                <button
                  style={{ background: 'none', border: 'none', color: '#1D4ED8', fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: '4px 6px', minWidth: 36, minHeight: 36, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', filter: 'drop-shadow(0 0 0.5px #1D4ED8)' }}
                  onClick={() => setShowTargetTip(true)}
                >ⓘ</button>
              </div>
            </div>
            <div
              role="button" tabIndex={0}
              aria-label={startPt ? `${startPt.label} selected, tap to change` : 'Tap to select start point'}
              style={{ backgroundColor: startPt ? BLUE_DEEP : SURFACE, border: `1.5px solid ${startPt ? BLUE_ACC : BORDER}`, borderRadius: 8, padding: '6px 10px', cursor: 'pointer', minHeight: 44 }}
              onClick={() => setShowPicker(true)}
              onKeyDown={e => e.key === 'Enter' && setShowPicker(true)}
            >
              {startPt ? (
                <>
                  <div style={{ fontSize: 15, fontWeight: 900, color: BLUE_ACC }}>{startPt.label}{startPt.pointName ? ` · ${startPt.pointName}` : ''}</div>
                  {startElev > 0
                    ? <div style={{ fontSize: 13, fontWeight: 700, color: TEXT_SEC, marginTop: 2 }}>{t('slopeCurrElev')} {startElev.toFixed(2)} {t('slopeFtUnit')}</div>
                    : <div style={{ fontSize: 13, color: RED_DARK, marginTop: 2, fontWeight: 700 }}>{t('slopeStartNoElev')}</div>
                  }
                </>
              ) : (
                <div style={{ fontSize: 14, fontWeight: 700, color: '#6B7280', marginTop: 3 }}>{t('slopeTapSelectStart')}</div>
              )}
            </div>
          </div>

          {/* TARGET SLOPE */}
          <div>
            <div style={{ ...LBL, marginBottom: 4 }}>{t('slopeTargetSlope')}</div>
            <div style={{
              display: 'flex', alignItems: 'center',
              border: `1.5px solid ${touched.slope && slopePct !== '' && !validSlope ? RED_DARK : validSlope ? BLUE_ACC : BORDER}`,
              borderRadius: 8, backgroundColor: SURFACE, overflow: 'hidden',
              transition: 'border-color 0.18s',
            }}>
              <input
                type="text" inputMode="decimal"
                value={slopePct}
                placeholder="2.00"
                aria-label={t('slopeTargetSlope')}
                onChange={e => setSlopePct(e.target.value)}
                onBlur={() => setTouched(prev => ({ ...prev, slope: true }))}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Done') (e.target as HTMLInputElement).blur(); }}
                style={{ flex: 1, height: 38, border: 'none', outline: 'none', padding: '0 10px', fontSize: 17, fontWeight: 700, color: TEXT_PRI, backgroundColor: 'transparent', minWidth: 0 }}
              />
              {slopePct.length > 0 && (
                <button
                  tabIndex={-1}
                  aria-label="Clear slope"
                  style={{ background: 'none', border: 'none', color: TEXT_DIS, fontSize: 15, cursor: 'pointer', padding: '0 4px', lineHeight: 1, minWidth: 28, minHeight: 38, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onClick={() => setSlopePct('')}
                >✕</button>
              )}
              <span style={{ fontSize: 15, fontWeight: 800, color: TEXT_SEC, paddingRight: 12, paddingLeft: 4, flexShrink: 0 }}>%</span>
            </div>
            {touched.slope && slopePct !== '' && !validSlope && (
              <div style={{ fontSize: 12, fontWeight: 700, color: RED_DARK, marginTop: 3 }}>
                {lang === 'es' ? 'Ingresa un porcentaje mayor que 0' : 'Enter a slope percentage greater than 0'}
              </div>
            )}
          </div>

          {/* HORIZONTAL DISTANCE */}
          <div>
            <div style={{ ...LBL, marginBottom: 4 }}>{t('slopeHorizDist')}</div>
            <div style={{
              display: 'flex', alignItems: 'center',
              border: `1.5px solid ${touched.dist && distance !== '' && !validDist ? RED_DARK : validDist ? BLUE_ACC : BORDER}`,
              borderRadius: 8, backgroundColor: SURFACE, overflow: 'hidden',
              transition: 'border-color 0.18s',
            }}>
              <input
                type="text" inputMode="decimal"
                value={distance}
                placeholder="0.00"
                aria-label={t('slopeHorizDist')}
                onChange={e => setDistance(e.target.value)}
                onBlur={() => setTouched(prev => ({ ...prev, dist: true }))}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Done') (e.target as HTMLInputElement).blur(); }}
                style={{ flex: 1, height: 38, border: 'none', outline: 'none', padding: '0 10px', fontSize: 17, fontWeight: 700, color: TEXT_PRI, backgroundColor: 'transparent', minWidth: 0 }}
              />
              {distance.length > 0 && (
                <button
                  tabIndex={-1}
                  aria-label="Clear distance"
                  style={{ background: 'none', border: 'none', color: TEXT_DIS, fontSize: 15, cursor: 'pointer', padding: '0 4px', lineHeight: 1, minWidth: 28, minHeight: 38, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onClick={() => setDistance('')}
                >✕</button>
              )}
              <span style={{ fontSize: 15, fontWeight: 800, color: TEXT_SEC, paddingRight: 12, paddingLeft: 4, flexShrink: 0 }}>{t('slopeFtUnit')}</span>
            </div>
            {touched.dist && distance !== '' && !validDist && (
              <div style={{ fontSize: 12, fontWeight: 700, color: RED_DARK, marginTop: 3 }}>
                {lang === 'es' ? 'Ingresa una distancia mayor que 0' : 'Enter a distance greater than 0'}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ── Direction toggle (always visible) ─────────────────────── */}
      <div style={{ backgroundColor: CARD, borderRadius: 10, border: `1px solid ${BORDER}`, padding: '7px 10px' }}>
        <div style={{ ...LBL, marginBottom: 5 }}>{t('slopeDirection')}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['downhill', 'uphill'] as const).map(d => {
            const active = dir === d;
            const btnC   = d === 'uphill' ? GREEN_DARK : RED_DARK;
            return (
              <button
                key={d}
                aria-pressed={active}
                style={{
                  flex: 1, minHeight: 40, padding: '5px 10px',
                  borderRadius: 8,
                  border: `2px solid ${active ? btnC : BORDER}`,
                  backgroundColor: active ? `${btnC}14` : SURFACE,
                  fontSize: 15, fontWeight: 800,
                  color: active ? btnC : TEXT_SEC,
                  cursor: 'pointer',
                  transition: 'border-color 0.2s, background-color 0.2s, color 0.2s, box-shadow 0.2s',
                  boxShadow: active ? `0 2px 10px ${btnC}30` : 'none',
                }}
                onClick={() => handleDirChange(d)}
              >
                {d === 'downhill' ? `↘ ${t('slopeDownhill')}` : `↗ ${t('slopeUphill')}`}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Calculate button (collapses after Calculate) ──────────── */}
      <div style={{
        maxHeight:    showResults ? 0 : 70,
        opacity:      showResults ? 0 : 1,
        overflow:     'hidden',
        transition:   'max-height 0.28s cubic-bezier(0.4,0,0.2,1), opacity 0.22s ease',
        pointerEvents: showResults ? 'none' : 'auto',
      }}>
        <button
          disabled={!canCalc}
          onClick={handleCalculate}
          aria-label={t('slopeCalculateBtn')}
          style={{
            width: '100%', height: 44,
            backgroundColor: canCalc ? NAVY : '#CBD5E1',
            border: 'none', borderRadius: 9,
            color: canCalc ? '#fff' : '#9CA3AF',
            fontSize: 17, fontWeight: 800, letterSpacing: 0.3,
            cursor: canCalc ? 'pointer' : 'default',
            transition: 'background-color 0.22s, box-shadow 0.22s',
            boxShadow: canCalc ? '0 3px 10px rgba(20,58,99,0.32)' : 'none',
          }}
        >{t('slopeCalculateBtn')}</button>
        {/* Inline hint when fields incomplete */}
        {!canCalc && (touched.slope || touched.dist) && (
          <div style={{ fontSize: 12, fontWeight: 600, color: TEXT_DIS, textAlign: 'center' as const, marginTop: 4 }}>
            {lang === 'es' ? 'Completa todos los campos para calcular' : 'Complete all fields to calculate'}
          </div>
        )}
      </div>

      {/* ── Results section (expands after Calculate) ─────────────── */}
      <div style={{
        maxHeight:  showResults ? 2000 : 0,
        opacity:    showResults ? 1 : 0,
        overflow:   'hidden',
        transition: 'max-height 0.36s cubic-bezier(0.4,0,0.2,1), opacity 0.28s ease',
      }}>
        {liveResult && (
          <div key={resultsKey} className="target-results-in"
               style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>

            {/* Slope profile graph */}
            <div style={{ backgroundColor: CARD, borderRadius: 10, border: `1px solid ${BORDER}`, padding: '4px 4px 0px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
              <div style={{ paddingLeft: 8, paddingBottom: 1 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: TEXT_SEC, letterSpacing: 0.5, textTransform: 'uppercase' as const }}>
                  {lang === 'es' ? 'Perfil de Pendiente' : 'Slope Profile'}
                </span>
              </div>
              <TargetElevGraph
                startElev={liveResult.startElev}
                reqElev={liveResult.reqElev}
                distN={liveResult.distN}
                dir={dir}
              />
            </div>

            {/* 3 result cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>

              {/* Card 1 — Start Elevation */}
              <div style={{ backgroundColor: CARD, borderRadius: 10, border: `1px solid ${BORDER}`, padding: '6px 7px', boxShadow: '0 1px 6px rgba(0,0,0,0.07)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: TEXT_SEC, letterSpacing: 0.5, textTransform: 'uppercase' as const, lineHeight: 1.35 }}>
                  {t('slopeStartElev')}
                </div>
                <div style={{ fontSize: 17, fontWeight: 900, color: TEXT_PRI, fontFamily: 'monospace', lineHeight: 1.1 }}>
                  {liveResult.startElev.toFixed(2)}
                  <span style={{ fontSize: 11, fontWeight: 700, color: TEXT_SEC, marginLeft: 2 }}>ft</span>
                </div>
              </div>

              {/* Card 2 — Elevation Change */}
              <div style={{ backgroundColor: CARD, borderRadius: 10, border: `1px solid ${rc}44`, padding: '6px 7px', boxShadow: '0 1px 6px rgba(0,0,0,0.07)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: TEXT_SEC, letterSpacing: 0.5, textTransform: 'uppercase' as const, lineHeight: 1.35 }}>
                  {t('slopeElevChange')}
                </div>
                <div style={{ fontSize: 17, fontWeight: 900, color: rc, fontFamily: 'monospace', lineHeight: 1.1 }}>
                  {dir === 'uphill' ? '+' : '−'}{liveResult.elevChange.toFixed(2)}
                  <span style={{ fontSize: 11, fontWeight: 700, marginLeft: 2 }}>ft</span>
                </div>
              </div>

              {/* Card 3 — Required Elevation (highlighted) */}
              <div style={{ backgroundColor: rc, borderRadius: 10, padding: '6px 7px', boxShadow: `0 3px 14px ${rc}44`, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.78)', letterSpacing: 0.5, textTransform: 'uppercase' as const, lineHeight: 1.35 }}>
                    {t('slopeReqElev')}
                  </div>
                  <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.88)' }}>{dir === 'uphill' ? '↗' : '↘'}</span>
                </div>
                <div style={{ fontSize: 17, fontWeight: 900, color: '#fff', fontFamily: 'monospace', lineHeight: 1.1 }}>
                  {liveResult.reqElev.toFixed(2)}
                  <span style={{ fontSize: 11, fontWeight: 700, marginLeft: 2 }}>ft</span>
                </div>
              </div>
            </div>

            {/* Calculate Another Target */}
            <button
              style={{ width: '100%', height: 40, backgroundColor: NAVY, border: 'none', borderRadius: 9, color: '#fff', fontSize: 16, fontWeight: 800, cursor: 'pointer', letterSpacing: 0.2, boxShadow: '0 3px 10px rgba(20,58,99,0.32)', transition: 'box-shadow 0.18s' }}
              onClick={handleCalcAnother}
            >
              {lang === 'es' ? 'Calcular Otro Objetivo' : 'Calculate Another Target'}
            </button>
          </div>
        )}
      </div>

      {/* ── Info tip modal ─────────────────────────────────────────── */}
      {showTargetTip && (
        <CenteredOverlay onClose={() => setShowTargetTip(false)}>
          <div style={{ width: '100%', maxWidth: 380, backgroundColor: CARD, borderRadius: 14, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.28)' }}>
            <div style={{ backgroundColor: NAVY, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>
                {lang === 'es' ? 'Cómo Usar Pendiente Objetivo' : 'How to Use Target Slope'}
              </span>
              <button style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.8)', fontSize: 22, cursor: 'pointer', padding: 0, lineHeight: 1 }} onClick={() => setShowTargetTip(false)}>✕</button>
            </div>
            <div style={{ padding: '14px 16px', fontSize: 14, color: TEXT_SEC, lineHeight: 1.65, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {lang === 'es' ? (
                <>
                  <p style={{ margin: 0 }}><strong style={{ color: TEXT_PRI }}>Punto de Inicio</strong> — Toca el campo y selecciona el punto desde donde se mide. Solo se muestran puntos con datos de elevación.</p>
                  <p style={{ margin: 0 }}><strong style={{ color: TEXT_PRI }}>Pendiente Objetivo</strong> — Ingresa el porcentaje de pendiente deseado (p. ej., 3.5 para un 3.5%). Toca ✕ para limpiar.</p>
                  <p style={{ margin: 0 }}><strong style={{ color: TEXT_PRI }}>Distancia Horizontal</strong> — Ingresa la distancia horizontal en pies. Toca ✕ para limpiar.</p>
                  <p style={{ margin: 0 }}><strong style={{ color: TEXT_PRI }}>Dirección</strong> — Elige <strong style={{ color: TEXT_PRI }}>Bajada</strong> si el terreno desciende, o <strong style={{ color: TEXT_PRI }}>Subida</strong> si asciende desde el punto de inicio.</p>
                  <p style={{ margin: 0 }}><strong style={{ color: TEXT_PRI }}>Cómo se Calcula</strong> — Elevación Requerida = Elevación de Inicio ± (Pendiente % × Distancia). Después de calcular, cambia la dirección para comparar Bajada/Subida instantáneamente sin recalcular.</p>
                  <p style={{ margin: 0 }}><strong style={{ color: TEXT_PRI }}>Limpiar</strong> — Toca Limpiar para restablecer todos los campos y volver a la entrada.</p>
                </>
              ) : (
                <>
                  <p style={{ margin: 0 }}><strong style={{ color: TEXT_PRI }}>Start Point</strong> — Tap the field and select the point you're measuring from. Only points with elevation data are shown.</p>
                  <p style={{ margin: 0 }}><strong style={{ color: TEXT_PRI }}>Target Slope</strong> — Enter the desired slope percentage (e.g. 3.5 for 3.5%). Tap ✕ to clear.</p>
                  <p style={{ margin: 0 }}><strong style={{ color: TEXT_PRI }}>Horizontal Distance</strong> — Enter the horizontal distance in feet. Tap ✕ to clear.</p>
                  <p style={{ margin: 0 }}><strong style={{ color: TEXT_PRI }}>Direction</strong> — Choose <strong style={{ color: TEXT_PRI }}>Downhill</strong> if the grade descends, or <strong style={{ color: TEXT_PRI }}>Uphill</strong> if it rises from your start point.</p>
                  <p style={{ margin: 0 }}><strong style={{ color: TEXT_PRI }}>How it Calculates</strong> — Required Elevation = Start Elevation ± (Slope % × Distance). After calculating, toggle Direction to instantly compare Downhill vs Uphill without re-entering inputs.</p>
                  <p style={{ margin: 0 }}><strong style={{ color: TEXT_PRI }}>Clear</strong> — Tap Clear to reset all fields and return to input mode.</p>
                </>
              )}
              <button
                style={{ alignSelf: 'flex-start', marginTop: 4, background: BLUE, color: '#fff', border: 'none', borderRadius: 6, padding: '7px 18px', fontSize: 14, cursor: 'pointer', fontWeight: 700 }}
                onClick={() => setShowTargetTip(false)}
              >{t('gotIt')}</button>
            </div>
          </div>
        </CenteredOverlay>
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

      {/* Segmented sub-tab control */}
      <div style={{ display: 'flex', backgroundColor: '#EEF4FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: 3, margin: '6px 8px', gap: 3, flexShrink: 0 }}>
        {TABS.map(tab => {
          const active = activeTab === tab.id;
          return (
            <button key={tab.id}
              style={{ flex: 1, minHeight: 34, padding: '5px 6px', borderRadius: 7, border: 'none', backgroundColor: active ? NAVY : 'transparent', color: active ? '#FFFFFF' : '#6B7280', fontSize: 15, fontWeight: active ? 700 : 600, cursor: 'pointer', boxShadow: active ? '0 1px 4px rgba(20,58,99,0.30)' : 'none', transition: 'background-color 0.2s, color 0.2s, box-shadow 0.2s', whiteSpace: 'normal', lineHeight: 1.2 }}
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
