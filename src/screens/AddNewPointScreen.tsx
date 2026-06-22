import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useSurveyStore } from '../stores/surveyStore';
import { SurveyPoint, SurveySet } from '../types';
import {
  INCHES_OPTIONS, FRACTION_OPTIONS,
  toEngFt, fromEngFt, fmtFIF, fmtTimestamp,
} from '../constants';
import { useLang } from '../LangContext';
import { strings } from '../i18n';

// ─── Color constants ───────────────────────────────────────────────────────────
const NAVY      = '#143A63';
const BLUE      = '#1E5799';
const BLUE_ACC  = '#3B82F6';
const BLUE_DEEP = 'rgba(30,87,153,0.12)';
const GOLD      = '#F2B533';
const BORDER    = '#E5E7EB';
const SURFACE   = '#F0EEE8';
const CARD      = '#FFFFFF';
const TEXT_PRI  = '#111827';
const TEXT_SEC  = '#374151';
const TEXT_DIS  = '#9CA3AF';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  projectId:        string;
  isVisible?:       boolean;
  onViewPoints?:    () => void;
  editPoint?:       SurveyPoint | null;
  onEditConsumed?:  () => void;
  onComparePoint?:  (fromId: string, toId: string | null) => void;
  onDirtyChange?:   (dirty: boolean) => void;
}

type RodFormat = 'fif' | 'eng';

// ─── Sub-modals ───────────────────────────────────────────────────────────────

interface ModalOverlayProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}
function ModalOverlay({ open, onClose, children }: ModalOverlayProps) {
  if (!open) return null;
  return (
    <div style={mStyle.overlay} onClick={onClose}>
      <div style={mStyle.sheet} onClick={e => e.stopPropagation()}>
        <div style={mStyle.handle} />
        {children}
      </div>
    </div>
  );
}

const mStyle: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)',
    display: 'flex', alignItems: 'flex-end', zIndex: 100,
  },
  sheet: {
    width: '100%', maxWidth: 480, margin: '0 auto',
    backgroundColor: CARD, borderRadius: '20px 20px 0 0',
    padding: '4px 16px 32px', display: 'flex', flexDirection: 'column', gap: 12,
  },
  handle: {
    alignSelf: 'center', width: 36, height: 4, borderRadius: 2,
    backgroundColor: BORDER, margin: '10px auto 4px',
  },
};

// ─── Create Set Modal ─────────────────────────────────────────────────────────
interface CreateSetProps {
  open: boolean; onClose: () => void;
  pointLabel: string; engFt: number; nextSetId: string;
  onCreate: (name: string) => void;
}
function CreateSetModal({ open, onClose, pointLabel, engFt, nextSetId, onCreate }: CreateSetProps) {
  const [name, setName] = useState('');
  const { t, lang } = useLang();
  return (
    <ModalOverlay open={open} onClose={onClose}>
      <h3 style={c.modalTitle}>{t('createSetTitle')}</h3>
      <p style={c.modalDesc}>
        {strings[lang].willBeFirstPoint(pointLabel, isNaN(engFt) ? '—' : engFt.toFixed(2))}
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <div style={c.setIdBadge}><span style={c.setIdText}>{nextSetId}</span></div>
        <div style={{ flex: 1 }}>
          <label style={c.fieldLbl}>{t('setNameLabel')}</label>
          <input
            style={c.input} value={name} onChange={e => setName(e.target.value)}
            placeholder={t('setNamePlaceholder')} autoFocus
            onKeyDown={e => { if (e.key === 'Enter' && name.trim()) { onCreate(name.trim()); setName(''); onClose(); } }}
          />
        </div>
      </div>
      <button
        style={{ ...c.saveBtn, opacity: name.trim() ? 1 : 0.4 }}
        disabled={!name.trim()}
        onClick={() => { if (name.trim()) { onCreate(name.trim()); setName(''); onClose(); } }}
      >
        {t('createSetBtn')}
      </button>
      <button style={c.cancelBtn} onClick={onClose}>{t('cancel')}</button>
    </ModalOverlay>
  );
}

// ─── Assign Set Modal ─────────────────────────────────────────────────────────
interface AssignSetProps {
  open: boolean; onClose: () => void;
  sets: SurveySet[]; allPoints: SurveyPoint[];
  pointLabel: string;
  onAssign: (setId: string) => void;
}
function AssignSetModal({ open, onClose, sets, allPoints, pointLabel, onAssign }: AssignSetProps) {
  const [chosen, setChosen] = useState<string | null>(null);
  const chosenSet = sets.find(s => s.id === chosen);
  const { t, lang } = useLang();

  const setDetail = (s: SurveySet) => {
    const pts = allPoints.filter(p => p.setId === s.id);
    if (pts.length === 0) return t('emptySet');
    return `${pts.length} point${pts.length !== 1 ? 's' : ''}`;
  };

  return (
    <ModalOverlay open={open} onClose={() => { setChosen(null); onClose(); }}>
      <h3 style={c.modalTitle}>{t('assignSetTitle')}</h3>
      <p style={c.modalDesc}>{strings[lang].addPointToSet(pointLabel)}</p>
      {sets.length === 0 ? (
        <p style={{ color: TEXT_DIS, textAlign: 'center', padding: '16px 0' }}>{t('noSetsCreateFirst')}</p>
      ) : (
        <div style={{ maxHeight: 240, overflowY: 'auto', border: `1px solid ${BORDER}`, borderRadius: 8 }}>
          {sets.map((s, i) => (
            <div
              key={s.id}
              style={{
                ...c.setRow,
                backgroundColor: chosen === s.id ? BLUE_DEEP : 'transparent',
                borderBottom: i < sets.length - 1 ? `1px solid ${BORDER}` : 'none',
              }}
              onClick={() => setChosen(s.id)}
            >
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  {s.setLabel && (
                    <span style={c.setLblBadge}>{s.setLabel}</span>
                  )}
                  <span style={c.setName}>{s.name}</span>
                </div>
                <span style={c.setDetail}>{setDetail(s)}</span>
              </div>
              {chosen === s.id && <span style={{ color: BLUE_ACC, fontWeight: 700 }}>✓</span>}
            </div>
          ))}
        </div>
      )}
      {chosen && (
        <button style={c.saveBtn} onClick={() => { onAssign(chosen); setChosen(null); onClose(); }}>
          {strings[lang].assignToSetBtn(chosenSet?.name ?? '')}
        </button>
      )}
      <button style={c.cancelBtn} onClick={() => { setChosen(null); onClose(); }}>{t('cancel')}</button>
    </ModalOverlay>
  );
}

// ─── Quick-edit modal (Point Name / Taken By) ─────────────────────────────────
interface QuickEditProps {
  open: boolean; title: string; placeholder: string;
  value: string; onClose: () => void;
  onSave: (val: string) => void;
}
function QuickEditModal({ open, title, placeholder, value, onClose, onSave }: QuickEditProps) {
  const [tmp, setTmp] = useState(value);
  const { t } = useLang();
  useEffect(() => { if (open) setTmp(value); }, [open, value]);
  return (
    <ModalOverlay open={open} onClose={onClose}>
      <h3 style={c.modalTitle}>{title}</h3>
      <input
        style={{ ...c.input, borderColor: BLUE }}
        value={tmp} onChange={e => setTmp(e.target.value)}
        placeholder={placeholder} autoFocus
        onKeyDown={e => { if (e.key === 'Enter') { onSave(tmp.trim()); onClose(); } }}
      />
      <button style={c.saveBtn} onClick={() => { onSave(tmp.trim()); onClose(); }}>{t('save')}</button>
      <button style={c.cancelBtn} onClick={onClose}>{t('cancel')}</button>
    </ModalOverlay>
  );
}

// ─── Info tooltip ─────────────────────────────────────────────────────────────
function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [tipPos, setTipPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const { t } = useLang();

  const handleToggle = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const tipW = 248;
      const margin = 10;
      let left = rect.left - tipW / 2 + rect.width / 2;
      left = Math.max(margin, Math.min(left, window.innerWidth - tipW - margin));
      setTipPos({ top: rect.bottom + 6, left });
    }
    setOpen(v => !v);
  };

  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        ref={btnRef}
        style={{ background: 'none', border: 'none', color: BLUE_ACC, fontSize: 13, cursor: 'pointer', lineHeight: 1, padding: '0 2px' }}
        onClick={handleToggle}
      >ⓘ</button>
      {open && (
        <div style={{
          position: 'fixed', top: tipPos.top, left: tipPos.left,
          backgroundColor: CARD, border: `1px solid ${BORDER}`, borderRadius: 10,
          padding: '10px 14px', width: 248, fontSize: 12, color: TEXT_SEC,
          boxShadow: '0 4px 20px rgba(0,0,0,0.18)', zIndex: 9999, lineHeight: 1.5,
        }}>
          {text}
          <br />
          <button
            style={{ marginTop: 8, background: BLUE, color: '#fff', border: 'none', borderRadius: 6, padding: '4px 12px', fontSize: 11, cursor: 'pointer', fontWeight: 700 }}
            onClick={() => setOpen(false)}
          >{t('gotIt')}</button>
        </div>
      )}
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AddNewPointScreen({ projectId, isVisible = true, editPoint, onEditConsumed, onComparePoint, onDirtyChange }: Props) {
  const { getPoints, addPoint, updatePoint, getSets, addSet, nextLabel, nextSetLabel } = useSurveyStore();
  const { t } = useLang();

  const points = getPoints(projectId);
  const sets   = getSets(projectId);

  const [currentIdx,  setCurrentIdx]  = useState(-1);   // -1 = new blank point; always start fresh
  const [rodFormat,   setRodFormat]   = useState<RodFormat>('fif');
  const [rodFeet,     setRodFeet]     = useState('');
  const [rodInches,   setRodInches]   = useState(0);
  const [rodFracDec,  setRodFracDec]  = useState(0);
  const [rodFracLbl,  setRodFracLbl]  = useState('0/0');
  const [engFtStr,    setEngFtStr]    = useState('');
  const [bmElevStr,   setBmElevStr]   = useState('');
  const [pointName,   setPointName]   = useState('');
  const [takenBy,     setTakenBy]     = useState('');
  const [savedAt,     setSavedAt]     = useState<string | null>(null);
  const [assignedSet, setAssignedSet] = useState<string | null>(null);
  const [setAssignMethod, setSetAssignMethod] = useState<'existing' | 'new' | null>(null);
  const [pendingNewSet, setPendingNewSet] = useState<SurveySet | null>(null);
  const [locationTxt, setLocationTxt] = useState<string | null>(null);
  const [savedLat,    setSavedLat]    = useState<number | null>(null);
  const [savedLon,    setSavedLon]    = useState<number | null>(null);
  const [isEditMode,  setIsEditMode]  = useState(true);
  const [showCreate,     setShowCreate]     = useState(false);
  const [showAssign,     setShowAssign]     = useState(false);
  const [showNameModal,  setShowNameModal]  = useState(false);
  const [saveMsg,        setSaveMsg]        = useState<string | null>(null);
  const [setWarning,     setSetWarning]     = useState(false);
  const [newSetElevWarn, setNewSetElevWarn] = useState(false);
  const [showSetPanel,   setShowSetPanel]   = useState(false);
  const [cameFromNewPoint, setCameFromNewPoint] = useState(false);
  const viewSetBtnRef = useRef<HTMLButtonElement>(null);
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const savedNewPointRef = useRef<{
    rodFeet: string; rodInches: number; rodFracDec: number; rodFracLbl: string;
    engFtStr: string; bmElevStr: string; pointName: string; takenBy: string;
    assignedSet: string | null;
  } | null>(null);

  const lockRef = useRef(false);

  // ── Derived values ────────────────────────────────────────────────────────
  const currentPoint  = currentIdx >= 0 && currentIdx < points.length ? points[currentIdx] : null;
  const currentLabel  = currentPoint?.label ?? nextLabel(projectId);
  const engFt         = parseFloat(engFtStr);
  const isNewPoint    = currentIdx < 0 || currentIdx >= points.length;
  // pendingNewSet is staged in memory; fall back to store only for existing sets
  const assignedSetObj = pendingNewSet?.id === assignedSet
    ? pendingNewSet
    : sets.find(s => s.id === assignedSet);

  // ── Set reference point (for auto-derived BM) ─────────────────────────────
  const setReferencePoint = (() => {
    if (!assignedSet) return null;
    return points
      .filter(p => p.setId === assignedSet && (p.bmElevation ?? 0) > 0)
      .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))[0] ?? null;
  })();

  const currentIsSetReference = setReferencePoint?.id === currentPoint?.id;
  const refBmPoint = (setReferencePoint && !currentIsSetReference) ? setReferencePoint : null;
  const autoDerivedBm: number | null =
    (refBmPoint && !isNaN(engFt) && engFt > 0)
      ? refBmPoint.bmElevation + (refBmPoint.engineeringFeet - engFt)
      : null;
  const showManualBm = !setReferencePoint || currentIsSetReference;
  const isKnownElevation = currentIsSetReference && (currentPoint?.bmElevation ?? 0) > 0;

  const fifDisplay = (rodFeet || rodInches > 0) ? fmtFIF(rodFeet, rodInches, rodFracLbl) : '';
  const engDisplay = !isNaN(engFt) && engFt > 0 ? `${engFt.toFixed(2)} ft` : '';

  // ── Dirty detection (unsaved data in edit mode) ───────────────────────────
  const isDirty = isEditMode && (rodFeet !== '' || rodInches > 0 || rodFracDec > 0 || engFtStr !== '' || bmElevStr !== '');
  useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange]);

  // ── Set-point panel helpers ───────────────────────────────────────────────
  // setPoints: used for nav arrows (only points in the *assigned* set)
  const setPoints = assignedSet
    ? points.filter(p => p.setId === assignedSet).sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
    : [];
  const setPointIdx = currentPoint ? setPoints.findIndex(p => p.id === currentPoint.id) : -1;

  const goPrevInSet = () => {
    if (setPointIdx > 0) {
      const gi = points.findIndex(p => p.id === setPoints[setPointIdx - 1].id);
      if (gi >= 0) goTo(gi);
    }
  };
  const goNextInSet = () => {
    if (setPointIdx >= 0 && setPointIdx < setPoints.length - 1) {
      const gi = points.findIndex(p => p.id === setPoints[setPointIdx + 1].id);
      if (gi >= 0) goTo(gi);
    }
  };

  const toggleSetDropdown = () => {
    if (!showSetPanel && viewSetBtnRef.current) {
      const r = viewSetBtnRef.current.getBoundingClientRect();
      // Dropdown is at least 200 px wide so point names aren't clipped,
      // but never bleeds off-screen on narrow phones.
      const dropW = Math.min(Math.max(r.width, 200), window.innerWidth - 8);
      const left  = Math.min(r.left, window.innerWidth - dropW - 4);
      setDropdownRect({ top: r.bottom + 2, left, width: dropW });
    }
    setShowSetPanel(v => !v);
  };

  // Last used set: set associated with the most recently updated point that has a setId
  const lastUsedSet = (() => {
    const pointsWithSet = points.filter(p => p.setId);
    if (pointsWithSet.length === 0) return sets[0] ?? null;
    const mostRecent = pointsWithSet.reduce((a, b) => (a.updatedAt > b.updatedAt ? a : b));
    return sets.find(s => s.id === mostRecent.setId) ?? sets[0] ?? null;
  })();

  // dropdownSetId / dropdownPoints: what the "View All Points Of This Set" dropdown shows.
  // On a new-point page (assignedSet = null), falls back to lastUsedSet so the button
  // is always visible as long as any set exists.
  const dropdownSetId = assignedSet ?? (lastUsedSet?.id ?? null);
  const dropdownPoints = dropdownSetId
    ? points.filter(p => p.setId === dropdownSetId).sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
    : [];

  // ── Load point into form ───────────────────────────────────────────────────
  const loadPoint = useCallback((pt: SurveyPoint) => {
    lockRef.current = true;
    setRodFeet(pt.rodFeet ?? '');
    setRodInches(pt.rodInches ?? 0);
    setRodFracDec(pt.rodFractionDec ?? 0);
    setRodFracLbl(pt.rodFractionLabel ?? '0/0');
    setEngFtStr(pt.engineeringFeet > 0 ? String(pt.engineeringFeet) : '');
    setBmElevStr(pt.bmElevation > 0 ? String(pt.bmElevation) : '');
    setPointName(pt.pointName ?? '');
    setTakenBy(pt.takenBy ?? '');
    setSavedAt(pt.savedAt ?? null);
    setAssignedSet(pt.setId ?? null);
    setSetAssignMethod(pt.setId ? 'existing' : null);
    setLocationTxt(pt.createdAddress ?? null);
    setSavedLat(pt.createdLatitude ?? null);
    setSavedLon(pt.createdLongitude ?? null);
    setTimeout(() => { lockRef.current = false; }, 50);
  }, []);

  const clearForm = () => {
    setRodFeet(''); setRodInches(0); setRodFracDec(0); setRodFracLbl('0/0');
    setEngFtStr(''); setBmElevStr('');
    setPointName(''); setTakenBy(''); setSavedAt(null);
    setAssignedSet(null); setLocationTxt(null); setSavedLat(null); setSavedLon(null);
    setSetWarning(false); setNewSetElevWarn(false); setShowSetPanel(false); setDropdownRect(null); setSetAssignMethod(null); setPendingNewSet(null);
  };

  // ── Edit point injection ───────────────────────────────────────────────────
  useEffect(() => {
    if (!editPoint) return;
    const idx = points.findIndex(p => p.id === editPoint.id);
    if (idx >= 0) { setCurrentIdx(idx); loadPoint(points[idx]); setIsEditMode(true); }
    onEditConsumed?.();
  }, [editPoint]);

  // Reset to a blank new point every time the tab becomes visible
  useEffect(() => {
    if (!isVisible) return;
    if (editPoint) return;   // editPoint handler takes precedence
    clearForm();
    setCurrentIdx(-1);
    setIsEditMode(true);
    setRodFormat('fif');
    setCameFromNewPoint(false);
    savedNewPointRef.current = null;
  }, [isVisible]);

  const goTo = (idx: number) => {
    if (idx < 0 || idx >= points.length) return;
    setCurrentIdx(idx); loadPoint(points[idx]); setIsEditMode(false);
  };

  const openNewPoint = () => {
    clearForm(); setCurrentIdx(-1); setIsEditMode(true); setRodFormat('fif');
    setCameFromNewPoint(false); savedNewPointRef.current = null;
  };

  // ── Back To Main Page: restore the new-point form the user was on before browsing ──
  const handleBackToMain = () => {
    setCameFromNewPoint(false);
    setCurrentIdx(-1);
    setIsEditMode(true);
    setRodFormat('fif');
    setShowSetPanel(false);
    setDropdownRect(null);
    if (savedNewPointRef.current) {
      const d = savedNewPointRef.current;
      lockRef.current = true;
      setRodFeet(d.rodFeet);
      setRodInches(d.rodInches);
      setRodFracDec(d.rodFracDec);
      setRodFracLbl(d.rodFracLbl);
      setEngFtStr(d.engFtStr);
      setBmElevStr(d.bmElevStr);
      setPointName(d.pointName);
      setTakenBy(d.takenBy);
      // Restore set only if it's a real persisted set (discard any stale pending-set id)
      const restoredSet = d.assignedSet ? sets.find(s => s.id === d.assignedSet) : null;
      setAssignedSet(restoredSet ? d.assignedSet : null);
      setSetAssignMethod(restoredSet ? 'existing' : null);
      setPendingNewSet(null);
      savedNewPointRef.current = null;
      setTimeout(() => { lockRef.current = false; }, 50);
    }
  };

  // ── Rod format sync ────────────────────────────────────────────────────────
  const updateFromFI = (feet: string, inches: number, frac: number, fracLbl: string) => {
    if (lockRef.current) return;
    lockRef.current = true;
    setRodFeet(feet); setRodInches(inches); setRodFracDec(frac); setRodFracLbl(fracLbl);
    const eng = toEngFt(feet, inches, frac);
    setEngFtStr(isNaN(eng) || (feet === '' && inches === 0 && frac === 0) ? '' : eng.toFixed(2));
    lockRef.current = false;
  };

  const updateFromEng = (val: string) => {
    setEngFtStr(val);
    if (lockRef.current) return;
    const eng = parseFloat(val);
    if (!isNaN(eng) && eng >= 0) {
      lockRef.current = true;
      const { feet, inches, fraction, frLabel } = fromEngFt(eng);
      setRodFeet(feet); setRodInches(inches); setRodFracDec(fraction); setRodFracLbl(frLabel);
      lockRef.current = false;
    }
  };

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    const eng = parseFloat(engFtStr);
    if (isNaN(eng) || eng <= 0) { alert(t('rodReadingAlert')); return; }
    if (!assignedSet) { setSetWarning(true); return; }
    setSetWarning(false);
    // Block save if "Create New Set" is selected but no elevation entered
    if (setAssignMethod === 'new' && showManualBm && (!bmElevStr || isNaN(parseFloat(bmElevStr)) || parseFloat(bmElevStr) <= 0)) {
      setNewSetElevWarn(true);
      return;
    }
    // Flush pending new set to storage before persisting the point
    if (pendingNewSet && assignedSet === pendingNewSet.id) {
      addSet(projectId, pendingNewSet);
      setPendingNewSet(null);
    }

    const bm   = autoDerivedBm != null
      ? autoDerivedBm
      : (bmElevStr.trim() === '' ? 0 : parseFloat(bmElevStr));
    const elev = bm + eng;
    const now  = Date.now();
    const iso  = new Date(now).toISOString();

    // GPS via browser API
    let createdLatitude: number | undefined;
    let createdLongitude: number | undefined;
    let createdAddress: string | undefined;
    try {
      if ('geolocation' in navigator) {
        const pos = await new Promise<GeolocationPosition>((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 })
        );
        createdLatitude  = pos.coords.latitude;
        createdLongitude = pos.coords.longitude;
        createdAddress = `${createdLatitude.toFixed(5)}, ${createdLongitude.toFixed(5)}`;
        // Reverse geocode via nominatim (free, no key)
        try {
          const r = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${createdLatitude}&lon=${createdLongitude}`,
            { headers: { 'Accept-Language': 'en' } }
          );
          const data = await r.json();
          if (data.display_name) createdAddress = data.display_name;
        } catch { /* geocoding optional */ }
      }
    } catch { /* GPS optional */ }

    setLocationTxt(createdAddress ?? null);
    setSavedLat(createdLatitude ?? null);
    setSavedLon(createdLongitude ?? null);

    if (isNewPoint) {
      const label = nextLabel(projectId);
      const pt: SurveyPoint = {
        id: `pt-${now}`, projectId, label,
        pointName: pointName.trim() || undefined,
        takenBy:   takenBy.trim() || undefined,
        setId:     assignedSet ?? undefined,
        rodFeet, rodInches, rodFractionDec: rodFracDec, rodFractionLabel: rodFracLbl,
        engineeringFeet: eng, bmElevation: bm, elevation: elev,
        savedAt: iso, createdAt: now, updatedAt: now,
        ...(createdLatitude  != null ? { createdLatitude  } : {}),
        ...(createdLongitude != null ? { createdLongitude } : {}),
        ...(createdAddress   != null ? { createdAddress   } : {}),
      };
      addPoint(projectId, pt);
      setSaveMsg(t('pointSaved'));
      setTimeout(() => { setSaveMsg(null); openNewPoint(); }, 1200);
    } else if (currentPoint) {
      updatePoint(projectId, currentPoint.id, {
        pointName: pointName.trim() || undefined,
        takenBy:   takenBy.trim() || undefined,
        setId:     assignedSet ?? undefined,
        rodFeet, rodInches, rodFractionDec: rodFracDec, rodFractionLabel: rodFracLbl,
        engineeringFeet: eng, bmElevation: bm, elevation: elev, savedAt: iso,
        ...(createdLatitude  != null ? { createdLatitude  } : {}),
        ...(createdLongitude != null ? { createdLongitude } : {}),
        ...(createdAddress   != null ? { createdAddress   } : {}),
      });
      setSaveMsg(t('pointUpdated'));
      setTimeout(() => { setSaveMsg(null); openNewPoint(); }, 1200);
    }
  };

  const handleCompareThis = () => {
    if (!currentPoint || !onComparePoint) return;
    let prevId: string | null = null;
    if (currentPoint.setId) {
      const sameSetPts = points
        .filter(p => p.setId === currentPoint.setId && p.id !== currentPoint.id)
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      prevId = sameSetPts[0]?.id ?? null;
    }
    onComparePoint(currentPoint.id, prevId);
  };

  const handleCreateSet = (name: string) => {
    const now = Date.now();
    const label = nextSetLabel(projectId);
    const newSet: SurveySet = {
      id: `set-${now}`, projectId, setLabel: label, name,
      datum: (!isNaN(engFt) ? (parseFloat(bmElevStr) || 0) + engFt : undefined),
      createdAt: now, updatedAt: now,
    };
    // Stage in memory only — not written to storage until Save Point
    setPendingNewSet(newSet);
    setAssignedSet(newSet.id);
    setSetAssignMethod('new');
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, width: '100%', boxSizing: 'border-box' }}>

      {/* Save toast */}
      {saveMsg && (
        <div style={{
          position: 'fixed', top: 70, left: '50%', transform: 'translateX(-50%)',
          backgroundColor: '#16A34A', color: '#fff', padding: '8px 20px',
          borderRadius: 20, fontSize: 13, fontWeight: 700, zIndex: 200,
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
        }}>{saveMsg}</div>
      )}

      {/* Point nav header */}
      <div style={{ backgroundColor: CARD, borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
        <div style={s.pointNav}>
          {/* Left arrow — only for existing points in a set */}
          {!isNewPoint && setPoints.length > 0 && (
            <button
              style={{ ...s.setNavArrow, opacity: setPointIdx <= 0 ? 0.4 : 1 }}
              disabled={setPointIdx <= 0}
              onClick={goPrevInSet}
            >‹</button>
          )}
          <span style={s.navLabel}>{currentLabel}</span>
          <button style={s.inlineBtn} onClick={() => setShowNameModal(true)} title="Edit point name">
            {pointName || t('pointName')}
          </button>
          {/* View All Set Points OR Back To Main Page — hidden in edit-from-card mode */}
          {cameFromNewPoint ? (
            <button style={s.backToMainBtn} onClick={handleBackToMain}>
              {t('backToMainPage')}
            </button>
          ) : (dropdownSetId && !editPoint) ? (
            <button ref={viewSetBtnRef} style={s.viewSetDropBtn} onClick={toggleSetDropdown}>
              {t('viewAllSetPoints')} {showSetPanel ? '▲' : '▼'}
            </button>
          ) : null}
          <div style={{ flex: 1 }} />
          {!isNewPoint && !isEditMode && (
            <button style={s.editBtn} onClick={() => setIsEditMode(true)}>{t('edit')}</button>
          )}
          {!isNewPoint && isEditMode && currentPoint && (
            <button style={s.undoBtn} onClick={() => { loadPoint(currentPoint); setIsEditMode(false); }}>↩</button>
          )}
          {/* Right arrow */}
          {!isNewPoint && setPoints.length > 0 && (
            <button
              style={{ ...s.setNavArrow, opacity: (setPointIdx < 0 || setPointIdx >= setPoints.length - 1) ? 0.4 : 1 }}
              disabled={setPointIdx < 0 || setPointIdx >= setPoints.length - 1}
              onClick={goNextInSet}
            >›</button>
          )}
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 80 }}>

        {/* ── Rod Reading + Benchmark card ── */}
        <div style={s.card}>

          {/* Section header row */}
          <div style={s.secRow}>
            <span style={s.secLbl}>{t('rodReading')}</span>
            <InfoTip text={t('rodInfoTip')} />
            <div style={{ flex: 1 }} />
            <button style={{ ...s.fmtBtn, ...(rodFormat === 'fif' ? s.fmtBtnOn : {}) }} onClick={() => setRodFormat('fif')}>
              {t('feetInchesBtn')}
            </button>
            <button style={{ ...s.fmtBtn, ...(rodFormat === 'eng' ? s.fmtBtnOn : {}) }} onClick={() => setRodFormat('eng')}>
              {t('engineeringFtBtn')}
            </button>
          </div>

          {/* Rod reading inputs */}
          {rodFormat === 'fif' ? (
            <>
              <div style={{ ...s.rodBox, backgroundColor: '#E6E6E6' }}>
                {/* Feet */}
                <div style={s.rodPart}>
                  <span style={s.rodPartLbl}>{t('feetLabel')}</span>
                  <input
                    style={{ ...s.rodFeetInput, opacity: isEditMode ? 1 : 0.7 }}
                    type="text" inputMode="numeric" pattern="[0-9]*" value={rodFeet}
                    onChange={e => {
                      const v = e.target.value;
                      if (v === '' || /^\d+$/.test(v)) {
                        updateFromFI(v, rodInches, rodFracDec, rodFracLbl);
                      }
                    }}
                    onFocus={(e) => {
                      if (rodFeet === '0') {
                        e.target.value = '';
                        updateFromFI('', rodInches, rodFracDec, rodFracLbl);
                      }
                    }}
                    onKeyDown={e => {
                      const allowed = ['Backspace','Delete','ArrowLeft','ArrowRight','Tab','Home','End'];
                      if (!allowed.includes(e.key) && !/^\d$/.test(e.key)) e.preventDefault();
                    }}
                    placeholder="" readOnly={!isEditMode}
                  />
                </div>
                <div style={s.rodDiv} />
                {/* Inches */}
                <div style={s.rodPart}>
                  <span style={s.rodPartLbl}>{t('inchesLabel')}</span>
                  <select
                    style={s.rodSelect} value={String(rodInches)}
                    onChange={e => updateFromFI(rodFeet, parseInt(e.target.value, 10), rodFracDec, rodFracLbl)}
                    disabled={!isEditMode}
                  >
                    {INCHES_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div style={s.rodDiv} />
                {/* Fraction */}
                <div style={s.rodPart}>
                  <span style={s.rodPartLbl}>{t('fracLabel')}</span>
                  <select
                    style={s.rodSelect} value={String(rodFracDec)}
                    onChange={e => {
                      const dec = parseFloat(e.target.value);
                      const lbl = FRACTION_OPTIONS.find(o => Math.abs(parseFloat(o.value) - dec) < 0.001)?.label ?? '0/0';
                      updateFromFI(rodFeet, rodInches, dec, lbl);
                    }}
                    disabled={!isEditMode}
                  >
                    {FRACTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                {/* Clear */}
                {isEditMode && (
                  <>
                    <div style={s.rodDiv} />
                    <button style={s.clearAllBtn} onClick={() => updateFromFI('', 0, 0, '0/0')}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: TEXT_SEC, textAlign: 'center' as const }}>{t('clearBtn')}</span>
                    </button>
                  </>
                )}
              </div>
              {engDisplay && (
                <div style={s.autoGenRow}>
                  <span style={s.autoGenLbl}>{t('autoGenEngFt')}:</span>
                  <span style={s.autoGenVal}>{engFtStr}′</span>
                </div>
              )}
            </>
          ) : (
            <>
              <input
                style={{ ...s.engInput, border: `1.5px solid ${isEditMode ? BLUE_ACC : BORDER}` }}
                type="text" inputMode="decimal" value={engFtStr}
                onChange={e => {
                  const v = e.target.value;
                  if (v === '' || /^\d*\.?\d*$/.test(v)) updateFromEng(v);
                }}
                onFocus={(e) => {
                  if (engFtStr !== '' && parseFloat(engFtStr) === 0) {
                    e.target.value = '';
                    updateFromEng('');
                  }
                }}
                placeholder="" readOnly={!isEditMode}
              />
              {fifDisplay && fifDisplay !== '—' && (
                <div style={s.autoGenRow}>
                  <span style={s.autoGenLbl}>{t('autoGenFIF')}:</span>
                  <span style={s.autoGenVal}>{fifDisplay}</span>
                </div>
              )}
            </>
          )}

          <div style={s.sep} />

          {/* ── Benchmark section ── */}
          {!showManualBm ? (
            <div style={s.autoBmBox}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={s.autoBmLbl}>{t('derivedBenchmark')}</span>
                <span style={s.autoBmDesc}>
                  {t('derivedFrom')} {refBmPoint!.label}{refBmPoint!.pointName ? ` (${refBmPoint!.pointName})` : ''}
                </span>
              </div>
              <div style={s.autoBmRight}>
                <span style={s.autoBmVal}>
                  {autoDerivedBm != null ? autoDerivedBm.toFixed(2) : (engFt > 0 ? '…' : '—')}
                </span>
                <span style={s.autoBmUnit}>ft</span>
              </div>
            </div>
          ) : isKnownElevation && !isEditMode ? (
            <div style={s.autoBmBox}>
              <div style={{ flex: 1 }}>
                <span style={s.autoBmLbl}>{t('pointElevation')}</span>
              </div>
              <div style={s.autoBmRight}>
                <span style={s.autoBmVal}>{currentPoint!.bmElevation.toFixed(2)}</span>
                <span style={s.autoBmUnit}>ft</span>
              </div>
            </div>
          ) : (
            <div style={s.bmRow}>
              <span style={s.bmTxt}>{t('benchmarkText')}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  style={{ ...s.bmInput, opacity: isEditMode ? 1 : 0.7 }}
                  type="number" step="0.0001" value={bmElevStr}
                  onChange={e => { setBmElevStr(e.target.value); setNewSetElevWarn(false); }}
                  placeholder="" readOnly={!isEditMode}
                />
                <span style={{ fontSize: 13, color: TEXT_PRI, fontWeight: 700 }}>ft</span>
              </div>
            </div>
          )}
        </div>

        {/* ── Set Assignment ── */}
        <div style={{ ...s.card, ...(setWarning && !assignedSetObj ? { border: `1.5px solid #EF4444` } : {}) }}>
          <div style={s.secRow}>
            <span style={s.secLbl}>{t('setAssignment')}</span>
            <InfoTip text={t('setInfoTip')} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {/* Button 1: Add to Current Set — only shown when a set exists */}
            {sets.length > 0 && lastUsedSet && (
              <button
                style={{
                  ...s.setAssignBtn,
                  ...(setAssignMethod === 'existing'
                    ? s.setAssignBtnActive
                    : setAssignMethod === 'new' ? s.setAssignBtnDim : {}),
                }}
                onClick={() => {
                  // Already selected — single-click does nothing; double-click clears
                  if (setAssignMethod === 'existing') return;
                  setPendingNewSet(null); // discard any staged new set
                  setAssignedSet(lastUsedSet.id);
                  setSetAssignMethod('existing');
                  setSetWarning(false);
                }}
                onDoubleClick={() => {
                  if (setAssignMethod === 'existing') {
                    setAssignedSet(null);
                    setSetAssignMethod(null);
                  }
                }}
              >
                {setAssignMethod === 'existing' && assignedSetObj
                  ? `✓ ${t('currentSetLabel')}: ${[assignedSetObj.setLabel, assignedSetObj.name].filter(Boolean).join(' • ')}`
                  : `${t('addToExistingSet')}: ${[lastUsedSet.setLabel, lastUsedSet.name].filter(Boolean).join(' • ')}`
                }
              </button>
            )}

            {/* Button 2: Create New Set */}
            <button
              style={{
                ...s.setAssignBtn,
                ...(setAssignMethod === 'new'
                  ? s.setAssignBtnActive
                  : setAssignMethod === 'existing' ? s.setAssignBtnDim : {}),
              }}
              onClick={() => {
                // Already selected — single-click does nothing; double-click clears
                if (setAssignMethod === 'new') return;
                if (showManualBm && (!bmElevStr || isNaN(parseFloat(bmElevStr)) || parseFloat(bmElevStr) <= 0)) {
                  setNewSetElevWarn(true);
                  return;
                }
                setNewSetElevWarn(false);
                setShowCreate(true);
              }}
              onDoubleClick={() => {
                if (setAssignMethod === 'new') {
                  setAssignedSet(null);
                  setSetAssignMethod(null);
                  setPendingNewSet(null);
                }
              }}
            >
              {setAssignMethod === 'new' && assignedSetObj
                ? `✓ ${t('newSetLabel')}: ${[assignedSetObj.setLabel, assignedSetObj.name].filter(Boolean).join(' • ')}`
                : t('createNewSetBtn')
              }
            </button>

            {newSetElevWarn && <div style={s.warnMsg}>⚠ {t('elevRequiredForSet')}</div>}
            {setWarning && <div style={s.warnMsg}>⚠ {t('noSetWarning')}</div>}
          </div>
        </div>

        {/* ── Save / Update / Post-save actions ── */}
        {(isNewPoint || isEditMode) ? (
          <button style={s.saveBtn} onClick={handleSave}>
            {isNewPoint ? t('savePoint') : t('updatePoint')}
          </button>
        ) : currentPoint && (
          <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <button style={s.compareBtn} onClick={handleCompareThis}>
              {t('compareThisReading')}
            </button>
            <button style={s.slopeBtn} onClick={() => alert(t('comingSoon'))}>
              {t('findSlope')}
            </button>
          </div>
        )}

        {/* ── Timestamp + Location ── */}
        {savedAt && (
          <div style={s.timestampCard}>
            <span style={s.savedAt}>{t('recordedLabel')} {fmtTimestamp(savedAt)}</span>
            {locationTxt ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <span style={{ fontSize: 12 }}>📍</span>
                <span style={{ flex: 1, fontSize: 12, color: TEXT_SEC, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {locationTxt}
                </span>
                {savedLat != null && savedLon != null && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${savedLat},${savedLon}`}
                    target="_blank" rel="noreferrer"
                    style={s.mapsBtn}
                  >{t('openMaps')}</a>
                )}
              </div>
            ) : (
              <span style={{ fontSize: 12, color: TEXT_DIS }}>{t('locationUnavailable')}</span>
            )}
          </div>
        )}
      </div>

      {/* ── Set points dropdown overlay (position:fixed, no layout shift) ── */}
      {showSetPanel && dropdownRect && dropdownSetId && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 499 }}
          onClick={() => setShowSetPanel(false)}
        >
          <div
            style={{
              position: 'fixed',
              top: dropdownRect.top,
              left: dropdownRect.left,
              width: dropdownRect.width,
              backgroundColor: CARD,
              border: `1px solid ${BORDER}`,
              borderRadius: 6,
              boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
              zIndex: 500,
              maxHeight: 130,
              overflowY: 'auto',
            }}
            onClick={e => e.stopPropagation()}
          >
            {dropdownPoints.length === 0
              ? <div style={{ padding: '10px', color: TEXT_DIS, fontSize: 13, textAlign: 'center' }}>{t('noSetPointsYet')}</div>
              : dropdownPoints.map(pt => (
                <div
                  key={pt.id}
                  style={{ ...s.setPointRow, overflow: 'hidden', flexWrap: 'nowrap', backgroundColor: pt.id === currentPoint?.id ? BLUE_DEEP : 'transparent' }}
                  onClick={() => {
                    // If on a brand-new unsaved point, save form state so Back can restore it
                    if (isNewPoint && !cameFromNewPoint) {
                      savedNewPointRef.current = { rodFeet, rodInches, rodFracDec, rodFracLbl, engFtStr, bmElevStr, pointName, takenBy, assignedSet };
                      setCameFromNewPoint(true);
                    }
                    const gi = points.findIndex(p => p.id === pt.id);
                    if (gi >= 0) goTo(gi);
                    setShowSetPanel(false);
                  }}
                >
                  <span style={{ fontWeight: 700, color: BLUE_ACC, fontSize: 13, flexShrink: 0 }}>{pt.label}</span>
                  <span style={{ color: TEXT_SEC, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}> — {pt.pointName || t('unnamedPoint')}</span>
                </div>
              ))
            }
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      <CreateSetModal
        open={showCreate} onClose={() => setShowCreate(false)}
        pointLabel={currentLabel} engFt={parseFloat(engFtStr) || 0}
        nextSetId={nextSetLabel(projectId)} onCreate={handleCreateSet}
      />
      <AssignSetModal
        open={showAssign} onClose={() => setShowAssign(false)}
        sets={sets} allPoints={points}
        pointLabel={currentLabel} onAssign={id => { setAssignedSet(id); setSetWarning(false); }}
      />
      <QuickEditModal
        open={showNameModal} title={t('pointName')} placeholder={t('pointNamePlaceholder')}
        value={pointName} onClose={() => setShowNameModal(false)}
        onSave={v => {
          setPointName(v);
          if (currentPoint) updatePoint(projectId, currentPoint.id, { pointName: v || undefined });
        }}
      />
    </div>
  );
}

// ─── Shared modal styles ─────────────────────────────────────────────────────

const c: Record<string, React.CSSProperties> = {
  modalTitle: { fontSize: 16, fontWeight: 700, color: TEXT_PRI, textAlign: 'center', margin: 0 },
  modalDesc:  { fontSize: 13, color: TEXT_SEC, textAlign: 'center', lineHeight: 1.5, margin: 0 },
  fieldLbl:   { display: 'block', fontSize: 10, fontWeight: 800, color: TEXT_SEC, letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 4 },
  input:      { height: 42, width: '100%', backgroundColor: '#f9f9f9', border: `1.5px solid ${BORDER}`, borderRadius: 6, padding: '0 12px', fontSize: 14, color: TEXT_PRI, outline: 'none', boxSizing: 'border-box' },
  saveBtn:    { height: 44, width: '100%', backgroundColor: BLUE, border: 'none', borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' },
  cancelBtn:  { height: 40, width: '100%', backgroundColor: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT_SEC, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  setIdBadge: { backgroundColor: BLUE_DEEP, border: `1px solid ${BLUE}`, borderRadius: 6, padding: '6px 10px', flexShrink: 0 },
  setIdText:  { fontSize: 13, fontWeight: 800, color: BLUE_ACC, letterSpacing: '0.5px' },
  setRow:     { display: 'flex', alignItems: 'center', padding: '10px 12px', cursor: 'pointer' },
  setName:    { fontSize: 13, fontWeight: 700, color: BLUE_ACC },
  setDetail:  { fontSize: 11, color: TEXT_SEC },
  setLblBadge:{ backgroundColor: BLUE, borderRadius: 4, padding: '1px 5px', fontSize: 9, fontWeight: 800, color: '#fff', letterSpacing: '0.4px' },
};

// ─── Component styles ─────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  pointNav: {
    display: 'flex', alignItems: 'center', gap: 6,
    backgroundColor: CARD, padding: '5px 10px',
  },
  setNavArrow:   { width: 26, height: 26, borderRadius: 5, backgroundColor: NAVY, border: 'none', color: '#fff', fontSize: 18, fontWeight: 700, cursor: 'pointer', flexShrink: 0, padding: 0 },
  // View All: single-line (whiteSpace:nowrap) so height matches Point Name;
  // flexShrink:1 + ellipsis lets it shrink gracefully on cramped rows.
  viewSetDropBtn:{ flexShrink: 1, minWidth: 90, maxWidth: 170, backgroundColor: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 5, padding: '5px 10px', fontSize: 11, fontWeight: 700, color: BLUE, cursor: 'pointer', whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center' as const },
  // Back To Main Page: maxWidth 100 forces the label to wrap onto exactly 2 lines.
  backToMainBtn: { flexShrink: 1, minWidth: 80, maxWidth: 100, backgroundColor: NAVY, border: 'none', borderRadius: 5, padding: '4px 6px', fontSize: 10, fontWeight: 700, color: '#fff', cursor: 'pointer', lineHeight: 1.35, textAlign: 'center' as const },
  setPointRow:   { display: 'flex', alignItems: 'center', padding: '7px 10px', cursor: 'pointer', borderBottom: `1px solid ${BORDER}` },
  navArrow: {
    width: 28, height: 28, borderRadius: 6, backgroundColor: SURFACE,
    border: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 18, cursor: 'pointer', color: TEXT_PRI, lineHeight: 1, padding: 0, flexShrink: 0,
  },
  navCenter: { flex: 1, minWidth: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 },
  navLabel:  { fontSize: 16, fontWeight: 700, color: TEXT_PRI, flexShrink: 0 },
  inlineBtn: {
    backgroundColor: CARD, borderRadius: 6, padding: '5px 14px',
    border: `1.5px solid ${BLUE_ACC}`, fontSize: 13, fontWeight: 700,
    color: BLUE, cursor: 'pointer', minWidth: 100, maxWidth: 150,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
  },
  newBtn:       { backgroundColor: BLUE, borderRadius: 6, padding: '5px 12px', color: '#fff', fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', flexShrink: 0 },
  newBtnDisabled: { backgroundColor: '#9CA3AF', opacity: 0.6, cursor: 'default' },
  editBtn:      { backgroundColor: BLUE, borderRadius: 6, padding: '5px 12px', color: '#fff', fontSize: 13, fontWeight: 700, border: `1px solid ${BLUE_ACC}`, cursor: 'pointer', flexShrink: 0 },
  undoBtn:      { width: 28, height: 28, borderRadius: 6, backgroundColor: SURFACE, border: `1px solid ${BORDER}`, fontSize: 14, cursor: 'pointer', color: TEXT_SEC, flexShrink: 0 },

  card:    { backgroundColor: CARD, borderRadius: 12, border: `1px solid ${BORDER}`, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 },
  sep:     { height: 1, backgroundColor: '#F3F4F6', margin: '2px 0' },
  secRow:  { display: 'flex', alignItems: 'center', gap: 4 },
  secLbl:  { fontSize: 13, fontWeight: 800, color: TEXT_PRI, letterSpacing: '0.8px', textTransform: 'uppercase' },

  fmtBtn:    { padding: '3px 8px', borderRadius: 4, backgroundColor: SURFACE, border: `1px solid ${BORDER}`, fontSize: 12, fontWeight: 800, color: TEXT_SEC, cursor: 'pointer', letterSpacing: '0.2px' },
  fmtBtnOn:  { backgroundColor: BLUE, border: `1px solid ${BLUE}`, color: '#fff' } as React.CSSProperties,

  rodBox:      { display: 'flex', border: `1.5px solid ${BLUE_ACC}`, borderRadius: 6, backgroundColor: '#FAFAF8', overflow: 'hidden', minHeight: 64 },
  rodPart:     { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '6px 4px', gap: 4 },
  rodPartLbl:  { fontSize: 11, fontWeight: 800, color: TEXT_PRI, letterSpacing: '0.5px', textAlign: 'center' },
  rodFeetInput:{ width: '100%', height: 38, border: `1px solid ${BORDER}`, borderRadius: 4, textAlign: 'center', fontSize: 17, fontWeight: 700, color: TEXT_PRI, background: '#fff', outline: 'none', padding: 0 },
  rodSelect:   { width: '100%', height: 36, border: `1px solid ${BORDER}`, borderRadius: 4, textAlign: 'center', fontSize: 15, fontWeight: 700, color: TEXT_PRI, background: '#fff', outline: 'none', cursor: 'pointer' },
  rodDiv:      { width: 1, backgroundColor: '#F3F4F6', flexShrink: 0 },
  clearAllBtn: { width: 40, border: 'none', borderLeft: `1px solid #F3F4F6`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backgroundColor: `${SURFACE}88` },

  engInput:   { height: 40, width: '100%', backgroundColor: '#FFFFFF', border: `1.5px solid ${BORDER}`, borderRadius: 6, textAlign: 'center', fontSize: 17, fontWeight: 700, color: TEXT_PRI, outline: 'none', boxSizing: 'border-box', padding: '0 12px' },
  autoGenRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, flexWrap: 'wrap' as const },
  autoGenLbl: { fontSize: 13, color: TEXT_PRI, fontWeight: 600 },
  autoGenVal: { fontSize: 13, color: BLUE, fontWeight: 700 },
  warnMsg:    { fontSize: 12, color: '#EF4444', fontWeight: 600, padding: '4px 0' },

  autoBmBox:   { display: 'flex', alignItems: 'center', gap: 12, backgroundColor: NAVY, borderRadius: 6, padding: '7px 10px', border: '1.5px solid #2A5898' },
  knownElevBox:{ border: `1.5px solid ${GOLD}`, backgroundColor: '#1A3A5C' } as React.CSSProperties,
  autoBmLbl:   { fontSize: 12, fontWeight: 800, color: '#FFFFFF', letterSpacing: '0.6px', textTransform: 'uppercase' },
  autoBmDesc:  { fontSize: 12, color: '#F5F7FA', lineHeight: 1.5 },
  autoBmRight: { display: 'flex', alignItems: 'flex-end', gap: 3 },
  autoBmVal:   { fontSize: 20, fontWeight: 700, color: '#fff', fontFamily: 'monospace' },
  autoBmUnit:  { fontSize: 13, fontWeight: 700, color: '#F5F7FA', marginBottom: 2 },

  bmRow:   { display: 'flex', alignItems: 'center', gap: 8 },
  bmTxt:   { flex: 1, fontSize: 13, color: TEXT_PRI, lineHeight: 1.5, fontWeight: 600 },
  bmInput: { width: 92, height: 38, backgroundColor: '#FFFFFF', border: `1.5px solid #6B7280`, borderRadius: 6, textAlign: 'center', fontSize: 14, fontWeight: 700, color: TEXT_PRI, outline: 'none' },

  assignedBadge:  { display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: BLUE_DEEP, borderRadius: 6, padding: '8px 10px' },
  setLblBadge:    { backgroundColor: BLUE, borderRadius: 4, padding: '1px 5px', fontSize: 9, fontWeight: 800, color: '#fff', letterSpacing: '0.4px' },
  setOptBtnPri:   { width: '100%', backgroundColor: BLUE, border: 'none', borderRadius: 6, padding: '8px 12px', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left' },
  setOptBtnSec:   { width: '100%', backgroundColor: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '8px 12px', color: TEXT_SEC, fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left' },
  // Always-visible set assignment buttons
  setAssignBtn:    { width: '100%', backgroundColor: '#1B3858', border: '3px solid transparent', borderRadius: 7, padding: '5px 12px', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', textAlign: 'left' as const, lineHeight: 1.3 },
  setAssignBtnActive: { backgroundColor: NAVY, border: `3px solid ${GOLD}` } as React.CSSProperties,
  setAssignBtnDim: { backgroundColor: BLUE, border: '3px solid transparent' } as React.CSSProperties,
  removeAssignBtn: { width: '100%', background: 'none', border: 'none', color: '#EF4444', fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'center' as const, padding: '2px 0' },

  timestampCard:{ backgroundColor: CARD, borderRadius: 8, border: `1px solid #F3F4F6`, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 2 },
  savedAt:      { fontSize: 11, color: TEXT_SEC, textAlign: 'center', lineHeight: 1.5, fontWeight: 600 },
  mapsBtn:      { backgroundColor: BLUE, borderRadius: 4, padding: '3px 8px', color: '#fff', fontSize: 9, fontWeight: 800, textDecoration: 'none', flexShrink: 0 },

  saveBtn:    { height: 40, width: '100%', backgroundColor: BLUE, border: 'none', borderRadius: 10, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.3px' },
  compareBtn: { height: 36, flex: 1, minWidth: 120, backgroundColor: NAVY, border: 'none', borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.3px' },
  slopeBtn:   { height: 36, flex: 1, minWidth: 120, backgroundColor: SURFACE, border: `1.5px solid ${BORDER}`, borderRadius: 10, color: TEXT_SEC, fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.3px' },
};
