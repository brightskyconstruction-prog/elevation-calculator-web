import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useSurveyStore } from '../stores/surveyStore';
import { SurveySet, SurveyPoint } from '../types';
import { fmtTimestamp } from '../constants';
import { useLang } from '../LangContext';
import { strings } from '../i18n';

// ─── Animations ───────────────────────────────────────────────────────────────
if (typeof document !== 'undefined' && !document.getElementById('anp-modal-anim')) {
  const _svs = document.createElement('style');
  _svs.id = 'anp-modal-anim';
  _svs.textContent = `
    @keyframes anpModalIn {
      from { opacity:0; transform:scale(0.92) translateY(6px); }
      to   { opacity:1; transform:scale(1) translateY(0); }
    }
    .anp-modal-in { animation: anpModalIn 0.20s cubic-bezier(0.22,1,0.36,1) both; }
    @keyframes svsEditSlide {
      from { opacity:0; transform:translateY(-10px); }
      to   { opacity:1; transform:translateY(0); }
    }
    .svs-edit-in  { animation: svsEditSlide 0.22s ease both; }
    @keyframes svsFadeIn {
      from { opacity:0; }
      to   { opacity:1; }
    }
    .svs-fade-in  { animation: svsFadeIn 0.18s ease both; }
    .svs-stats-row::-webkit-scrollbar { display:none; }
    .svs-stats-row { -ms-overflow-style:none; scrollbar-width:none; }
  `;
  document.head.appendChild(_svs);
}

// ─── Colors ───────────────────────────────────────────────────────────────────
const NAVY     = '#143A63';
const BLUE     = '#1E5799';
const BLUE_A   = '#3B82F6';
const BLUE_D   = 'rgba(30,87,153,0.12)';
const BORDER   = '#E5E7EB';
const SURFACE  = '#F0EEE8';
const CARD     = '#FFFFFF';
const SCREEN   = '#F5F4F0';
const TEXT_P   = '#111827';
const TEXT_S   = '#374151';
const TEXT_D   = '#9CA3AF';
const RED      = '#C0392B';
const GREEN    = '#15803D';
const GREEN_D  = 'rgba(21,128,61,0.10)';
const GREEN_B  = '#86EFAC';
const CHARCOAL = '#222222';
const GOLD_TXT = '#92610A';
const GOLD_LBL = '#B8730A';

type Filter    = 'latest' | 'name' | 'search';
type PointType = 'benchmark' | 'derived' | 'standalone';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDateFull(ts: number, lang: string): string {
  return new Date(ts).toLocaleDateString(lang === 'es' ? 'es-MX' : 'en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
}

// ─── Type theming (badges only — value text is charcoal per req #6) ───────────
const TYPE_THEME: Record<PointType, {
  border: string; badgeBg: string; badgeBdr: string; badgeTxt: string; labelKey: string;
}> = {
  benchmark:  { border: '#F5A623', badgeBg: '#FFF3CD', badgeBdr: '#F5A623', badgeTxt: GOLD_TXT,  labelKey: 'spBenchmarkBadge' },
  derived:    { border: BLUE,      badgeBg: BLUE_D,    badgeBdr: BLUE,      badgeTxt: BLUE_A,    labelKey: 'spDerivedBadge'   },
  standalone: { border: BORDER,    badgeBg: SURFACE,   badgeBdr: BORDER,    badgeTxt: TEXT_D,    labelKey: 'spStandaloneBadge'},
};

const ELEV_LABEL_KEY: Record<PointType, string> = {
  benchmark:  'svsElevLabel',
  derived:    'svsDerivedBm',
  standalone: 'svsBmElev',
};

// ─── Stacked fraction ─────────────────────────────────────────────────────────
function StackedFIFSpan({ feet, inches, frac, color = TEXT_P, size = 14 }: {
  feet: string | number; inches: string | number; frac: string;
  color?: string; size?: number;
}) {
  const hasFrac  = !!(frac && frac !== '0' && frac !== 'None');
  const parts    = hasFrac ? frac.split('/') : [];
  const num      = parts.length === 2 ? parseInt(parts[0], 10) : NaN;
  const den      = parts.length === 2 ? parseInt(parts[1], 10) : NaN;
  const showFrac = hasFrac && !isNaN(num) && !isNaN(den);
  const tiny     = Math.max(8, Math.round(size * 0.62));
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
      <span style={{ fontSize: size, fontWeight: 700, color }}>{feet}′ - {inches}{showFrac ? ' ' : '″'}</span>
      {showFrac && (
        <>
          <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1 }}>
            <span style={{ fontSize: tiny, fontWeight: 700, color, lineHeight: 1.1 }}>{num}</span>
            <span style={{ width: '100%', height: 1.5, backgroundColor: color, display: 'block' }} />
            <span style={{ fontSize: tiny, fontWeight: 700, color, lineHeight: 1.1 }}>{den}</span>
          </span>
          <span style={{ fontSize: size, fontWeight: 700, color }}>″</span>
        </>
      )}
    </span>
  );
}

// ─── Export utilities ─────────────────────────────────────────────────────────
async function loadXLSX(): Promise<any> {
  const w = window as any;
  if (w.XLSX) return w.XLSX;
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload  = () => resolve((window as any).XLSX);
    s.onerror = () => reject(new Error('xlsx unavailable'));
    document.head.appendChild(s);
  });
}

function rodFifStr(pt: SurveyPoint): string {
  const f  = pt.rodFeet ?? '0';
  const i  = pt.rodInches ?? 0;
  const fr = pt.rodFractionLabel && pt.rodFractionLabel !== 'None' ? ` ${pt.rodFractionLabel}` : '';
  return `${f}' ${i}${fr}"`;
}

function pointTypeName(pt: SurveyPoint, refId: string | null): string {
  if (pt.id === refId) return 'Benchmark';
  if ((pt.bmElevation ?? 0) > 0) return 'Derived';
  return 'Standalone';
}

function exportSinglePointCsv(pt: SurveyPoint, setName: string, setLabel: string) {
  const hdrs = ['Set', 'Set Label', 'Point ID', 'Point Name', 'Rod (FIF)', 'Rod (ft)', 'Elevation (ft)', 'Recorded', 'Lat', 'Lon'];
  const row  = [
    setName, setLabel, pt.label, pt.pointName ?? '',
    rodFifStr(pt),
    (pt.engineeringFeet ?? 0).toFixed(4),
    (pt.bmElevation ?? 0).toFixed(4),
    pt.savedAt ? fmtTimestamp(pt.savedAt) : '',
    String(pt.createdLatitude ?? ''),
    String(pt.createdLongitude ?? ''),
  ];
  const csv  = [hdrs, row].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `point-${pt.label}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

function exportToCsv(sets: SurveySet[], points: SurveyPoint[]) {
  const refMap: Record<string, string | null> = {};
  for (const s of sets) {
    const cands = points.filter(p => p.setId === s.id && (p.bmElevation ?? 0) > 0)
      .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
    refMap[s.id] = cands[0]?.id ?? null;
  }
  const headers = ['Set', 'Set Label', 'Point ID', 'Point Name', 'Rod Reading (FIF)', 'Decimal Rod (ft)', 'Elevation (ft)', 'Type', 'Recorded', 'Latitude', 'Longitude'];
  const rows: string[][] = [headers];
  for (const s of sets) {
    const pts = points.filter(p => p.setId === s.id).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
    for (const pt of pts) {
      rows.push([
        s.name, s.setLabel ?? '', pt.label, pt.pointName ?? '',
        rodFifStr(pt),
        (pt.engineeringFeet ?? 0).toFixed(4),
        (pt.bmElevation ?? 0).toFixed(4),
        pointTypeName(pt, refMap[s.id]),
        pt.savedAt ? fmtTimestamp(pt.savedAt) : '',
        String(pt.createdLatitude ?? ''),
        String(pt.createdLongitude ?? ''),
      ]);
    }
  }
  const csv  = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `sets-export-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

async function exportSetsToXlsx(sets: SurveySet[], points: SurveyPoint[]) {
  let XLSX: any;
  try { XLSX = await loadXLSX(); } catch { exportToCsv(sets, points); return; }
  const wb      = XLSX.utils.book_new();
  const headers = ['Point ID', 'Point Name', 'Rod Reading (FIF)', 'Decimal Rod (ft)', 'Elevation (ft)', 'Type', 'Recorded', 'Latitude', 'Longitude'];
  for (const s of sets) {
    const refId  = points.filter(p => p.setId === s.id && (p.bmElevation ?? 0) > 0)
      .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))[0]?.id ?? null;
    const pts    = points.filter(p => p.setId === s.id)
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
    const wsData = [headers, ...pts.map(pt => [
      pt.label, pt.pointName ?? '', rodFifStr(pt),
      (pt.engineeringFeet ?? 0).toFixed(4), (pt.bmElevation ?? 0).toFixed(4),
      pointTypeName(pt, refId), pt.savedAt ? fmtTimestamp(pt.savedAt) : '',
      pt.createdLatitude ?? '', pt.createdLongitude ?? '',
    ])];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{ wch:10 },{ wch:22 },{ wch:16 },{ wch:16 },{ wch:16 },{ wch:14 },{ wch:28 },{ wch:14 },{ wch:14 }];
    const sheetName = (s.setLabel ? `${s.setLabel} ` : '') + s.name.substring(0, 26).replace(/[/\\?*[\]:]/g, '');
    XLSX.utils.book_append_sheet(wb, ws, sheetName.substring(0, 31));
  }
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob  = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  a.href = url; a.download = `sets-export-${new Date().toISOString().split('T')[0]}.xlsx`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ─── Shared overlay styles ────────────────────────────────────────────────────
const OV: Record<string, React.CSSProperties> = {
  overlay: { position:'fixed', inset:0, backgroundColor:'rgba(0,0,0,0.52)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:300, padding:'0 16px', boxSizing:'border-box' },
  sheet:   { backgroundColor:CARD, borderRadius:18, maxWidth:440, width:'100%', overflow:'hidden', boxShadow:'0 20px 60px rgba(0,0,0,0.28)', display:'flex', flexDirection:'column' },
  hdr:     { backgroundColor:NAVY, padding:'15px 18px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 },
  hdrTxt:  { fontSize:18, fontWeight:800, color:'#fff', lineHeight:1.2 },
  hdrX:    { background:'none', border:'none', color:'#fff', fontSize:24, fontWeight:700, lineHeight:1, cursor:'pointer', padding:'4px 6px', opacity:0.85 },
};

// ─── Rename / DeleteAll modals (unchanged) ────────────────────────────────────
function RenameSetModal({ curSet, allSets, onSave, onClose }: {
  curSet: SurveySet; allSets: SurveySet[];
  onSave: (name: string) => void; onClose: () => void;
}) {
  const { lang } = useLang();
  const [name, setName]   = useState(curSet.name);
  const [error, setError] = useState('');
  const inputRef          = useRef<HTMLInputElement>(null);
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 80); }, []);
  const validate = () => {
    const v = name.trim();
    if (!v) { setError(lang === 'es' ? 'El nombre no puede estar vacío.' : 'Name cannot be empty.'); return ''; }
    if (allSets.some(s => s.id !== curSet.id && s.name.trim().toLowerCase() === v.toLowerCase())) {
      setError(lang === 'es' ? 'Ya existe un conjunto con ese nombre.' : 'A set with this name already exists.'); return '';
    }
    return v;
  };
  return (
    <div style={OV.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="anp-modal-in" style={{ ...OV.sheet, maxWidth:380 }}>
        <div style={OV.hdr}>
          <span style={OV.hdrTxt}>{lang === 'es' ? 'Renombrar Conjunto' : 'Rename Set'}</span>
          <button style={OV.hdrX} onClick={onClose}>✕</button>
        </div>
        <div style={{ padding:'14px 16px 18px', display:'flex', flexDirection:'column', gap:10 }}>
          <div style={{ fontSize:12, fontWeight:700, color:TEXT_S }}>
            {lang === 'es' ? 'Nombre actual:' : 'Current name:'} <span style={{ color:NAVY, fontWeight:800 }}>{curSet.name}</span>
          </div>
          <input ref={inputRef} value={name} onChange={e => { setName(e.target.value); setError(''); }}
            onKeyDown={e => { if (e.key === 'Enter') { const v = validate(); if (v) onSave(v); } }}
            placeholder={lang === 'es' ? 'Nuevo nombre…' : 'New name…'}
            style={{ height:42, borderRadius:8, border:`1.5px solid ${error ? RED : BORDER}`, padding:'0 12px', fontSize:15, fontWeight:600, color:TEXT_P, backgroundColor:SURFACE, outline:'none', boxSizing:'border-box' as const, width:'100%' }} />
          {error && <span style={{ fontSize:12, color:RED, fontWeight:600 }}>{error}</span>}
          <div style={{ display:'flex', gap:8, marginTop:2 }}>
            <button style={{ flex:1, height:42, borderRadius:8, border:`1px solid ${BORDER}`, backgroundColor:SURFACE, color:TEXT_S, fontSize:14, fontWeight:700, cursor:'pointer' }} onClick={onClose}>
              {lang === 'es' ? 'Cancelar' : 'Cancel'}
            </button>
            <button style={{ flex:2, height:42, borderRadius:8, border:'none', backgroundColor:NAVY, color:'#fff', fontSize:14, fontWeight:800, cursor:'pointer' }} onClick={() => { const v = validate(); if (v) onSave(v); }}>
              {lang === 'es' ? 'Guardar' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DeleteAllConfirmModal({ setCount, onConfirm, onClose }: {
  setCount: number; onConfirm: () => void; onClose: () => void;
}) {
  const { lang }    = useLang();
  const [value, setValue] = useState('');
  const canDelete   = value === 'DELETE';
  return (
    <div style={OV.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="anp-modal-in" style={{ ...OV.sheet, maxWidth:380 }}>
        <div style={{ ...OV.hdr, backgroundColor:RED }}>
          <span style={OV.hdrTxt}>{lang === 'es' ? 'Confirmar Eliminación' : 'Confirm Delete All'}</span>
          <button style={OV.hdrX} onClick={onClose}>✕</button>
        </div>
        <div style={{ padding:'16px 16px 18px', display:'flex', flexDirection:'column', gap:12 }}>
          <p style={{ margin:0, fontSize:14, color:TEXT_P, lineHeight:1.55 }}>
            {lang === 'es'
              ? `Esto eliminará permanentemente ${setCount} conjunto${setCount !== 1 ? 's' : ''} y todos sus puntos. Esta acción no se puede deshacer.`
              : `This will permanently delete ${setCount} set${setCount !== 1 ? 's' : ''} and all their points. This action cannot be undone.`}
          </p>
          <div>
            <div style={{ fontSize:12, fontWeight:700, color:TEXT_S, marginBottom:6 }}>
              {lang === 'es' ? 'Escribe DELETE para confirmar:' : 'Type DELETE to confirm:'}
            </div>
            <input value={value} onChange={e => setValue(e.target.value)} placeholder="DELETE"
              style={{ height:42, borderRadius:8, border:`1.5px solid ${canDelete ? RED : BORDER}`, padding:'0 12px', fontSize:15, fontWeight:700, color:RED, backgroundColor:'#FFF5F5', outline:'none', boxSizing:'border-box' as const, width:'100%', letterSpacing:1 }} />
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button style={{ flex:1, height:42, borderRadius:8, border:`1px solid ${BORDER}`, backgroundColor:SURFACE, color:TEXT_S, fontSize:14, fontWeight:700, cursor:'pointer' }} onClick={onClose}>
              {lang === 'es' ? 'Cancelar' : 'Cancel'}
            </button>
            <button disabled={!canDelete}
              style={{ flex:2, height:42, borderRadius:8, border:'none', backgroundColor:canDelete ? RED : '#E5E7EB', color:canDelete ? '#fff' : TEXT_D, fontSize:14, fontWeight:800, cursor:canDelete ? 'pointer' : 'default', transition:'background-color 0.2s, color 0.2s' }}
              onClick={onConfirm}>
              {lang === 'es' ? 'Eliminar Todo' : 'Delete All'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ManageSetModal({ curSet, allSets, onRename, onDeleteThis, onDeleteAll, onClose }: {
  curSet: SurveySet | null; allSets: SurveySet[];
  onRename: (name: string) => void; onDeleteThis: () => void; onDeleteAll: () => void; onClose: () => void;
}) {
  const { lang }                     = useLang();
  const [showRename,        setShowRename]        = useState(false);
  const [showDeleteAllConf, setShowDeleteAllConf] = useState(false);
  if (showRename && curSet) return (
    <RenameSetModal curSet={curSet} allSets={allSets}
      onSave={name => { onRename(name); setShowRename(false); onClose(); }}
      onClose={() => setShowRename(false)} />
  );
  if (showDeleteAllConf) return (
    <DeleteAllConfirmModal setCount={allSets.length}
      onConfirm={() => { setShowDeleteAllConf(false); onDeleteAll(); }}
      onClose={() => setShowDeleteAllConf(false)} />
  );
  const btn = (color: string, bg: string, bdr: string): React.CSSProperties => ({
    width:'100%', padding:'13px 16px', backgroundColor:bg, border:`1px solid ${bdr}`,
    borderRadius:10, fontSize:15, fontWeight:700, color, cursor:'pointer',
    textAlign:'left' as const, display:'flex', alignItems:'center', gap:10,
  });
  return (
    <div style={OV.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="anp-modal-in" style={OV.sheet}>
        <div style={OV.hdr}>
          <div>
            <div style={{ fontSize:18, fontWeight:800, color:'#fff' }}>{lang === 'es' ? 'Gestionar Conjunto' : 'Manage Set'}</div>
            {curSet && <div style={{ fontSize:12, color:'rgba(255,255,255,0.65)', marginTop:2 }}>{curSet.name}</div>}
          </div>
          <button style={OV.hdrX} onClick={onClose}>✕</button>
        </div>
        <div style={{ padding:'12px 14px 16px', display:'flex', flexDirection:'column', gap:8 }}>
          {curSet && <button style={btn(NAVY, BLUE_D, BLUE)} onClick={() => setShowRename(true)}><span style={{ fontSize:18 }}>✏️</span><span>{lang === 'es' ? 'Renombrar Conjunto' : 'Rename Set'}</span></button>}
          {curSet && <button style={btn(RED, 'rgba(192,57,43,0.06)', 'rgba(192,57,43,0.25)')} onClick={onDeleteThis}><span style={{ fontSize:18 }}>🗑️</span><span>{lang === 'es' ? 'Eliminar Este Conjunto' : 'Delete This Set'}</span></button>}
          <button style={btn(RED, 'rgba(192,57,43,0.06)', 'rgba(192,57,43,0.25)')} onClick={() => setShowDeleteAllConf(true)}><span style={{ fontSize:18 }}>⚠️</span><span>{lang === 'es' ? 'Eliminar Todos los Conjuntos' : 'Delete All Sets'}</span></button>
          <button style={btn(TEXT_S, SURFACE, BORDER)} onClick={onClose}><span style={{ fontSize:18, opacity:0 }}>·</span><span>{lang === 'es' ? 'Cancelar' : 'Cancel'}</span></button>
        </div>
      </div>
    </div>
  );
}

// ─── SetDetailView ─────────────────────────────────────────────────────────────
interface SetDetailProps {
  set: SurveySet; points: SurveyPoint[]; projectId: string; onClose: () => void;
}

function SetDetailView({ set, points, projectId, onClose }: SetDetailProps) {
  const { t, lang }                         = useLang();
  const { updatePoint, updateSet, getSets } = useSurveyStore();
  const allSets                             = getSets(projectId);

  // view state
  const [menuPtId,     setMenuPtId]     = useState<string | null>(null);
  const [moveMenuPtId, setMoveMenuPtId] = useState<string | null>(null);
  const [toastMsg,     setToastMsg]     = useState('');

  // edit state
  const [isEdit,          setIsEdit]          = useState(false);
  const [editName,        setEditName]        = useState('');
  const [editNameErr,     setEditNameErr]     = useState(false);
  const [editBmElevStr,   setEditBmElevStr]   = useState('');
  const [pendingRemovals, setPendingRemovals] = useState<Set<string>>(new Set());
  const editNameRef = useRef<HTMLInputElement>(null);

  const sorted = [...points].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { numeric: true }));

  const referenceId = (() => {
    const cands = points.filter(p => (p.bmElevation ?? 0) > 0)
      .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
    return cands.length > 0 ? cands[0].id : null;
  })();

  const getType = (pt: SurveyPoint): PointType => {
    if (pt.id === referenceId) return 'benchmark';
    if ((pt.bmElevation ?? 0) > 0) return 'derived';
    return 'standalone';
  };

  const withBm   = points.filter(p => (p.bmElevation ?? 0) > 0);
  const elevs    = withBm.map(p => p.bmElevation!);
  const highElev = elevs.length > 0 ? Math.max(...elevs) : null;
  const lowElev  = elevs.length > 0 ? Math.min(...elevs) : null;
  const avgElev  = elevs.length > 0 ? elevs.reduce((s, e) => s + e, 0) / elevs.length : null;
  const refPt    = sorted.find(p => p.id === referenceId);

  // ── Enter edit mode ──────────────────────────────────────────────────────────
  const enterEdit = () => {
    setEditName(set.name);
    setEditBmElevStr(refPt ? (refPt.bmElevation ?? 0).toFixed(3) : '');
    setPendingRemovals(new Set());
    setEditNameErr(false);
    setMenuPtId(null);
    setMoveMenuPtId(null);
    setIsEdit(true);
  };

  useEffect(() => {
    if (isEdit) setTimeout(() => editNameRef.current?.focus(), 80);
  }, [isEdit]);

  // ── Save changes ─────────────────────────────────────────────────────────────
  const handleSave = () => {
    const nameVal = editName.trim();
    if (!nameVal) { setEditNameErr(true); return; }

    // 1. Rename set if changed
    if (nameVal !== set.name) updateSet(projectId, set.id, { name: nameVal });

    // 2. Known elevation / benchmark recalculation
    if (refPt) {
      const newBm = parseFloat(editBmElevStr);
      if (!isNaN(newBm) && Math.abs(newBm - (refPt.bmElevation ?? 0)) > 0.00001) {
        const diff = newBm - (refPt.bmElevation ?? 0);
        // Update benchmark point
        updatePoint(projectId, refPt.id, {
          bmElevation: newBm,
          elevation:   newBm + (refPt.engineeringFeet ?? 0),
        });
        // Update all derived points in this set
        sorted
          .filter(p => p.id !== refPt.id && (p.bmElevation ?? 0) > 0)
          .forEach(p => {
            const newDerived = (p.bmElevation ?? 0) + diff;
            updatePoint(projectId, p.id, {
              bmElevation: newDerived,
              elevation:   newDerived + (p.engineeringFeet ?? 0),
            });
          });
      }
    }

    // 3. Apply pending removals
    pendingRemovals.forEach(ptId => {
      updatePoint(projectId, ptId, { setId: undefined });
    });

    setIsEdit(false);
    setPendingRemovals(new Set());
  };

  // ── Overflow menu actions ─────────────────────────────────────────────────────
  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 2200);
  };

  const handleRemoveFromSet = (pt: SurveyPoint) => {
    const msg = lang === 'es'
      ? `¿Quitar ${pt.label} de este conjunto?`
      : `Remove ${pt.label} from this set?`;
    if (!window.confirm(msg)) return;
    updatePoint(projectId, pt.id, { setId: undefined });
    setMenuPtId(null);
  };

  const handleMoveToSet = (pt: SurveyPoint, targetSet: SurveySet) => {
    updatePoint(projectId, pt.id, { setId: targetSet.id });
    setMenuPtId(null); setMoveMenuPtId(null);
  };

  const handleExportPoint = (pt: SurveyPoint) => {
    exportSinglePointCsv(pt, set.name, set.setLabel ?? '');
    setMenuPtId(null);
  };

  const handleSharePoint = (pt: SurveyPoint) => {
    const text = [
      `Point: ${pt.label}${pt.pointName ? ` — ${pt.pointName}` : ''}`,
      `Rod: ${rodFifStr(pt)}  |  ${(pt.engineeringFeet ?? 0).toFixed(4)} ft`,
      (pt.bmElevation ?? 0) > 0 ? `Elevation: ${(pt.bmElevation ?? 0).toFixed(3)} ft` : null,
      pt.createdLatitude != null ? `GPS: ${pt.createdLatitude}, ${pt.createdLongitude}` : null,
    ].filter(Boolean).join('\n');
    if ((navigator as any).share) {
      (navigator as any).share({ title: `Survey Point ${pt.label}`, text });
    } else {
      navigator.clipboard?.writeText(text).then(() => showToast(lang === 'es' ? '¡Copiado!' : 'Copied to clipboard'));
    }
    setMenuPtId(null);
  };

  const handleDuplicate = () => {
    showToast(lang === 'es' ? 'Próximamente…' : 'Coming soon…');
    setMenuPtId(null);
  };

  const closeMenus = () => { setMenuPtId(null); setMoveMenuPtId(null); };

  // ── Edit mode removal toggle ──────────────────────────────────────────────────
  const toggleRemoval = (ptId: string) => {
    setPendingRemovals(prev => {
      const next = new Set(prev);
      if (next.has(ptId)) next.delete(ptId); else next.add(ptId);
      return next;
    });
  };

  const otherSets = allSets.filter(s => s.id !== set.id);

  return (
    <div
      style={{ position:'fixed', inset:0, backgroundColor:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:'0 16px', boxSizing:'border-box' as const }}
      onClick={e => { if (e.target === e.currentTarget) { closeMenus(); onClose(); } }}
    >
      <div className="anp-modal-in"
        style={{ backgroundColor:SCREEN, borderRadius:18, maxWidth:440, width:'100%', maxHeight:'90vh', display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 20px 60px rgba(0,0,0,0.28)' }}>

        {/* ── Header (req #8) ─────────────────────────────────────────────── */}
        <div style={{ backgroundColor:NAVY, padding:'13px 16px', display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' as const }}>
              {set.setLabel && (
                <span style={{ backgroundColor:'rgba(255,255,255,0.22)', borderRadius:4, padding:'2px 8px', fontSize:11, fontWeight:800, color:'#fff', letterSpacing:0.4, flexShrink:0 }}>{set.setLabel}</span>
              )}
              <span style={{ fontSize:17, fontWeight:800, color:'#fff', lineHeight:1.25, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const }}>{set.name}</span>
            </div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.60)', marginTop:3, fontWeight:600 }}>
              {lang === 'es' ? 'Creado' : 'Created'} {fmtDateFull(set.createdAt, lang)}
            </div>
          </div>
          {/* Edit button (req #3) */}
          {!isEdit && (
            <button onClick={enterEdit}
              style={{ height:28, padding:'0 10px', background:'transparent', border:'1.5px solid rgba(255,255,255,0.55)', borderRadius:6, color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', flexShrink:0, display:'flex', alignItems:'center', gap:4 }}>
              ✏ {lang === 'es' ? 'Editar' : 'Edit'}
            </button>
          )}
          <button style={{ background:'none', border:'none', color:'#fff', fontSize:22, fontWeight:700, lineHeight:1, cursor:'pointer', padding:'4px 4px', opacity:0.85, flexShrink:0 }} onClick={onClose}>✕</button>
        </div>

        {/* ── Stats strip — all 5 cards in one row, no scrolling ─────────── */}
        <div style={{ display:'flex', flexWrap:'nowrap' as const, gap:3, padding:'7px 10px', borderBottom:`1px solid ${BORDER}`, flexShrink:0 }}>
          {/* Points */}
          <div style={sdS.stat}>
            <span style={sdS.statLbl}>{lang === 'es' ? 'Puntos' : 'Points'}</span>
            <span style={sdS.statVal}>{sorted.length}</span>
          </div>
          {/* Benchmark */}
          {refPt && (
            <div style={{ ...sdS.stat, backgroundColor:'#FFF3CD', border:`1px solid #F5A623` }}>
              <span style={{ ...sdS.statLbl, color:GOLD_LBL }}>{lang === 'es' ? 'Ref.' : 'Bmark'}</span>
              <span style={{ ...sdS.statVal, color:GOLD_TXT }}>{(refPt.bmElevation ?? 0).toFixed(2)}<span style={{ fontSize:8, fontWeight:700, marginLeft:1 }}>ft</span></span>
            </div>
          )}
          {/* Highest */}
          {highElev != null && (
            <div style={sdS.stat}>
              <span style={sdS.statLbl}>{lang === 'es' ? 'Max' : 'High'}</span>
              <span style={sdS.statVal}>{highElev.toFixed(2)}<span style={{ fontSize:8, fontWeight:700, marginLeft:1 }}>ft</span></span>
            </div>
          )}
          {/* Lowest */}
          {lowElev != null && (
            <div style={sdS.stat}>
              <span style={sdS.statLbl}>{lang === 'es' ? 'Min' : 'Low'}</span>
              <span style={sdS.statVal}>{lowElev.toFixed(2)}<span style={{ fontSize:8, fontWeight:700, marginLeft:1 }}>ft</span></span>
            </div>
          )}
          {/* Average */}
          {avgElev != null && elevs.length > 1 && (
            <div style={sdS.stat}>
              <span style={sdS.statLbl}>{lang === 'es' ? 'Prom.' : 'Avg.'}</span>
              <span style={sdS.statVal}>{avgElev.toFixed(2)}<span style={{ fontSize:8, fontWeight:700, marginLeft:1 }}>ft</span></span>
            </div>
          )}
        </div>

        {/* ── Toast ──────────────────────────────────────────────────────────── */}
        {toastMsg && (
          <div style={{ position:'absolute', top:90, left:'50%', transform:'translateX(-50%)', backgroundColor:NAVY, color:'#fff', borderRadius:8, padding:'7px 16px', fontSize:13, fontWeight:700, zIndex:30, boxShadow:'0 4px 16px rgba(0,0,0,0.25)', pointerEvents:'none', whiteSpace:'nowrap' as const }}>
            {toastMsg}
          </div>
        )}

        {/* ── EDIT MODE (req #4) ─────────────────────────────────────────────── */}
        {isEdit ? (
          <div className="svs-edit-in" style={{ flex:1, overflowY:'auto', padding:'12px 14px', display:'flex', flexDirection:'column', gap:12 }}>

            {/* Set name */}
            <div>
              <div style={sdS.editLbl}>{lang === 'es' ? 'Nombre del Conjunto' : 'Set Name'}</div>
              <input
                ref={editNameRef}
                value={editName}
                onChange={e => { setEditName(e.target.value); setEditNameErr(false); }}
                style={{ width:'100%', height:42, borderRadius:8, border:`1.5px solid ${editNameErr ? RED : BORDER}`, padding:'0 12px', fontSize:15, fontWeight:600, color:TEXT_P, backgroundColor:CARD, outline:'none', boxSizing:'border-box' as const }}
              />
              {editNameErr && <div style={{ fontSize:11, color:RED, marginTop:3 }}>{lang === 'es' ? 'El nombre no puede estar vacío.' : 'Name cannot be empty.'}</div>}
            </div>

            {/* Known elevation (only if benchmark exists) */}
            {refPt && (
              <div>
                <div style={sdS.editLbl}>{lang === 'es' ? 'Elevación Conocida (ft)' : 'Known Elevation (ft)'}</div>
                <div style={{ fontSize:11, color:TEXT_D, marginBottom:5 }}>
                  {lang === 'es' ? `Punto de referencia: ${refPt.label}` : `Benchmark point: ${refPt.label}`}
                </div>
                <input
                  value={editBmElevStr}
                  onChange={e => setEditBmElevStr(e.target.value)}
                  inputMode="decimal"
                  placeholder="0.000"
                  style={{ width:'100%', height:42, borderRadius:8, border:`1.5px solid ${BORDER}`, padding:'0 12px', fontSize:16, fontWeight:700, color:GOLD_TXT, backgroundColor:CARD, outline:'none', boxSizing:'border-box' as const, fontFamily:'monospace' }}
                />
                <div style={{ fontSize:11, color:TEXT_D, marginTop:4 }}>
                  {lang === 'es' ? 'Todos los puntos derivados se recalcularán al guardar.' : 'All derived points will be recalculated on save.'}
                </div>
              </div>
            )}

            {/* Point list with remove toggles */}
            <div>
              <div style={sdS.editLbl}>{lang === 'es' ? 'Puntos del Conjunto' : 'Set Points'}</div>
              <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                {sorted.length === 0 && (
                  <div style={{ fontSize:13, color:TEXT_D, textAlign:'center', padding:'12px 0' }}>
                    {lang === 'es' ? 'Sin puntos' : 'No points'}
                  </div>
                )}
                {sorted.map(pt => {
                  const isPending = pendingRemovals.has(pt.id);
                  const ptType    = getType(pt);
                  const theme     = TYPE_THEME[ptType];
                  return (
                    <div key={pt.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 10px', borderRadius:8, border:`1px solid ${isPending ? RED : BORDER}`, backgroundColor:isPending ? '#FFF5F5' : CARD, opacity:isPending ? 0.65 : 1, transition:'all 0.18s ease' }}>
                      <div style={{ width:36, height:36, backgroundColor:BLUE_D, borderRadius:6, border:`1px solid ${BLUE}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        <span style={{ fontSize:10, fontWeight:800, color:BLUE_A }}>{pt.label}</span>
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:700, color: isPending ? RED : TEXT_P, textDecoration: isPending ? 'line-through' : 'none', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const }}>
                          {pt.pointName || pt.label}
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:5, marginTop:1 }}>
                          <span style={{ backgroundColor:theme.badgeBg, border:`1px solid ${theme.badgeBdr}`, borderRadius:3, padding:'1px 5px', fontSize:9, fontWeight:800, color:theme.badgeTxt }}>
                            {t(theme.labelKey)}
                          </span>
                          <span style={{ fontSize:10, fontWeight:600, color:TEXT_D, fontFamily:'monospace' }}>
                            {(pt.engineeringFeet ?? 0).toFixed(2)} ft
                          </span>
                        </div>
                      </div>
                      <button onClick={() => toggleRemoval(pt.id)}
                        style={{ height:28, padding:'0 9px', borderRadius:6, border:`1.5px solid ${isPending ? RED : BORDER}`, backgroundColor:isPending ? RED : 'transparent', color:isPending ? '#fff' : TEXT_S, fontSize:11, fontWeight:700, cursor:'pointer', flexShrink:0, transition:'all 0.15s' }}>
                        {isPending ? (lang === 'es' ? 'Deshacer' : 'Undo') : (lang === 'es' ? '✕ Quitar' : '✕ Remove')}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Edit mode buttons */}
            <div style={{ display:'flex', gap:8, paddingTop:4, paddingBottom:4 }}>
              <button onClick={() => { setIsEdit(false); setPendingRemovals(new Set()); }}
                style={{ flex:1, height:42, borderRadius:8, border:`1px solid ${BORDER}`, backgroundColor:SURFACE, color:TEXT_S, fontSize:14, fontWeight:700, cursor:'pointer' }}>
                {lang === 'es' ? 'Cancelar' : 'Cancel'}
              </button>
              <button onClick={handleSave}
                style={{ flex:2, height:42, borderRadius:8, border:'none', backgroundColor:NAVY, color:'#fff', fontSize:14, fontWeight:800, cursor:'pointer' }}>
                {lang === 'es' ? 'Guardar Cambios' : 'Save Changes'}
              </button>
            </div>
          </div>

        ) : (
        /* ── VIEW MODE ─────────────────────────────────────────────────────── */
          sorted.length === 0 ? (
            <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:32, gap:12 }}>
              <span style={{ fontSize:36 }}>📍</span>
              <p style={{ color:TEXT_S, textAlign:'center', margin:0 }}>{t('pointsInSet')}</p>
            </div>
          ) : (
            <div className="svs-fade-in"
              style={{ flex:1, overflowY:'auto', padding:10, display:'flex', flexDirection:'column', gap:8 }}
              onClick={closeMenus}
            >
              {sorted.map((pt, idx) => {
                const ptType = getType(pt);
                const theme  = TYPE_THEME[ptType];
                const hasBm  = (pt.bmElevation ?? 0) > 0;
                const addr   = pt.createdAddress;
                const lat    = pt.createdLatitude;
                const lon    = pt.createdLongitude;
                const isMenu = menuPtId === pt.id;
                const isMove = moveMenuPtId === pt.id;

                // Elevation cell colors: benchmark = gold, all others = charcoal (req #6)
                const elevLblColor = ptType === 'benchmark' ? GOLD_LBL : TEXT_S;
                const elevValColor = ptType === 'benchmark' ? GOLD_TXT : CHARCOAL;

                return (
                  <div key={pt.id} style={{ position:'relative' }}>
                    <div style={{ backgroundColor:CARD, borderRadius:8, border:`1px solid ${BORDER}`, borderLeft:`4px solid ${theme.border}`, padding:10, display:'flex', flexDirection:'column', gap:7 }}>

                      {/* Row 1: ID badge, name, index, menu */}
                      <div style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
                        <div style={{ width:42, height:42, backgroundColor:BLUE_D, borderRadius:6, border:`1px solid ${BLUE}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                          <span style={{ fontSize:13, fontWeight:800, color:BLUE_A, letterSpacing:0.4 }}>{pt.label}</span>
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:15, fontWeight:700, color: pt.pointName ? TEXT_P : TEXT_D, fontStyle: pt.pointName ? 'normal' : 'italic' }}>
                            {pt.pointName || (lang === 'es' ? 'Punto Sin Nombre' : 'Unnamed Point')}
                          </div>
                          {pt.takenBy && <div style={{ fontSize:12, fontWeight:600, color:TEXT_S, marginTop:1 }}>{pt.takenBy}</div>}
                        </div>
                        <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:3, flexShrink:0 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:3 }}>
                            <span style={{ fontSize:12, fontWeight:700, color:TEXT_S, backgroundColor:SURFACE, borderRadius:3, padding:'1px 6px' }}>#{idx + 1}</span>
                            <button
                              style={{ background:'none', border:'none', color:TEXT_D, fontSize:18, cursor:'pointer', padding:'2px 3px', lineHeight:1, borderRadius:4 }}
                              onClick={e => { e.stopPropagation(); setMoveMenuPtId(null); setMenuPtId(isMenu ? null : pt.id); }}>
                              ⋮
                            </button>
                          </div>
                          <span style={{ backgroundColor:theme.badgeBg, border:`1px solid ${theme.badgeBdr}`, borderRadius:4, padding:'2px 7px', fontSize:10, fontWeight:800, color:theme.badgeTxt }}>
                            {t(theme.labelKey)}
                          </span>
                        </div>
                      </div>

                      {/* Row 2: Rod + Elevation cells (req #6: elevation values dark charcoal) */}
                      <div style={{ display:'flex', gap:7 }}>
                        <div style={sdS.cell}>
                          <span style={sdS.cellLbl}>{t('rodReading')}</span>
                          <StackedFIFSpan feet={pt.rodFeet ?? '0'} inches={pt.rodInches ?? 0} frac={pt.rodFractionLabel ?? ''} color={CHARCOAL} size={16} />
                          <span style={{ ...sdS.cellSub, color:CHARCOAL }}>{(pt.engineeringFeet ?? 0).toFixed(2)} ft</span>
                        </div>
                        {hasBm && (
                          <div style={sdS.cell}>
                            <span style={{ ...sdS.cellLbl, color:elevLblColor }}>{t(ELEV_LABEL_KEY[ptType])}</span>
                            <span style={{ ...sdS.cellVal, color:elevValColor, fontWeight:800 }}>{(pt.bmElevation ?? 0).toFixed(3)} ft</span>
                          </div>
                        )}
                      </div>

                      {/* Address */}
                      {addr && (
                        <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, fontWeight:600, color:TEXT_P }}>
                          <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const }}>📍 {addr}</span>
                          {lat != null && lon != null && (
                            <a href={`https://www.google.com/maps/search/?api=1&query=${lat},${lon}`} target="_blank" rel="noreferrer"
                              style={{ backgroundColor:BLUE, borderRadius:4, padding:'3px 9px', color:'#fff', fontSize:11, fontWeight:800, textDecoration:'none' }}>
                              {t('svsMapBtn')}
                            </a>
                          )}
                        </div>
                      )}

                      {/* Timestamp */}
                      {pt.savedAt && (
                        <div style={{ fontSize:12, fontWeight:600, color:TEXT_S, borderTop:`1px solid ${BORDER}`, paddingTop:5 }}>
                          {t('svsRecorded')}: {fmtTimestamp(pt.savedAt)}
                        </div>
                      )}
                    </div>

                    {/* ── Overflow menu (req #7) ─────────────────────────────── */}
                    {isMenu && (
                      <div
                        style={{ position:'absolute', right:6, top:46, zIndex:20, backgroundColor:CARD, borderRadius:10, border:`1px solid ${BORDER}`, boxShadow:'0 8px 24px rgba(0,0,0,0.15)', overflow:'hidden', minWidth:195 }}
                        onClick={e => e.stopPropagation()}
                      >
                        {[
                          { icon:'✏️', label: lang === 'es' ? 'Editar Punto'          : 'Edit Point',            action: () => { showToast(lang === 'es' ? 'Próximamente…' : 'Coming soon…'); setMenuPtId(null); }, color: TEXT_P },
                          { icon:'🗑', label: lang === 'es' ? 'Quitar del Conjunto'   : 'Remove Point',          action: () => handleRemoveFromSet(pt), color: RED },
                          { icon:'↗️', label: lang === 'es' ? 'Mover a Otro Conjunto' : 'Move to Another Set',   action: () => { setMoveMenuPtId(isMove ? null : pt.id); }, color: BLUE_A },
                          { icon:'⧉', label: lang === 'es' ? 'Duplicar Punto'        : 'Duplicate Point',       action: () => handleDuplicate(), color: TEXT_P },
                          { icon:'⬇', label: lang === 'es' ? 'Exportar Punto'        : 'Export Point',          action: () => handleExportPoint(pt), color: GREEN },
                          { icon:'↑', label: lang === 'es' ? 'Compartir Punto'       : 'Share Point',           action: () => handleSharePoint(pt), color: NAVY },
                        ].map((item, i) => (
                          <button key={i}
                            style={{ display:'flex', alignItems:'center', gap:9, width:'100%', textAlign:'left' as const, padding:'10px 13px', fontSize:13, fontWeight:700, color:item.color, backgroundColor:'transparent', border:'none', borderTop: i === 0 ? 'none' : `1px solid ${BORDER}`, cursor:'pointer' }}
                            onClick={item.action}>
                            <span style={{ fontSize:15, width:18, textAlign:'center' as const }}>{item.icon}</span>
                            {item.label}
                          </button>
                        ))}

                        {/* Move to another set sub-panel */}
                        {isMove && (
                          <div style={{ borderTop:`1.5px solid ${BLUE_D}`, backgroundColor:'#F8FAFF' }}>
                            <div style={{ padding:'7px 13px 4px', fontSize:10, fontWeight:800, color:TEXT_D, letterSpacing:0.5 }}>
                              {lang === 'es' ? 'SELECCIONAR CONJUNTO' : 'SELECT SET'}
                            </div>
                            {otherSets.length === 0 ? (
                              <div style={{ padding:'6px 13px 10px', fontSize:12, color:TEXT_D }}>
                                {lang === 'es' ? 'Sin otros conjuntos' : 'No other sets'}
                              </div>
                            ) : (
                              otherSets.slice(0, 5).map(s => (
                                <button key={s.id}
                                  style={{ display:'flex', alignItems:'center', gap:7, width:'100%', textAlign:'left' as const, padding:'8px 13px', fontSize:12, fontWeight:700, color:NAVY, backgroundColor:'transparent', border:'none', borderTop:`1px solid ${BORDER}`, cursor:'pointer' }}
                                  onClick={() => handleMoveToSet(pt, s)}>
                                  {s.setLabel && <span style={{ backgroundColor:BLUE, borderRadius:3, padding:'1px 5px', fontSize:9, fontWeight:800, color:'#fff' }}>{s.setLabel}</span>}
                                  <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const }}>{s.name}</span>
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>
    </div>
  );
}

const sdS: Record<string, React.CSSProperties> = {
  // Stats row — req #2: smaller labels, single row
  stat:    { flex:1, minWidth:0, backgroundColor:SURFACE, borderRadius:6, padding:'5px 4px', display:'flex', flexDirection:'column', alignItems:'center', gap:1 },
  statLbl: { fontSize:8, fontWeight:700, color:TEXT_S, letterSpacing:0.1, whiteSpace:'nowrap' as const },
  statVal: { fontSize:12, fontWeight:800, color:TEXT_P, fontFamily:'monospace', lineHeight:1.25 },
  // Point cells
  cell:    { flex:1, backgroundColor:SURFACE, borderRadius:6, padding:'7px 9px', display:'flex', flexDirection:'column', gap:2 },
  cellLbl: { fontSize:11, fontWeight:800, color:TEXT_S, letterSpacing:0.4, textTransform:'uppercase' as const },
  cellVal: { fontSize:16, fontWeight:800, color:CHARCOAL, fontFamily:'monospace' },
  cellSub: { fontSize:12, fontWeight:600, color:CHARCOAL, fontFamily:'monospace' },
  // Edit mode
  editLbl: { fontSize:11, fontWeight:800, color:TEXT_S, letterSpacing:0.5, textTransform:'uppercase' as const, marginBottom:5 },
};

// ─── View All Sets Modal — no expand/collapse (req #1) ────────────────────────
function ViewAllSetsModal({ sets, points, currentIdx, onSelect, onClose }: {
  sets: SurveySet[]; points: SurveyPoint[];
  currentIdx: number; onSelect: (idx: number) => void; onClose: () => void;
}) {
  const { lang } = useLang();
  const [search, setSearch] = useState('');

  const filteredSets = useMemo(() => {
    if (!search.trim()) return sets;
    const q = search.toLowerCase();
    return sets.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.setLabel ?? '').toLowerCase().includes(q) ||
      points.some(p => p.setId === s.id && (
        p.label.toLowerCase().includes(q) ||
        (p.pointName ?? '').toLowerCase().includes(q)
      ))
    );
  }, [sets, points, search]);

  return (
    <div
      style={{ position:'fixed', inset:0, backgroundColor:'rgba(0,0,0,0.55)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:'0 16px', boxSizing:'border-box' as const }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="anp-modal-in"
        style={{ backgroundColor:SCREEN, borderRadius:18, maxWidth:440, width:'100%', maxHeight:'85vh', display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 20px 60px rgba(0,0,0,0.28)' }}>

        <div style={{ backgroundColor:NAVY, padding:'16px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <span style={{ fontSize:18, fontWeight:800, color:'#fff' }}>
            {lang === 'es' ? 'Ver Todos los Conjuntos' : 'View All Sets'}
          </span>
          <button style={{ background:'none', border:'none', color:'#fff', fontSize:24, fontWeight:700, lineHeight:1, cursor:'pointer', padding:'4px 6px', opacity:0.85 }} onClick={onClose}>✕</button>
        </div>

        <div style={{ padding:'8px 12px', borderBottom:`1px solid ${BORDER}`, flexShrink:0, backgroundColor:CARD }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder={lang === 'es' ? 'Buscar conjuntos o puntos…' : 'Search sets or points…'}
            style={{ width:'100%', height:34, borderRadius:7, border:`1px solid ${BORDER}`, padding:'0 10px', fontSize:13, color:TEXT_P, backgroundColor:SURFACE, outline:'none', boxSizing:'border-box' as const }} />
        </div>

        {/* Always-expanded set sections (req #1) */}
        <div style={{ flex:1, overflowY:'auto', padding:'8px 10px', display:'flex', flexDirection:'column', gap:6 }}>
          {filteredSets.length === 0 && (
            <div style={{ padding:'28px 0', textAlign:'center', color:TEXT_D, fontSize:13 }}>
              {lang === 'es' ? 'No se encontraron conjuntos.' : 'No sets found.'}
            </div>
          )}
          {filteredSets.map(s => {
            const origIdx   = sets.indexOf(s);
            const isCur     = origIdx === currentIdx;
            const setPoints = points.filter(p => p.setId === s.id)
              .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
            const ptCount   = setPoints.length;

            return (
              <div key={s.id} style={{ backgroundColor:CARD, borderRadius:10, border:`1.5px solid ${isCur ? BLUE_A : BORDER}`, overflow:'hidden' }}>

                {/* Set header — tap to navigate */}
                <div
                  style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px', backgroundColor:isCur ? BLUE_D : CARD, cursor:'pointer' }}
                  onClick={() => { onSelect(origIdx); onClose(); }}
                >
                  {s.setLabel && (
                    <span style={{ backgroundColor:BLUE, borderRadius:4, padding:'3px 8px', fontSize:12, fontWeight:800, color:'#fff', letterSpacing:0.4, flexShrink:0 }}>{s.setLabel}</span>
                  )}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:15, fontWeight:800, color:TEXT_P, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const }}>{s.name}</div>
                    <div style={{ fontSize:11, fontWeight:600, color:TEXT_S, marginTop:1 }}>
                      {strings[lang].svsPts(ptCount)} · {fmtDateFull(s.createdAt, lang)}
                    </div>
                  </div>
                  {isCur && <span style={{ fontSize:16, fontWeight:800, color:BLUE_A, flexShrink:0 }}>✓</span>}
                </div>

              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
interface Props { projectId: string }

export default function ViewSetsScreen({ projectId }: Props) {
  const { t, lang } = useLang();
  const { getSets, getPoints, deleteSet, deletePoints, updateSet } = useSurveyStore();
  const sets   = getSets(projectId);
  const points = getPoints(projectId);

  const [filter,       setFilter]       = useState<Filter>('latest');
  const [search,       setSearch]       = useState('');
  const [rawIdx,       setRawIdx]       = useState<number | null>(null);
  const [detailSet,    setDetailSet]    = useState<SurveySet | null>(null);
  const [showManage,   setShowManage]   = useState(false);
  const [showAllModal, setShowAllModal] = useState(false);
  const [exporting,    setExporting]    = useState(false);

  const displayed = useMemo(() => {
    let arr = [...sets];
    if (filter === 'latest') arr.sort((a, b) => b.updatedAt - a.updatedAt);
    if (filter === 'name')   arr.sort((a, b) => a.name.localeCompare(b.name));
    if (filter === 'search' && search.trim()) {
      const q = search.toLowerCase();
      arr = arr.filter(s => s.name.toLowerCase().includes(q) || (s.setLabel ?? '').toLowerCase().includes(q));
    }
    return arr;
  }, [sets, filter, search]);

  useEffect(() => { setRawIdx(null); }, [filter, search]);

  const curIdx  = rawIdx !== null ? Math.max(0, Math.min(rawIdx, displayed.length - 1)) : 0;
  const curSet  = displayed[curIdx] ?? null;
  const ptCount = curSet ? points.filter(p => p.setId === curSet.id).length : 0;

  const detailSetLive = detailSet ? sets.find(s => s.id === detailSet.id) ?? null : null;
  const detailPoints  = detailSetLive ? points.filter(p => p.setId === detailSetLive.id) : [];

  const handleRename = (newName: string) => {
    if (!curSet) return;
    updateSet(projectId, curSet.id, { name: newName });
  };

  const handleDeleteThis = () => {
    if (!curSet) return;
    setShowManage(false);
    if (!window.confirm(strings[lang].deleteSingleSet(curSet.name))) return;
    const ptIds = points.filter(p => p.setId === curSet.id).map(p => p.id);
    if (ptIds.length > 0) deletePoints(projectId, ptIds);
    deleteSet(projectId, curSet.id);
    setRawIdx(null);
  };

  const handleDeleteAll = () => {
    setShowManage(false);
    if (sets.length === 0) return;
    const allPtIds = points.map(p => p.id);
    if (allPtIds.length > 0) deletePoints(projectId, allPtIds);
    sets.forEach(s => deleteSet(projectId, s.id));
    setRawIdx(null);
  };

  const handleExport = async () => {
    if (sets.length === 0) return;
    setExporting(true);
    try { await exportSetsToXlsx(sets, points); } finally { setExporting(false); }
  };

  const FILTERS: { id: Filter; label: string }[] = [
    { id:'latest', label:t('setLatest') },
    { id:'name',   label:t('setByName') },
    { id:'search', label:t('setSearch') },
  ];

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', position:'relative' }}>

      {/* Filter tabs */}
      <div style={{ display:'flex', backgroundColor:'#EEF4FF', border:'1px solid #BFDBFE', borderRadius:10, padding:3, margin:'6px 8px', gap:3, flexShrink:0 }}>
        {FILTERS.map(f => {
          const isActive = filter === f.id;
          return (
            <button key={f.id} style={{
              flex:1, height:34, borderRadius:7, border:'none',
              backgroundColor: isActive ? NAVY : 'transparent',
              color: isActive ? '#fff' : '#6B7280',
              fontSize:15, fontWeight: isActive ? 700 : 600,
              cursor:'pointer', boxShadow: isActive ? '0 1px 4px rgba(20,58,99,0.30)' : 'none',
              whiteSpace:'nowrap' as const, overflow:'hidden',
              transition:'background-color 0.2s, color 0.2s, box-shadow 0.2s',
            }} onClick={() => setFilter(f.id)}>{f.label}</button>
          );
        })}
      </div>

      {/* Search input */}
      {filter === 'search' && (
        <div style={{ padding:'6px 10px', backgroundColor:CARD, borderBottom:`1px solid ${BORDER}` }}>
          <input
            style={{ width:'100%', height:36, borderRadius:6, border:`1px solid ${BORDER}`, padding:'0 10px', fontSize:15, color:TEXT_P, outline:'none', backgroundColor:SURFACE, boxSizing:'border-box' as const }}
            placeholder={t('searchSets')} value={search} onChange={e => setSearch(e.target.value)} autoFocus />
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'5px 10px', backgroundColor:CARD, borderBottom:`1px solid ${BORDER}`, flexShrink:0 }}>
        <span style={{ fontSize:13, fontWeight:800, color:TEXT_P, letterSpacing:0.6, textTransform:'uppercase' as const }}>
          {strings[lang].svsSets(sets.length)}
        </span>
        {sets.length > 0 && (
          <div style={{ display:'flex', gap:6 }}>
            <button
              style={{ height:30, padding:'0 11px', backgroundColor:exporting ? '#D1FAE5' : GREEN_D, border:`1px solid ${exporting ? '#6EE7B7' : GREEN_B}`, borderRadius:6, fontSize:13, fontWeight:700, color:exporting ? '#065F46' : GREEN, cursor:exporting ? 'default' : 'pointer', display:'flex', alignItems:'center', gap:5, whiteSpace:'nowrap' as const, transition:'background-color 0.15s' }}
              onClick={handleExport} disabled={exporting}>
              {exporting ? '⏳' : '⬇'} {lang === 'es' ? 'Exportar' : 'Export'}
            </button>
            <button
              style={{ height:30, padding:'0 12px', backgroundColor:BLUE_D, border:`1px solid ${BLUE}`, borderRadius:6, fontSize:13, fontWeight:700, color:BLUE_A, cursor:'pointer' }}
              onClick={() => setShowManage(true)}>
              {t('manageSets')}
            </button>
          </div>
        )}
      </div>

      {/* Body */}
      {displayed.length === 0 ? (
        <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:32, gap:12 }}>
          <span style={{ fontSize:40 }}>🗂</span>
          <p style={{ fontSize:15, fontWeight:700, color:TEXT_P, margin:0 }}>
            {filter === 'search' ? t('noSetsMatch') : t('noSetsYet')}
          </p>
          <p style={{ fontSize:13, color:TEXT_S, textAlign:'center', lineHeight:1.5, margin:0, maxWidth:260 }}>
            {filter === 'search' ? strings[lang].noSetsMatchDesc(search) : t('createFirstSet')}
          </p>
        </div>
      ) : (
        <div style={{ flex:1, overflowY:'auto', padding:'8px 10px', display:'flex', flexDirection:'column', gap:6 }}>
          {curSet && (
            <div style={{ backgroundColor:CARD, borderRadius:8, border:`1px solid ${BORDER}`, borderLeft:`4px solid ${BLUE}`, padding:'10px 12px', display:'flex', flexDirection:'column', gap:8 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                {curSet.setLabel && (
                  <span style={{ backgroundColor:BLUE, borderRadius:4, padding:'2px 7px', fontSize:12, fontWeight:800, color:'#fff', letterSpacing:0.5, flexShrink:0 }}>{curSet.setLabel}</span>
                )}
                <span style={{ fontSize:17, fontWeight:800, color:TEXT_P, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const }}>{curSet.name}</span>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'5px 10px' }}>
                <div>
                  <div style={{ fontSize:11, fontWeight:800, color:TEXT_S, letterSpacing:0.5, textTransform:'uppercase' as const, marginBottom:1 }}>{t('svsCreatedLabel')}</div>
                  <div style={{ fontSize:15, fontWeight:700, color:TEXT_P }}>{fmtDateFull(curSet.createdAt, lang)}</div>
                </div>
                <div>
                  <div style={{ fontSize:11, fontWeight:800, color:TEXT_S, letterSpacing:0.5, textTransform:'uppercase' as const, marginBottom:1 }}>{t('svsPointsLabel')}</div>
                  <div style={{ fontSize:15, fontWeight:700, color:BLUE_A }}>{ptCount}</div>
                </div>
              </div>
              <div style={{ display:'flex', gap:6 }}>
                <button style={{ flex:1, height:36, backgroundColor:BLUE_D, border:`1px solid ${BLUE}`, borderRadius:7, fontSize:14, fontWeight:700, color:BLUE_A, cursor:'pointer' }}
                  onClick={() => setDetailSet(curSet)}>{t('viewSetDetails')}</button>
                <button style={{ height:36, padding:'0 14px', backgroundColor:SURFACE, border:`1px solid ${BORDER}`, borderRadius:7, fontSize:14, fontWeight:700, color:TEXT_S, cursor:'pointer' }}
                  onClick={() => setShowAllModal(true)}>{t('viewAllSets')}</button>
              </div>
            </div>
          )}

          {displayed.length > 1 && (
            <div style={{ display:'flex', alignItems:'center', gap:5 }}>
              <button disabled={curIdx === 0}
                style={{ flex:1, height:34, backgroundColor:curIdx === 0 ? SURFACE : CARD, border:`1px solid ${curIdx === 0 ? BORDER : BLUE}`, borderRadius:6, fontSize:14, fontWeight:700, color:curIdx === 0 ? TEXT_D : BLUE_A, cursor:curIdx === 0 ? 'default' : 'pointer', opacity:curIdx === 0 ? 0.4 : 1 }}
                onClick={() => setRawIdx(curIdx - 1)}>← {t('prevSet')}</button>
              <span style={{ fontSize:13, fontWeight:700, color:TEXT_S, whiteSpace:'nowrap' as const }}>{curIdx + 1}/{displayed.length}</span>
              <button disabled={curIdx === displayed.length - 1}
                style={{ flex:1, height:34, backgroundColor:curIdx === displayed.length - 1 ? SURFACE : CARD, border:`1px solid ${curIdx === displayed.length - 1 ? BORDER : BLUE}`, borderRadius:6, fontSize:14, fontWeight:700, color:curIdx === displayed.length - 1 ? TEXT_D : BLUE_A, cursor:curIdx === displayed.length - 1 ? 'default' : 'pointer', opacity:curIdx === displayed.length - 1 ? 0.4 : 1 }}
                onClick={() => setRawIdx(curIdx + 1)}>{t('nextSet')} →</button>
            </div>
          )}

          <div style={{ height:54, borderTop:`1px dashed ${BORDER}`, display:'flex', alignItems:'center', justifyContent:'center', marginTop:4 }}>
            <span style={{ fontSize:10, color:TEXT_D, letterSpacing:0.8, fontWeight:600 }}>AD SPACE</span>
          </div>
        </div>
      )}

      {showManage && (
        <ManageSetModal curSet={curSet} allSets={sets}
          onRename={handleRename} onDeleteThis={handleDeleteThis}
          onDeleteAll={handleDeleteAll} onClose={() => setShowManage(false)} />
      )}

      {showAllModal && (
        <ViewAllSetsModal sets={displayed} points={points} currentIdx={curIdx}
          onSelect={idx => setRawIdx(idx)} onClose={() => setShowAllModal(false)} />
      )}

      {detailSetLive && (
        <SetDetailView set={detailSetLive} points={detailPoints}
          projectId={projectId} onClose={() => setDetailSet(null)} />
      )}
    </div>
  );
}
