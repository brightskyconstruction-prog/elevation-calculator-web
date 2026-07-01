import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useSurveyStore } from '../stores/surveyStore';
import { SurveyPoint, SurveySet } from '../types';
import {
  INCHES_OPTIONS, FRACTION_OPTIONS,
  toEngFt, fromEngFt, fmtFIF, fmtTimestamp,
} from '../constants';
import { useLang } from '../LangContext';
import { strings } from '../i18n';
import { SinglePointTab } from './ViewPointsScreen';

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

// ─── Public API exposed to App.tsx via imperativeRef ─────────────────────────

export interface AddNewPointScreenAPI {
  /** Current manage-overlay state */
  getManageState: () => { showManagePoint: boolean; editingFromManage: boolean };
  /** Go back from edit form to manage overlay (Back button equivalent) */
  goBackFromEdit:  () => void;
  /** Close the manage overlay and reset form to blank new-point state */
  closeManage:     () => void;
  /** Reset form to blank new-point state (without touching manage overlay) */
  reset:           () => void;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  projectId:        string;
  isVisible?:       boolean;
  onViewPoints?:    () => void;
  editPoint?:       SurveyPoint | null;
  onEditConsumed?:  () => void;
  onComparePoint?:  (fromId: string, toId: string | null) => void;
  onDirtyChange?:   (dirty: boolean) => void;
  /** Callback when user selects Edit on a point inside Manage Point overlay */
  onEditPoint?:     (pt: SurveyPoint) => void;
  /** Callback: open Slope tab with fromId pre-populated */
  onFindSlope?:     (fromId: string, toId: string | null) => void;
  /** Ref populated by this component so App.tsx can drive back-navigation */
  imperativeRef?:   React.MutableRefObject<AddNewPointScreenAPI | null>;
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
  pointLabel: string; engFt: number; fifDisplay: string; nextSetId: string;
  onCreate: (name: string) => void;
}
function CreateSetModal({ open, onClose, pointLabel, engFt, fifDisplay, nextSetId, onCreate }: CreateSetProps) {
  const [name, setName] = useState('');
  const { t, lang } = useLang();
  return (
    <ModalOverlay open={open} onClose={onClose}>
      <h3 style={c.modalTitle}>{t('createSetTitle')}</h3>
      <p style={c.modalDesc}>
        {strings[lang].willBeFirstPoint(
          pointLabel,
          fifDisplay || '—',
          isNaN(engFt) ? '—' : engFt.toFixed(2),
        )}
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
  /** Optional element rendered to the right of the title (e.g. View All Set Points button) */
  headerAction?: React.ReactNode;
  /** Optional validation: return an error string to block save, or null to allow */
  validate?: (val: string) => string | null;
  /** Inline content rendered directly below the title row (e.g. anchored dropdown list) */
  dropdownContent?: React.ReactNode;
}
function QuickEditModal({ open, title, placeholder, value, onClose, onSave, headerAction, validate, dropdownContent }: QuickEditProps) {
  const [tmp, setTmp]         = useState(value);
  const [validErr, setValidErr] = useState<string | null>(null);
  const { t } = useLang();
  useEffect(() => { if (open) { setTmp(value); setValidErr(null); } }, [open, value]);

  const handleSave = () => {
    const trimmed = tmp.trim();
    if (validate) {
      const err = validate(trimmed);
      if (err) { setValidErr(err); return; }
    }
    setValidErr(null);
    onSave(trimmed);
    onClose();
  };

  return (
    <ModalOverlay open={open} onClose={onClose}>
      {/* ✕ close — top-right corner, above the title row */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 2, marginTop: -4 }}>
        <button
          style={{
            background: 'none', border: 'none', color: TEXT_PRI,
            fontSize: 22, fontWeight: 900, lineHeight: 1,
            cursor: 'pointer', padding: '2px 4px', flexShrink: 0,
          }}
          onClick={onClose}
          aria-label="Close"
        >✕</button>
      </div>
      {/* Title row + optional action (e.g. View All Set Points button) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 2 }}>
        <h3 style={{ ...c.modalTitle, flex: 1, textAlign: 'left', fontSize: 19, margin: 0 }}>
          {title}
        </h3>
        {headerAction}
      </div>
      {/* Inline dropdown list — renders immediately below the title row when open */}
      {dropdownContent}
      <input
        style={{ ...c.input, borderColor: BLUE, fontSize: 16, height: 46 }}
        value={tmp}
        onChange={e => { setTmp(e.target.value); setValidErr(null); }}
        placeholder={placeholder} autoFocus
        onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
      />
      {/* Duplicate / validation error */}
      {validErr && (
        <div style={{ fontSize: 13, color: '#DC2626', lineHeight: 1.4, padding: '2px 0' }}>
          ⚠ {validErr}
        </div>
      )}
      <button
        style={{ ...c.saveBtn, fontSize: 16, padding: '13px 0', height: 'auto' }}
        onClick={handleSave}
      >{t('save')}</button>
    </ModalOverlay>
  );
}

// ─── Duplicate point name alert dialog ───────────────────────────────────────
interface DupNameModalProps {
  conflict: { name: string; label: string } | null;
  onClose: () => void;
}
function DupNameModal({ conflict, onClose }: DupNameModalProps) {
  const { t, lang } = useLang();
  if (!conflict) return null;
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      backgroundColor: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '0 24px',
    }}>
      <div style={{
        backgroundColor: CARD, borderRadius: 18,
        padding: '28px 22px 22px',
        maxWidth: 400, width: '100%',
        boxShadow: '0 12px 40px rgba(0,0,0,0.32)',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        {/* Warning icon + title */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, paddingBottom: 4 }}>
          <span style={{ fontSize: 34, lineHeight: 1 }}>⚠️</span>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: TEXT_PRI, textAlign: 'center' }}>
            {t('dupNameTitle')}
          </h3>
        </div>
        {/* Body lines */}
        <p style={{ margin: 0, fontSize: 14, color: TEXT_SEC, textAlign: 'center', lineHeight: 1.6 }}>
          {t('dupNameBody1')}
        </p>
        <p style={{ margin: 0, fontSize: 14, color: TEXT_PRI, textAlign: 'center', fontWeight: 700, lineHeight: 1.6 }}>
          {strings[lang].dupNameAssigned(conflict.name, conflict.label)}
        </p>
        <p style={{ margin: 0, fontSize: 14, color: TEXT_SEC, textAlign: 'center', lineHeight: 1.6, paddingBottom: 4 }}>
          {t('dupNameBody2')}
        </p>
        {/* OK button */}
        <button
          style={{
            height: 46, width: '100%', backgroundColor: BLUE,
            border: 'none', borderRadius: 10,
            color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer',
          }}
          onClick={onClose}
        >{t('okBtn')}</button>
      </div>
    </div>
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

export default function AddNewPointScreen({ projectId, isVisible = true, editPoint, onEditConsumed, onComparePoint, onDirtyChange, onFindSlope, imperativeRef }: Props) {
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
  const [isEditMode,      setIsEditMode]      = useState(true);
  const [cameFromEditMode, setCameFromEditMode] = useState(false); // true when navigated here via Edit from SinglePoint tab
  const [showCreate,     setShowCreate]     = useState(false);
  const [showAssign,     setShowAssign]     = useState(false);
  const [showNameModal,  setShowNameModal]  = useState(false);
  const [saveMsg,        setSaveMsg]        = useState<string | null>(null);
  const [setWarning,        setSetWarning]        = useState(false);
  const [newSetElevWarn,    setNewSetElevWarn]    = useState(false);
  const [rodReadingWarn,    setRodReadingWarn]    = useState(false);
  const [dupConflict,       setDupConflict]       = useState<{ name: string; label: string } | null>(null);
  const [showManagePoint,   setShowManagePoint]   = useState(false);
  const [editingFromManage, setEditingFromManage] = useState(false); // true = overlay mounted but hidden while editing a point from it
  const [showSetPanel,   setShowSetPanel]   = useState(false);
  const [cameFromNewPoint, setCameFromNewPoint] = useState(false);
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

  const fifDisplay      = (rodFeet || rodInches > 0) ? fmtFIF(rodFeet, rodInches, rodFracLbl) : '';
  const engDisplay      = !isNaN(engFt) && engFt > 0 ? `${engFt.toFixed(2)} ft` : '';
  const hasRodReading   = !isNaN(engFt) && engFt > 0;

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

  const toggleSetDropdown = () => setShowSetPanel(v => !v);

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
    setSetWarning(false); setNewSetElevWarn(false); setRodReadingWarn(false); setDupConflict(null); setShowSetPanel(false); setSetAssignMethod(null); setPendingNewSet(null);
  };

  // ── Edit point injection ───────────────────────────────────────────────────
  useEffect(() => {
    if (!editPoint) return;
    const idx = points.findIndex(p => p.id === editPoint.id);
    if (idx >= 0) { setCurrentIdx(idx); loadPoint(points[idx]); setIsEditMode(true); setCameFromEditMode(true); }
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
    setEditingFromManage(false);
    savedNewPointRef.current = null;
  }, [isVisible]);

  // ── Expose imperative API to App.tsx for global back-navigation ──────────────
  useEffect(() => {
    if (!imperativeRef) return;
    imperativeRef.current = {
      getManageState: () => ({ showManagePoint, editingFromManage }),
      goBackFromEdit:  () => setEditingFromManage(false),
      closeManage:     () => { setShowManagePoint(false); setEditingFromManage(false); openNewPoint(); },
      reset:           () => openNewPoint(),
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showManagePoint, editingFromManage, imperativeRef]);

  const goTo = (idx: number) => {
    if (idx < 0 || idx >= points.length) return;
    setCurrentIdx(idx); loadPoint(points[idx]);
    // If we're in the edit-from-SinglePoint flow, preserve edit mode and cameFromEditMode
    // so the "View All" button stays hidden across arrow navigation
    if (!cameFromEditMode) setIsEditMode(false);
  };

  const openNewPoint = () => {
    clearForm(); setCurrentIdx(-1); setIsEditMode(true); setRodFormat('fif');
    setCameFromNewPoint(false); setCameFromEditMode(false); setEditingFromManage(false); savedNewPointRef.current = null;
  };

  // ── Back To Main Page: restore the new-point form the user was on before browsing ──
  const handleBackToMain = () => {
    setCameFromNewPoint(false);
    setCurrentIdx(-1);
    setIsEditMode(true);
    setRodFormat('fif');
    setShowSetPanel(false);
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
    setRodReadingWarn(false);
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
    setRodReadingWarn(false);
  };

  // ── Duplicate-name helpers ─────────────────────────────────────────────────
  // findDupConflict: returns the conflicting point, or null if name is unique.
  const findDupConflict = (name: string, setId: string, selfId?: string) => {
    const norm = name.trim().toLowerCase();
    if (!norm) return null;
    return points.find(p =>
      p.setId === setId &&
      p.id !== selfId &&
      (p.pointName ?? '').trim().toLowerCase() === norm
    ) ?? null;
  };

  // checkDupName: string-form validator used by QuickEditModal.validate prop.
  const checkDupName = (name: string, setId: string, selfId?: string): string | null => {
    const conflict = findDupConflict(name, setId, selfId);
    if (!conflict) return null;
    return `Point name already exists in this set. "${name.trim()}" is already assigned to ${conflict.label}. Please choose a different name.`;
  };

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    const eng = parseFloat(engFtStr);
    if (isNaN(eng) || eng <= 0) { alert(t('rodReadingAlert')); return; }
    if (!assignedSet) { setSetWarning(true); return; }
    setSetWarning(false);
    // Duplicate point-name check — opens modal dialog on conflict
    const conflictPt = findDupConflict(pointName, assignedSet, currentPoint?.id);
    if (conflictPt) { setDupConflict({ name: pointName.trim(), label: conflictPt.label }); return; }
    setDupConflict(null);
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

  const handleFindSlope = () => {
    if (!currentPoint || !onFindSlope) return;
    // Find the immediately preceding point in the set (by createdAt order)
    let prevId: string | null = null;
    if (currentPoint.setId) {
      const setOrdered = points
        .filter(p => p.setId === currentPoint.setId)
        .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
      const idx = setOrdered.findIndex(p => p.id === currentPoint.id);
      if (idx > 0) prevId = setOrdered[idx - 1].id;
    }
    onFindSlope(currentPoint.id, prevId);
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
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, width: '100%', boxSizing: 'border-box', position: 'relative' }}>

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
          {/* Point Name — read-only span when viewing, button when editing/new */}
          {(!isEditMode && !isNewPoint) ? (
            <span style={s.inlineLbl}>
              {pointName || t('unnamedPoint')}
            </span>
          ) : (
            <button style={s.inlineBtn} onClick={() => setShowNameModal(true)} title="Edit point name">
              {pointName || t('pointName')}
            </button>
          )}
          {/* Back → only when browsing from new-point flow */}
          {cameFromNewPoint && (
            <button style={s.backToMainBtn} onClick={handleBackToMain}>
              ← {t('back')}
            </button>
          )}
          {/* Back → only when a point was opened via Edit from Manage Point overlay (read-only or edit) */}
          {editingFromManage && !isNewPoint && (
            <button style={s.backToMainBtn} onClick={() => setEditingFromManage(false)}>
              ← {t('back')}
            </button>
          )}
          <div style={{ flex: 1 }} />
          {!isNewPoint && !isEditMode && (
            <button style={s.editIconBtn} onClick={() => setIsEditMode(true)} title={t('edit')} aria-label={t('edit')}>
              ✏
            </button>
          )}
          {!isNewPoint && isEditMode && currentPoint && (
            <button style={s.undoBtn} onClick={() => { loadPoint(currentPoint); setIsEditMode(false); setCameFromEditMode(false); }}>↩</button>
          )}
          {/* Right arrow — same size/style as left, no extra offset */}
          {!isNewPoint && setPoints.length > 0 && (
            <button
              style={{ ...s.setNavArrow, opacity: (setPointIdx < 0 || setPointIdx >= setPoints.length - 1) ? 0.4 : 1 }}
              disabled={setPointIdx < 0 || setPointIdx >= setPoints.length - 1}
              onClick={goNextInSet}
            >›</button>
          )}
          {/* ⋮ — only on new-point creation page, opens Manage Point overlay */}
          {isNewPoint && (
            <button
              style={s.dotsBtn}
              onClick={() => setShowManagePoint(true)}
              title="Manage Point"
              aria-label="Manage Point"
            >⋮</button>
          )}
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 80 }}>

        {/* ── Rod Reading + Benchmark card ── */}
        <div style={{ ...s.card, ...(!isEditMode && !isNewPoint ? { gap: 4, padding: '8px 10px' } : {}) }}>

          {/* ── READ-ONLY rod display (existing saved point, not editing) ── */}
          {!isEditMode && !isNewPoint ? (
            <>
              <div style={{ ...s.secRow, marginBottom: 0 }}>
                <span style={s.secLbl}>{t('rodReading')}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {fifDisplay ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '2px 0' }}>
                    <span style={{ fontSize: 17, color: TEXT_SEC, fontWeight: 700 }}>{t('feetInchesBtn')}</span>
                    <span style={{ fontSize: 22, fontWeight: 800, color: TEXT_PRI, letterSpacing: '-0.5px' }}>{fifDisplay}</span>
                  </div>
                ) : null}
                {engDisplay ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '2px 0' }}>
                    <span style={{ fontSize: 17, color: TEXT_SEC, fontWeight: 700 }}>{t('engineeringFtBtn')}</span>
                    <span style={{ fontSize: 22, fontWeight: 800, color: BLUE, letterSpacing: '-0.5px' }}>{engDisplay}</span>
                  </div>
                ) : null}
                {!fifDisplay && !engDisplay && (
                  <span style={{ fontSize: 14, color: TEXT_DIS, fontStyle: 'italic', padding: '2px 0' }}>—</span>
                )}
                {/* ── Elevation rows (read-only only) ── */}
                {setReferencePoint && (setReferencePoint.bmElevation ?? 0) > 0 && (
                  <>
                    {/* Thin separator before elevation section */}
                    <div style={{ height: 1, backgroundColor: BORDER, margin: '4px 0 2px' }} />
                    {/* Point Elevation — the set reference point's known elevation */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '2px 0' }}>
                      <span style={{ fontSize: 17, color: TEXT_SEC, fontWeight: 700 }}>{t('pointElevation')}</span>
                      <span style={{ fontSize: 22, fontWeight: 800, color: TEXT_PRI, letterSpacing: '-0.5px' }}>
                        {setReferencePoint.bmElevation.toFixed(2)} ft
                      </span>
                    </div>
                    {/* Derived Benchmark — live-calculated for non-reference points */}
                    {autoDerivedBm != null && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '2px 0' }}>
                        <span style={{ fontSize: 17, color: TEXT_SEC, fontWeight: 700 }}>{t('derivedBenchmark')}</span>
                        <span style={{ fontSize: 22, fontWeight: 800, color: BLUE, letterSpacing: '-0.5px' }}>
                          {autoDerivedBm.toFixed(2)} ft
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          ) : (
          <>
          {/* Section header row — edit mode */}
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
          </>
          )} {/* end read-only / edit-mode ternary */}
        </div>

        {/* ── Set Assignment ── */}
        {/* Read-only: simple label + set name. Edit mode: full radio card. */}
        {!isEditMode && !isNewPoint ? (
          <div style={s.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: TEXT_SEC, letterSpacing: '0.5px', textTransform: 'uppercase' as const }}>{t('assignedSetLabel')}</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: assignedSetObj ? TEXT_PRI : TEXT_DIS }}>
                {assignedSetObj
                  ? [assignedSetObj.setLabel, assignedSetObj.name].filter(Boolean).join(' • ')
                  : '—'
                }
              </span>
            </div>
          </div>
        ) : (
        <div style={{ ...s.card, ...(setWarning && !assignedSetObj ? { border: `1.5px solid #EF4444` } : {}) }}>
          <div style={s.secRow}>
            <span style={s.secLbl}>{t('setAssignment')}</span>
            <InfoTip text={t('setInfoTip')} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {/* Option 1: Add to Current Set — radio row, only shown when a set exists */}
            {sets.length > 0 && lastUsedSet && (
              <button
                style={{
                  ...s.setAssignBtn,
                  display: 'flex', alignItems: 'center', gap: 10,
                  ...(setAssignMethod === 'existing'
                    ? s.setAssignBtnActive
                    : setAssignMethod === 'new' ? s.setAssignBtnDim : {}),
                }}
                onClick={() => {
                  if (setAssignMethod === 'existing') {
                    // Single tap deselects
                    setAssignedSet(null);
                    setSetAssignMethod(null);
                  } else {
                    if (!hasRodReading) { setRodReadingWarn(true); return; }
                    setRodReadingWarn(false);
                    setDupConflict(null);
                    setPendingNewSet(null);
                    setAssignedSet(lastUsedSet.id);
                    setSetAssignMethod('existing');
                    setSetWarning(false);
                  }
                }}
              >
                {/* Radio dot */}
                <span style={{
                  width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                  border: `2px solid ${setAssignMethod === 'existing' ? GOLD : 'rgba(255,255,255,0.45)'}`,
                  backgroundColor: setAssignMethod === 'existing' ? GOLD : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {setAssignMethod === 'existing' && (
                    <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: NAVY, display: 'block' }} />
                  )}
                </span>
                <span style={{ flex: 1, textAlign: 'left' as const }}>
                  {setAssignMethod === 'existing' && assignedSetObj
                    ? `${t('currentSetLabel')}: ${[assignedSetObj.setLabel, assignedSetObj.name].filter(Boolean).join(' • ')}`
                    : `${t('addToExistingSet')}: ${[lastUsedSet.setLabel, lastUsedSet.name].filter(Boolean).join(' • ')}`
                  }
                </span>
              </button>
            )}

            {/* Option 2: Create New Set — radio row */}
            <button
              style={{
                ...s.setAssignBtn,
                display: 'flex', alignItems: 'center', gap: 10,
                ...(setAssignMethod === 'new'
                  ? s.setAssignBtnActive
                  : setAssignMethod === 'existing' ? s.setAssignBtnDim : {}),
              }}
              onClick={() => {
                if (setAssignMethod === 'new') {
                  // Single tap deselects
                  setAssignedSet(null);
                  setSetAssignMethod(null);
                  setPendingNewSet(null);
                } else {
                  if (!hasRodReading) { setRodReadingWarn(true); return; }
                  setRodReadingWarn(false);
                  setDupConflict(null);
                  setNewSetElevWarn(false);
                  setShowCreate(true);
                }
              }}
            >
              {/* Radio dot */}
              <span style={{
                width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                border: `2px solid ${setAssignMethod === 'new' ? GOLD : 'rgba(255,255,255,0.45)'}`,
                backgroundColor: setAssignMethod === 'new' ? GOLD : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {setAssignMethod === 'new' && (
                  <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: NAVY, display: 'block' }} />
                )}
              </span>
              <span style={{ flex: 1, textAlign: 'left' as const }}>
                {setAssignMethod === 'new' && assignedSetObj
                  ? `${t('newSetLabel')}: ${[assignedSetObj.setLabel, assignedSetObj.name].filter(Boolean).join(' • ')}`
                  : t('createNewSetBtn')
                }
              </span>
            </button>

            {rodReadingWarn && <div style={s.warnMsg}>⚠ {t('rodReadingRequiredForSet')}</div>}
            {newSetElevWarn && <div style={s.warnMsg}>⚠ {t('elevRequiredForSet')}</div>}
            {setWarning && <div style={s.warnMsg}>⚠ {t('noSetWarning')}</div>}
          </div>
        </div>
        )} {/* end read-only / edit-mode set assignment conditional */}

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
            <button style={s.slopeBtn} onClick={handleFindSlope}>
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
      {/* ── Modals ── */}
      <CreateSetModal
        open={showCreate} onClose={() => setShowCreate(false)}
        pointLabel={currentLabel} engFt={parseFloat(engFtStr) || 0}
        fifDisplay={fifDisplay}
        nextSetId={nextSetLabel(projectId)} onCreate={handleCreateSet}
      />
      <AssignSetModal
        open={showAssign} onClose={() => setShowAssign(false)}
        sets={sets} allPoints={points}
        pointLabel={currentLabel} onAssign={id => { setAssignedSet(id); setSetWarning(false); }}
      />
      <QuickEditModal
        open={showNameModal} title={t('pointName')} placeholder={t('pointNamePlaceholder')}
        value={pointName} onClose={() => { setShowNameModal(false); setShowSetPanel(false); }}
        headerAction={(!cameFromNewPoint && dropdownSetId && !cameFromEditMode) ? (
          <button
            style={{ ...s.viewSetDropBtn, fontSize: 14, maxWidth: 220 }}
            onClick={toggleSetDropdown}
          >
            {t('viewAllSetPoints')} {showSetPanel ? '▲' : '▼'}
          </button>
        ) : undefined}
        dropdownContent={(showSetPanel && dropdownSetId) ? (
          <div style={{
            border: `1px solid ${BORDER}`, borderRadius: 8,
            backgroundColor: CARD, overflow: 'hidden',
            maxHeight: 220, overflowY: 'auto',
            boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
          }}>
            {dropdownPoints.length === 0
              ? <div style={{ padding: '12px', color: TEXT_DIS, fontSize: 15, textAlign: 'center' }}>{t('noSetPointsYet')}</div>
              : dropdownPoints.map(pt => (
                <div
                  key={pt.id}
                  style={{
                    display: 'flex', alignItems: 'center', padding: '10px 14px',
                    cursor: 'pointer', borderBottom: `1px solid ${BORDER}`,
                    backgroundColor: pt.id === currentPoint?.id ? BLUE_DEEP : 'transparent',
                    overflow: 'hidden',
                  }}
                  onClick={() => {
                    if (isNewPoint && !cameFromNewPoint) {
                      savedNewPointRef.current = { rodFeet, rodInches, rodFracDec, rodFracLbl, engFtStr, bmElevStr, pointName, takenBy, assignedSet };
                      setCameFromNewPoint(true);
                    }
                    const gi = points.findIndex(p => p.id === pt.id);
                    if (gi >= 0) goTo(gi);
                    setShowSetPanel(false);
                    setShowNameModal(false);
                  }}
                >
                  <span style={{ fontWeight: 700, color: BLUE_ACC, fontSize: 16, flexShrink: 0 }}>{pt.label}</span>
                  <span style={{ color: TEXT_SEC, fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}> — {pt.pointName || t('unnamedPoint')}</span>
                </div>
              ))
            }
          </div>
        ) : undefined}
        validate={(name) => assignedSet ? checkDupName(name, assignedSet, currentPoint?.id) : null}
        onSave={v => {
          setPointName(v);
          setDupConflict(null);
          if (currentPoint) updatePoint(projectId, currentPoint.id, { pointName: v || undefined });
        }}
      />
      {/* ── Duplicate point name alert dialog ── */}
      <DupNameModal conflict={dupConflict} onClose={() => setDupConflict(null)} />

      {/* ── Manage Point overlay — kept mounted (display toggle) to preserve SinglePointTab state ── */}
      {(showManagePoint || editingFromManage) && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 50, backgroundColor: SURFACE,
          // Hidden while user is editing the point, but kept in DOM so search/page/scroll are preserved
          display: editingFromManage ? 'none' : 'flex',
          flexDirection: 'column',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', backgroundColor: NAVY, flexShrink: 0 }}>
            <button
              style={{ background: 'none', border: 'none', color: '#fff', fontSize: 22, lineHeight: 1, cursor: 'pointer', padding: '2px 6px 2px 0', flexShrink: 0 }}
              onClick={() => { setShowManagePoint(false); setEditingFromManage(false); openNewPoint(); }}
              aria-label="Close"
            >←</button>
            <span style={{ fontSize: 17, fontWeight: 800, color: '#fff', flex: 1 }}>Manage Point</span>
          </div>
          {/* Content */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <SinglePointTab
              points={points}
              sets={sets}
              projectId={projectId}
              onEditPoint={(pt) => {
                // Load point directly into the form without routing through App,
                // push a history entry so browser Back returns to this overlay,
                // then hide the overlay (keeping it mounted to preserve state)
                const gi = points.findIndex(p => p.id === pt.id);
                if (gi >= 0) {
                  setCurrentIdx(gi);
                  loadPoint(points[gi]);
                  setIsEditMode(true);
                  setCameFromEditMode(true);
                }
                setEditingFromManage(true);
              }}
            />
          </div>
        </div>
      )}
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
  backToMainBtn: { flexShrink: 0, backgroundColor: NAVY, border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' as const },
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
    color: BLUE, cursor: 'pointer', minWidth: 80,
    whiteSpace: 'normal' as const, wordBreak: 'break-word' as const,
    textAlign: 'center' as const, lineHeight: '1.3',
  },
  // Read-only point name — same visual as inlineBtn but non-clickable
  inlineLbl: {
    backgroundColor: CARD, borderRadius: 6, padding: '5px 14px',
    border: `1.5px solid ${BORDER}`, fontSize: 13, fontWeight: 700,
    color: TEXT_PRI, minWidth: 80,
    whiteSpace: 'normal' as const, wordBreak: 'break-word' as const,
    textAlign: 'center' as const, lineHeight: '1.3', display: 'inline-block' as const,
  },
  newBtn:       { backgroundColor: BLUE, borderRadius: 6, padding: '5px 12px', color: '#fff', fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', flexShrink: 0 },
  newBtnDisabled: { backgroundColor: '#9CA3AF', opacity: 0.6, cursor: 'default' },
  editBtn:      { backgroundColor: BLUE, borderRadius: 6, padding: '5px 12px', color: '#fff', fontSize: 13, fontWeight: 700, border: `1px solid ${BLUE_ACC}`, cursor: 'pointer', flexShrink: 0 },
  editIconBtn:  { width: 30, height: 30, borderRadius: 6, backgroundColor: BLUE, border: `1px solid ${BLUE_ACC}`, fontSize: 16, cursor: 'pointer', color: '#fff', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 },
  undoBtn:      { width: 28, height: 28, borderRadius: 6, backgroundColor: SURFACE, border: `1px solid ${BORDER}`, fontSize: 14, cursor: 'pointer', color: TEXT_SEC, flexShrink: 0 },
  dotsBtn:      { width: 30, height: 30, borderRadius: '50%', backgroundColor: NAVY, border: 'none', fontSize: 18, fontWeight: 900, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, lineHeight: 1, letterSpacing: '-1px', padding: 0 },

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
  compareBtn: { height: 40, flex: 1, minWidth: 120, backgroundColor: NAVY, border: 'none', borderRadius: 10, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.3px' },
  slopeBtn:   { height: 40, flex: 1, minWidth: 120, backgroundColor: NAVY, border: 'none', borderRadius: 10, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.3px' },
};
