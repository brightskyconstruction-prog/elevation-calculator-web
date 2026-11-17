import { useState, useEffect } from 'react';
import { INCHES_OPTIONS, FRACTION_OPTIONS } from '../constants';
import { useLang } from '../LangContext';
import { useUnit, CM_OPTIONS, MM_OPTIONS, FT_TO_M } from '../UnitContext';
import ConfirmModal from '../components/ConfirmModal';

// ─── Modal animation (idempotent injection) ───────────────────────────────────
if (typeof document !== 'undefined' && !document.getElementById('anp-modal-anim')) {
  const _s = document.createElement('style');
  _s.id = 'anp-modal-anim';
  _s.textContent = `
    @keyframes anpModalIn { from { opacity: 0; transform: scale(0.92) translateY(6px); } to { opacity: 1; transform: scale(1) translateY(0); } }
    .anp-modal-in { animation: anpModalIn 0.20s cubic-bezier(0.22,1,0.36,1) both; }
  `;
  document.head.appendChild(_s);
}

// ─── Colors ───────────────────────────────────────────────────────────────────
const GOLD  = '#F4B02A';
const NAVY  = '#163A63';
const DARK  = '#102D4E';
const BORDER = '#E5E7EB';
const SURFACE = '#F0EEE8';
const CARD  = '#FFFFFF';
const SCREEN = '#F5F4F0';
const TEXT_P = '#111827';
const TEXT_S = '#374151';
const TEXT_D = '#9CA3AF';
const BLUE   = '#1E5799';
const BLUE_A = '#3B82F6';
const BLUE_D = 'rgba(30,87,153,0.12)';

// ─── Storage keys — scoped per user so history is never shared across accounts ─
const KEY_CALC_BASE = 'elevCalc:calcHistV3';
const KEY_CONV_BASE = 'elevCalc:convHistory';
const MAX_HIST = 20;
// Returns uid-specific key; falls back to base key for guests/no-uid
function calcKey(uid: string) { return uid ? `${KEY_CALC_BASE}:${uid}` : KEY_CALC_BASE; }
function convKey(uid: string) { return uid ? `${KEY_CONV_BASE}:${uid}` : KEY_CONV_BASE; }

// ─── Types ────────────────────────────────────────────────────────────────────
type Mode     = 'eng' | 'fif';
type Op       = '+' | '-';
type SubTab   = 'calculator' | 'converter';
type ConvMode = 'fif_to_eng' | 'eng_to_fif';

// One value in an accumulated calculation session
interface SessionStep {
  op: Op;       // operator preceding this step (ignored for step[0])
  mode: Mode;
  ft: string; inches: number; frac: number; frL: string; eng: string;
  val: number;
}

// History item: a complete session (2 steps = normal calc; 3+ = chained via Add Another Value)
interface CalcHistItem {
  id: string;
  steps: SessionStep[];
  result: number;
  timestamp?: number;
}

interface ConvItem {
  id: string;
  mode: ConvMode;
  fifFeet: number; fifInches: number; fifFracLbl: string;
  engVal: number;
}

// ─── Math helpers ─────────────────────────────────────────────────────────────
function fifToEng(feet: string, inches: number, frac: number): number {
  const f = parseFloat(feet);
  if (isNaN(f) || f < 0) return NaN;
  return f + inches / 12 + frac / 12;
}

function engToFif(eng: number): { feet: number; inches: number; fracLbl: string } {
  if (isNaN(eng) || eng < 0) return { feet: 0, inches: 0, fracLbl: 'None' };
  const ti = eng * 12;
  const ft = Math.floor(ti / 12);
  const ri = ti - ft * 12;
  const fl = Math.floor(ri);
  const s  = Math.round((ri - fl) * 16);
  const M: Record<number, string> = {
    0:'None', 1:'1/16"', 2:'1/8"', 3:'3/16"', 4:'1/4"', 5:'5/16"',
    6:'3/8"', 7:'7/16"', 8:'1/2"', 9:'9/16"', 10:'5/8"', 11:'11/16"',
    12:'3/4"', 13:'13/16"', 14:'7/8"', 15:'15/16"',
  };
  return { feet: ft, inches: fl, fracLbl: M[s] ?? 'None' };
}

function fracLblToDecimal(fracLbl: string): number {
  if (!fracLbl || fracLbl === 'None') return 0;
  const clean = fracLbl.endsWith('"') ? fracLbl.slice(0, -1) : fracLbl;
  const parts = clean.split('/');
  if (parts.length === 2) {
    const num = parseInt(parts[0], 10);
    const den = parseInt(parts[1], 10);
    if (!isNaN(num) && !isNaN(den) && den > 0) return num / den;
  }
  return 0;
}

function genId(): string { return `${Date.now()}-${Math.random().toString(36).slice(2,7)}`; }

function loadJson<T>(key: string, fallback: T): T {
  try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : fallback; } catch { return fallback; }
}

// ─── Stacked fraction display ─────────────────────────────────────────────────
function StackedFraction({ feet, inches, fracLbl, negative = false, color = '#fff', size = 14 }: {
  feet: number; inches: number; fracLbl: string; negative?: boolean; color?: string; size?: number;
}) {
  const hasFrac  = !!(fracLbl && fracLbl !== 'None');
  const clean    = hasFrac ? fracLbl.replace('"', '') : '';
  const parts    = clean.split('/');
  const num      = parts.length === 2 ? parseInt(parts[0], 10) : NaN;
  const den      = parts.length === 2 ? parseInt(parts[1], 10) : NaN;
  const showFrac = hasFrac && !isNaN(num) && !isNaN(den);
  const tiny     = Math.max(8, Math.round(size * 0.62));

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
      <span style={{ fontSize: size, fontWeight: 700, color }}>{negative ? '−' : ''}{feet}' - {inches}{showFrac ? ' ' : '"'}</span>
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


// ─── Step value node (FIF or decimal, inline) ────────────────────────────────
function StepValueNode({ step, size = 13 }: { step: SessionStep; size?: number }) {
  const { isMetric, ftToDisplay } = useUnit();
  if (step.mode === 'eng') {
    const dispVal = ftToDisplay(Math.abs(parseFloat(step.eng) || 0));
    return (
      <span style={{ fontSize: size, fontWeight: 700, color: NAVY, fontFamily: 'monospace' }}>
        {dispVal.toFixed(isMetric ? 3 : 2)} {isMetric ? 'm' : 'ft'}
      </span>
    );
  }
  // FIF mode — in metric, display as M-CM-MM using step.val (always in feet)
  if (isMetric) {
    const totalM = Math.abs(step.val) * FT_TO_M;
    const wholeM = Math.floor(totalM);
    const remM   = totalM - wholeM;
    const cm     = Math.floor(remM * 100);
    const mm     = Math.round((remM * 100 - cm) * 10);
    return (
      <span style={{ fontSize: size, fontWeight: 700, color: NAVY, fontFamily: 'monospace' }}>
        {wholeM}m {String(cm).padStart(2,'0')}cm{mm > 0 ? ` ${mm}mm` : ''}
      </span>
    );
  }
  // Imperial FIF: always derive from step.val (feet) so metric-entered steps display correctly
  const fif = engToFif(Math.abs(step.val));
  return (
    <StackedFraction
      feet={fif.feet}
      inches={fif.inches}
      fracLbl={fif.fracLbl}
      color={NAVY} size={size}
    />
  );
}

// ─── Compact calc row — expression (last ≤3 ops, no = result) + result row ────
function CompactCalcRow({ item }: { item: CalcHistItem }) {
  const { t } = useLang();
  const { isMetric, ftToDisplay } = useUnit();
  const rFIF    = engToFif(Math.abs(item.result));
  // Show at most last 3 steps; prefix "…" if earlier steps were cut
  const showFrom   = item.steps.length > 3 ? item.steps.length - 3 : 0;
  const showSteps  = item.steps.slice(showFrom);
  const truncated  = showFrom > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* Expression row — operations only, no = or result */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, overflow: 'hidden', flexWrap: 'nowrap' }}>
        {truncated && (
          <span style={{ fontSize: 14, fontWeight: 700, color: TEXT_S, flexShrink: 0, paddingRight: 1 }}>…</span>
        )}
        {showSteps.map((step, idx) => {
          const globalIdx = showFrom + idx;
          const isVeryFirst = globalIdx === 0 && !truncated;
          return (
            <span key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, flexShrink: idx === showSteps.length - 1 ? 0 : 1 }}>
              {!isVeryFirst && (
                <span style={{ fontSize: 15, fontWeight: 800, color: NAVY, padding: '0 3px', flexShrink: 0 }}>
                  {step.op === '+' ? '+' : '−'}
                </span>
              )}
              <StepValueNode step={step} size={14} />
            </span>
          );
        })}
      </div>
      {/* Result row — RESULT label, structured • decimal, ops badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'nowrap' }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: NAVY, textTransform: 'uppercase', letterSpacing: 0.6, flexShrink: 0 }}>{t('result')}:</span>
        {isMetric ? (() => {
          const totalM = Math.abs(item.result) * FT_TO_M;
          const wholeM = Math.floor(totalM);
          const remM   = totalM - wholeM;
          const cm     = Math.floor(remM * 100);
          const mm     = Math.round((remM * 100 - cm) * 10);
          return <span style={{ fontSize: 14, fontWeight: 700, color: NAVY, fontFamily: 'monospace', flexShrink: 0 }}>{item.result < 0 ? '−' : ''}{wholeM}m {String(cm).padStart(2,'0')}cm{mm > 0 ? ` ${mm}mm` : ''}</span>;
        })() : (
          <StackedFraction {...rFIF} negative={item.result < 0} color={NAVY} size={14} />
        )}
        <span style={{ fontSize: 12, fontWeight: 700, color: TEXT_S, flexShrink: 0 }}>•</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: NAVY, fontFamily: 'monospace', flexShrink: 0 }}>
          {item.result < 0 ? '−' : ''}{ftToDisplay(Math.abs(item.result)).toFixed(isMetric ? 3 : 2)} {isMetric ? 'm' : 'ft'}
        </span>
      </div>
    </div>
  );
}

// ─── Calculation Grid Modal — full-screen, 2×3 value grid, final result only ──
function CalcGridModal({ item, onClose, onEdit, onDelete }: {
  item: CalcHistItem;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useLang();
  const { isMetric, ftToDisplay } = useUnit();

  const dateStr = item.timestamp
    ? new Date(item.timestamp).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : '';
  const rFIF = engToFif(Math.abs(item.result));
  const rNeg = item.result < 0;
  const steps = item.steps;

  const StepCard = ({ step, num }: { step: SessionStep; num: number }) => {
    const sf = engToFif(Math.abs(step.val));
    return (
      <div style={{ flex: 1, minWidth: 0, backgroundColor: CARD, borderRadius: 8, border: `1.5px solid ${BORDER}`, padding: '8px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
        <span style={{ fontSize: 9, fontWeight: 800, color: NAVY, textTransform: 'uppercase' as const, letterSpacing: 0.5 }}>VALUE {num}</span>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          {isMetric ? (() => {
            const totalM = Math.abs(step.val) * FT_TO_M;
            const wholeM = Math.floor(totalM);
            const remM   = totalM - wholeM;
            const cm     = Math.floor(remM * 100);
            const mm     = Math.round((remM * 100 - cm) * 10);
            return <span style={{ fontSize: 14, fontWeight: 700, color: NAVY, fontFamily: 'monospace' }}>{wholeM}m {String(cm).padStart(2,'0')}cm{mm > 0 ? ` ${mm}mm` : ''}</span>;
          })() : <StackedFraction {...sf} color={NAVY} size={15} />}
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, color: TEXT_S, fontFamily: 'monospace' }}>
          {ftToDisplay(Math.abs(step.val)).toFixed(isMetric ? 3 : 2)} {isMetric ? 'm' : 'ft'}
        </span>
      </div>
    );
  };

  const OpBadge = ({ op }: { op: Op }) => (
    <div style={{ width: 24, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: op === '+' ? '#EDF7ED' : '#FEF2F2', border: `2px solid ${op === '+' ? '#43A047' : '#E53935'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 900, color: op === '+' ? '#2E7D32' : '#C62828', lineHeight: 1, fontFamily: 'monospace' }}>{op === '+' ? '+' : '−'}</span>
      </div>
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.60)', display: 'flex', alignItems: 'flex-end', zIndex: 400 }} onClick={onClose}>
      <div className="anp-modal-in" style={{ width: '100%', maxWidth: 480, margin: '0 auto', backgroundColor: SCREEN, display: 'flex', flexDirection: 'column', maxHeight: '88vh', borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' }} onClick={e => e.stopPropagation()}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', backgroundColor: NAVY, borderBottom: `2px solid ${GOLD}`, flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', letterSpacing: 0.3 }}>{t('calcDetailsTitle')}</div>
          {dateStr && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>{dateStr}</div>}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button style={{ height: 30, padding: '0 10px', backgroundColor: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.35)', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' as const }}
            onClick={onEdit}>✏️ Edit</button>
          <button style={{ height: 30, padding: '0 10px', backgroundColor: 'rgba(220,53,53,0.25)', border: '1px solid #E53935', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' as const }}
            onClick={onDelete}>🗑️ Delete</button>
          <button style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.18)', border: 'none', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}
            onClick={onClose}>✕</button>
        </div>
      </div>

      {/* ── 2×3 grid + final result ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Row 1 — steps 0–2 */}
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 4 }}>
          {steps[0] && <StepCard step={steps[0]} num={1} />}
          {steps[1] && <OpBadge op={steps[1].op} />}
          {steps[1] && <StepCard step={steps[1]} num={2} />}
          {steps[2] && <OpBadge op={steps[2].op} />}
          {steps[2] && <StepCard step={steps[2]} num={3} />}
        </div>

        {/* Inter-row divider + operator (op between step[2] and step[3]) */}
        {steps[3] && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, height: 1, backgroundColor: BORDER }} />
            <div style={{ width: 28, height: 24, borderRadius: 12, backgroundColor: steps[3].op === '+' ? '#EDF7ED' : '#FEF2F2', border: `2px solid ${steps[3].op === '+' ? '#43A047' : '#E53935'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 15, fontWeight: 900, color: steps[3].op === '+' ? '#2E7D32' : '#C62828', lineHeight: 1, fontFamily: 'monospace' }}>{steps[3].op === '+' ? '+' : '−'}</span>
            </div>
            <div style={{ flex: 1, height: 1, backgroundColor: BORDER }} />
          </div>
        )}

        {/* Row 2 — steps 3–5 */}
        {steps[3] && (
          <div style={{ display: 'flex', alignItems: 'stretch', gap: 4 }}>
            <StepCard step={steps[3]} num={4} />
            {steps[4] && <OpBadge op={steps[4].op} />}
            {steps[4] && <StepCard step={steps[4]} num={5} />}
            {steps[5] && <OpBadge op={steps[5].op} />}
            {steps[5] && <StepCard step={steps[5]} num={6} />}
          </div>
        )}

        {/* Final result only */}
        <div style={{ backgroundColor: DARK, borderRadius: 10, border: `2px solid ${GOLD}`, padding: '12px 14px', textAlign: 'center' as const, boxShadow: '0 4px 16px rgba(16,45,78,0.22)' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: GOLD, textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 8 }}>{t('finalResult')}</div>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}>
            {isMetric ? (() => {
              const totalM = Math.abs(item.result) * FT_TO_M;
              const wholeM = Math.floor(totalM);
              const remM   = totalM - wholeM;
              const cm     = Math.floor(remM * 100);
              const mm     = Math.round((remM * 100 - cm) * 10);
              return <span style={{ fontSize: 20, fontWeight: 700, color: '#fff', fontFamily: 'monospace' }}>{rNeg ? '−' : ''}{wholeM}m {String(cm).padStart(2,'0')}cm{mm > 0 ? ` ${mm}mm` : ''}</span>;
            })() : <StackedFraction {...rFIF} negative={rNeg} color="#fff" size={20} />}
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: GOLD, marginBottom: 4 }}>·</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', fontFamily: 'monospace' }}>
            {rNeg ? '−' : ''}{ftToDisplay(Math.abs(item.result)).toFixed(isMetric ? 3 : 2)} {isMetric ? 'm' : 'ft'}
          </div>
        </div>

      </div>
      </div>{/* inner card */}
    </div>
  );
}


// ─── Conv history row ─────────────────────────────────────────────────────────
function ConvHistRow({ item, compact = false }: { item: ConvItem; compact?: boolean }) {
  const { isMetric, ftToDisplay } = useUnit();
  const sz = compact ? 14 : 16;
  // In metric: show MCM for the structured side
  const mcmNode = (() => {
    const totalM = item.engVal * FT_TO_M;
    const wholeM = Math.floor(totalM);
    const remM   = totalM - wholeM;
    const cm     = Math.floor(remM * 100);
    const mm     = Math.round((remM * 100 - cm) * 10);
    return <span style={{ fontSize: sz, fontWeight: 700, color: TEXT_P, fontFamily: 'monospace' }}>{wholeM}m {String(cm).padStart(2,'0')}cm{mm > 0 ? ` ${mm}mm` : ''}</span>;
  })();
  const FIFNode = isMetric ? mcmNode : <StackedFraction feet={item.fifFeet} inches={item.fifInches} fracLbl={item.fifFracLbl} color={TEXT_P} size={sz} />;
  const dispVal = ftToDisplay(item.engVal);
  const EngNode = <span style={{ fontSize: sz, fontWeight: 700, color: TEXT_P, fontFamily: 'monospace' }}>{dispVal.toFixed(isMetric ? 3 : 2)} {isMetric ? 'm' : 'ft'}</span>;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      {item.mode === 'fif_to_eng' ? FIFNode : EngNode}
      <span style={{ fontSize: compact ? 14 : 17, color: GOLD, fontWeight: 700 }}>→</span>
      {item.mode === 'fif_to_eng' ? EngNode : FIFNode}
    </div>
  );
}

// ─── All-calcs modal — with ⋮ menu on every card ─────────────────────────────
function AllCalcsModal({ history, onClose, onDeleteAll, onViewFull, onEdit, onDeleteItem }: {
  history: CalcHistItem[];
  onClose: () => void;
  onDeleteAll: () => void;
  onViewFull: (item: CalcHistItem) => void;
  onEdit: (item: CalcHistItem) => void;
  onDeleteItem: (item: CalcHistItem) => void;
}) {
  const { t } = useLang();
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', zIndex: 300 }}>
      <div style={{ width: '100%', maxWidth: 480, margin: '0 auto', backgroundColor: SCREEN, display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', backgroundColor: NAVY, borderBottom: `2px solid ${GOLD}`, flexShrink: 0 }}>
          <span style={{ fontSize: 17, fontWeight: 800, color: '#fff', letterSpacing: 0.3 }}>{t('allCalcsTitle')}</span>
          <button style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer' }} onClick={onClose}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {history.length === 0 && <p style={{ textAlign: 'center', color: TEXT_D, padding: 32 }}>{t('noCalcsYet')}</p>}
          {history.map((item, i) => (
            <div key={item.id} style={{ backgroundColor: CARD, borderRadius: 10, border: `1px solid ${BORDER}`, padding: '10px 12px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              {/* Card header: number badge + ⋮ menu */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ backgroundColor: BLUE_D, borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 800, color: BLUE_A }}>#{i + 1}</span>
                <div style={{ position: 'relative' }}>
                  <button
                    style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: menuOpenId === item.id ? SURFACE : 'transparent', border: `1px solid ${menuOpenId === item.id ? BORDER : 'transparent'}`, fontSize: 16, fontWeight: 900, color: TEXT_S, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', letterSpacing: '-1px', lineHeight: 1, padding: 0 }}
                    onClick={e => { e.stopPropagation(); setMenuOpenId(menuOpenId === item.id ? null : item.id); }}
                  >⋮</button>
                  {menuOpenId === item.id && (
                    <div style={{ position: 'absolute', right: 0, top: 32, zIndex: 50, backgroundColor: CARD, borderRadius: 8, border: `1px solid ${BORDER}`, boxShadow: '0 6px 20px rgba(0,0,0,0.14)', minWidth: 180, overflow: 'hidden' }}>
                      <button style={{ width: '100%', padding: '10px 14px', border: 'none', borderBottom: `1px solid ${BORDER}`, backgroundColor: 'transparent', textAlign: 'left' as const, fontSize: 13, fontWeight: 700, color: NAVY, cursor: 'pointer' }}
                        onClick={() => { setMenuOpenId(null); onViewFull(item); }}>🔍 {t('viewFullCalcBtn')}</button>
                      <button style={{ width: '100%', padding: '10px 14px', border: 'none', borderBottom: `1px solid ${BORDER}`, backgroundColor: 'transparent', textAlign: 'left' as const, fontSize: 13, fontWeight: 700, color: NAVY, cursor: 'pointer' }}
                        onClick={() => { setMenuOpenId(null); onEdit(item); }}>✏️ {t('editCalcBtn')}</button>
                      <button style={{ width: '100%', padding: '10px 14px', border: 'none', backgroundColor: 'transparent', textAlign: 'left' as const, fontSize: 13, fontWeight: 700, color: '#C0392B', cursor: 'pointer' }}
                        onClick={() => { setMenuOpenId(null); onDeleteItem(item); }}>🗑️ {t('deleteCalcBtn')}</button>
                    </div>
                  )}
                </div>
              </div>
              <CompactCalcRow item={item} />
            </div>
          ))}
        </div>
        {history.length > 0 && (
          <div style={{ padding: '10px 16px', borderTop: `1px solid ${BORDER}`, flexShrink: 0 }}>
            <button style={{ width: '100%', height: 48, backgroundColor: 'rgba(192,57,43,0.10)', border: '1.5px solid #C0392B', borderRadius: 8, color: '#C0392B', fontSize: 15, fontWeight: 800, cursor: 'pointer', letterSpacing: 0.5 }} onClick={onDeleteAll}>
              {t('deleteAllCalcs')}
            </button>
          </div>
        )}
      </div>
      {/* Close ⋮ when tapping outside */}
      {menuOpenId && <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setMenuOpenId(null)} />}
    </div>
  );
}

// ─── All-convs modal ──────────────────────────────────────────────────────────
function AllConvsModal({ history, onClose, onDeleteAll }: {
  history: ConvItem[]; onClose: () => void; onDeleteAll: () => void;
}) {
  const { t } = useLang();
  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', zIndex: 300 }}>
      <div style={{ width: '100%', maxWidth: 480, margin: '0 auto', backgroundColor: SCREEN, display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', backgroundColor: NAVY, borderBottom: `2px solid ${GOLD}` }}>
          <span style={{ fontSize: 17, fontWeight: 700, color: '#fff', letterSpacing: 0.5 }}>{t('allConvsTitle')}</span>
          <button style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer' }} onClick={onClose}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {history.length === 0 && <p style={{ textAlign: 'center', color: TEXT_D, padding: 32 }}>{t('noConvsYet')}</p>}
          {history.map((item, i) => (
            <div key={item.id} style={{ backgroundColor: CARD, borderRadius: 8, border: `1px solid ${BORDER}`, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ backgroundColor: BLUE_D, borderRadius: 4, padding: '2px 7px', fontSize: 12, fontWeight: 800, color: BLUE_A, alignSelf: 'flex-start' }}>#{i + 1}</span>
              <ConvHistRow item={item} />
            </div>
          ))}
        </div>
        {history.length > 0 && (
          <div style={{ padding: '10px 16px', borderTop: `1px solid ${BORDER}` }}>
            <button style={{ width: '100%', height: 48, backgroundColor: 'rgba(192,57,43,0.10)', border: '1.5px solid #C0392B', borderRadius: 8, color: '#C0392B', fontSize: 15, fontWeight: 800, cursor: 'pointer', letterSpacing: 0.5 }} onClick={onDeleteAll}>
              {t('deleteAllConvs')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONVERTER VIEW — bidirectional, both cards always active
// ═══════════════════════════════════════════════════════════════════════════════
function ConverterView({ uid }: { uid: string }) {
  const { t } = useLang();
  const { isMetric } = useUnit();

  // ── Input state (each side is independent — no auto-sync) ──────────────────
  const [cFt,         setCFt]         = useState('');
  const [cIn,         setCIn]         = useState(0);
  const [cFr,         setCFr]         = useState(0);
  const [cFrL,        setCFrL]        = useState('None');
  const [cFtErr,      setCFtErr]      = useState('');
  const [cEng,        setCEng]        = useState('');
  // Metric M-CM-MM state (cFt repurposed as meters string in metric)
  const [cCm,         setCCm]         = useState(0);
  const [cMm,         setCMm]         = useState(0);

  // Which side the user last edited — determines conversion direction on CONVERT
  const [lastEdited,  setLastEdited]  = useState<'fif' | 'eng' | null>(null);
  // Disables button after a successful conversion until an input changes
  const [convDone,    setConvDone]    = useState(false);

  // Placeholder-on-focus state
  const [cFtFocused,  setCFtFocused]  = useState(false);
  const [cEngFocused, setCEngFocused] = useState(false);

  const [convHistory, setConvHistory] = useState<ConvItem[]>(() => loadJson(convKey(uid), []));
  const [showAllConvs,setShowAllConvs]= useState(false);
  const [convConfirm, setConvConfirm] = useState<null | { onConfirm: () => void }>(null);

  // Reload history when the active user changes (account switch)
  useEffect(() => {
    setConvHistory(loadJson(convKey(uid), []));
  }, [uid]);

  // Persist history under the uid-scoped key
  useEffect(() => {
    try { localStorage.setItem(convKey(uid), JSON.stringify(convHistory)); } catch {}
  }, [convHistory, uid]);

  // ── Input handlers — NO cross-side updates, just track lastEdited ──────────
  const resetConv = () => setConvDone(false);

  const onCFtChange = (v: string) => {
    if (v !== '' && !/^\d+$/.test(v)) { setCFtErr('Whole numbers only'); return; }
    setCFt(v); setCFtErr('');
    setLastEdited('fif'); resetConv();
  };
  const onSelectInches = (inches: number) => {
    setCIn(inches); setLastEdited('fif'); resetConv();
  };
  const onSelectFrac = (frac: number, frL: string) => {
    setCFr(frac); setCFrL(frL); setLastEdited('fif'); resetConv();
  };
  const onEngChange = (v: string) => {
    setCEng(v); setLastEdited('eng'); resetConv();
  };

  // ── Clear buttons ─────────────────────────────────────────────────────────
  const clearFIF = () => { setCFt(''); setCIn(0); setCFr(0); setCFrL('None'); setCFtErr(''); setCCm(0); setCMm(0); if (lastEdited === 'fif') { setCEng(''); } setLastEdited(null); resetConv(); };
  const clearEng = () => { setCEng(''); if (lastEdited === 'eng') { setCFt(''); setCIn(0); setCFr(0); setCFrL('None'); setCFtErr(''); setCCm(0); setCMm(0); } setLastEdited(null); resetConv(); };
  const handleAllClear = () => { setCFt(''); setCIn(0); setCFr(0); setCFrL('None'); setCFtErr(''); setCEng(''); setCCm(0); setCMm(0); setLastEdited(null); resetConv(); };

  // ── Validity ──────────────────────────────────────────────────────────────
  // In metric mode: cFt holds meters string; cCm/cMm hold cm/mm
  const fifValid = isMetric
    ? (cFt !== '' && !isNaN(parseFloat(cFt))) || cCm > 0 || cMm > 0
    : cFt !== '' && !isNaN(parseFloat(cFt));
  const engValid = cEng !== '' && !isNaN(parseFloat(cEng)) && parseFloat(cEng) >= 0;
  const canConv  = fifValid || engValid;
  const convEnabled = canConv && !convDone;

  // ── CONVERT — manual, explicit, saves to history ───────────────────────────
  const handleConvert = () => {
    if (!convEnabled) return;

    // Determine conversion direction: prefer the side user last edited
    const goFifToEng = lastEdited !== 'eng' ? fifValid : !engValid;

    if (isMetric) {
      if (goFifToEng) {
        // M-CM-MM → Decimal m
        const meters = (parseFloat(cFt || '0') || 0) + cCm / 100 + cMm / 1000;
        const engStr = meters.toFixed(3);
        setCEng(engStr);
        const engInFt = meters / FT_TO_M;
        setConvHistory(prev => [{
          id: genId(), mode: 'fif_to_eng' as ConvMode,
          fifFeet: Math.floor(meters), fifInches: cCm, fifFracLbl: `${cMm}`, engVal: engInFt,
        }, ...prev].slice(0, MAX_HIST));
      } else {
        // Decimal m → M-CM-MM
        const decMeters = parseFloat(cEng);
        if (isNaN(decMeters) || decMeters < 0) return;
        const wholeM = Math.floor(decMeters);
        const remM   = decMeters - wholeM;
        const cm     = Math.floor(remM * 100);
        const mm     = Math.round((remM * 100 - cm) * 10);
        setCFt(String(wholeM));
        setCCm(cm);
        setCMm(mm);
        setCFtErr('');
        setCEng(decMeters.toFixed(3));
        const engInFt = decMeters / FT_TO_M;
        setConvHistory(prev => [{
          id: genId(), mode: 'fif_to_eng' as ConvMode,
          fifFeet: wholeM, fifInches: cm, fifFracLbl: `${mm}`, engVal: engInFt,
        }, ...prev].slice(0, MAX_HIST));
      }
    } else {
      if (goFifToEng) {
        // FIF → Decimal
        const engNum = fifToEng(cFt, cIn, cFr);
        if (isNaN(engNum)) return;
        const engStr = engNum.toFixed(2);
        setCEng(engStr);
        const ftNum = parseInt(cFt, 10) || 0;
        setConvHistory(prev => [{
          id: genId(), mode: 'fif_to_eng' as ConvMode,
          fifFeet: ftNum, fifInches: cIn, fifFracLbl: cFrL, engVal: engNum,
        }, ...prev].slice(0, MAX_HIST));
      } else {
        // Decimal → FIF
        const engNum = parseFloat(cEng);
        if (isNaN(engNum) || engNum < 0) return;
        const fif = engToFif(engNum);
        setCFt(String(fif.feet));
        setCIn(fif.inches);
        setCFrL(fif.fracLbl);
        setCFr(fracLblToDecimal(fif.fracLbl));
        setCFtErr('');
        // Normalise the decimal display to 2dp
        setCEng(engNum.toFixed(2));
        const ftNum = fif.feet;
        setConvHistory(prev => [{
          id: genId(), mode: 'fif_to_eng' as ConvMode,
          fifFeet: ftNum, fifInches: fif.inches, fifFracLbl: fif.fracLbl, engVal: engNum,
        }, ...prev].slice(0, MAX_HIST));
      }
    }

    setConvDone(true);
  };

  const handleDeleteAllConvs = () => {
    setConvConfirm({
      onConfirm: () => {
        setConvHistory([]);
        setShowAllConvs(false);
        setConvConfirm(null);
      },
    });
  };

  return (
    <>
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: 12, display: 'flex', flexDirection: 'column', gap: 12, boxSizing: 'border-box', width: '100%' }}>

        {/* ── Card row: FIF | = | Decimal ── */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'stretch', minWidth: 0 }}>

          {/* FIF / M-CM-MM card — always active */}
          <div style={{ flex: 5, minWidth: 0, overflow: 'hidden', backgroundColor: CARD, borderRadius: 8, border: `1.5px solid ${GOLD}`, padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: TEXT_P, letterSpacing: 0.4 }}>{isMetric ? 'M-CM' : t('ftInches')}</span>
            {isMetric ? (
              /* Metric: M-CM-MM fields */
              <div style={{ border: `1.5px solid ${GOLD}`, borderRadius: 6, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <input
                  style={{ width: '100%', height: 36, border: 'none', backgroundColor: '#fff', fontSize: 20, fontWeight: 700, color: '#1A2D35', textAlign: 'center', outline: 'none', padding: '0 4px', boxSizing: 'border-box' as const }}
                  value={cFt === '' ? '' : (cFt === '0' ? '' : cFt)}
                  onChange={e => { const v = e.target.value; if (v === '' || /^\d+$/.test(v)) { setCFt(v || '0'); setCFtErr(''); setLastEdited('fif'); resetConv(); } }}
                  inputMode="numeric"
                  placeholder={cFtFocused ? '' : 'Meters'}
                  onFocus={() => setCFtFocused(true)}
                  onBlur={() => setCFtFocused(false)}
                />
                <div style={{ height: 1, backgroundColor: '#8C8C8C', flexShrink: 0 }} />
                <select style={{ width: '100%', height: 36, border: 'none', backgroundColor: SURFACE, fontSize: 18, fontWeight: 700, color: TEXT_P, textAlign: 'center' as const, boxSizing: 'border-box' as const }}
                  value={String(cCm)} onChange={e => { setCCm(parseInt(e.target.value, 10)); setLastEdited('fif'); resetConv(); }}>
                  {CM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <div style={{ height: 1, backgroundColor: '#8C8C8C', flexShrink: 0 }} />
                <select style={{ width: '100%', height: 36, border: 'none', backgroundColor: SURFACE, fontSize: 18, fontWeight: 700, color: TEXT_P, textAlign: 'center' as const, boxSizing: 'border-box' as const }}
                  value={String(cMm)} onChange={e => { setCMm(parseInt(e.target.value, 10)); setLastEdited('fif'); resetConv(); }}>
                  {MM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            ) : (
              /* Imperial: FIF fields */
              <div style={{ border: `1.5px solid ${cFtErr ? '#C0392B' : GOLD}`, borderRadius: 6, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <input
                  style={{ width: '100%', height: 36, border: 'none', backgroundColor: '#fff', fontSize: 20, fontWeight: 700, color: '#1A2D35', textAlign: 'center', outline: 'none', padding: '0 4px', boxSizing: 'border-box' as const }}
                  value={cFt} onChange={e => onCFtChange(e.target.value)}
                  inputMode="numeric"
                  placeholder={cFtFocused ? '' : 'Feet'}
                  onFocus={() => setCFtFocused(true)}
                  onBlur={() => setCFtFocused(false)}
                />
                <div style={{ height: 1, backgroundColor: '#8C8C8C', flexShrink: 0 }} />
                <select style={{ width: '100%', height: 36, border: 'none', backgroundColor: SURFACE, fontSize: 20, fontWeight: 700, color: TEXT_P, textAlign: 'center' as const, boxSizing: 'border-box' as const }}
                  value={String(cIn)} onChange={e => onSelectInches(parseInt(e.target.value, 10))}>
                  {INCHES_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <div style={{ height: 1, backgroundColor: '#8C8C8C', flexShrink: 0 }} />
                <select style={{ width: '100%', height: 36, border: 'none', backgroundColor: SURFACE, fontSize: 20, fontWeight: 700, color: TEXT_P, textAlign: 'center' as const, boxSizing: 'border-box' as const }}
                  value={cFrL === 'None' ? '0' : String(cFr)} onChange={e => {
                    const opt = FRACTION_OPTIONS.find(o => o.value === e.target.value);
                    if (opt) onSelectFrac(parseFloat(opt.value), opt.label);
                  }}>
                  {FRACTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            )}
            {cFtErr && <span style={{ fontSize: 9, color: '#C0392B', fontWeight: 600, textAlign: 'center' }}>{cFtErr}</span>}
            <button style={{ height: 28, backgroundColor: 'rgba(192,57,43,0.08)', border: '1px solid rgba(192,57,43,0.35)', borderRadius: 4, fontSize: 11, fontWeight: 800, color: '#C0392B', cursor: 'pointer', letterSpacing: 0.2 }}
              onClick={clearFIF}>✕ {t('clearBtn')}</button>
          </div>

          {/* = center */}
          <div style={{ width: 44, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: NAVY, border: `2px solid ${GOLD}`, color: GOLD, fontSize: 20, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', userSelect: 'none' as const }}>=</div>
          </div>

          {/* Decimal card — always active */}
          <div style={{ flex: 5, minWidth: 0, overflow: 'hidden', backgroundColor: CARD, borderRadius: 8, border: `1.5px solid ${GOLD}`, padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: TEXT_P, letterSpacing: 0.4 }}>{isMetric ? 'Decimal m' : t('decimalFeet')}</span>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, minWidth: 0 }}>
              <input
                style={{ width: '100%', height: 52, borderRadius: 4, border: `1.5px solid ${GOLD}`, backgroundColor: '#fff', fontSize: 20, fontWeight: 700, color: '#1A2D35', textAlign: 'center', outline: 'none', boxSizing: 'border-box' as const }}
                value={cEng} onChange={e => onEngChange(e.target.value)}
                inputMode="decimal"
                enterKeyHint="done"
                placeholder={cEngFocused ? '' : '0.00'}
                onFocus={() => setCEngFocused(true)}
                onBlur={() => setCEngFocused(false)}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              />
              <span style={{ fontSize: 13, fontWeight: 700, color: TEXT_S, letterSpacing: 0.3 }}>{isMetric ? 'm' : 'ft'}</span>
            </div>
            <button style={{ height: 28, backgroundColor: 'rgba(192,57,43,0.08)', border: '1px solid rgba(192,57,43,0.35)', borderRadius: 4, fontSize: 11, fontWeight: 800, color: '#C0392B', cursor: 'pointer', letterSpacing: 0.2 }}
              onClick={clearEng}>✕ {t('clearBtn')}</button>
          </div>
        </div>

        {/* ── Action buttons ── */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            style={{ flex: 1, height: 40, backgroundColor: CARD, border: `2px solid ${NAVY}`, borderRadius: 8, color: NAVY, fontSize: 15, fontWeight: 800, letterSpacing: 1, cursor: 'pointer' }}
            onClick={handleAllClear}
          >{t('allClear')}</button>
          <button
            style={{
              flex: 2, height: 40,
              backgroundColor: convEnabled ? NAVY : '#E8EFF7',
              border: `2px solid ${convEnabled ? GOLD : '#C5D2E4'}`,
              borderRadius: 8,
              color: convEnabled ? '#fff' : '#7B96B8',
              fontSize: 17, fontWeight: 800, letterSpacing: 1.5,
              cursor: convEnabled ? 'pointer' : 'default',
            }}
            onClick={handleConvert}
            disabled={!convEnabled}
          >{t('convert')}</button>
        </div>

        {/* ── Recent Conversions ── */}
        {convHistory.length > 0 && (
          <div style={{ backgroundColor: CARD, borderRadius: 8, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', backgroundColor: SURFACE, borderBottom: `1px solid ${BORDER}` }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: TEXT_P, letterSpacing: 0.7 }}>{t('recentConvs')}</span>
              <button style={{ backgroundColor: BLUE_D, borderRadius: 4, padding: '4px 10px', border: `1px solid ${BLUE}`, fontSize: 14, fontWeight: 700, color: BLUE_A, cursor: 'pointer' }}
                onClick={() => setShowAllConvs(true)}>{t('allConvs')}</button>
            </div>
            {convHistory.slice(0, 2).map((item, i) => (
              <div key={item.id} style={{ padding: '10px 12px', borderBottom: i === 0 && convHistory.length > 1 ? `1px solid ${BORDER}` : 'none' }}>
                <ConvHistRow item={item} compact />
              </div>
            ))}
          </div>
        )}
      </div>

      {showAllConvs && (
        <AllConvsModal history={convHistory} onClose={() => setShowAllConvs(false)} onDeleteAll={handleDeleteAllConvs} />
      )}
      {convConfirm && (
        <ConfirmModal
          message={t('deleteConvsConfirm')}
          confirmLabel={t('deleteAll')}
          cancelLabel={t('cancel')}
          danger
          onConfirm={convConfirm.onConfirm}
          onCancel={() => setConvConfirm(null)}
        />
      )}
    </>
  );
}

// ─── Card state ───────────────────────────────────────────────────────────────
interface CardState {
  mode: Mode;
  ft: string; inches: number; frac: number; frL: string; eng: string; ftErr: string;
  mt: string; cm: number; mm: number;
}
function emptyCard(): CardState {
  return { mode: 'fif', ft: '', inches: 0, frac: 0, frL: 'None', eng: '', ftErr: '', mt: '0', cm: 0, mm: 0 };
}
function cardValFt(card: CardState, isMetric: boolean): number {
  if (card.mode === 'eng') {
    if (card.eng === '') return NaN;
    const v = parseFloat(card.eng);
    if (isNaN(v)) return NaN;
    return isMetric ? v / FT_TO_M : v;
  }
  if (isMetric) {
    const mt = parseFloat(card.mt || '0') || 0;
    if (mt === 0 && card.cm === 0 && card.mm === 0) return NaN;
    return (mt + card.cm / 100 + card.mm / 1000) / FT_TO_M;
  }
  if (card.ft === '') return NaN;
  const f = parseFloat(card.ft);
  if (isNaN(f) || f < 0) return NaN;
  return f + card.inches / 12 + card.frac / 12;
}

// ─── Compact mode toggle (for 3-col grid) ────────────────────────────────────
function ModeToggleCompact({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const { isMetric } = useUnit();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', borderRadius: 3, border: `1px solid ${BORDER}`, overflow: 'hidden', flexShrink: 0 }}>
      {(['eng', 'fif'] as Mode[]).map(m => (
        <button key={m} style={{
          height: 18, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 800,
          letterSpacing: 0.1, color: mode === m ? '#fff' : TEXT_S,
          backgroundColor: mode === m ? NAVY : SURFACE,
          transition: 'background-color 0.12s, color 0.12s',
          whiteSpace: 'nowrap' as const, padding: 0,
        }} onClick={() => onChange(m)}>
          {m === 'eng' ? (isMetric ? 'Dec m' : 'Dec ft') : (isMetric ? 'M-CM' : 'Ft-In')}
        </button>
      ))}
    </div>
  );
}

// ─── Individual value card (1 of 6 in the grid) ──────────────────────────────
function ValueCard({ idx: _idx, card, onUpdate, onClear }: {
  idx: number; card: CardState;
  onUpdate: (patch: Partial<CardState>) => void;
  onClear: () => void;
}) {
  const { isMetric } = useUnit();
  const [engFocused, setEngFocused] = useState(false);
  const [ftFocused,  setFtFocused]  = useState(false);
  const [mtFocused,  setMtFocused]  = useState(false);

  const selSt = { width: '100%', height: 26, border: 'none', backgroundColor: SURFACE, fontSize: 13, fontWeight: 700, color: TEXT_P, textAlign: 'center' as const, boxSizing: 'border-box' as const };
  const inpSt = { height: 26, border: 'none', backgroundColor: '#fff', fontSize: 14, fontWeight: 700, color: '#1A2D35', textAlign: 'center' as const, outline: 'none', padding: 0, width: '100%', boxSizing: 'border-box' as const };
  const div1  = { height: 1, backgroundColor: '#8C8C8C', flexShrink: 0 as const };

  return (
    <div style={{ flex: 1, minWidth: 0, backgroundColor: CARD, borderRadius: 7, border: `1.5px solid ${BORDER}`, padding: '3px 2px', display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden' }}>
      {/* Mode toggle */}
      <ModeToggleCompact mode={card.mode} onChange={m => onUpdate({ mode: m })} />
      {/* Inputs */}
      {card.mode === 'fif' ? (
        isMetric ? (
          <div style={{ border: `1.5px solid ${GOLD}`, borderRadius: 5, overflow: 'hidden', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            <input style={inpSt} value={card.mt === '0' ? '' : card.mt}
              onChange={e => { const v = e.target.value; if (v === '' || /^\d+$/.test(v)) onUpdate({ mt: v || '0' }); }}
              inputMode="numeric" placeholder={mtFocused ? '' : 'M'}
              onFocus={() => setMtFocused(true)} onBlur={() => setMtFocused(false)} />
            <div style={div1} />
            <select style={selSt} value={String(card.cm)} onChange={e => onUpdate({ cm: parseInt(e.target.value, 10) })}>
              {CM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.value}</option>)}
            </select>
            <div style={div1} />
            <select style={selSt} value={String(card.mm)} onChange={e => onUpdate({ mm: parseInt(e.target.value, 10) })}>
              {MM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.value}</option>)}
            </select>
          </div>
        ) : (
          <div style={{ border: `1.5px solid ${card.ftErr ? '#C0392B' : GOLD}`, borderRadius: 5, overflow: 'hidden', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            <input style={inpSt} value={card.ft}
              onChange={e => { const v = e.target.value; if (v === '' || /^\d+$/.test(v)) onUpdate({ ft: v, ftErr: '' }); else onUpdate({ ftErr: '#' }); }}
              inputMode="numeric" placeholder={ftFocused ? '' : 'Ft'}
              onFocus={() => setFtFocused(true)} onBlur={() => setFtFocused(false)} />
            <div style={div1} />
            <select style={selSt} value={String(card.inches)} onChange={e => onUpdate({ inches: parseInt(e.target.value, 10) })}>
              {INCHES_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <div style={div1} />
            <select style={selSt} value={card.frL === 'None' ? '0' : String(card.frac)}
              onChange={e => { const opt = FRACTION_OPTIONS.find(o => o.value === e.target.value); if (opt) onUpdate({ frac: parseFloat(opt.value), frL: opt.label }); }}>
              {FRACTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        )
      ) : (
        <input style={{ flex: 1, minHeight: 36, borderRadius: 4, border: `1.5px solid ${GOLD}`, backgroundColor: '#fff', fontSize: 16, fontWeight: 700, color: '#1A2D35', textAlign: 'center', outline: 'none', width: '100%', boxSizing: 'border-box' as const }}
          value={card.eng} onChange={e => onUpdate({ eng: e.target.value })}
          inputMode="decimal" enterKeyHint="done"
          placeholder={engFocused ? '' : '0.00'}
          onFocus={() => setEngFocused(true)} onBlur={() => setEngFocused(false)}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
      )}
      {/* Clear */}
      <button style={{ height: 16, backgroundColor: '#FDECEC', border: `1px solid #F5B5B5`, borderRadius: 3, fontSize: 9, fontWeight: 800, color: '#D32F2F', cursor: 'pointer', flexShrink: 0, letterSpacing: 0.1 }}
        onClick={onClear}>✕ Clear</button>
    </div>
  );
}

// ─── Operator column between adjacent cards ───────────────────────────────────
function OpColumn({ opIdx, ops, onToggle }: { opIdx: number; ops: Op[]; onToggle: (idx: number, op: Op) => void }) {
  const cur = ops[opIdx];
  return (
    <div style={{ width: 26, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
      {(['+', '-'] as Op[]).map(o => (
        <button key={o} onClick={() => onToggle(opIdx, o)}
          style={{
            width: 26, height: 26, borderRadius: 6,
            border: `2px solid ${cur === o ? GOLD : BORDER}`,
            backgroundColor: cur === o ? NAVY : CARD,
            color: cur === o ? '#fff' : TEXT_S,
            fontSize: o === '+' ? 18 : 22, fontWeight: 900,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'monospace', lineHeight: 1, padding: 0,
            transition: 'background-color 0.15s, border-color 0.15s, color 0.15s',
          }}
        >{o === '+' ? '+' : '−'}</button>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CALCULATOR VIEW — 6-card 2×3 grid
// ═══════════════════════════════════════════════════════════════════════════════
function CalculatorView({ uid }: { uid: string }) {
  const { t } = useLang();
  const { isMetric, ftToDisplay } = useUnit();

  // ── 6 input cards + 5 operators ──────────────────────────────────────────
  const [cards, setCards] = useState<CardState[]>(() => Array.from({ length: 6 }, () => emptyCard()));
  const [ops,   setOps]   = useState<Op[]>(['+', '+', '+', '+', '+']);

  // ── Result state ──────────────────────────────────────────────────────────
  const [result,   setResult]   = useState<number | null>(null);
  const [calcDone, setCalcDone] = useState(false);

  // ── History ───────────────────────────────────────────────────────────────
  const [history,      setHistory]      = useState<CalcHistItem[]>(() => loadJson(calcKey(uid), []));
  const [showAllCalcs, setShowAllCalcs] = useState(false);
  const [calcConfirm,  setCalcConfirm]  = useState<null | { onConfirm: () => void }>(null);
  const [viewFullItem, setViewFullItem] = useState<CalcHistItem | null>(null);

  useEffect(() => {
    setHistory(loadJson(calcKey(uid), []));
    setShowAllCalcs(false);
    setViewFullItem(null);
  }, [uid]);

  useEffect(() => {
    try { localStorage.setItem(calcKey(uid), JSON.stringify(history)); } catch {}
  }, [history, uid]);

  // ── Sync card values when unit system switches ────────────────────────────
  useEffect(() => {
    setCards(prev => prev.map(card => {
      // Read value from the PREVIOUS unit system
      const valFt = cardValFt(card, !isMetric);
      if (isNaN(valFt)) return card;
      if (card.mode === 'eng') {
        // Convert decimal display value
        return { ...card, eng: isMetric ? (valFt * FT_TO_M).toFixed(3) : valFt.toFixed(2) };
      }
      // FIF mode — convert between m-cm-mm ↔ ft-in-frac
      if (isMetric) {
        const totalM = valFt * FT_TO_M;
        const wholeM = Math.floor(totalM);
        const remM   = totalM - wholeM;
        const cm     = Math.floor(remM * 100);
        const mm     = Math.round((remM * 100 - cm) * 10);
        return { ...card, mt: String(wholeM), cm, mm };
      } else {
        const fif = engToFif(valFt);
        return { ...card, ft: String(fif.feet), inches: fif.inches, frac: fracLblToDecimal(fif.fracLbl), frL: fif.fracLbl };
      }
    }));
    setResult(null);
    setCalcDone(false);
  }, [isMetric]); // eslint-disable-line react-hooks/exhaustive-deps

  const resetCalc = () => { setResult(null); setCalcDone(false); };

  const clearAll = () => {
    setCards(Array.from({ length: 6 }, () => emptyCard()));
    setOps(['+', '+', '+', '+', '+']);
    setResult(null);
    setCalcDone(false);
  };

  const updateCard = (idx: number, patch: Partial<CardState>) => {
    setCards(prev => prev.map((c, i) => i === idx ? { ...c, ...patch } : c));
    resetCalc();
  };
  const clearCard = (idx: number) => {
    setCards(prev => prev.map((c, i) => i === idx ? emptyCard() : c));
    resetCalc();
  };
  const toggleOp = (idx: number, op: Op) => {
    setOps(prev => prev.map((o, i) => i === idx ? op : o));
    resetCalc();
  };

  // Compute values in feet for each card
  const vals = cards.map(c => cardValFt(c, isMetric));
  const filledCount = vals.filter(v => !isNaN(v)).length;
  const canCalc = filledCount >= 2 && !calcDone;
  const resultFif = result !== null ? engToFif(Math.abs(result)) : null;

  const handleCalculate = () => {
    if (filledCount < 2) return;
    let res = NaN;
    let started = false;
    const steps: SessionStep[] = [];
    for (let i = 0; i < 6; i++) {
      const v = vals[i];
      if (!isNaN(v)) {
        const effectiveOp: Op = !started ? '+' : (i > 0 ? ops[i - 1] : '+');
        if (!started) { res = v; started = true; }
        else { res = effectiveOp === '+' ? res + v : res - v; }
        steps.push({ op: effectiveOp, mode: cards[i].mode, ft: cards[i].ft, inches: cards[i].inches, frac: cards[i].frac, frL: cards[i].frL, eng: cards[i].eng, val: v });
      }
    }
    if (isNaN(res)) return;
    setResult(res);
    setCalcDone(true);
    const item: CalcHistItem = { id: genId(), steps, result: res, timestamp: Date.now() };
    setHistory(prev => [item, ...prev].slice(0, MAX_HIST));
  };

  const handleDeleteAll = () => {
    setCalcConfirm({ onConfirm: () => { setHistory([]); setShowAllCalcs(false); setCalcConfirm(null); } });
  };

  const handleEditItem = (item: CalcHistItem) => {
    const newCards: CardState[] = Array.from({ length: 6 }, () => emptyCard());
    const newOps: Op[] = ['+', '+', '+', '+', '+'];
    item.steps.slice(0, 6).forEach((step, idx) => {
      const c: CardState = { ...emptyCard(), mode: step.mode };
      if (step.mode === 'fif') {
        if (isMetric && !isNaN(step.val) && step.val > 0) {
          const totalM = step.val * FT_TO_M;
          const wholeM = Math.floor(totalM);
          const remM   = totalM - wholeM;
          c.mt = String(wholeM); c.cm = Math.floor(remM * 100); c.mm = Math.round((remM * 100 - c.cm) * 10);
        } else {
          c.ft = step.ft; c.inches = step.inches; c.frac = step.frac; c.frL = step.frL;
        }
      } else { c.eng = step.eng; }
      newCards[idx] = c;
      if (idx > 0) newOps[idx - 1] = step.op;
    });
    setCards(newCards);
    setOps(newOps);
    resetCalc();
  };

  const handleDeleteItem = (item: CalcHistItem) => {
    setCalcConfirm({
      onConfirm: () => { setHistory(prev => prev.filter(h => h.id !== item.id)); setCalcConfirm(null); },
    });
  };

  return (
    <>
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: 8, display: 'flex', flexDirection: 'column', gap: 5, width: '100%', boxSizing: 'border-box' }}>

        {/* ── Row 1: Cards 0–2 ── */}
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 3, minWidth: 0 }}>
          <ValueCard idx={0} card={cards[0]} onUpdate={p => updateCard(0, p)} onClear={() => clearCard(0)} />
          <OpColumn opIdx={0} ops={ops} onToggle={toggleOp} />
          <ValueCard idx={1} card={cards[1]} onUpdate={p => updateCard(1, p)} onClear={() => clearCard(1)} />
          <OpColumn opIdx={1} ops={ops} onToggle={toggleOp} />
          <ValueCard idx={2} card={cards[2]} onUpdate={p => updateCard(2, p)} onClear={() => clearCard(2)} />
        </div>

        {/* ── Inter-row operator (op[2]: between Card 2 and Card 3) ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ flex: 1, height: 1, backgroundColor: BORDER }} />
          <div style={{ display: 'flex', gap: 3 }}>
            {(['+', '-'] as Op[]).map(o => (
              <button key={o} onClick={() => toggleOp(2, o)}
                style={{
                  width: 28, height: 22, borderRadius: 5,
                  border: `1.5px solid ${ops[2] === o ? GOLD : BORDER}`,
                  backgroundColor: ops[2] === o ? NAVY : CARD,
                  color: ops[2] === o ? '#fff' : TEXT_S,
                  fontSize: o === '+' ? 15 : 18, fontWeight: 900,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'monospace', lineHeight: 1, padding: 0,
                  transition: 'background-color 0.15s, border-color 0.15s',
                }}
              >{o === '+' ? '+' : '−'}</button>
            ))}
          </div>
          <div style={{ flex: 1, height: 1, backgroundColor: BORDER }} />
        </div>

        {/* ── Row 2: Cards 3–5 ── */}
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 3, minWidth: 0 }}>
          <ValueCard idx={3} card={cards[3]} onUpdate={p => updateCard(3, p)} onClear={() => clearCard(3)} />
          <OpColumn opIdx={3} ops={ops} onToggle={toggleOp} />
          <ValueCard idx={4} card={cards[4]} onUpdate={p => updateCard(4, p)} onClear={() => clearCard(4)} />
          <OpColumn opIdx={4} ops={ops} onToggle={toggleOp} />
          <ValueCard idx={5} card={cards[5]} onUpdate={p => updateCard(5, p)} onClear={() => clearCard(5)} />
        </div>

        {/* ── Result + Clear All row ── */}
        <div style={{ display: 'flex', gap: 5, alignItems: 'stretch' }}>
        <div style={{ flex: 1, backgroundColor: DARK, borderRadius: 8, border: `2px solid ${GOLD}`, padding: '5px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minHeight: 46 }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.65)', letterSpacing: 1.2, textTransform: 'uppercase' as const }}>{t('result')}</span>
          {result !== null ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const, justifyContent: 'center' }}>
              <span style={{ fontSize: 17, fontWeight: 800, color: '#fff', fontFamily: 'monospace', letterSpacing: 0.5, whiteSpace: 'nowrap' as const }}>
                {ftToDisplay(result).toFixed(isMetric ? 3 : 2)} {isMetric ? 'm' : 'ft'}
              </span>
              <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>·</span>
              {isMetric ? (() => {
                const totalM = Math.abs(ftToDisplay(result));
                const wholeM = Math.floor(totalM);
                const remM   = totalM - wholeM;
                const cm     = Math.floor(remM * 100);
                const mm     = Math.round((remM * 100 - cm) * 10);
                return <span style={{ fontSize: 14, fontWeight: 700, color: '#fff', fontFamily: 'monospace', whiteSpace: 'nowrap' as const }}>{result < 0 ? '−' : ''}{wholeM}m {String(cm).padStart(2,'0')}cm{mm > 0 ? ` ${mm}mm` : ''}</span>;
              })() : (
                resultFif && <StackedFraction feet={resultFif.feet} inches={resultFif.inches} fracLbl={resultFif.fracLbl} negative={result < 0} color="#fff" size={13} />
              )}
            </div>
          ) : (
            <span style={{ fontSize: 20, fontWeight: 700, color: 'rgba(255,255,255,0.28)', lineHeight: 1.4 }}>—</span>
          )}
        </div>
        {/* Clear All */}
        <button
          style={{ width: 42, flexShrink: 0, backgroundColor: '#FDECEC', border: '1px solid #F5B5B5', borderRadius: 8, fontSize: 9, fontWeight: 800, color: '#D32F2F', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, letterSpacing: 0.1 }}
          onClick={clearAll}
        >
          <span>✕</span>
          <span>Clear</span>
          <span>All</span>
        </button>
        </div>{/* end result row */}

        {/* ── Calculate ── */}
        <button
          style={{
            width: '100%', height: 36,
            backgroundColor: canCalc ? NAVY : '#8A9BB5',
            border: `2px solid ${canCalc ? GOLD : '#B0C0D4'}`,
            borderRadius: 8, color: '#fff',
            fontSize: 17, fontWeight: 800, letterSpacing: 1.5,
            cursor: canCalc ? 'pointer' : 'default',
            transition: 'background-color 0.15s, border-color 0.15s',
          }}
          onClick={handleCalculate}
        >{t('calculate')}</button>

        {/* ── Recent Calculations ── */}
        {history.length > 0 && (
          <div style={{ backgroundColor: CARD, borderRadius: 8, border: `1px solid ${BORDER}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', backgroundColor: SURFACE, borderBottom: `1px solid ${BORDER}`, borderTopLeftRadius: 8, borderTopRightRadius: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: TEXT_P, letterSpacing: 0.7 }}>{t('recentCalcs')}</span>
              <button style={{ backgroundColor: BLUE_D, borderRadius: 4, padding: '3px 8px', border: `1px solid ${BLUE}`, fontSize: 11, fontWeight: 700, color: BLUE_A, cursor: 'pointer' }}
                onClick={() => setShowAllCalcs(true)}>{t('allCalcs')}</button>
            </div>
            {history.slice(0, 1).map(item => (
              <button
                key={item.id}
                style={{ display: 'block', width: '100%', padding: '7px 10px', background: 'none', border: 'none', textAlign: 'left' as const, cursor: 'pointer' }}
                onClick={() => setViewFullItem(item)}
              >
                <CompactCalcRow item={item} />
              </button>
            ))}
          </div>
        )}
      </div>

      {showAllCalcs && (
        <AllCalcsModal
          history={history}
          onClose={() => setShowAllCalcs(false)}
          onDeleteAll={handleDeleteAll}
          onViewFull={item => { setViewFullItem(item); setShowAllCalcs(false); }}
          onEdit={item => { handleEditItem(item); setShowAllCalcs(false); }}
          onDeleteItem={handleDeleteItem}
        />
      )}
      {viewFullItem && (
        <CalcGridModal
          item={viewFullItem}
          onClose={() => setViewFullItem(null)}
          onEdit={() => { handleEditItem(viewFullItem); setViewFullItem(null); }}
          onDelete={() => { handleDeleteItem(viewFullItem); setViewFullItem(null); }}
        />
      )}
      {calcConfirm && (
        <ConfirmModal
          message={t('deleteCalcsConfirm')}
          confirmLabel={t('deleteAll')}
          cancelLabel={t('cancel')}
          danger
          onConfirm={calcConfirm.onConfirm}
          onCancel={() => setCalcConfirm(null)}
        />
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN SCREEN — gold sub-tab shell
// ═══════════════════════════════════════════════════════════════════════════════
export default function CalculatorScreen({ uid = '' }: { uid?: string }) {
  const { t } = useLang();
  const [subTab, setSubTab] = useState<SubTab>('calculator');

  const SUB_TABS: { id: SubTab; label: string }[] = [
    { id: 'calculator', label: t('calcTabCalc') },
    { id: 'converter',  label: t('calcTabConv') },
  ];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Segmented sub-tab control */}
      <div style={{ display: 'flex', backgroundColor: '#EEF4FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: 3, margin: '6px 8px', gap: 3, flexShrink: 0 }}>
        {SUB_TABS.map(tab => {
          const isActive = subTab === tab.id;
          return (
            <button key={tab.id} style={{
              flex: 1,
              height: 36,
              borderRadius: 7,
              border: 'none',
              backgroundColor: isActive ? NAVY : 'transparent',
              color: isActive ? '#FFFFFF' : '#6B7280',
              fontSize: 15,
              fontWeight: isActive ? 700 : 600,
              cursor: 'pointer',
              boxShadow: isActive ? '0 1px 4px rgba(20,58,99,0.30)' : 'none',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              transition: 'background-color 0.2s, color 0.2s, box-shadow 0.2s',
            }} onClick={() => setSubTab(tab.id)}>
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Sub-tab content — both permanently mounted */}
      <div style={{ flex: 1, overflow: 'hidden', display: subTab === 'calculator' ? 'flex' : 'none', flexDirection: 'column' }}>
        <CalculatorView uid={uid} />
      </div>
      <div style={{ flex: 1, overflow: 'hidden', display: subTab === 'converter' ? 'flex' : 'none', flexDirection: 'column' }}>
        <ConverterView uid={uid} />
      </div>
    </div>
  );
}
