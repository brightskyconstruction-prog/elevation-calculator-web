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

// ─── Storage keys ─────────────────────────────────────────────────────────────
const KEY_CALC = 'elevCalc:calcHistV2';
const KEY_CONV = 'elevCalc:convHistory';
const MAX_HIST = 20;

// ─── Types ────────────────────────────────────────────────────────────────────
type Mode     = 'eng' | 'fif';
type Op       = '+' | '-';
type SubTab   = 'calculator' | 'converter';
type ConvMode = 'fif_to_eng' | 'eng_to_fif';

// One row in the dynamic multi-value calculator
interface CalcRow {
  id: string;
  op: Op;       // operator preceding this row — ignored for row[0]
  mode: Mode;
  ft: string; inches: number; frac: number; frL: string; eng: string; ftErr: string;
}

// History item — stores N rows + aggregate result
interface CalcHistItem {
  id: string;
  rows: Array<{ op: Op; mode: Mode; ft: string; inches: number; frac: number; frL: string; eng: string; val: number }>;
  result: number;
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

function uid(): string { return `${Date.now()}-${Math.random().toString(36).slice(2,7)}`; }

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

// ─── Measure block (FIF + Eng Ft stacked) ────────────────────────────────────
function MeasureBlock({ feet, inches, fracLbl, engFt, negative = false, compact = false }: {
  feet: number; inches: number; fracLbl: string; engFt: number;
  negative?: boolean; compact?: boolean;
}) {
  const sz = compact ? 14 : 15;
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
      <StackedFraction feet={feet} inches={inches} fracLbl={fracLbl} negative={negative} color={TEXT_P} size={sz} />
      <span style={{ fontSize: sz, fontWeight: 600, color: TEXT_S, fontFamily: 'monospace' }}>
        {negative && engFt > 0 ? '−' : ''}{Math.abs(engFt).toFixed(2)} ft
      </span>
    </div>
  );
}

// ─── Compact calc row (history item) — multi-row ─────────────────────────────
function CompactCalcRow({ item, compact = false }: { item: CalcHistItem; compact?: boolean }) {
  const sym  = compact ? 15 : 17;
  const rFIF = engToFif(Math.abs(item.result));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
      {item.rows.flatMap((row, i) => {
        const fif = row.mode === 'fif'
          ? { feet: parseInt(row.ft || '0', 10), inches: row.inches, fracLbl: row.frL }
          : engToFif(Math.abs(row.val));
        const out = [];
        if (i > 0) out.push(
          <span key={`op-${i}`} style={{ fontSize: sym, fontWeight: 700, color: TEXT_S, padding: '0 2px' }}>
            {row.op === '+' ? '+' : '−'}
          </span>
        );
        out.push(<MeasureBlock key={`v-${i}`} {...fif} engFt={row.val} compact={compact} />);
        return out;
      })}
      <span style={{ fontSize: sym, fontWeight: 700, color: TEXT_S, padding: '0 2px' }}>=</span>
      <MeasureBlock {...rFIF} engFt={Math.abs(item.result)} negative={item.result < 0} compact={compact} />
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

// ─── All-calcs modal ──────────────────────────────────────────────────────────
function AllCalcsModal({ history, onClose, onDeleteAll }: {
  history: CalcHistItem[]; onClose: () => void; onDeleteAll: () => void;
}) {
  const { t } = useLang();
  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', zIndex: 300 }}>
      <div style={{ width: '100%', maxWidth: 480, margin: '0 auto', backgroundColor: SCREEN, display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', backgroundColor: NAVY, borderBottom: `2px solid ${GOLD}` }}>
          <span style={{ fontSize: 17, fontWeight: 700, color: '#fff', letterSpacing: 0.5 }}>{t('allCalcsTitle')}</span>
          <button style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer' }} onClick={onClose}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {history.length === 0 && <p style={{ textAlign: 'center', color: TEXT_D, padding: 32 }}>{t('noCalcsYet')}</p>}
          {history.map((item, i) => (
            <div key={item.id} style={{ backgroundColor: CARD, borderRadius: 8, border: `1px solid ${BORDER}`, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ backgroundColor: BLUE_D, borderRadius: 4, padding: '2px 7px', fontSize: 12, fontWeight: 800, color: BLUE_A, alignSelf: 'flex-start' }}>#{i + 1}</span>
              <CompactCalcRow item={item} />
            </div>
          ))}
        </div>
        {history.length > 0 && (
          <div style={{ padding: '10px 16px', borderTop: `1px solid ${BORDER}` }}>
            <button style={{ width: '100%', height: 48, backgroundColor: 'rgba(192,57,43,0.10)', border: '1.5px solid #C0392B', borderRadius: 8, color: '#C0392B', fontSize: 15, fontWeight: 800, cursor: 'pointer', letterSpacing: 0.5 }} onClick={onDeleteAll}>
              {t('deleteAllCalcs')}
            </button>
          </div>
        )}
      </div>
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
function ConverterView() {
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

  const [convHistory, setConvHistory] = useState<ConvItem[]>(() => loadJson(KEY_CONV, []));
  const [showAllConvs,setShowAllConvs]= useState(false);
  const [convConfirm, setConvConfirm] = useState<null | { onConfirm: () => void }>(null);

  useEffect(() => {
    try { localStorage.setItem(KEY_CONV, JSON.stringify(convHistory)); } catch {}
  }, [convHistory]);

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
        id: uid(), mode: 'fif_to_eng' as ConvMode,
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
        id: uid(), mode: 'fif_to_eng' as ConvMode,
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

// ═══════════════════════════════════════════════════════════════════════════════
// CALCULATOR VIEW — dynamic multi-row list
// ═══════════════════════════════════════════════════════════════════════════════
function CalculatorView() {
  const { t } = useLang();

  const makeRow = (op: Op = '+'): CalcRow => ({
    id: uid(), op, mode: 'fif',
    ft: '', inches: 0, frac: 0, frL: 'None', eng: '', ftErr: '',
  });

  const [rows,         setRows]         = useState<CalcRow[]>(() => [makeRow(), makeRow()]);
  const [calcDone,     setCalcDone]     = useState(false);
  const [history,      setHistory]      = useState<CalcHistItem[]>(() => loadJson(KEY_CALC, []));
  const [showAllCalcs, setShowAllCalcs] = useState(false);
  const [menuOpenId,   setMenuOpenId]   = useState<string | null>(null);
  const [calcConfirm,  setCalcConfirm]  = useState<null | { onConfirm: () => void }>(null);
  const [engFocused,   setEngFocused]   = useState<string | null>(null);

  useEffect(() => {
    try { localStorage.setItem(KEY_CALC, JSON.stringify(history)); } catch {}
  }, [history]);

  // Row value — blank fields treated as 0 so total is always a valid number
  const rowVal = (r: CalcRow): number => {
    if (r.mode === 'eng') { const v = parseFloat(r.eng); return isNaN(v) ? 0 : v; }
    const f = r.ft === '' ? 0 : parseFloat(r.ft);
    if (isNaN(f) || f < 0) return 0;
    return f + r.inches / 12 + r.frac / 12;
  };

  const total   = rows.reduce<number>((acc, r, i) => { const v = rowVal(r); return i === 0 ? v : (r.op === '+' ? acc + v : acc - v); }, 0);
  const isEmpty = rows.every(r => r.ft === '' && r.eng === '' && r.inches === 0 && r.frac === 0);
  const totalFif = engToFif(Math.abs(total));

  const resetCalc = () => setCalcDone(false);

  const updateRow = (id: string, patch: Partial<CalcRow>) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
    resetCalc();
  };

  const addRow    = () => { setRows(prev => [...prev, makeRow('+')]); resetCalc(); };
  const removeRow = (id: string) => { if (rows.length <= 2) return; setRows(prev => prev.filter(r => r.id !== id)); resetCalc(); };
  const clearAll  = () => { setRows([makeRow(), makeRow()]); setCalcDone(false); };

  const handleCalculate = () => {
    if (isEmpty || calcDone) return;
    const item: CalcHistItem = {
      id: uid(),
      rows: rows.map(r => ({ op: r.op, mode: r.mode, ft: r.ft, inches: r.inches, frac: r.frac, frL: r.frL, eng: r.eng, val: rowVal(r) })),
      result: total,
    };
    setHistory(prev => [item, ...prev].slice(0, MAX_HIST));
    setCalcDone(true);
  };

  const handleEditItem = (item: CalcHistItem) => {
    setRows(item.rows.map(r => ({ id: uid(), op: r.op, mode: r.mode, ft: r.ft, inches: r.inches, frac: r.frac, frL: r.frL, eng: r.eng, ftErr: '' })));
    setCalcDone(false);
    setMenuOpenId(null);
  };

  const handleDeleteItem = (item: CalcHistItem) => {
    setCalcConfirm({ onConfirm: () => { setHistory(prev => prev.filter(h => h.id !== item.id)); setMenuOpenId(null); setCalcConfirm(null); } });
  };

  const handleDeleteAll = () => {
    setCalcConfirm({ onConfirm: () => { setHistory([]); setShowAllCalcs(false); setCalcConfirm(null); } });
  };

  const calcEnabled = !isEmpty && !calcDone;

  return (
    <>
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: 10, display: 'flex', flexDirection: 'column', gap: 6, width: '100%', boxSizing: 'border-box' }}>

        {/* ── Row list ── */}
        {rows.map((row, i) => (
          <div key={row.id}>

            {/* Op connector between adjacent rows */}
            {i > 0 && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, padding: '3px 0' }}>
                {(['+', '-'] as Op[]).map(o => (
                  <button key={o} onClick={() => updateRow(row.id, { op: o })} aria-pressed={row.op === o}
                    style={{
                      width: 40, height: 32, borderRadius: 8,
                      border: `2px solid ${row.op === o ? GOLD : BORDER}`,
                      backgroundColor: row.op === o ? NAVY : CARD,
                      color: row.op === o ? '#fff' : TEXT_S,
                      fontSize: o === '+' ? 22 : 26, fontWeight: 900,
                      cursor: 'pointer', fontFamily: 'monospace', lineHeight: 1, padding: 0,
                      transition: 'background-color 0.12s, border-color 0.12s, color 0.12s',
                    }}
                  >{o === '+' ? '+' : '−'}</button>
                ))}
              </div>
            )}

            {/* Row card */}
            <div style={{ backgroundColor: CARD, borderRadius: 8, border: `1.5px solid ${BORDER}`, padding: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 18 }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: TEXT_D, letterSpacing: 0.8, textTransform: 'uppercase' as const }}>Value {i + 1}</span>
                {rows.length > 2 && (
                  <button onClick={() => removeRow(row.id)}
                    style={{ width: 22, height: 22, border: 'none', borderRadius: 4, backgroundColor: '#FDECEC', color: '#C0392B', fontSize: 13, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, lineHeight: 1 }}>
                    ✕
                  </button>
                )}
              </div>

              {/* Mode toggle + inputs */}
              <div style={{ display: 'flex', gap: 4, alignItems: 'flex-start' }}>
                <ModeToggle mode={row.mode} onChange={m => updateRow(row.id, { mode: m })} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  {row.mode === 'fif' ? (
                    <FIFInputs
                      ft={row.ft}         setFt={v => updateRow(row.id, { ft: v })}
                      inches={row.inches} setInches={v => updateRow(row.id, { inches: v })}
                      frac={row.frac}     setFrac={v => updateRow(row.id, { frac: v })}
                      frL={row.frL}       setFrL={v => updateRow(row.id, { frL: v })}
                      ftErr={row.ftErr}
                      onFtChange={v => {
                        if (v === '' || /^\d+$/.test(v)) updateRow(row.id, { ft: v, ftErr: '' });
                        else updateRow(row.id, { ftErr: 'Whole numbers only' });
                      }}
                    />
                  ) : (
                    <input
                      style={{ width: '100%', minHeight: 50, borderRadius: 4, border: `1.5px solid ${GOLD}`, backgroundColor: '#fff', fontSize: 20, fontWeight: 700, color: '#1A2D35', textAlign: 'center', outline: 'none', boxSizing: 'border-box' as const }}
                      value={row.eng}
                      onChange={e => updateRow(row.id, { eng: e.target.value })}
                      inputMode="decimal"
                      enterKeyHint="done"
                      placeholder={engFocused === row.id ? '' : '0.00'}
                      onFocus={() => setEngFocused(row.id)}
                      onBlur={() => setEngFocused(null)}
                      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* ── Add Value button ── */}
        <button onClick={addRow}
          style={{ height: 36, backgroundColor: CARD, border: `1.5px dashed ${BLUE}`, borderRadius: 8, color: BLUE, fontSize: 14, fontWeight: 800, cursor: 'pointer', letterSpacing: 0.3, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
          <span style={{ fontSize: 18, lineHeight: 1, fontFamily: 'monospace', fontWeight: 900 }}>+</span> Add Value
        </button>

        {/* ── Live total box ── */}
        <div style={{ backgroundColor: DARK, borderRadius: 8, border: `2px solid ${GOLD}`, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.55)', letterSpacing: 1, flexShrink: 0 }}>TOTAL</span>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            {!isEmpty ? (
              <>
                <span style={{ fontSize: 16, fontWeight: 700, color: '#fff', fontFamily: 'monospace', lineHeight: 1.2 }}>
                  {total < 0 ? '−' : ''}{Math.abs(total).toFixed(2)} ft
                </span>
                <StackedFraction feet={totalFif.feet} inches={totalFif.inches} fracLbl={totalFif.fracLbl} negative={total < 0} color="rgba(255,255,255,0.85)" size={14} />
              </>
            ) : (
              <span style={{ fontSize: 22, fontWeight: 700, color: 'rgba(255,255,255,0.25)', lineHeight: 1 }}>—</span>
            )}
          </div>
        </div>

        {/* ── Action row ── */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={clearAll}
            style={{ flex: 1, height: 40, backgroundColor: CARD, border: `2px solid ${NAVY}`, borderRadius: 8, color: NAVY, fontSize: 13, fontWeight: 800, letterSpacing: 0.5, cursor: 'pointer' }}>
            {t('allClear')}
          </button>
          <button onClick={handleCalculate}
            style={{ flex: 2, height: 40, backgroundColor: NAVY, border: `2px solid ${GOLD}`, borderRadius: 8, color: '#fff', fontSize: 17, fontWeight: 800, letterSpacing: 1.5, cursor: calcEnabled ? 'pointer' : 'default', opacity: calcEnabled ? 1 : 0.7 }}>
            {t('calculate')}
          </button>
        </div>

        {/* ── Recent Calculations ── */}
        {history.length > 0 && (
          <div style={{ backgroundColor: CARD, borderRadius: 8, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', backgroundColor: SURFACE, borderBottom: `1px solid ${BORDER}` }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: TEXT_P, letterSpacing: 0.7 }}>{t('recentCalcs')}</span>
              <button style={{ backgroundColor: BLUE_D, borderRadius: 4, padding: '4px 10px', border: `1px solid ${BLUE}`, fontSize: 13, fontWeight: 700, color: BLUE_A, cursor: 'pointer' }}
                onClick={() => setShowAllCalcs(true)}>{t('allCalcs')}</button>
            </div>
            {history.slice(0, 2).map((item, i) => (
              <div key={item.id} style={{ padding: '8px 12px', borderBottom: i === 0 && history.length > 1 ? `1px solid ${BORDER}` : 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <CompactCalcRow item={item} compact />
                </div>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <button
                    style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: menuOpenId === item.id ? SURFACE : 'transparent', border: `1px solid ${menuOpenId === item.id ? BORDER : 'transparent'}`, fontSize: 16, fontWeight: 900, color: TEXT_S, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', letterSpacing: '-1px', lineHeight: 1, padding: 0 }}
                    onClick={e => { e.stopPropagation(); setMenuOpenId(menuOpenId === item.id ? null : item.id); }}
                  >⋮</button>
                  {menuOpenId === item.id && (
                    <div style={{ position: 'absolute', right: 0, top: 32, zIndex: 50, backgroundColor: CARD, borderRadius: 8, border: `1px solid ${BORDER}`, boxShadow: '0 6px 20px rgba(0,0,0,0.14)', minWidth: 160, overflow: 'hidden' }}>
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

      {showAllCalcs && (
        <AllCalcsModal history={history} onClose={() => setShowAllCalcs(false)} onDeleteAll={handleDeleteAll} />
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
export default function CalculatorScreen() {
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
        <CalculatorView />
      </div>
      <div style={{ flex: 1, overflow: 'hidden', display: subTab === 'converter' ? 'flex' : 'none', flexDirection: 'column' }}>
        <ConverterView />
      </div>
    </div>
  );
}
