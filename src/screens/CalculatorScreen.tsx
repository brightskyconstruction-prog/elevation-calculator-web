import { useState, useEffect } from 'react';
import { INCHES_OPTIONS, FRACTION_OPTIONS } from '../constants';
import { useLang } from '../LangContext';

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
const KEY_CALC = 'elevCalc:history';
const KEY_CONV = 'elevCalc:convHistory';
const MAX_HIST = 20;

// ─── Types ────────────────────────────────────────────────────────────────────
type Mode     = 'eng' | 'fif';
type Op       = '+' | '-';
type SubTab   = 'calculator' | 'converter';
type ConvMode = 'fif_to_eng' | 'eng_to_fif';

interface CalcHistItem {
  id: string;
  modeA: Mode; modeB: Mode; op: Op;
  aFt: string; aIn: number; aFr: number; aFrL: string; aEng: string;
  bFt: string; bIn: number; bFr: number; bFrL: string; bEng: string;
  valA: number; valB: number; valR: number;
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

// ─── Compact calc row (history item) ─────────────────────────────────────────
function CompactCalcRow({ item, compact = false }: { item: CalcHistItem; compact?: boolean }) {
  const aFIF = item.modeA === 'fif'
    ? { feet: parseInt(item.aFt || '0', 10), inches: item.aIn, fracLbl: item.aFrL }
    : engToFif(Math.abs(item.valA));
  const bFIF = item.modeB === 'fif'
    ? { feet: parseInt(item.bFt || '0', 10), inches: item.bIn, fracLbl: item.bFrL }
    : engToFif(Math.abs(item.valB));
  const rFIF = engToFif(Math.abs(item.valR));
  const sym  = compact ? 15 : 17;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <MeasureBlock {...aFIF} engFt={item.valA} compact={compact} />
      <span style={{ fontSize: sym, fontWeight: 700, color: TEXT_S, padding: '0 2px' }}>{item.op === '+' ? '+' : '−'}</span>
      <MeasureBlock {...bFIF} engFt={item.valB} compact={compact} />
      <span style={{ fontSize: sym, fontWeight: 700, color: TEXT_S, padding: '0 2px' }}>=</span>
      <MeasureBlock {...rFIF} engFt={Math.abs(item.valR)} negative={item.valR < 0} compact={compact} />
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
    if (!window.confirm(t('deleteConvsConfirm'))) return;
    setConvHistory([]); setShowAllConvs(false);
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
                placeholder={cEngFocused ? '' : '0.00'}
                onFocus={() => setCEngFocused(true)}
                onBlur={() => setCEngFocused(false)}
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
              backgroundColor: convEnabled ? NAVY : '#C8C8C8',
              border: `2px solid ${convEnabled ? GOLD : '#AAAAAA'}`,
              borderRadius: 8,
              color: convEnabled ? '#fff' : '#6B7280',
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
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CALCULATOR VIEW
// ═══════════════════════════════════════════════════════════════════════════════
function CalculatorView() {
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
  const [calcDone,     setCalcDone]     = useState(false);   // change 4: disable after calc
  const [aEngFocused,  setAEngFocused]  = useState(false);   // change 1: placeholder on focus
  const [bEngFocused,  setBEngFocused]  = useState(false);   // change 1: placeholder on focus
  const [history,      setHistory]      = useState<CalcHistItem[]>(() => loadJson(KEY_CALC, []));
  const [showAllCalcs, setShowAllCalcs] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(KEY_CALC, JSON.stringify(history)); } catch {}
  }, [history]);

  // Reset both result display and "already calculated" flag
  const resetCalc = () => { setResult(null); setCalcDone(false); };

  const clearA = () => { setAFt(''); setAIn(0); setAFr(0); setAFrL('None'); setAEng(''); setAFtErr(''); resetCalc(); };
  const clearB = () => { setBFt(''); setBIn(0); setBFr(0); setBFrL('None'); setBEng(''); setBFtErr(''); resetCalc(); };
  const handleAllClear = () => { clearA(); clearB(); setOp('+'); };

  // Feet text input handlers — validate whole numbers
  const onFtChangeA = (v: string) => { if (v === '' || /^\d+$/.test(v)) { setAFt(v); setAFtErr(''); } else setAFtErr('Whole numbers only'); resetCalc(); };
  const onFtChangeB = (v: string) => { if (v === '' || /^\d+$/.test(v)) { setBFt(v); setBFtErr(''); } else setBFtErr('Whole numbers only'); resetCalc(); };

  const valA    = modeA === 'eng' ? parseFloat(aEng) : fifToEng(aFt, aIn, aFr);
  const valB    = modeB === 'eng' ? parseFloat(bEng) : fifToEng(bFt, bIn, bFr);
  const canCalc = !isNaN(valA) && !isNaN(valB);
  // Button active only when inputs are valid AND result hasn't been computed yet for this combo
  const calcEnabled = canCalc && !calcDone;
  const resultFif = result !== null ? engToFif(Math.abs(result)) : null;

  const handleCalculate = () => {
    if (!calcEnabled) return;
    const raw = op === '+' ? valA + valB : valA - valB;
    if (isNaN(raw)) return;
    setResult(raw);
    setCalcDone(true);  // disable button until inputs change
    const item: CalcHistItem = {
      id: uid(), modeA, modeB, op,
      aFt, aIn, aFr, aFrL, aEng,
      bFt, bIn, bFr, bFrL, bEng,
      valA, valB, valR: raw,
    };
    setHistory(prev => [item, ...prev].slice(0, MAX_HIST));
  };

  const handleDeleteAll = () => {
    if (!window.confirm(t('deleteCalcsConfirm'))) return;
    setHistory([]); setShowAllCalcs(false);
  };

  return (
    <>
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: 10, display: 'flex', flexDirection: 'column', gap: 10, width: '100%', boxSizing: 'border-box' }}>

        {/* Calculator row: A | op | B | result */}
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 4, minWidth: 0 }}>

          {/* Input A */}
          <div style={{ flex: 3, minWidth: 0, backgroundColor: CARD, borderRadius: 8, border: `1.5px solid ${BORDER}`, padding: 6, display: 'flex', flexDirection: 'column', gap: 3, overflow: 'hidden' }}>
            <ModeToggle mode={modeA} onChange={m => { setModeA(m); resetCalc(); }} />
            {modeA === 'fif' ? (
              <FIFInputs
                ft={aFt} setFt={setAFt}
                inches={aIn} setInches={v => { setAIn(v); resetCalc(); }}
                frac={aFr}   setFrac={v => { setAFr(v); resetCalc(); }}
                frL={aFrL}   setFrL={v => { setAFrL(v); resetCalc(); }}
                ftErr={aFtErr} onFtChange={onFtChangeA}
              />
            ) : (
              <input
                style={{ flex: 1, minHeight: 50, borderRadius: 4, border: `1.5px solid ${GOLD}`, backgroundColor: '#fff', fontSize: 20, fontWeight: 700, color: '#1A2D35', textAlign: 'center', outline: 'none' }}
                value={aEng}
                onChange={e => { setAEng(e.target.value); resetCalc(); }}
                inputMode="decimal"
                placeholder={aEngFocused ? '' : '0.00'}
                onFocus={() => setAEngFocused(true)}
                onBlur={() => setAEngFocused(false)}
              />
            )}
            <button style={{ height: 26, backgroundColor: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 4, fontSize: 11, fontWeight: 800, color: TEXT_S, cursor: 'pointer', letterSpacing: 0.3 }} onClick={clearA}>✕ {t('clearBtn')}</button>
          </div>

          {/* Operator column — change 5: "OR" between + and − */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <button
              style={{ width: '100%', height: 44, borderRadius: 6, backgroundColor: op === '+' ? NAVY : CARD, border: `2px solid ${op === '+' ? GOLD : BORDER}`, color: op === '+' ? GOLD : TEXT_S, fontSize: 22, fontWeight: 700, cursor: 'pointer', lineHeight: 1 }}
              onClick={() => { setOp('+'); resetCalc(); }}
            >+</button>
            <span style={{ fontSize: 11, fontWeight: 800, color: TEXT_S, letterSpacing: 0.5, lineHeight: 1 }}>OR</span>
            <button
              style={{ width: '100%', height: 44, borderRadius: 6, backgroundColor: op === '-' ? NAVY : CARD, border: `2px solid ${op === '-' ? GOLD : BORDER}`, color: op === '-' ? GOLD : TEXT_S, fontSize: 22, fontWeight: 700, cursor: 'pointer', lineHeight: 1 }}
              onClick={() => { setOp('-'); resetCalc(); }}
            >−</button>
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
                inputMode="decimal"
                placeholder={bEngFocused ? '' : '0.00'}
                onFocus={() => setBEngFocused(true)}
                onBlur={() => setBEngFocused(false)}
              />
            )}
            <button style={{ height: 26, backgroundColor: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 4, fontSize: 11, fontWeight: 800, color: TEXT_S, cursor: 'pointer', letterSpacing: 0.3 }} onClick={clearB}>✕ {t('clearBtn')}</button>
          </div>

          {/* Result card */}
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

        {/* Action buttons — changes 2, 3, 4: larger font, shorter height, disable after calc */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            style={{ flex: 1, height: 40, backgroundColor: CARD, border: `2px solid ${NAVY}`, borderRadius: 8, color: NAVY, fontSize: 15, fontWeight: 800, letterSpacing: 1, cursor: 'pointer' }}
            onClick={handleAllClear}
          >{t('allClear')}</button>
          <button
            style={{
              flex: 2, height: 40,
              backgroundColor: calcEnabled ? NAVY : '#C8C8C8',
              border: `2px solid ${calcEnabled ? GOLD : '#AAAAAA'}`,
              borderRadius: 8,
              color: calcEnabled ? '#fff' : '#6B7280',
              fontSize: 17, fontWeight: 800, letterSpacing: 1.5,
              cursor: calcEnabled ? 'pointer' : 'default',
            }}
            onClick={handleCalculate}
            disabled={!calcEnabled}
          >{t('calculate')}</button>
        </div>

        {/* Recent Calculations */}
        {history.length > 0 && (
          <div style={{ backgroundColor: CARD, borderRadius: 8, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', backgroundColor: SURFACE, borderBottom: `1px solid ${BORDER}` }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: TEXT_P, letterSpacing: 0.7 }}>{t('recentCalcs')}</span>
              <button style={{ backgroundColor: BLUE_D, borderRadius: 4, padding: '4px 10px', border: `1px solid ${BLUE}`, fontSize: 13, fontWeight: 700, color: BLUE_A, cursor: 'pointer' }}
                onClick={() => setShowAllCalcs(true)}>{t('allCalcs')}</button>
            </div>
            {history.slice(0, 2).map((item, i) => (
              <div key={item.id} style={{ padding: '10px 12px', borderBottom: i === 0 && history.length > 1 ? `1px solid ${BORDER}` : 'none' }}>
                <CompactCalcRow item={item} compact />
              </div>
            ))}
          </div>
        )}
      </div>

      {showAllCalcs && (
        <AllCalcsModal history={history} onClose={() => setShowAllCalcs(false)} onDeleteAll={handleDeleteAll} />
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
              backgroundColor: isActive ? '#DBEAFE' : 'transparent',
              color: isActive ? NAVY : '#6B7280',
              fontSize: 15,
              fontWeight: isActive ? 700 : 600,
              cursor: 'pointer',
              boxShadow: isActive ? '0 1px 3px rgba(20,58,99,0.12)' : 'none',
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
