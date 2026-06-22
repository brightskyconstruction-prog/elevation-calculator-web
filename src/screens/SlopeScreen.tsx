import { useState, useMemo, useCallback } from 'react';
import { useSurveyStore } from '../stores/surveyStore';
import { SurveyPoint, SurveySet } from '../types';

// ─── Design tokens (match rest of app) ───────────────────────────────────────
const NAVY      = '#143A63';
const BLUE      = '#1E5799';
const BLUE_ACC  = '#3B82F6';
const BLUE_DEEP = 'rgba(30,87,153,0.10)';
const GOLD      = '#F4B02A';
const GREEN     = '#1F8A4D';
const RED       = '#E74C3C';
const TEXT_PRI  = '#111827';
const TEXT_SEC  = '#374151';
const TEXT_DIS  = '#9CA3AF';
const SURFACE   = '#F0EEE8';
const CARD      = '#FFFFFF';
const BORDER    = '#E5E7EB';
const BORDER_B  = '#D1D5DB';

type SlopeSubTab = 'find' | 'profile' | 'target';

interface Props { projectId: string }

// ─── Saved calculation record ─────────────────────────────────────────────────
interface SavedCalc {
  id:        string;
  fromLabel: string;
  fromName:  string;
  toLabel:   string;
  toName:    string;
  distance:  number;
  slopePct:  number;
  diff:      number;
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
  return dir === 'uphill' ? GREEN : dir === 'downhill' ? RED : TEXT_DIS;
}
function dirIcon(dir: string) {
  return dir === 'uphill' ? '↗' : dir === 'downhill' ? '↘' : '→';
}
function sign(n: number) { return n >= 0 ? '+' : ''; }

function fmtDate(ms: number) {
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Point Picker Modal ───────────────────────────────────────────────────────
interface PickerProps {
  points:     SurveyPoint[];
  setMap:     Record<string, SurveySet>;
  selectedId: string | null;
  title:      string;
  onSelect:   (id: string) => void;
  onClose:    () => void;
}

function PointPickerModal({ points, setMap, selectedId, title, onSelect, onClose }: PickerProps) {
  const [q, setQ] = useState('');

  const eligible = useMemo(() =>
    points.filter(p => (p.bmElevation ?? 0) > 0), [points]);

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

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px 8px', borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: TEXT_PRI }}>{title}</span>
          <button style={{ background: 'none', border: 'none', fontSize: 22, color: TEXT_SEC, cursor: 'pointer', padding: 0, lineHeight: 1 }} onClick={onClose}>✕</button>
        </div>

        {/* Search */}
        <div style={{ padding: '8px 12px', flexShrink: 0 }}>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search by ID, name, or set…"
            autoFocus
            style={{ width: '100%', height: 36, borderRadius: 7, border: `1.5px solid ${BORDER}`, padding: '0 10px', fontSize: 13, color: TEXT_PRI, backgroundColor: SURFACE, outline: 'none', boxSizing: 'border-box' as const }}
          />
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 10px 14px', display: 'flex', flexDirection: 'column', gap: 5 }}>
          {filtered.length === 0 && (
            <div style={{ padding: '28px 0', textAlign: 'center', color: TEXT_DIS, fontSize: 13 }}>
              {eligible.length === 0 ? 'No points with elevation data yet.' : 'No matching points found.'}
            </div>
          )}
          {filtered.map(pt => {
            const setObj = pt.setId ? setMap[pt.setId] : null;
            const isSel  = pt.id === selectedId;
            return (
              <div
                key={pt.id}
                style={{ backgroundColor: isSel ? BLUE_DEEP : SURFACE, border: `1px solid ${isSel ? BLUE_ACC : BORDER}`, borderRadius: 8, padding: '8px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                onClick={() => { onSelect(pt.id); onClose(); }}
              >
                <div style={{ width: 38, height: 38, backgroundColor: isSel ? BLUE_ACC : BLUE, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#fff', letterSpacing: 0.3 }}>{pt.label}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: TEXT_PRI, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                    {pt.label}{pt.pointName ? ` · ${pt.pointName}` : ''}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: TEXT_SEC }}>
                    {(pt.bmElevation ?? 0).toFixed(3)} ft elev
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

// ─── Reusable: mini point selector card ──────────────────────────────────────
function PointSelectCard({ pt, label, onPick }: { pt: SurveyPoint | null; label: string; onPick: () => void }) {
  const hasElev = (pt?.bmElevation ?? 0) > 0;
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: TEXT_DIS, letterSpacing: 0.6, textTransform: 'uppercase' as const, marginBottom: 4 }}>{label}</div>
      <div
        style={{ backgroundColor: pt ? BLUE_DEEP : SURFACE, border: `1.5px solid ${pt ? BLUE_ACC : BORDER}`, borderRadius: 8, padding: '8px 10px', cursor: 'pointer', minHeight: 54 }}
        onClick={onPick}
      >
        {pt ? (
          <>
            <div style={{ fontSize: 14, fontWeight: 900, color: BLUE_ACC, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
              {pt.label}{pt.pointName ? ` · ${pt.pointName}` : ''}
            </div>
            {hasElev
              ? <div style={{ fontSize: 12, fontWeight: 700, color: TEXT_SEC, marginTop: 2 }}>{pt.bmElevation!.toFixed(3)} ft elev</div>
              : <div style={{ fontSize: 11, color: RED, marginTop: 2 }}>⚠ No elevation data</div>
            }
          </>
        ) : (
          <div style={{ fontSize: 12, fontWeight: 700, color: TEXT_DIS, paddingTop: 4 }}>Tap to select…</div>
        )}
      </div>
    </div>
  );
}

// ─── Saved Calculations Panel ─────────────────────────────────────────────────
function SavedCalcsPanel({ calcs, onDelete }: { calcs: SavedCalc[]; onDelete: (id: string) => void }) {
  if (calcs.length === 0) return null;
  return (
    <div style={{ backgroundColor: CARD, borderRadius: 10, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
      <div style={{ padding: '8px 12px', borderBottom: `1px solid ${BORDER}`, fontSize: 11, fontWeight: 800, color: BLUE, letterSpacing: 0.8, textTransform: 'uppercase' as const }}>
        Saved Calculations ({calcs.length})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 0 }}>
        {calcs.map((c, i) => {
          const dc = dirColor(c.dir);
          return (
            <div key={c.id} style={{ padding: '8px 12px', borderBottom: i < calcs.length - 1 ? `1px solid ${BORDER}` : 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: TEXT_PRI }}>{c.fromLabel} → {c.toLabel}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: dc }}>{dirIcon(c.dir)} {sign(c.slopePct)}{c.slopePct.toFixed(2)}%</span>
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: TEXT_SEC }}>
                  {c.distance.toFixed(1)} ft · Δ {sign(c.diff)}{c.diff.toFixed(3)} ft · {fmtDate(c.savedAt)}
                </div>
              </div>
              <button
                style={{ background: 'none', border: 'none', color: TEXT_DIS, fontSize: 16, cursor: 'pointer', padding: '2px 4px', lineHeight: 1 }}
                onClick={() => onDelete(c.id)}
              >✕</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── 1. Find Slope Tab ────────────────────────────────────────────────────────
interface FindSlopeProps {
  points:     SurveyPoint[];
  setMap:     Record<string, SurveySet>;
  savedCalcs: SavedCalc[];
  onSave:     (c: SavedCalc) => void;
  onDelete:   (id: string) => void;
}

function FindSlopeTab({ points, setMap, savedCalcs, onSave, onDelete }: FindSlopeProps) {
  const [fromId, setFromId] = useState<string | null>(null);
  const [toId,   setToId]   = useState<string | null>(null);
  const [dist,   setDist]   = useState('');
  const [picker, setPicker] = useState<'from' | 'to' | null>(null);
  const [justSaved, setJustSaved] = useState(false);

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

  const handleSwap = useCallback(() => {
    setFromId(toId); setToId(fromId); setJustSaved(false);
  }, [fromId, toId]);

  const handleSave = useCallback(() => {
    if (!result || !fromPt || !toPt) return;
    onSave({
      id: Date.now().toString(),
      fromLabel: fromPt.label,
      fromName:  fromPt.pointName ?? '',
      toLabel:   toPt.label,
      toName:    toPt.pointName  ?? '',
      distance:  distN,
      slopePct:  result.pct,
      diff:      result.diff,
      angle:     result.angle,
      dir:       result.dir,
      savedAt:   Date.now(),
    });
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2500);
  }, [result, fromPt, toPt, distN, onSave]);

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>

      {/* ── Inputs card ── */}
      <div style={{ backgroundColor: CARD, borderRadius: 10, border: `1px solid ${BORDER}`, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* From / Swap / To */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
          <PointSelectCard pt={fromPt} label="From Point" onPick={() => setPicker('from')} />
          <button
            style={{ width: 34, height: 34, backgroundColor: NAVY, border: 'none', borderRadius: 7, color: '#fff', fontSize: 18, fontWeight: 800, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, marginBottom: 0 }}
            onClick={handleSwap}
            title="Swap points"
          >⇆</button>
          <PointSelectCard pt={toPt} label="To Point" onPick={() => setPicker('to')} />
        </div>

        {/* Distance */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, color: TEXT_DIS, letterSpacing: 0.6, textTransform: 'uppercase' as const, marginBottom: 4 }}>Horizontal Distance</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="number"
              inputMode="decimal"
              value={dist}
              onChange={e => { setDist(e.target.value); setJustSaved(false); }}
              placeholder="0.00"
              style={{ flex: 1, height: 42, borderRadius: 7, border: `1.5px solid ${validDist ? BLUE_ACC : BORDER}`, padding: '0 12px', fontSize: 17, fontWeight: 700, color: TEXT_PRI, backgroundColor: SURFACE, outline: 'none', boxSizing: 'border-box' as const }}
            />
            <span style={{ fontSize: 14, fontWeight: 800, color: TEXT_SEC, minWidth: 22 }}>ft</span>
          </div>
        </div>

        {/* Inline errors */}
        {samePoint && <div style={{ fontSize: 12, fontWeight: 700, color: RED }}>⚠ From and To points must be different.</div>}
        {fromPt && !validFrom && <div style={{ fontSize: 12, fontWeight: 700, color: RED }}>⚠ From point has no elevation data.</div>}
        {toPt   && !validTo   && <div style={{ fontSize: 12, fontWeight: 700, color: RED }}>⚠ To point has no elevation data.</div>}
      </div>

      {/* ── Results ── */}
      {result && (
        <>
          {/* Direction banner */}
          <div style={{ backgroundColor: dc, borderRadius: 9, padding: '9px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 18, fontWeight: 900, color: '#fff' }}>
              {dirIcon(result.dir)} {result.dir.charAt(0).toUpperCase() + result.dir.slice(1)}
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.85)', textAlign: 'right' as const }}>
              {fromPt!.label} → {toPt!.label}
            </span>
          </div>

          {/* 2×2 result cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {([
              { label: 'Elev. Difference', value: `${sign(result.diff)}${result.diff.toFixed(3)} ft`, color: dc },
              { label: 'Slope',            value: `${sign(result.pct)}${result.pct.toFixed(2)}%`,    color: dc },
              { label: 'Slope Ratio',      value: result.ratio != null ? `1 : ${result.ratio.toFixed(1)}` : '—', color: TEXT_PRI },
              { label: 'Angle',            value: `${result.angle.toFixed(2)}°`,                     color: TEXT_PRI },
            ] as const).map(({ label, value, color }) => (
              <div key={label} style={{ backgroundColor: CARD, borderRadius: 8, border: `1px solid ${BORDER}`, padding: '8px 10px' }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: TEXT_DIS, letterSpacing: 0.5, textTransform: 'uppercase' as const, marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 20, fontWeight: 900, color, fontFamily: 'monospace' }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Point detail strip */}
          <div style={{ backgroundColor: CARD, borderRadius: 8, border: `1px solid ${BORDER}`, padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {([
              ['From',     `${fromPt!.label}${fromPt!.pointName ? ' · ' + fromPt!.pointName : ''}`],
              ['From Elev',`${fromPt!.bmElevation!.toFixed(3)} ft`],
              ['To',       `${toPt!.label}${toPt!.pointName ? ' · ' + toPt!.pointName : ''}`],
              ['To Elev',  `${toPt!.bmElevation!.toFixed(3)} ft`],
              ['Distance', `${distN.toFixed(2)} ft`],
            ] as [string, string][]).map(([lbl, val]) => (
              <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: TEXT_DIS }}>{lbl}</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: TEXT_PRI, fontFamily: 'monospace' }}>{val}</span>
              </div>
            ))}
          </div>

          {/* Save button */}
          <button
            style={{ height: 38, backgroundColor: justSaved ? GREEN : NAVY, border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 800, cursor: justSaved ? 'default' : 'pointer', letterSpacing: 0.3, boxShadow: '0 2px 6px rgba(20,58,99,0.25)', transition: 'background-color 0.2s' }}
            onClick={handleSave}
            disabled={justSaved}
          >{justSaved ? '✓ Saved!' : 'Save Calculation'}</button>
        </>
      )}

      {/* Saved calcs */}
      <SavedCalcsPanel calcs={savedCalcs} onDelete={onDelete} />

      {/* Pickers */}
      {picker === 'from' && (
        <PointPickerModal points={points} setMap={setMap} selectedId={fromId}
          title="Select From Point"
          onSelect={id => { setFromId(id); setJustSaved(false); }}
          onClose={() => setPicker(null)} />
      )}
      {picker === 'to' && (
        <PointPickerModal points={points} setMap={setMap} selectedId={toId}
          title="Select To Point"
          onSelect={id => { setToId(id); setJustSaved(false); }}
          onClose={() => setPicker(null)} />
      )}
    </div>
  );
}

// ─── 2. Profile Visualization Tab ─────────────────────────────────────────────
function ProfileTab({ points, setMap }: { points: SurveyPoint[]; setMap: Record<string, SurveySet> }) {
  const [fromId, setFromId] = useState<string | null>(null);
  const [toId,   setToId]   = useState<string | null>(null);
  const [dist,   setDist]   = useState('');
  const [picker, setPicker] = useState<'from' | 'to' | null>(null);

  const fromPt = fromId ? points.find(p => p.id === fromId) ?? null : null;
  const toPt   = toId   ? points.find(p => p.id === toId)   ?? null : null;
  const distN  = parseFloat(dist);

  const canChart =
    fromPt != null && toPt != null &&
    (fromPt.bmElevation ?? 0) > 0 && (toPt.bmElevation ?? 0) > 0 &&
    !isNaN(distN) && distN > 0 && fromId !== toId;

  const result = canChart ? calcSlope(fromPt!.bmElevation!, toPt!.bmElevation!, distN) : null;
  const dc = result ? dirColor(result.dir) : TEXT_DIS;

  // ── SVG profile chart ──
  const ProfileChart = useCallback(() => {
    if (!canChart || !result || !fromPt || !toPt) return null;

    const elevA = fromPt.bmElevation!;
    const elevB = toPt.bmElevation!;
    const W = 360, H = 200;
    const PL = 52, PR = 14, PT = 28, PB = 38;
    const PW = W - PL - PR;
    const PH = H - PT - PB;

    const minE  = Math.min(elevA, elevB);
    const maxE  = Math.max(elevA, elevB);
    const rangeE = Math.max(maxE - minE, 0.5);
    const padE  = rangeE * 0.30;
    const yMin  = minE - padE;
    const yMax  = maxE + padE;

    const yFor  = (e: number) => PT + PH * (1 - (e - yMin) / (yMax - yMin));
    const xA    = PL;
    const xB    = PL + PW;
    const yA    = yFor(elevA);
    const yB    = yFor(elevB);

    const ticks: number[] = [];
    for (let i = 0; i <= 4; i++) ticks.push(yMin + (yMax - yMin) * (i / 4));

    return (
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
        {/* Plot bg */}
        <rect x={PL} y={PT} width={PW} height={PH} fill="#FAFBFE" rx="3" />
        <rect x={PL} y={PT} width={PW} height={PH} fill="none" stroke="#E2E8F0" strokeWidth="0.75" rx="3" />

        {/* Y-axis ticks */}
        {ticks.map((tick, i) => {
          const ty = yFor(tick);
          if (ty < PT - 2 || ty > PT + PH + 2) return null;
          return (
            <g key={i}>
              <line x1={PL} y1={ty} x2={PL + PW} y2={ty} stroke="#D1D8E4" strokeWidth="0.5" strokeDasharray="3,4" />
              <text x={PL - 4} y={ty + 3.5} textAnchor="end" fontSize="8.5" fontWeight="700" fill={TEXT_SEC}>
                {tick.toFixed(1)}
              </text>
            </g>
          );
        })}

        {/* Y-axis unit */}
        <text x={9} y={PT + PH / 2} textAnchor="middle" fontSize="8" fontWeight="700" fill={TEXT_DIS}
          transform={`rotate(-90 9 ${PT + PH / 2})`}>ft</text>

        {/* Ground fill */}
        <polygon
          points={`${xA},${yA} ${xB},${yB} ${xB},${PT + PH} ${xA},${PT + PH}`}
          fill={`${dc}18`}
        />

        {/* Slope line */}
        <line x1={xA} y1={yA} x2={xB} y2={yB} stroke={dc} strokeWidth="2.5" />

        {/* Vertical drop / rise guides */}
        {result.dir !== 'flat' && (
          <line x1={xB} y1={yA} x2={xB} y2={yB} stroke={dc} strokeWidth="1" strokeDasharray="4,3" opacity="0.4" />
        )}

        {/* Point A dot + labels */}
        <circle cx={xA} cy={yA} r={5.5} fill={BLUE} />
        <circle cx={xA} cy={yA} r={3}   fill={BLUE_ACC} />
        <text x={xA} y={yA - 10} textAnchor="middle" fontSize="10" fontWeight="900" fill={NAVY}>{fromPt.label}</text>
        <text x={xA} y={PT + PH + 15} textAnchor="middle" fontSize="8.5" fontWeight="700" fill={TEXT_SEC}>{elevA.toFixed(2)}</text>

        {/* Point B dot + labels */}
        <circle cx={xB} cy={yB} r={5.5} fill={BLUE} />
        <circle cx={xB} cy={yB} r={3}   fill={BLUE_ACC} />
        <text x={xB} y={yB - 10} textAnchor="middle" fontSize="10" fontWeight="900" fill={NAVY}>{toPt.label}</text>
        <text x={xB} y={PT + PH + 15} textAnchor="middle" fontSize="8.5" fontWeight="700" fill={TEXT_SEC}>{elevB.toFixed(2)}</text>

        {/* Distance x-axis label */}
        <text x={PL + PW / 2} y={H - 2} textAnchor="middle" fontSize="8.5" fontWeight="700" fill={TEXT_DIS}>
          {distN.toFixed(1)} ft horizontal
        </text>

        {/* Slope annotation mid-line */}
        <text x={PL + PW / 2} y={(yA + yB) / 2 - 9} textAnchor="middle" fontSize="11" fontWeight="900" fill={dc}>
          {sign(result.pct)}{result.pct.toFixed(2)}% {dirIcon(result.dir)}
        </text>
      </svg>
    );
  }, [canChart, result, fromPt, toPt, distN, dc]);

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>

      {/* Inputs */}
      <div style={{ backgroundColor: CARD, borderRadius: 10, border: `1px solid ${BORDER}`, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['from', 'to'] as const).map(which => {
            const pt  = which === 'from' ? fromPt : toPt;
            const lbl = which === 'from' ? 'Point A (From)' : 'Point B (To)';
            return (
              <div key={which} style={{ flex: 1 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: TEXT_DIS, letterSpacing: 0.5, textTransform: 'uppercase' as const, marginBottom: 3 }}>{lbl}</div>
                <div
                  style={{ backgroundColor: pt ? BLUE_DEEP : SURFACE, border: `1.5px solid ${pt ? BLUE_ACC : BORDER}`, borderRadius: 7, padding: '7px 9px', cursor: 'pointer', minHeight: 48 }}
                  onClick={() => setPicker(which)}
                >
                  {pt ? (
                    <>
                      <div style={{ fontSize: 13, fontWeight: 800, color: BLUE_ACC }}>{pt.label}</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: TEXT_SEC }}>{(pt.bmElevation ?? 0).toFixed(3)} ft</div>
                    </>
                  ) : (
                    <div style={{ fontSize: 12, fontWeight: 700, color: TEXT_DIS }}>Tap to select…</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, color: TEXT_DIS, letterSpacing: 0.5, textTransform: 'uppercase' as const, marginBottom: 3 }}>Horizontal Distance</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="number" inputMode="decimal"
              value={dist} onChange={e => setDist(e.target.value)}
              placeholder="0.00"
              style={{ flex: 1, height: 40, borderRadius: 7, border: `1.5px solid ${BORDER}`, padding: '0 10px', fontSize: 16, fontWeight: 700, color: TEXT_PRI, backgroundColor: SURFACE, outline: 'none', boxSizing: 'border-box' as const }}
            />
            <span style={{ fontSize: 13, fontWeight: 800, color: TEXT_SEC }}>ft</span>
          </div>
        </div>
      </div>

      {/* Chart */}
      {canChart && result ? (
        <>
          <div style={{ backgroundColor: CARD, borderRadius: 10, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
            <div style={{ padding: '8px 12px 4px', fontSize: 11, fontWeight: 800, color: BLUE, letterSpacing: 0.8, textTransform: 'uppercase' as const, borderBottom: `1px solid ${BORDER}` }}>
              Elevation Profile
            </div>
            <div style={{ padding: '8px 4px 4px' }}>
              <ProfileChart />
            </div>
          </div>

          {/* Summary strip */}
          <div style={{ backgroundColor: CARD, borderRadius: 9, border: `1px solid ${BORDER}`, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
            {([
              ['From',             `${fromPt!.label}${fromPt!.pointName ? ' · ' + fromPt!.pointName : ''}`],
              ['From Elevation',   `${fromPt!.bmElevation!.toFixed(3)} ft`],
              ['To',               `${toPt!.label}${toPt!.pointName ? ' · ' + toPt!.pointName : ''}`],
              ['To Elevation',     `${toPt!.bmElevation!.toFixed(3)} ft`],
              ['Distance',         `${distN.toFixed(2)} ft`],
              ['Elev. Difference', `${sign(result.diff)}${result.diff.toFixed(3)} ft`],
              ['Slope',            `${sign(result.pct)}${result.pct.toFixed(2)}%`],
              ['Angle',            `${result.angle.toFixed(2)}°`],
              ['Direction',        result.dir.charAt(0).toUpperCase() + result.dir.slice(1)],
            ] as [string, string][]).map(([lbl, val]) => {
              const highlight = ['Slope', 'Elev. Difference', 'Direction'].includes(lbl);
              return (
                <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: TEXT_DIS }}>{lbl}</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: highlight ? dc : TEXT_PRI, fontFamily: 'monospace' }}>{val}</span>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div style={{ backgroundColor: CARD, borderRadius: 8, border: `1px solid ${BORDER}`, padding: '24px 16px', textAlign: 'center', color: TEXT_DIS, fontSize: 13, fontWeight: 600 }}>
          Select both points and enter a distance to see the elevation profile.
        </div>
      )}

      {picker && (
        <PointPickerModal
          points={points} setMap={setMap}
          selectedId={picker === 'from' ? fromId : toId}
          title={picker === 'from' ? 'Select Point A (From)' : 'Select Point B (To)'}
          onSelect={id => picker === 'from' ? setFromId(id) : setToId(id)}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}

// ─── 3. Target Slope Tab ──────────────────────────────────────────────────────
function TargetSlopeTab({ points, setMap }: { points: SurveyPoint[]; setMap: Record<string, SurveySet> }) {
  const [startId,    setStartId]    = useState<string | null>(null);
  const [slopePct,   setSlopePct]   = useState('');
  const [distance,   setDistance]   = useState('');
  const [dir,        setDir]        = useState<'uphill' | 'downhill'>('downhill');
  const [showPicker, setShowPicker] = useState(false);

  const startPt   = startId ? points.find(p => p.id === startId) ?? null : null;
  const startElev = startPt?.bmElevation ?? 0;
  const slopeN    = parseFloat(slopePct);
  const distN     = parseFloat(distance);

  const valid = startPt != null && startElev > 0 &&
    !isNaN(slopeN) && slopeN >= 0 &&
    !isNaN(distN)  && distN  > 0;

  const elevChange = valid ? distN * (slopeN / 100) : 0;
  const reqElev    = valid ? (dir === 'uphill' ? startElev + elevChange : startElev - elevChange) : 0;
  const rc         = dir === 'uphill' ? GREEN : RED;

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>

      {/* Inputs card */}
      <div style={{ backgroundColor: CARD, borderRadius: 10, border: `1px solid ${BORDER}`, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Start point */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, color: TEXT_DIS, letterSpacing: 0.6, textTransform: 'uppercase' as const, marginBottom: 4 }}>Start Point</div>
          <div
            style={{ backgroundColor: startPt ? BLUE_DEEP : SURFACE, border: `1.5px solid ${startPt ? BLUE_ACC : BORDER}`, borderRadius: 8, padding: '9px 11px', cursor: 'pointer', minHeight: 52 }}
            onClick={() => setShowPicker(true)}
          >
            {startPt ? (
              <>
                <div style={{ fontSize: 14, fontWeight: 900, color: BLUE_ACC }}>
                  {startPt.label}{startPt.pointName ? ` · ${startPt.pointName}` : ''}
                </div>
                {startElev > 0
                  ? <div style={{ fontSize: 12, fontWeight: 700, color: TEXT_SEC, marginTop: 2 }}>Current elevation: {startElev.toFixed(3)} ft</div>
                  : <div style={{ fontSize: 11, color: RED, marginTop: 2 }}>⚠ No elevation data</div>
                }
              </>
            ) : (
              <div style={{ fontSize: 12, fontWeight: 700, color: TEXT_DIS, paddingTop: 4 }}>Tap to select start point…</div>
            )}
          </div>
        </div>

        {/* Target slope */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, color: TEXT_DIS, letterSpacing: 0.6, textTransform: 'uppercase' as const, marginBottom: 4 }}>Target Slope</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="number" inputMode="decimal"
              value={slopePct} onChange={e => setSlopePct(e.target.value)}
              placeholder="2.00"
              style={{ flex: 1, height: 42, borderRadius: 7, border: `1.5px solid ${BORDER}`, padding: '0 12px', fontSize: 17, fontWeight: 700, color: TEXT_PRI, backgroundColor: SURFACE, outline: 'none', boxSizing: 'border-box' as const }}
            />
            <span style={{ fontSize: 15, fontWeight: 800, color: TEXT_SEC, minWidth: 20 }}>%</span>
          </div>
        </div>

        {/* Distance */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, color: TEXT_DIS, letterSpacing: 0.6, textTransform: 'uppercase' as const, marginBottom: 4 }}>Horizontal Distance</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="number" inputMode="decimal"
              value={distance} onChange={e => setDistance(e.target.value)}
              placeholder="0.00"
              style={{ flex: 1, height: 42, borderRadius: 7, border: `1.5px solid ${BORDER}`, padding: '0 12px', fontSize: 17, fontWeight: 700, color: TEXT_PRI, backgroundColor: SURFACE, outline: 'none', boxSizing: 'border-box' as const }}
            />
            <span style={{ fontSize: 15, fontWeight: 800, color: TEXT_SEC, minWidth: 20 }}>ft</span>
          </div>
        </div>

        {/* Direction toggle */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, color: TEXT_DIS, letterSpacing: 0.6, textTransform: 'uppercase' as const, marginBottom: 4 }}>Direction</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['downhill', 'uphill'] as const).map(d => {
              const active = dir === d;
              const btnC   = d === 'uphill' ? GREEN : RED;
              return (
                <button
                  key={d}
                  style={{ flex: 1, height: 38, borderRadius: 7, border: `1.5px solid ${active ? btnC : BORDER}`, backgroundColor: active ? `${btnC}14` : SURFACE, fontSize: 13, fontWeight: 800, color: active ? btnC : TEXT_SEC, cursor: 'pointer', transition: 'border-color 0.15s, background-color 0.15s' }}
                  onClick={() => setDir(d)}
                >{d === 'downhill' ? '↘ Downhill' : '↗ Uphill'}</button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Results */}
      {valid && (
        <>
          {/* 2-col mini stats */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <div style={{ backgroundColor: CARD, borderRadius: 8, border: `1px solid ${BORDER}`, padding: '8px 10px' }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: TEXT_DIS, letterSpacing: 0.5, textTransform: 'uppercase' as const, marginBottom: 3 }}>Start Elevation</div>
              <div style={{ fontSize: 17, fontWeight: 900, color: TEXT_PRI, fontFamily: 'monospace' }}>{startElev.toFixed(3)} ft</div>
            </div>
            <div style={{ backgroundColor: CARD, borderRadius: 8, border: `1px solid ${BORDER}`, padding: '8px 10px' }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: TEXT_DIS, letterSpacing: 0.5, textTransform: 'uppercase' as const, marginBottom: 3 }}>Elev. Change</div>
              <div style={{ fontSize: 17, fontWeight: 900, color: rc, fontFamily: 'monospace' }}>
                {dir === 'uphill' ? '+' : '−'}{elevChange.toFixed(3)} ft
              </div>
            </div>
          </div>

          {/* Required elevation hero card */}
          <div style={{ backgroundColor: rc, borderRadius: 10, padding: '13px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: `0 3px 10px ${rc}55` }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.78)', letterSpacing: 0.7, textTransform: 'uppercase' as const, marginBottom: 3 }}>Required Elevation</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: '#fff', fontFamily: 'monospace', letterSpacing: -0.5 }}>{reqElev.toFixed(3)} ft</div>
            </div>
            <div style={{ fontSize: 32, color: 'rgba(255,255,255,0.85)' }}>{dir === 'uphill' ? '↗' : '↘'}</div>
          </div>

          {/* Summary strip */}
          <div style={{ backgroundColor: CARD, borderRadius: 8, border: `1px solid ${BORDER}`, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {([
              ['Start Point',       `${startPt!.label}${startPt!.pointName ? ' · ' + startPt!.pointName : ''}`],
              ['Start Elevation',   `${startElev.toFixed(3)} ft`],
              ['Target Slope',      `${slopeN.toFixed(2)}%`],
              ['Distance',          `${distN.toFixed(2)} ft`],
              ['Direction',         dir === 'uphill' ? '↗ Uphill' : '↘ Downhill'],
              ['Elevation Change',  `${dir === 'uphill' ? '+' : '−'}${elevChange.toFixed(3)} ft`],
              ['Required Elevation', `${reqElev.toFixed(3)} ft`],
            ] as [string, string][]).map(([lbl, val]) => (
              <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: TEXT_DIS }}>{lbl}</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: lbl === 'Required Elevation' ? rc : TEXT_PRI, fontFamily: 'monospace' }}>{val}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {showPicker && (
        <PointPickerModal
          points={points} setMap={setMap}
          selectedId={startId}
          title="Select Start Point"
          onSelect={setStartId}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}

// ─── Main SlopeScreen ─────────────────────────────────────────────────────────
export default function SlopeScreen({ projectId }: Props) {
  const { getPoints, getSets } = useSurveyStore();
  const points = getPoints(projectId);
  const sets   = getSets(projectId);

  const setMap = useMemo<Record<string, SurveySet>>(() => {
    const m: Record<string, SurveySet> = {};
    sets.forEach(s => { m[s.id] = s; });
    return m;
  }, [sets]);

  const [activeTab,  setActiveTab]  = useState<SlopeSubTab>('find');
  const [savedCalcs, setSavedCalcs] = useState<SavedCalc[]>([]);

  const handleSave   = useCallback((c: SavedCalc) => setSavedCalcs(prev => [c, ...prev]), []);
  const handleDelete = useCallback((id: string)   => setSavedCalcs(prev => prev.filter(c => c.id !== id)), []);

  const TABS: { id: SlopeSubTab; label: string }[] = [
    { id: 'find',    label: 'Find Slope' },
    { id: 'profile', label: 'Profile'    },
    { id: 'target',  label: 'Target'     },
  ];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: '#F5F4F0' }}>

      {/* Gold sub-tab bar — same style as other tabs */}
      <div style={{ display: 'flex', backgroundColor: GOLD, padding: '4px 7px', gap: 5, flexShrink: 0 }}>
        {TABS.map(tab => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              style={{
                flex: 1, height: 34, borderRadius: 8,
                border: `1.5px solid ${active ? 'rgba(0,0,0,0.07)' : 'rgba(140,95,0,0.20)'}`,
                backgroundColor: active ? '#FFFFFF' : GOLD,
                color: NAVY, fontSize: 13, fontWeight: 700,
                cursor: 'pointer',
                boxShadow: active ? '0 1px 4px rgba(0,0,0,0.10)' : 'none',
                transition: 'background-color 0.15s, border-color 0.15s',
              }}
              onClick={() => setActiveTab(tab.id)}
            >{tab.label}</button>
          );
        })}
      </div>

      {/* Sub-tab content — all mounted, toggled with display */}
      <div style={{ flex: 1, overflow: 'hidden', display: activeTab === 'find'    ? 'flex' : 'none', flexDirection: 'column' as const }}>
        <FindSlopeTab points={points} setMap={setMap} savedCalcs={savedCalcs} onSave={handleSave} onDelete={handleDelete} />
      </div>
      <div style={{ flex: 1, overflow: 'hidden', display: activeTab === 'profile' ? 'flex' : 'none', flexDirection: 'column' as const }}>
        <ProfileTab points={points} setMap={setMap} />
      </div>
      <div style={{ flex: 1, overflow: 'hidden', display: activeTab === 'target'  ? 'flex' : 'none', flexDirection: 'column' as const }}>
        <TargetSlopeTab points={points} setMap={setMap} />
      </div>
    </div>
  );
}
