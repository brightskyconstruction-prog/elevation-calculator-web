import { useState, useEffect } from 'react';
import { INCHES_OPTIONS, FRACTION_OPTIONS } from '../constants';
import { useLang } from '../LangContext';
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
  if (step.mode === 'eng') {
    return (
      <span style={{ fontSize: size, fontWeight: 700, color: NAVY, fontFamily: 'monospace' }}>
        {Math.abs(parseFloat(step.eng) || 0).toFixed(2)} ft
      </span>
    );
  }
  return (
    <StackedFraction
      feet={parseInt(step.ft || '0', 10)}
      inches={step.inches}
      fracLbl={step.frL}
      color={NAVY} size={size}
    />
  );
}

// ─── Compact calc row — expression (last ≤3 ops, no = result) + result row ────
function CompactCalcRow({ item }: { item: CalcHistItem }) {
  const { t } = useLang();
  const rFIF    = engToFif(Math.abs(item.result));
  const opCount = item.steps.length - 1;
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
      {/* Result row — RESULT label, FIF • decimal, ops badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'nowrap' }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: NAVY, textTransform: 'uppercase', letterSpacing: 0.6, flexShrink: 0 }}>{t('result')}:</span>
        <StackedFraction {...rFIF} negative={item.result < 0} color={NAVY} size={14} />
        <span style={{ fontSize: 12, fontWeight: 700, color: TEXT_S, flexShrink: 0 }}>•</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: NAVY, fontFamily: 'monospace', flexShrink: 0 }}>
          {item.result < 0 ? '−' : ''}{Math.abs(item.result).toFixed(2)} ft
        </span>
        {opCount > 1 && (
          <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 800, color: NAVY, backgroundColor: BLUE_D, borderRadius: 4, padding: '2px 7px', flexShrink: 0 }}>
            {opCount} {t('operations')}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Calculation Details modal — centered, step-by-step with running totals ───
function CalcDetailsModal({ item, onClose }: { item: CalcHistItem; onClose: () => void }) {
  const { t } = useLang();
  // Compute running totals after each step
  const runningTotals: number[] = [];
  let running = item.steps[0]?.val ?? 0;
  runningTotals.push(running);
  for (let i = 1; i < item.steps.length; i++) {
    running = item.steps[i].op === '+' ? running + item.steps[i].val : running - item.steps[i].val;
    runningTotals.push(running);
  }

  const dateStr = item.timestamp
    ? new Date(item.timestamp).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : '';

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'flex-end', zIndex: 400 }}>
      <div style={{ width: '100%', maxWidth: 480, margin: '0 auto', backgroundColor: SCREEN, display: 'flex', flexDirection: 'column', maxHeight: '92vh', borderTopLeftRadius: 16, borderTopRightRadius: 16, overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', backgroundColor: NAVY, borderBottom: `2px solid ${GOLD}`, flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', letterSpacing: 0.3 }}>{t('calcDetailsTitle')}</div>
            {dateStr && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>{dateStr}</div>}
          </div>
          <button style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.18)', border: 'none', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer' }} onClick={onClose}>✕</button>
        </div>
        {/* Scrollable steps */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 20px' }}>
          {item.steps.map((step, i) => {
            const isFinal = i === item.steps.length - 1;
            const rtFIF   = engToFif(Math.abs(runningTotals[i]));
            const rtNeg   = runningTotals[i] < 0;
            const stepFIF = step.mode === 'fif'
              ? { feet: parseInt(step.ft || '0', 10), inches: step.inches, fracLbl: step.frL }
              : engToFif(Math.abs(step.val));
            return (
              <div key={i}>
                {/* Operation circle — centered, compact spacing */}
                {i > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '5px 0' }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 16,
                      backgroundColor: step.op === '+' ? '#EDF7ED' : '#FEF2F2',
                      border: `2px solid ${step.op === '+' ? '#43A047' : '#E53935'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <span style={{ fontSize: 18, fontWeight: 900, color: step.op === '+' ? '#2E7D32' : '#C62828', lineHeight: 1, fontFamily: 'monospace' }}>
                        {step.op === '+' ? '+' : '−'}
                      </span>
                    </div>
                  </div>
                )}
                {/* Value card — centered content, compact padding */}
                <div style={{ backgroundColor: CARD, borderRadius: 8, border: `1.5px solid ${BORDER}`, padding: '8px 12px', textAlign: 'center' as const, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: NAVY, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5 }}>
                    {`VALUE ${i + 1}`}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 3 }}>
                    <StackedFraction {...stepFIF} color={NAVY} size={16} />
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: NAVY, fontFamily: 'monospace' }}>
                    {Math.abs(step.val).toFixed(4)} ft
                  </div>
                </div>
                {/* Result after each operation (intermediate or final) */}
                {i > 0 && (
                  <>
                    {/* Divider */}
                    <div style={{ height: 1, backgroundColor: BORDER, margin: '5px 0' }} />
                    {/* Result card */}
                    {isFinal ? (
                      /* Final result — navy bg, gold border, white text */
                      <div style={{ backgroundColor: DARK, borderRadius: 10, border: `2px solid ${GOLD}`, padding: '10px 12px', textAlign: 'center' as const, boxShadow: '0 4px 12px rgba(16,45,78,0.18)' }}>
                        <div style={{ fontSize: 10, fontWeight: 800, color: GOLD, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{t('finalResult')}</div>
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
                          <StackedFraction {...rtFIF} negative={rtNeg} color="#fff" size={18} />
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: GOLD, marginBottom: 2 }}>•</div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', fontFamily: 'monospace' }}>
                          {rtNeg ? '−' : ''}{Math.abs(runningTotals[i]).toFixed(4)} ft
                        </div>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 6 }}>
                          {item.steps.length - 1} {t('operations')} · {item.steps.length} values
                        </div>
                      </div>
                    ) : (
                      /* Intermediate result — light surface, navy text, compact */
                      <div style={{ backgroundColor: SURFACE, borderRadius: 8, border: `1.5px solid ${BORDER}`, padding: '7px 12px', textAlign: 'center' as const }}>
                        <div style={{ fontSize: 10, fontWeight: 800, color: NAVY, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{t('result')}</div>
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 2 }}>
                          <StackedFraction {...rtFIF} negative={rtNeg} color={NAVY} size={14} />
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: TEXT_S, marginBottom: 2 }}>•</div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: NAVY, fontFamily: 'monospace' }}>
                          {rtNeg ? '−' : ''}{Math.abs(runningTotals[i]).toFixed(2)} ft
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
          {/* If only 1 step (single value) — show result summary */}
          {item.steps.length === 1 && (
            <div style={{ marginTop: 8, backgroundColor: DARK, borderRadius: 10, border: `2px solid ${GOLD}`, padding: '10px 12px', textAlign: 'center' as const }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: GOLD, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{t('finalResult')}</div>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
                <StackedFraction {...engToFif(Math.abs(item.result))} negative={item.result < 0} color="#fff" size={18} />
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: GOLD, marginBottom: 2 }}>•</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', fontFamily: 'monospace' }}>
                {item.result < 0 ? '−' : ''}{Math.abs(item.result).toFixed(4)} ft
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Conv history row ─────────────────────────────────────────────────────────
function ConvHistRow({ item, compact = false }: { item: ConvItem; compact?: boolean }) {
  const sz = compact ? 14 : 16;
  const FIFNode = <StackedFraction feet={item.fifFeet} inches={item.fifInches} fracLbl={item.fifFracLbl} color={TEXT_P} size={sz} />;
  const EngNode = <span style={{ fontSize: sz, fontWeight: 700, color: TEXT_P, fontFamily: 'monospace' }}>{item.engVal.toFixed(2)} ft</span>;
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

// ─── Mode Toggle (vertical: Decimal Feet / Ft-Inches) ────────────────────────
function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const { t } = useLang();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', borderRadius: 4, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
      {(['eng', 'fif'] as Mode[]).map(m => (
        <button key={m} style={{
          height: 28, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 800,
          letterSpacing: 0.2, color: mode === m ? '#fff' : TEXT_S,
          backgroundColor: mode === m ? NAVY : SURFACE,
          transition: 'background-color 0.12s, color 0.12s',
        }} onClick={() => onChange(m)}>
          {m === 'eng' ? t('decimalFeet') : t('ftInches')}
        </button>
      ))}
    </div>
  );
}

// ─── FIF input group ──────────────────────────────────────────────────────────
// Placeholder clears immediately on focus (change 1)
function FIFInputs({ ft, setFt: _setFt, inches, setInches, frac, setFrac, frL, setFrL, ftErr, onFtChange }: {
  ft: string; setFt: (v:string)=>void;
  inches: number; setInches: (v:number)=>void;
  frac: number; setFrac: (v:number)=>void;
  frL: string; setFrL: (v:string)=>void;
  ftErr: string;
  onFtChange: (v:string)=>void;
}) {
  const [ftFocused, setFtFocused] = useState(false);
  const borderClr = ftErr ? '#C0392B' : GOLD;

  return (
    <>
      <div style={{ border: `1.5px solid ${borderClr}`, borderRadius: 6, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <input
          style={{ height: 36, border: 'none', backgroundColor: '#fff', fontSize: 20, fontWeight: 700, color: '#1A2D35', textAlign: 'center', outline: 'none', padding: '0 4px', width: '100%', boxSizing: 'border-box' }}
          value={ft} onChange={e => onFtChange(e.target.value)}
          inputMode="numeric"
          placeholder={ftFocused ? '' : 'Feet'}
          onFocus={() => setFtFocused(true)}
          onBlur={() => setFtFocused(false)}
        />
        <div style={{ height: 1, backgroundColor: '#8C8C8C', flexShrink: 0 }} />
        <select
          style={{ width: '100%', height: 36, border: 'none', backgroundColor: SURFACE, fontSize: 20, fontWeight: 700, color: TEXT_P, textAlign: 'center' as const, boxSizing: 'border-box' as const }}
          value={String(inches)} onChange={e => setInches(parseInt(e.target.value, 10))}
        >
          {INCHES_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <div style={{ height: 1, backgroundColor: '#8C8C8C', flexShrink: 0 }} />
        <select
          style={{ width: '100%', height: 36, border: 'none', backgroundColor: SURFACE, fontSize: 20, fontWeight: 700, color: TEXT_P, textAlign: 'center' as const, boxSizing: 'border-box' as const }}
          value={frL === 'None' ? '0' : String(frac)} onChange={e => {
            const opt = FRACTION_OPTIONS.find(o => o.value === e.target.value);
            if (opt) { setFrac(parseFloat(opt.value)); setFrL(opt.label); }
          }}
        >
          {FRACTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      {ftErr && <span style={{ fontSize: 9, color: '#C0392B', fontWeight: 600, textAlign: 'center' }}>{ftErr}</span>}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONVERTER VIEW — bidirectional, both cards always active
// ═══════════════════════════════════════════════════════════════════════════════
function ConverterView({ uid }: { uid: string }) {
  const { t } = useLang();

  // ── Input state (each side is independent — no auto-sync) ──────────────────
  const [cFt,         setCFt]         = useState('');
  const [cIn,         setCIn]         = useState(0);
  const [cFr,         setCFr]         = useState(0);
  const [cFrL,        setCFrL]        = useState('None');
  const [cFtErr,      setCFtErr]      = useState('');
  const [cEng,        setCEng]        = useState('');

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
  const clearFIF = () => { setCFt(''); setCIn(0); setCFr(0); setCFrL('None'); setCFtErr(''); if (lastEdited === 'fif') { setCEng(''); } setLastEdited(null); resetConv(); };
  const clearEng = () => { setCEng(''); if (lastEdited === 'eng') { setCFt(''); setCIn(0); setCFr(0); setCFrL('None'); setCFtErr(''); } setLastEdited(null); resetConv(); };
  const handleAllClear = () => { setCFt(''); setCIn(0); setCFr(0); setCFrL('None'); setCFtErr(''); setCEng(''); setLastEdited(null); resetConv(); };

  // ── Validity ──────────────────────────────────────────────────────────────
  const fifValid = cFt !== '' && !isNaN(parseFloat(cFt));
  const engValid = cEng !== '' && !isNaN(parseFloat(cEng)) && parseFloat(cEng) >= 0;
  const canConv  = fifValid || engValid;
  const convEnabled = canConv && !convDone;

  // ── CONVERT — manual, explicit, saves to history ───────────────────────────
  const handleConvert = () => {
    if (!convEnabled) return;

    // Determine conversion direction: prefer the side user last edited
    const goFifToEng = lastEdited !== 'eng' ? fifValid : !engValid;

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

          {/* FIF card — always active */}
          <div style={{ flex: 5, minWidth: 0, overflow: 'hidden', backgroundColor: CARD, borderRadius: 8, border: `1.5px solid ${GOLD}`, padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: TEXT_P, letterSpacing: 0.4 }}>{t('ftInches')}</span>
            <div style={{ border: `1.5px solid ${cFtErr ? '#C0392B' : GOLD}`, borderRadius: 6, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <input
                style={{ width: '100%', height: 36, border: 'none', backgroundColor: '#fff', fontSize: 20, fontWeight: 700, color: '#1A2D35', textAlign: 'center', outline: 'none', padding: '0 4px', boxSizing: 'border-box' }}
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
            <span style={{ fontSize: 14, fontWeight: 800, color: TEXT_P, letterSpacing: 0.4 }}>{t('decimalFeet')}</span>
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
              <span style={{ fontSize: 13, fontWeight: 700, color: TEXT_S, letterSpacing: 0.3 }}>ft</span>
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

// ─── Operation Selection Modal ────────────────────────────────────────────────
function OpSelectionModal({ onSelect, onClose, suggestedOp }: {
  onSelect: (op: Op) => void;
  onClose: () => void;
  suggestedOp?: Op;
}) {
  const { t } = useLang();
  const ops: { op: Op; sym: string; label: string }[] = [
    { op: '+', sym: '+', label: t('additionBtn') },
    { op: '-', sym: '−', label: t('subtractionBtn') },
  ];
  return (
    <div
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px', boxSizing: 'border-box' as const }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="anp-modal-in" style={{ backgroundColor: CARD, borderRadius: 18, maxWidth: 380, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.30)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ backgroundColor: NAVY, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontSize: 20, fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>{t('chooseOpTitle')}</span>
          <button style={{ background: 'none', border: 'none', color: '#fff', fontSize: 24, fontWeight: 700, cursor: 'pointer', padding: '4px 8px', opacity: 0.85, lineHeight: 1 }} onClick={onClose}>✕</button>
        </div>
        {/* Body */}
        <div style={{ padding: '18px 18px 22px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <p style={{ margin: 0, fontSize: 15, color: TEXT_S, lineHeight: 1.6, textAlign: 'center' }}>{t('chooseOpDesc')}</p>
          <div style={{ display: 'flex', gap: 12 }}>
            {ops.map(({ op, sym, label }) => {
              const active = suggestedOp === op;
              return (
                <button
                  key={op}
                  style={{
                    flex: 1, height: 96,
                    backgroundColor: active ? NAVY : CARD,
                    border: `2.5px solid ${active ? GOLD : '#C5D2E4'}`,
                    borderRadius: 14, cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
                    boxShadow: active ? '0 4px 14px rgba(20,58,99,0.22)' : '0 2px 6px rgba(0,0,0,0.07)',
                    transition: 'background-color 0.15s, border-color 0.15s, box-shadow 0.15s',
                  }}
                  onClick={() => onSelect(op)}
                >
                  {/* Symbol badge */}
                  <div style={{
                    width: 48, height: 48, borderRadius: 12,
                    backgroundColor: active ? GOLD : '#DDE6F0',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <span style={{ fontSize: 30, fontWeight: 900, color: NAVY, lineHeight: 1, fontFamily: 'monospace' }}>{sym}</span>
                  </div>
                  <span style={{ fontSize: 16, fontWeight: 800, color: active ? '#fff' : TEXT_P, letterSpacing: 0.3 }}>{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CALCULATOR VIEW — with sequential "Add More" chaining
// ═══════════════════════════════════════════════════════════════════════════════
function CalculatorView({ uid }: { uid: string }) {
  const { t } = useLang();
  const [modeA, setModeA] = useState<Mode>('fif');
  const [modeB, setModeB] = useState<Mode>('fif');
  const [op,    setOp]    = useState<Op>('+');

  const [aFt,    setAFt]    = useState('');
  const [aIn,    setAIn]    = useState(0);
  const [aFr,    setAFr]    = useState(0);
  const [aFrL,   setAFrL]   = useState('None');
  const [aEng,   setAEng]   = useState('');
  const [aFtErr, setAFtErr] = useState('');

  const [bFt,    setBFt]    = useState('');
  const [bIn,    setBIn]    = useState(0);
  const [bFr,    setBFr]    = useState(0);
  const [bFrL,   setBFrL]   = useState('None');
  const [bEng,   setBEng]   = useState('');
  const [bFtErr, setBFtErr] = useState('');

  const [result,       setResult]       = useState<number | null>(null);
  const [calcDone,     setCalcDone]     = useState(false);
  const [aEngFocused,  setAEngFocused]  = useState(false);
  const [bEngFocused,  setBEngFocused]  = useState(false);
  const [history,      setHistory]      = useState<CalcHistItem[]>(() => loadJson(calcKey(uid), []));
  const [showAllCalcs, setShowAllCalcs] = useState(false);
  const [showOpModal,  setShowOpModal]  = useState(false);
  const [menuOpenId,   setMenuOpenId]   = useState<string | null>(null);
  const [calcConfirm,  setCalcConfirm]  = useState<null | { onConfirm: () => void }>(null);

  // ── Session state — tracks chained Add More calculations ──────────────────
  const [sessionSteps,   setSessionSteps]   = useState<SessionStep[]>([]);
  const [sessionId,      setSessionId]      = useState<string | null>(null);
  const [addMoreActive,  setAddMoreActive]  = useState(false);  // result was copied to A
  const [addMoreEnabled, setAddMoreEnabled] = useState(false);  // result ready for chaining
  const [viewFullItem,   setViewFullItem]   = useState<CalcHistItem | null>(null);

  // Reload history when the active user changes (account switch)
  useEffect(() => {
    setHistory(loadJson(calcKey(uid), []));
    setShowAllCalcs(false);
    setViewFullItem(null);
  }, [uid]);

  // Persist history under the uid-scoped key
  useEffect(() => {
    try { localStorage.setItem(calcKey(uid), JSON.stringify(history)); } catch {}
  }, [history, uid]);

  const resetCalc = () => { setResult(null); setCalcDone(false); };

  const resetSession = () => {
    setSessionSteps([]); setSessionId(null);
    setAddMoreActive(false); setAddMoreEnabled(false);
  };

  // Clear A resets everything (breaks any active session)
  const clearA = () => { setAFt(''); setAIn(0); setAFr(0); setAFrL('None'); setAEng(''); setAFtErr(''); resetCalc(); resetSession(); };
  // Clear B also resets session — user is starting over
  const clearB = () => { setBFt(''); setBIn(0); setBFr(0); setBFrL('None'); setBEng(''); setBFtErr(''); resetCalc(); resetSession(); };

  // A input handlers — modifying A while addMoreActive breaks the session
  const onFtChangeA = (v: string) => {
    if (addMoreActive) resetSession();
    if (v === '' || /^\d+$/.test(v)) { setAFt(v); setAFtErr(''); } else setAFtErr('Whole numbers only');
    resetCalc();
  };
  // B input handlers — modifying B never breaks the session
  const onFtChangeB = (v: string) => {
    if (v === '' || /^\d+$/.test(v)) { setBFt(v); setBFtErr(''); } else setBFtErr('Whole numbers only');
    resetCalc();
  };

  const valA    = modeA === 'eng' ? parseFloat(aEng) : fifToEng(aFt, aIn, aFr);
  const valB    = modeB === 'eng' ? parseFloat(bEng) : fifToEng(bFt, bIn, bFr);
  const canCalc = !isNaN(valA) && !isNaN(valB);
  const calcEnabled = canCalc && !calcDone;
  const resultFif = result !== null ? engToFif(Math.abs(result)) : null;

  const triggerCalculate = () => { if (!calcEnabled) return; setShowOpModal(true); };

  const handleOpSelect = (selectedOp: Op) => {
    setShowOpModal(false);
    setOp(selectedOp);
    const raw = selectedOp === '+' ? valA + valB : valA - valB;
    if (isNaN(raw)) return;
    setResult(raw);
    setCalcDone(true);
    setAddMoreEnabled(true);

    // Build session steps
    let newSteps: SessionStep[];
    let curId: string;
    if (!addMoreActive || sessionSteps.length === 0) {
      // First calculation — start a new session
      newSteps = [
        { op: '+', mode: modeA, ft: aFt, inches: aIn, frac: aFr, frL: aFrL, eng: aEng, val: valA },
        { op: selectedOp, mode: modeB, ft: bFt, inches: bIn, frac: bFr, frL: bFrL, eng: bEng, val: valB },
      ];
      curId = genId();
      setSessionId(curId);
    } else {
      // Continuing session — append new B step
      newSteps = [
        ...sessionSteps,
        { op: selectedOp, mode: modeB, ft: bFt, inches: bIn, frac: bFr, frL: bFrL, eng: bEng, val: valB },
      ];
      curId = sessionId!;
    }
    setSessionSteps(newSteps);
    setAddMoreActive(false);  // reset; next Calculate starts fresh unless Add More is pressed

    // Upsert the history entry for this session
    const isNew = !addMoreActive || sessionSteps.length === 0;
    const item: CalcHistItem = { id: curId, steps: newSteps, result: raw, ...(isNew ? { timestamp: Date.now() } : {}) };
    setHistory(prev => {
      const idx = prev.findIndex(h => h.id === curId);
      if (idx === -1) return [item, ...prev].slice(0, MAX_HIST);
      const existing = prev[idx];
      const upd = [...prev]; upd[idx] = { ...item, timestamp: existing.timestamp }; return upd;
    });
  };

  // "Add Another Value" — moves current result into Input A (preserving mode), clears Input B
  const handleAddMore = () => {
    if (!addMoreEnabled || result === null) return;
    if (modeA === 'fif') {
      // Preserve Feet-Inches-Fraction mode — convert result back to FIF components
      const fif = engToFif(Math.abs(result));
      const frOpt = FRACTION_OPTIONS.find(o => {
        const noFrac = !fif.fracLbl || fif.fracLbl === 'None';
        if (noFrac) return o.value === '0';
        return Math.abs(parseFloat(o.value) - fracLblToDecimal(fif.fracLbl)) < 0.001;
      });
      setAFt(String(fif.feet));
      setAIn(fif.inches);
      setAFr(frOpt ? parseFloat(frOpt.value) : 0);
      setAFrL(frOpt?.label ?? 'None');
      setAEng('');
      // modeA stays 'fif'
    } else {
      // Preserve Decimal Feet mode — keep full precision including sign
      setAEng(String(result));
      setAFt(''); setAIn(0); setAFr(0); setAFrL('None');
      // modeA stays 'eng'
    }
    setAFtErr('');
    setBFt(''); setBIn(0); setBFr(0); setBFrL('None'); setBEng(''); setBFtErr('');
    setResult(null);
    setCalcDone(false);
    setAddMoreEnabled(false);
    setAddMoreActive(true);     // mark: next Calculate continues this session
  };

  const handleDeleteAll = () => {
    setCalcConfirm({ onConfirm: () => { setHistory([]); setShowAllCalcs(false); setCalcConfirm(null); } });
  };

  // Restore a history item — puts first two steps back into A/B cards
  const handleEditItem = (item: CalcHistItem) => {
    const s0 = item.steps[0]; const s1 = item.steps[1];
    if (!s0) return;
    setModeA(s0.mode);
    setAFt(s0.ft); setAIn(s0.inches); setAFr(s0.frac); setAFrL(s0.frL); setAEng(s0.eng); setAFtErr('');
    if (s1) { setModeB(s1.mode); setBFt(s1.ft); setBIn(s1.inches); setBFr(s1.frac); setBFrL(s1.frL); setBEng(s1.eng); setOp(s1.op); }
    setBFtErr('');
    resetCalc(); resetSession(); setMenuOpenId(null);
  };

  const handleDeleteItem = (item: CalcHistItem) => {
    setCalcConfirm({
      onConfirm: () => { setHistory(prev => prev.filter(h => h.id !== item.id)); setMenuOpenId(null); setCalcConfirm(null); },
    });
  };

  return (
    <>
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: 10, display: 'flex', flexDirection: 'column', gap: 10, width: '100%', boxSizing: 'border-box' }}>

        {/* "Add More" in-progress hint banner */}
        {addMoreActive && (
          <div style={{ backgroundColor: '#EEF4FF', borderRadius: 6, border: `1px solid ${NAVY}`, padding: '5px 10px', fontSize: 11, fontWeight: 700, color: NAVY, textAlign: 'center' as const }}>
            {t('addMoreHint')}
          </div>
        )}

        {/* Calculator row: A | op | B | result — layout unchanged */}
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 4, minWidth: 0 }}>

          {/* Input A */}
          <div style={{ flex: 3, minWidth: 0, backgroundColor: CARD, borderRadius: 8, border: `1.5px solid ${addMoreActive ? NAVY : BORDER}`, padding: 6, display: 'flex', flexDirection: 'column', gap: 3, overflow: 'hidden' }}>
            <ModeToggle mode={modeA} onChange={m => { if (addMoreActive) resetSession(); setModeA(m); resetCalc(); }} />
            {modeA === 'fif' ? (
              <FIFInputs
                ft={aFt} setFt={setAFt}
                inches={aIn} setInches={v => { if (addMoreActive) resetSession(); setAIn(v); resetCalc(); }}
                frac={aFr}   setFrac={v => { if (addMoreActive) resetSession(); setAFr(v); resetCalc(); }}
                frL={aFrL}   setFrL={v => { if (addMoreActive) resetSession(); setAFrL(v); resetCalc(); }}
                ftErr={aFtErr} onFtChange={onFtChangeA}
              />
            ) : (
              <input
                style={{ flex: 1, minHeight: 50, borderRadius: 4, border: `1.5px solid ${GOLD}`, backgroundColor: addMoreActive ? '#EEF4FF' : '#fff', fontSize: 20, fontWeight: 700, color: '#1A2D35', textAlign: 'center', outline: 'none' }}
                value={aEng}
                onChange={e => { if (addMoreActive) resetSession(); setAEng(e.target.value); resetCalc(); }}
                inputMode="decimal" enterKeyHint="done"
                placeholder={aEngFocused ? '' : '0.00'}
                onFocus={() => setAEngFocused(true)}
                onBlur={() => setAEngFocused(false)}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              />
            )}
            <button style={{ height: 26, backgroundColor: '#FDECEC', border: `1px solid #F5B5B5`, borderRadius: 4, fontSize: 11, fontWeight: 800, color: '#D32F2F', cursor: 'pointer', letterSpacing: 0.3 }} onClick={clearA}>✕ {t('clearBtn')}</button>
          </div>

          {/* Op selector column */}
          <div style={{ width: 34, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            {(['+', '-'] as Op[]).map(o => (
              <button key={o} onClick={() => { if (sessionSteps.length > 0) resetSession(); setOp(o); resetCalc(); }}
                style={{
                  width: 34, height: 38, borderRadius: 8,
                  border: `2px solid ${op === o ? GOLD : BORDER}`,
                  backgroundColor: op === o ? NAVY : CARD,
                  color: op === o ? '#FFFFFF' : TEXT_S,
                  fontSize: o === '+' ? 24 : 28, fontWeight: 900,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'monospace', lineHeight: 1, padding: 0,
                  transition: 'background-color 0.15s, border-color 0.15s, color 0.15s', flexShrink: 0,
                }}
                aria-label={o === '+' ? 'Addition' : 'Subtraction'} aria-pressed={op === o}
              >{o === '+' ? '+' : '−'}</button>
            ))}
          </div>

          {/* Input B */}
          <div style={{ flex: 3, minWidth: 0, backgroundColor: CARD, borderRadius: 8, border: `1.5px solid ${BORDER}`, padding: 6, display: 'flex', flexDirection: 'column', gap: 3, overflow: 'hidden' }}>
            <ModeToggle mode={modeB} onChange={m => { setModeB(m); resetCalc(); }} />
            {modeB === 'fif' ? (
              <FIFInputs
                ft={bFt} setFt={setBFt}
                inches={bIn} setInches={v => { setBIn(v); resetCalc(); }}
                frac={bFr}   setFrac={v => { setBFr(v); resetCalc(); }}
                frL={bFrL}   setFrL={v => { setBFrL(v); resetCalc(); }}
                ftErr={bFtErr} onFtChange={onFtChangeB}
              />
            ) : (
              <input
                style={{ flex: 1, minHeight: 50, borderRadius: 4, border: `1.5px solid ${GOLD}`, backgroundColor: '#fff', fontSize: 20, fontWeight: 700, color: '#1A2D35', textAlign: 'center', outline: 'none' }}
                value={bEng}
                onChange={e => { setBEng(e.target.value); resetCalc(); }}
                inputMode="decimal" enterKeyHint="done"
                placeholder={bEngFocused ? '' : '0.00'}
                onFocus={() => setBEngFocused(true)}
                onBlur={() => setBEngFocused(false)}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              />
            )}
            <button style={{ height: 26, backgroundColor: '#FDECEC', border: `1px solid #F5B5B5`, borderRadius: 4, fontSize: 11, fontWeight: 800, color: '#D32F2F', cursor: 'pointer', letterSpacing: 0.3 }} onClick={clearB}>✕ {t('clearBtn')}</button>
          </div>

          {/* Result card — unchanged */}
          <div style={{ flex: 2.8, minWidth: 0, backgroundColor: DARK, borderRadius: 8, border: `2px solid ${GOLD}`, padding: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', gap: 2, overflow: 'hidden' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', letterSpacing: 1, textTransform: 'uppercase' }}>{t('result')}</span>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, width: '100%' }}>
              {result !== null && resultFif ? (
                <>
                  <span style={{ fontSize: 16, fontWeight: 700, color: '#fff', fontFamily: 'monospace', textAlign: 'center', lineHeight: 1.2 }}>{result.toFixed(2)} ft</span>
                  <div style={{ height: 1, width: '80%', backgroundColor: 'rgba(255,255,255,0.25)' }} />
                  <StackedFraction feet={resultFif.feet} inches={resultFif.inches} fracLbl={resultFif.fracLbl} negative={result < 0} color="#fff" size={15} />
                </>
              ) : (
                <span style={{ fontSize: 24, fontWeight: 700, color: 'rgba(255,255,255,0.25)' }}>—</span>
              )}
            </div>
          </div>
        </div>

        {/* Add More — disabled until a result is ready, sits directly above Calculate */}
        <button onClick={handleAddMore} disabled={!addMoreEnabled}
          style={{
            width: '100%', height: 38,
            backgroundColor: addMoreEnabled ? '#EEF4FF' : CARD,
            border: `2px solid ${addMoreEnabled ? NAVY : BORDER}`,
            borderRadius: 8,
            color: addMoreEnabled ? NAVY : TEXT_D,
            fontSize: 14, fontWeight: 800, letterSpacing: 0.5,
            cursor: addMoreEnabled ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            transition: 'background-color 0.15s, border-color 0.15s, color 0.15s',
          }}
        >
          <span style={{ fontSize: 16, fontFamily: 'monospace', lineHeight: 1 }}>+</span>
          {t('addMoreBtn')}
        </button>

        {/* Calculate */}
        <button
          style={{
            width: '100%', height: 40,
            backgroundColor: NAVY, border: `2px solid ${GOLD}`,
            borderRadius: 8, color: '#fff',
            fontSize: 17, fontWeight: 800, letterSpacing: 1.5,
            cursor: calcEnabled ? 'pointer' : 'default',
          }}
          onClick={triggerCalculate}
        >{t('calculate')}</button>

        {/* Recent Calculations */}
        {history.length > 0 && (
          <div style={{ backgroundColor: CARD, borderRadius: 8, border: `1px solid ${BORDER}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', backgroundColor: SURFACE, borderBottom: `1px solid ${BORDER}`, borderTopLeftRadius: 8, borderTopRightRadius: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: TEXT_P, letterSpacing: 0.7 }}>{t('recentCalcs')}</span>
              <button style={{ backgroundColor: BLUE_D, borderRadius: 4, padding: '4px 10px', border: `1px solid ${BLUE}`, fontSize: 13, fontWeight: 700, color: BLUE_A, cursor: 'pointer' }}
                onClick={() => setShowAllCalcs(true)}>{t('allCalcs')}</button>
            </div>
            {/* Only the most recent session */}
            {history.slice(0, 1).map(item => (
              <div key={item.id} style={{ padding: '10px 12px', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <CompactCalcRow item={item} />
                </div>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <button
                    style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: menuOpenId === item.id ? SURFACE : 'transparent', border: `1px solid ${menuOpenId === item.id ? BORDER : 'transparent'}`, fontSize: 16, fontWeight: 900, color: TEXT_S, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', letterSpacing: '-1px', lineHeight: 1, padding: 0 }}
                    onClick={e => { e.stopPropagation(); setMenuOpenId(menuOpenId === item.id ? null : item.id); }}
                  >⋮</button>
                  {menuOpenId === item.id && (
                    <div style={{ position: 'absolute', right: 0, top: 32, zIndex: 200, backgroundColor: CARD, borderRadius: 8, border: `1px solid ${BORDER}`, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', minWidth: 190, overflow: 'hidden' }}>
                      <button style={{ width: '100%', padding: '10px 14px', border: 'none', borderBottom: `1px solid ${BORDER}`, backgroundColor: 'transparent', textAlign: 'left' as const, fontSize: 13, fontWeight: 700, color: NAVY, cursor: 'pointer' }}
                        onClick={() => { setViewFullItem(item); setMenuOpenId(null); }}>🔍 {t('viewFullCalcBtn')}</button>
                      <button style={{ width: '100%', padding: '10px 14px', border: 'none', borderBottom: `1px solid ${BORDER}`, backgroundColor: 'transparent', textAlign: 'left' as const, fontSize: 13, fontWeight: 700, color: NAVY, cursor: 'pointer' }}
                        onClick={() => handleEditItem(item)}>✏️ {t('editCalcBtn')}</button>
                      <button style={{ width: '100%', padding: '10px 14px', border: 'none', backgroundColor: 'transparent', textAlign: 'left' as const, fontSize: 13, fontWeight: 700, color: '#C0392B', cursor: 'pointer' }}
                        onClick={() => handleDeleteItem(item)}>🗑️ {t('deleteCalcBtn')}</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showOpModal && (
        <OpSelectionModal onSelect={handleOpSelect} onClose={() => setShowOpModal(false)} suggestedOp={op} />
      )}
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
        <CalcDetailsModal item={viewFullItem} onClose={() => setViewFullItem(null)} />
      )}
      {menuOpenId && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setMenuOpenId(null)} />
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
