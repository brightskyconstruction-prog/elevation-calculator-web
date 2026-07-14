import React, { useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react';
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

// ─── Modal + toast animation CSS (injected once at module load) ──────────────
if (typeof document !== 'undefined' && !document.getElementById('anp-modal-anim')) {
  const _s = document.createElement('style');
  _s.id = 'anp-modal-anim';
  _s.textContent = `
    @keyframes anpModalIn {
      from { opacity: 0; transform: scale(0.92) translateY(6px); }
      to   { opacity: 1; transform: scale(1) translateY(0); }
    }
    .anp-modal-in { animation: anpModalIn 0.20s cubic-bezier(0.22,1,0.36,1) both; }
    @keyframes anpToastIn {
      from { opacity: 0; transform: translateX(-50%) translateY(-10px); }
      to   { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
    .anp-toast { animation: anpToastIn 0.22s cubic-bezier(0.22,1,0.36,1) both; }
  `;
  document.head.appendChild(_s);
}

// ─── Stacked fraction display for Feet-Inches values ─────────────────────────
function StackedFIFSpan({ feet, inches, frac, color = '#111827', size = 14 }: {
  feet: string | number; inches: string | number; frac: string;
  color?: string; size?: number;
}) {
  const hasFrac  = !!(frac && frac !== '0/0' && frac !== 'None' && frac !== '0');
  const parts    = hasFrac ? frac.split('/') : [];
  const num      = parts.length === 2 ? parseInt(parts[0], 10) : NaN;
  const den      = parts.length === 2 ? parseInt(parts[1], 10) : NaN;
  const showFrac = hasFrac && !isNaN(num) && !isNaN(den);
  const tiny     = Math.max(8, Math.round(size * 0.62));

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
      <span style={{ fontSize: size, fontWeight: 700, color }}>{feet}' - {inches}{showFrac ? ' ' : '"'}</span>
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

// ─── Public API exposed to App.tsx via imperativeRef ─────────────────────────

export interface AddNewPointScreenAPI {
  /** Current manage-overlay state */
  getManageState: () => { showManagePoint: boolean; editingFromManage: boolean };
  /** True when an existing point is loaded (edit OR read-only); false on blank new-point form */
  isPointLoaded:  () => boolean;
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

// ─── Centered Modal (floating overlay — used by Point Name + Create Set) ─────
interface CenteredModalProps { open: boolean; onClose: () => void; children: React.ReactNode; }
function CenteredModal({ open, onClose, children }: CenteredModalProps) {
  if (!open) return null;
  return (
    <div
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px', boxSizing: 'border-box' }}
      onClick={onClose}
    >
      <div
        className="anp-modal-in"
        style={{ backgroundColor: CARD, borderRadius: 18, maxWidth: 440, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.28)', overflow: 'hidden', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

// ─── Shared Modal Header (navy bar + white title + optional subtitle + ✕) ─────
interface ModalHeaderProps { title: string; subtitle?: string; onClose: () => void; }
function ModalHeader({ title, subtitle, onClose }: ModalHeaderProps) {
  return (
    <div style={{ backgroundColor: NAVY, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ color: '#FFFFFF', fontSize: 18, fontWeight: 800, lineHeight: 1.2 }}>{title}</span>
        {subtitle && <span style={{ color: 'rgba(255,255,255,0.72)', fontSize: 13, fontWeight: 500, lineHeight: 1.2 }}>{subtitle}</span>}
      </div>
      <button
        style={{ background: 'none', border: 'none', color: '#FFFFFF', fontSize: 24, fontWeight: 700, lineHeight: 1, cursor: 'pointer', padding: '4px 6px', flexShrink: 0, opacity: 0.85 }}
        onClick={onClose}
        aria-label="Close"
      >✕</button>
    </div>
  );
}

// ─── Create Set Modal ─────────────────────────────────────────────────────────
interface CreateSetProps {
  open: boolean; onClose: () => void;
  pointLabel: string; engFt: number;
  rodFeet: string; rodInches: number; rodFracLbl: string;
  nextSetId: string;
  onCreate: (name: string) => void;
}
function CreateSetModal({ open, onClose, pointLabel, engFt, rodFeet, rodInches, rodFracLbl, nextSetId, onCreate }: CreateSetProps) {
  const [name, setName] = useState('');
  const { t, lang } = useLang();
  return (
    <CenteredModal open={open} onClose={onClose}>
      <ModalHeader title={t('createSetTitle')} onClose={onClose} />
      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ ...c.modalDesc, textAlign: 'left', fontSize: 14, lineHeight: 1.6, margin: 0 }}>
          {lang === 'es' ? 'Punto' : 'Point'} {pointLabel}{' '}(
          <StackedFIFSpan feet={rodFeet || '0'} inches={rodInches} frac={rodFracLbl} color={TEXT_PRI} size={14} />
          {` | ${isNaN(engFt) || engFt === 0 ? '—' : engFt.toFixed(2)} ft ${lang === 'es' ? 'Ing.' : 'Engineering'})`}{' '}
          {lang === 'es' ? 'será el primero en este conjunto.' : 'will be the first point in this set.'}
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
      </div>
    </CenteredModal>
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
  /** Optional subtitle shown below the title in the header */
  subtitle?: string;
  /** Optional element rendered below the header (e.g. View All Set Points button) */
  headerAction?: React.ReactNode;
  /** Optional validation: return an error string to block save, or null to allow */
  validate?: (val: string) => string | null;
  /** Inline content rendered directly below the header action */
  dropdownContent?: React.ReactNode;
}
function QuickEditModal({ open, title, subtitle, placeholder, value, onClose, onSave, headerAction, validate, dropdownContent }: QuickEditProps) {
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
    <CenteredModal open={open} onClose={onClose}>
      <ModalHeader title={title} subtitle={subtitle} onClose={onClose} />
      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Optional action (e.g. View All Set Points button) */}
        {headerAction && <div style={{ display: 'flex', justifyContent: 'flex-end' }}>{headerAction}</div>}
        {/* Inline dropdown list */}
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
          <div style={{ fontSize: 13, color: '#DC2626', lineHeight: 1.4 }}>
            ⚠ {validErr}
          </div>
        )}
        <button
          style={{ ...c.saveBtn, fontSize: 16, padding: '13px 0', height: 'auto' }}
          onClick={handleSave}
        >{t('save')}</button>
      </div>
    </CenteredModal>
  );
}

// ─── Set list modal (replaces inline dropdown in QuickEditModal) ──────────────
interface SetListModalProps {
  open: boolean;
  onClose: () => void;
  points: SurveyPoint[];
  currentPointId?: string;
  t: (k: string) => string;
  onSelectPoint: (pt: SurveyPoint) => void;
}
function SetListModal({ open, onClose, points, currentPointId, t, onSelectPoint }: SetListModalProps) {
  if (!open) return null;
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 400,
        backgroundColor: 'rgba(0,0,0,0.60)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '0 24px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: CARD, borderRadius: 18,
          maxWidth: 400, width: '100%', maxHeight: '70vh',
          boxShadow: '0 12px 40px rgba(0,0,0,0.32)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 16px 12px', borderBottom: `1px solid ${BORDER}`, flexShrink: 0,
        }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: TEXT_PRI }}>
            {t('viewAllSetPoints')}
          </h3>
          <button
            style={{ background: 'none', border: 'none', color: TEXT_PRI, fontSize: 22, fontWeight: 900, lineHeight: 1, cursor: 'pointer', padding: '2px 4px' }}
            onClick={onClose}
            aria-label="Close"
          >✕</button>
        </div>
        {/* Scrollable list */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {points.length === 0
            ? <div style={{ padding: '20px', color: TEXT_DIS, fontSize: 15, textAlign: 'center' }}>{t('noSetPointsYet')}</div>
            : points.map(pt => (
              <div
                key={pt.id}
                style={{
                  display: 'flex', alignItems: 'center', padding: '12px 16px',
                  cursor: 'pointer', borderBottom: `1px solid ${BORDER}`,
                  backgroundColor: pt.id === currentPointId ? BLUE_DEEP : 'transparent',
                  overflow: 'hidden',
                }}
                onClick={() => onSelectPoint(pt)}
              >
                <span style={{ fontWeight: 700, color: BLUE_ACC, fontSize: 16, flexShrink: 0 }}>{pt.label}</span>
                <span style={{ color: TEXT_SEC, fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}> — {pt.pointName || t('unnamedPoint')}</span>
              </div>
            ))
          }
        </div>
      </div>
    </div>
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

// ─── Info modal card ──────────────────────────────────────────────────────────
function InfoTip({ text, title }: { text: string; title?: string }) {
  const [open, setOpen] = useState(false);
  const { t } = useLang();

  return (
    <span style={{ display: 'inline-flex' }}>
      <button
        style={{ background: 'none', border: 'none', color: '#1D4ED8', fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: '4px 6px', minWidth: 36, minHeight: 36, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', filter: 'drop-shadow(0 0 0.5px #1D4ED8)' }}
        onClick={() => setOpen(true)}
      >ⓘ</button>

      {open && (
        /* Full-screen backdrop */
        <div
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 18px', boxSizing: 'border-box' }}
          onClick={() => setOpen(false)}
        >
          {/* Card */}
          <div
            className="anp-modal-in"
            style={{ backgroundColor: CARD, borderRadius: 18, width: '100%', maxWidth: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.28)', overflow: 'hidden' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header — full-width navy bar */}
            <div style={{ backgroundColor: NAVY, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: '#FFFFFF', fontSize: 18, fontWeight: 800, lineHeight: 1.2 }}>{title || 'Information'}</span>
              <button
                style={{ background: 'none', border: 'none', color: '#FFFFFF', fontSize: 24, fontWeight: 700, lineHeight: 1, cursor: 'pointer', padding: '4px 6px', flexShrink: 0, opacity: 0.85 }}
                onClick={() => setOpen(false)}
                aria-label="Close"
              >✕</button>
            </div>

            {/* Body — each double-newline becomes a new paragraph */}
            <div style={{ padding: '20px 20px 4px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {text.split('\n\n').map((para, i) => (
                <p key={i} style={{ margin: 0, fontSize: 15, color: TEXT_SEC, lineHeight: 1.7 }}>{para}</p>
              ))}
            </div>

            {/* Footer */}
            <div style={{ padding: '16px 20px 20px' }}>
              <button
                style={{ width: '100%', backgroundColor: NAVY, color: '#fff', border: 'none', borderRadius: 10, padding: '13px 0', fontSize: 15, fontWeight: 800, cursor: 'pointer', letterSpacing: '0.3px' }}
                onClick={() => setOpen(false)}
              >{t('gotIt')}</button>
            </div>
          </div>
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
  const [bmExpanded,  setBmExpanded]  = useState(false);
  const [showBmModal, setShowBmModal] = useState(false);
  const [bmDraft,     setBmDraft]     = useState('');
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
  const [rodSaveWarn,       setRodSaveWarn]       = useState(false);
  const [dupConflict,       setDupConflict]       = useState<{ name: string; label: string } | null>(null);
  const [showManagePoint,   setShowManagePoint]   = useState(false);
  const [editingFromManage, setEditingFromManage] = useState(false); // true = overlay mounted but hidden while editing a point from it
  const [showUnsavedWarn,   setShowUnsavedWarn]   = useState(false);
  const [showSetListModal, setShowSetListModal] = useState(false);
  const [cameFromNewPoint, setCameFromNewPoint] = useState(false);
  const savedNewPointRef = useRef<{
    rodFeet: string; rodInches: number; rodFracDec: number; rodFracLbl: string;
    engFtStr: string; bmElevStr: string; pointName: string; takenBy: string;
    assignedSet: string | null;
  } | null>(null);

  const lockRef        = useRef(false);
  const isNewPointRef  = useRef(true);  // mirror of isNewPoint for imperative API
  // Refs for equal-height set selection buttons
  const setBtn1Ref     = useRef<HTMLButtonElement>(null);
  const setBtn2Ref     = useRef<HTMLButtonElement>(null);

  // ── Derived values ────────────────────────────────────────────────────────
  const currentPoint  = currentIdx >= 0 && currentIdx < points.length ? points[currentIdx] : null;
  const currentLabel  = currentPoint?.label ?? nextLabel(projectId);
  const engFt         = parseFloat(engFtStr);
  const isNewPoint    = currentIdx < 0 || currentIdx >= points.length;
  // Keep ref in sync so the imperative API can read this without a stale closure.
  isNewPointRef.current = isNewPoint;
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


  // Last used set: set associated with the most recently updated point that has a setId
  const lastUsedSet = (() => {
    const pointsWithSet = points.filter(p => p.setId);
    if (pointsWithSet.length === 0) return sets[0] ?? null;
    const mostRecent = pointsWithSet.reduce((a, b) => (a.updatedAt > b.updatedAt ? a : b));
    return sets.find(s => s.id === mostRecent.setId) ?? sets[0] ?? null;
  })();

  // ── Equal-height set-assignment buttons ──────────────────────────────────
  // Runs synchronously before paint so there is never a visible flash.
  useLayoutEffect(() => {
    const sync = () => {
      const b1 = setBtn1Ref.current;
      const b2 = setBtn2Ref.current;
      if (!b1 && !b2) return;
      if (b1) b1.style.height = 'auto';
      if (b2) b2.style.height = 'auto';
      const h = Math.max(b1?.offsetHeight ?? 0, b2?.offsetHeight ?? 0);
      if (h > 0) {
        if (b1) b1.style.height = `${h}px`;
        if (b2) b2.style.height = `${h}px`;
      }
    };
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, [lastUsedSet?.id, assignedSetObj?.id, setAssignMethod, sets.length]);

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
    setBmExpanded(pt.bmElevation > 0);
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
    setSetWarning(false); setNewSetElevWarn(false); setRodReadingWarn(false); setDupConflict(null); setShowSetListModal(false); setSetAssignMethod(null); setPendingNewSet(null);
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
      isPointLoaded:  () => !isNewPointRef.current,
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

  // ── Rod format sync ────────────────────────────────────────────────────────
  const updateFromFI = (feet: string, inches: number, frac: number, fracLbl: string) => {
    if (lockRef.current) return;
    lockRef.current = true;
    setRodFeet(feet); setRodInches(inches); setRodFracDec(frac); setRodFracLbl(fracLbl);
    const eng = toEngFt(feet, inches, frac);
    setEngFtStr(isNaN(eng) || (feet === '' && inches === 0 && frac === 0) ? '' : eng.toFixed(2));
    setRodReadingWarn(false);
    setRodSaveWarn(false);
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
    setRodSaveWarn(false);
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

  // ── Benchmark modal handlers ───────────────────────────────────────────────
  const openBmModal  = () => { setBmDraft(bmElevStr); setShowBmModal(true); };
  const closeBmModal = () => { setShowBmModal(false); if (!bmElevStr) setBmExpanded(false); };
  const confirmBm    = () => {
    const v = bmDraft.trim();
    const n = parseFloat(v);
    if (v && !isNaN(n) && n > 0) {
      setBmElevStr(v); setBmExpanded(true); setNewSetElevWarn(false);
    } else {
      setBmElevStr(''); setBmExpanded(false);
    }
    setShowBmModal(false);
  };

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    const eng = parseFloat(engFtStr);
    if (isNaN(eng) || eng <= 0) { setRodSaveWarn(true); return; }
    setRodSaveWarn(false);
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
        <div className="anp-toast" style={{
          position: 'fixed', top: 70, left: '50%', transform: 'translateX(-50%)',
          backgroundColor: '#16A34A', color: '#fff', padding: '9px 22px',
          borderRadius: 20, fontSize: 13, fontWeight: 700, zIndex: 200,
          boxShadow: '0 4px 16px rgba(0,0,0,0.22)',
          display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap' as const,
        }}>
          <span style={{ fontSize: 15 }}>✓</span>
          {saveMsg}
        </div>
      )}

      {/* Point nav header */}
      <div style={{ backgroundColor: CARD, borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
        <div style={s.pointNav}>
          {/* Back — far left, shown when navigating from new-point or manage overlay */}
          {(cameFromNewPoint || (editingFromManage && !isNewPoint)) && (
            <button style={s.backToMainBtn} onClick={openNewPoint}>
              ← {t('back')}
            </button>
          )}

          {/* Point ID + Point Name */}
          <span style={s.navLabel}>{currentLabel}</span>
          {(!isEditMode && !isNewPoint) ? (
            <span style={s.inlineLbl}>{pointName || t('unnamedPoint')}</span>
          ) : (
            <button style={s.inlineBtn} onClick={() => setShowNameModal(true)} title="Edit point name">
              {pointName || t('pointNameOptional')}
            </button>
          )}

          <div style={{ flex: 1 }} />

          {/* View Details / Edit Point toggle — existing points only */}
          {!isNewPoint && (
            <button
              style={s.modeToggleBtn}
              onClick={() => {
                if (isEditMode && currentPoint) {
                  loadPoint(currentPoint);
                  setIsEditMode(false);
                  setCameFromEditMode(false);
                } else if (!isEditMode) {
                  setIsEditMode(true);
                }
              }}
            >
              {isEditMode ? t('viewDetailsBtn') : t('editPointBtn')}
            </button>
          )}

          {/* ⋮ — new-point creation only */}
          {isNewPoint && (
            <button
              style={s.dotsBtn}
              onClick={() => {
                const dirty = rodFeet !== '' || rodInches > 0 || rodFracDec > 0 || engFtStr !== '' || bmElevStr !== '';
                if (dirty) { setShowUnsavedWarn(true); } else { setShowManagePoint(true); }
              }}
              title="Manage Point"
              aria-label="Manage Point"
            >⋮</button>
          )}
        </div>

          {/* Arrow sub-row — only for existing points with prev/next */}
          {!isNewPoint && setPoints.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 10px 4px' }}>
              <button
                style={{ ...s.setNavArrow, opacity: setPointIdx <= 0 ? 0.4 : 1 }}
                disabled={setPointIdx <= 0}
                onClick={goPrevInSet}
              >‹</button>
              <span style={{ fontSize: 12, color: TEXT_DIS, fontWeight: 600 }}>
                {setPointIdx >= 0 ? `${setPointIdx + 1} / ${setPoints.length}` : ''}
              </span>
              <button
                style={{ ...s.setNavArrow, opacity: (setPointIdx < 0 || setPointIdx >= setPoints.length - 1) ? 0.4 : 1 }}
                disabled={setPointIdx < 0 || setPointIdx >= setPoints.length - 1}
                onClick={goNextInSet}
              >›</button>
            </div>
          )}
      </div>

      {/* Scrollable content */}
      <div style={{ flexGrow: 0, flexShrink: 1, flexBasis: 'auto', minHeight: 0, overflowY: 'auto', padding: '3px 4px', display: 'flex', flexDirection: 'column', gap: 4, paddingBottom: 4 }}>

        {/* ── Rod Reading + Set Assignment — joined into one visual card ── */}
        <div style={{ display: 'flex', flexDirection: 'column', border: (setWarning && !assignedSetObj && (isEditMode || isNewPoint)) ? `1.5px solid #EF4444` : `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ ...s.card, border: 'none', borderRadius: 0, ...(!isEditMode && !isNewPoint ? { gap: 4, padding: '8px 10px' } : {}), borderBottom: `1px solid ${BORDER}` }}>

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
                    <StackedFIFSpan feet={rodFeet || '0'} inches={rodInches} frac={rodFracLbl} color={TEXT_PRI} size={22} />
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
            <InfoTip text={t('rodInfoTip')} title={t('rodInfoTitle')} />
            <div style={{ flex: 1 }} />
            <div style={{ display: 'flex', backgroundColor: '#EEF4FF', border: '1px solid #BFDBFE', borderRadius: 7, padding: 2, gap: 2 }}>
              <button
                style={{ ...s.fmtBtn, ...(rodFormat === 'fif' ? s.fmtBtnOn : {}) }}
                onClick={() => setRodFormat('fif')}
              >
                {t('feetInchesBtn')}
              </button>
              <button
                style={{ ...s.fmtBtn, ...(rodFormat === 'eng' ? s.fmtBtnOn : {}) }}
                onClick={() => setRodFormat('eng')}
              >
                {t('engineeringFtBtn')}
              </button>
            </div>
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
                      <span style={{ fontSize: 13, fontWeight: 800, color: TEXT_SEC, textAlign: 'center' as const, whiteSpace: 'nowrap' as const }}>{t('clearBtn')}</span>
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
                  <StackedFIFSpan feet={rodFeet || '0'} inches={rodInches} frac={rodFracLbl} color={BLUE_ACC} size={15} />
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
            <>
              {/* Compact value card — shown once a benchmark is confirmed */}
              {bmExpanded && bmElevStr ? (
                <div style={{ ...s.autoBmBox }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: '#FFFFFF', letterSpacing: '0.9px', textTransform: 'uppercase' as const }}>
                      {t('benchmarkToggle')}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3 }}>
                      <span style={{ fontSize: 20, fontWeight: 700, color: '#fff', fontFamily: 'monospace', lineHeight: 1.3 }}>
                        {parseFloat(bmElevStr).toFixed(2)}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#F5F7FA', marginBottom: 1 }}>ft</span>
                    </div>
                  </div>
                  {isEditMode && (
                    <button
                      onClick={openBmModal}
                      style={{ backgroundColor: '#FFFFFF', border: `1.5px solid ${NAVY}`, borderRadius: 7, color: NAVY, fontSize: 13, fontWeight: 800, cursor: 'pointer', padding: '6px 14px', letterSpacing: '0.3px', flexShrink: 0, boxShadow: '0 1px 4px rgba(0,0,0,0.12)' }}
                    >✏ {t('editBtn')}</button>
                  )}
                </div>
              ) : (
                /* Yes / No toggle — Yes launches the modal */
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ flex: 1, fontSize: 15, fontWeight: 700, color: TEXT_PRI, lineHeight: 1.35 }}>
                    {t('benchmarkQuestion')}
                  </span>
                  <div style={{ display: 'flex', flexShrink: 0, borderRadius: 8, overflow: 'hidden', border: `1.5px solid ${NAVY}` }}>
                    <button
                      onClick={() => { if (!isEditMode) return; openBmModal(); }}
                      style={{ padding: '6px 18px', backgroundColor: 'transparent', color: NAVY, fontSize: 14, fontWeight: 800, border: 'none', borderRight: `1px solid ${NAVY}`, cursor: isEditMode ? 'pointer' : 'default', letterSpacing: '0.3px', transition: 'background-color 0.15s, color 0.15s' }}
                    >{t('yesBtn')}</button>
                    <button
                      onClick={() => { if (!isEditMode) return; setBmElevStr(''); setBmExpanded(false); }}
                      style={{ padding: '6px 18px', backgroundColor: NAVY, color: '#FFFFFF', fontSize: 14, fontWeight: 800, border: 'none', cursor: isEditMode ? 'pointer' : 'default', letterSpacing: '0.3px', transition: 'background-color 0.15s, color 0.15s' }}
                    >{t('noBtn')}</button>
                  </div>
                </div>
              )}
            </>
          )}
          </>
          )} {/* end read-only / edit-mode ternary */}
        </div>

        {/* ── Set Assignment ── */}
        {/* Read-only: simple label + set name. Edit mode: full radio card. */}
        {!isEditMode && !isNewPoint ? (
          <div style={{ ...s.card, border: 'none', borderRadius: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: TEXT_SEC, letterSpacing: '0.5px', textTransform: 'uppercase' as const }}>{t('assignedSetLabel')}</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: assignedSetObj ? TEXT_PRI : TEXT_DIS }}>
                {assignedSetObj
                  ? [assignedSetObj.setLabel, assignedSetObj.name].filter(Boolean).join(' • ')
                  : '—'
                }
              </span>
            </div>
          </div>
        ) : (
        <div style={{ ...s.card, border: 'none', borderRadius: 0 }}>
          <div style={s.secRow}>
            <span style={{ ...s.secLbl, textTransform: 'none' as const, letterSpacing: '0.2px' }}>{t('setAssignment')}</span>
            <InfoTip text={t('setInfoTip')} title={t('setInfoTitle')} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {/* Option 1: Add to Current Set — radio row, only shown when a set exists */}
            {sets.length > 0 && lastUsedSet && (
              <button
                ref={setBtn1Ref}
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
                  border: `2px solid ${NAVY}`,
                  backgroundColor: setAssignMethod === 'existing' ? NAVY : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {setAssignMethod === 'existing' && (
                    <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: '#fff', display: 'block' }} />
                  )}
                </span>
                <span style={{ flex: 1, textAlign: 'left' as const }}>
                  {`${t('currentSetLabel')}: ${[lastUsedSet.setLabel, lastUsedSet.name].filter(Boolean).join(' • ')}`}
                </span>
              </button>
            )}

            {/* Option 2: Create New Set — radio row */}
            <button
              ref={setBtn2Ref}
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
                border: `2px solid ${NAVY}`,
                backgroundColor: setAssignMethod === 'new' ? NAVY : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {setAssignMethod === 'new' && (
                  <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: '#fff', display: 'block' }} />
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
        </div> {/* end rod reading + set assignment combined card */}

        {/* ── Post-save actions (compare / slope) — read-only view only ── */}
        {!isNewPoint && !isEditMode && currentPoint && (
          <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <button style={s.compareBtn} onClick={handleCompareThis}>
              {t('compareThisReading')}
            </button>
            <button style={s.slopeBtn} onClick={handleFindSlope}>
              {t('findSlope')}
            </button>
          </div>
        )}

        {/* ── Timestamp + Location — read-only view only ── */}
        {savedAt && !isEditMode && !isNewPoint && (
          <div style={s.timestampCard}>
            <span style={s.savedAt}>{t('recordedLabel')} {fmtTimestamp(savedAt)}</span>
            {locationTxt ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <span style={{ fontSize: 14 }}>📍</span>
                <span style={{ flex: 1, fontSize: 14, color: TEXT_SEC, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
      </div>{/* end scrollable content */}

      {/* ── Save / Update button — outside scroll, always visible ── */}
      {(isNewPoint || isEditMode) && (
        <div style={{ flexShrink: 0, padding: '6px 4px 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {rodSaveWarn && (
            <div style={{ ...s.warnMsg, marginBottom: 0, paddingLeft: 4 }}>⚠ {t('rodReadingAlert')}</div>
          )}
          <button style={s.saveBtn} onClick={handleSave}>
            {isNewPoint ? t('savePoint') : t('updatePoint')}
          </button>
        </div>
      )}

      {/* ── Ad strip — fills ALL remaining space below Save Point, never scrolls ── */}
      <div style={{
        flex: 1,
        minHeight: 80,
        borderTop: `1px solid ${BORDER}`,
        backgroundColor: SURFACE,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 6,
      }}>
        <span style={{ fontSize: 10, color: '#C4BAA8', letterSpacing: 1.2, fontWeight: 700, textTransform: 'uppercase' as const }}>
          Advertisement
        </span>
      </div>

      {/* ── Set points dropdown overlay (position:fixed, no layout shift) ── */}
      {/* ── Benchmark elevation modal ── */}
      {showBmModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 24px', boxSizing: 'border-box' as const }}>
          <div
            className="bm-modal-in"
            style={{ backgroundColor: '#FFFFFF', borderRadius: 20, maxWidth: 420, width: '100%', boxShadow: '0 28px 72px rgba(0,0,0,0.32)', overflow: 'hidden' }}
          >
            {/* Navy header */}
            <div style={{ backgroundColor: NAVY, padding: '20px 24px' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#FFFFFF', lineHeight: 1.25, letterSpacing: '0.1px' }}>
                {t('benchmarkToggle')}
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', fontWeight: 500, marginTop: 5, lineHeight: 1.5 }}>
                {t('bmModalDesc')}
              </div>
            </div>
            {/* Body */}
            <div style={{ padding: '24px 24px 28px', display: 'flex', flexDirection: 'column', gap: 22 }}>
              {/* Input — full-width, placeholder disappears on type */}
              <input
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                type="text" inputMode="decimal"
                value={bmDraft}
                onChange={e => setBmDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') confirmBm(); }}
                className="bm-elev-input"
                style={{ width: '100%', height: 62, border: `2px solid ${BLUE_ACC}`, borderRadius: 12, textAlign: 'center' as const, fontSize: 28, fontWeight: 700, color: NAVY, outline: 'none', padding: '0 16px', boxSizing: 'border-box' as const, fontFamily: 'monospace', backgroundColor: '#FFFFFF' }}
                placeholder="0.00 ft"
              />
              {/* Cancel / OK */}
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={closeBmModal}
                  style={{ flex: 1, height: 50, border: `1.5px solid ${BORDER}`, borderRadius: 12, backgroundColor: SURFACE, color: TEXT_SEC, fontSize: 16, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.2px' }}
                >{t('cancelBtn')}</button>
                <button
                  onClick={confirmBm}
                  style={{ flex: 1, height: 50, border: 'none', borderRadius: 12, backgroundColor: NAVY, color: '#FFFFFF', fontSize: 16, fontWeight: 800, cursor: 'pointer', letterSpacing: '0.3px' }}
                >{t('okBtn')}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      <CreateSetModal
        open={showCreate} onClose={() => setShowCreate(false)}
        pointLabel={currentLabel} engFt={parseFloat(engFtStr) || 0}
        rodFeet={rodFeet} rodInches={rodInches} rodFracLbl={rodFracLbl}
        nextSetId={nextSetLabel(projectId)} onCreate={handleCreateSet}
      />
      <AssignSetModal
        open={showAssign} onClose={() => setShowAssign(false)}
        sets={sets} allPoints={points}
        pointLabel={currentLabel} onAssign={id => { setAssignedSet(id); setSetWarning(false); }}
      />
      <QuickEditModal
        open={showNameModal} title={t('pointName')} subtitle={t('optionalLbl')} placeholder={t('pointNamePlaceholder')}
        value={pointName} onClose={() => { setShowNameModal(false); setShowSetListModal(false); }}
        headerAction={(!cameFromNewPoint && dropdownSetId && !cameFromEditMode) ? (
          <button
            style={{ ...s.viewSetDropBtn, fontSize: 14, maxWidth: 220 }}
            onClick={() => setShowSetListModal(true)}
          >
            {t('viewAllSetPoints')}
          </button>
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

      {/* ── Unsaved changes warning dialog ── */}
      <CenteredModal open={showUnsavedWarn} onClose={() => setShowUnsavedWarn(false)}>
        <ModalHeader title={t('unsavedChangesTitle')} onClose={() => setShowUnsavedWarn(false)} />
        <div style={{ padding: '20px 20px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ margin: 0, fontSize: 15, color: TEXT_SEC, lineHeight: 1.65 }}>
            {t('unsavedChangesMsg')}
          </p>
          {/* Primary: continue editing */}
          <button
            style={{ ...c.saveBtn, backgroundColor: NAVY }}
            onClick={() => setShowUnsavedWarn(false)}
          >{t('continueEditing')}</button>
          {/* Secondary: discard and open */}
          <button
            style={{ ...c.cancelBtn, color: '#DC2626', borderColor: '#FECACA', fontSize: 14, height: 'auto', padding: '10px 12px', whiteSpace: 'normal' as const, lineHeight: 1.4 }}
            onClick={() => { clearForm(); setShowUnsavedWarn(false); setShowManagePoint(true); }}
          >{t('discardAndOpen')}</button>
        </div>
      </CenteredModal>

      {/* ── Set list modal — centered overlay showing all points in the current set ── */}
      <SetListModal
        open={showSetListModal}
        onClose={() => setShowSetListModal(false)}
        points={dropdownPoints}
        currentPointId={currentPoint?.id}
        t={t}
        onSelectPoint={(pt) => {
          if (isNewPoint && !cameFromNewPoint) {
            savedNewPointRef.current = { rodFeet, rodInches, rodFracDec, rodFracLbl, engFtStr, bmElevStr, pointName, takenBy, assignedSet };
            setCameFromNewPoint(true);
          }
          const gi = points.findIndex(p => p.id === pt.id);
          if (gi >= 0) goTo(gi);
          setShowSetListModal(false);
          setShowNameModal(false);
        }}
      />

      {/* ── Manage Point overlay — kept mounted (display toggle) to preserve SinglePointTab state ── */}
      {(showManagePoint || editingFromManage) && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 50, backgroundColor: SURFACE,
          // Hidden while user is editing the point, but kept in DOM so search/page/scroll are preserved
          display: editingFromManage ? 'none' : 'flex',
          flexDirection: 'column',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '8px 14px', backgroundColor: NAVY, flexShrink: 0, minHeight: 52 }}>
            <button
              style={{ background: 'rgba(255,255,255,0.20)', border: '1.5px solid rgba(255,255,255,0.45)', color: '#fff', fontSize: 20, lineHeight: 1, cursor: 'pointer', padding: '8px 14px', flexShrink: 0, borderRadius: 10, fontWeight: 900, minWidth: 48, minHeight: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.18)' }}
              onClick={() => { setShowManagePoint(false); setEditingFromManage(false); openNewPoint(); }}
              aria-label="Back"
            >←</button>
            <span style={{ flex: 1, textAlign: 'center' as const, fontSize: 20, fontWeight: 800, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', padding: '0 8px' }}>{t('managePointsTitle')}</span>
            <button
              style={{ background: GOLD, border: 'none', color: NAVY, fontSize: 12, fontWeight: 800, cursor: 'pointer', padding: '6px 10px', flexShrink: 0, borderRadius: 8, minHeight: 36, maxWidth: 86, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.18)', letterSpacing: '0.2px', whiteSpace: 'normal' as const, textAlign: 'center' as const, lineHeight: 1.25 }}
              onClick={() => { setShowManagePoint(false); setEditingFromManage(false); openNewPoint(); }}
              aria-label={t('addNewPointBtn')}
            >{t('addNewPointBtn')}</button>
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
  modalTitle: { fontSize: 19, fontWeight: 700, color: TEXT_PRI, textAlign: 'center', margin: 0 },
  modalDesc:  { fontSize: 15, color: TEXT_SEC, textAlign: 'center', lineHeight: 1.5, margin: 0 },
  fieldLbl:   { display: 'block', fontSize: 12, fontWeight: 800, color: TEXT_SEC, letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 4 },
  input:      { height: 42, width: '100%', backgroundColor: '#f9f9f9', border: `1.5px solid ${BORDER}`, borderRadius: 6, padding: '0 12px', fontSize: 16, color: TEXT_PRI, outline: 'none', boxSizing: 'border-box' },
  saveBtn:    { height: 48, width: '100%', backgroundColor: BLUE, border: 'none', borderRadius: 8, color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer' },
  cancelBtn:  { height: 40, width: '100%', backgroundColor: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT_SEC, fontSize: 15, fontWeight: 600, cursor: 'pointer' },
  setIdBadge: { backgroundColor: BLUE_DEEP, border: `1px solid ${BLUE}`, borderRadius: 6, padding: '6px 10px', flexShrink: 0 },
  setIdText:  { fontSize: 15, fontWeight: 800, color: BLUE_ACC, letterSpacing: '0.5px' },
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
  navLabel:  { fontSize: 18, fontWeight: 800, color: TEXT_PRI, flexShrink: 0 },
  inlineBtn: {
    backgroundColor: CARD, borderRadius: 6, padding: '3px 14px',
    border: `1.5px solid ${BLUE_ACC}`, fontSize: 15, fontWeight: 700,
    color: BLUE, cursor: 'pointer', minWidth: 140,
    whiteSpace: 'normal' as const, wordBreak: 'break-word' as const,
    textAlign: 'center' as const, lineHeight: '1.2',
  },
  // Read-only point name — same visual as inlineBtn but non-clickable
  inlineLbl: {
    backgroundColor: CARD, borderRadius: 6, padding: '3px 14px',
    border: `1.5px solid ${BORDER}`, fontSize: 15, fontWeight: 700,
    color: TEXT_PRI, minWidth: 80,
    whiteSpace: 'normal' as const, wordBreak: 'break-word' as const,
    textAlign: 'center' as const, lineHeight: '1.2', display: 'inline-block' as const,
  },
  newBtn:       { backgroundColor: BLUE, borderRadius: 6, padding: '5px 12px', color: '#fff', fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', flexShrink: 0 },
  newBtnDisabled: { backgroundColor: '#9CA3AF', opacity: 0.6, cursor: 'default' },
  editBtn:        { backgroundColor: BLUE, borderRadius: 6, padding: '5px 12px', color: '#fff', fontSize: 13, fontWeight: 700, border: `1px solid ${BLUE_ACC}`, cursor: 'pointer', flexShrink: 0 },
  modeToggleBtn:  { flexShrink: 0, backgroundColor: NAVY, border: 'none', borderRadius: 6, padding: '4px 7px', fontSize: 12, fontWeight: 800, color: '#fff', cursor: 'pointer', whiteSpace: 'normal' as const, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' as const, minWidth: 0, maxWidth: 48, lineHeight: 1.2 },
  dotsBtn:      { width: 30, height: 30, borderRadius: '50%', backgroundColor: NAVY, border: 'none', fontSize: 18, fontWeight: 900, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, lineHeight: 1, letterSpacing: '-1px', padding: 0 },

  card:    { backgroundColor: CARD, borderRadius: 12, border: `1px solid ${BORDER}`, padding: '7px 10px', display: 'flex', flexDirection: 'column', gap: 6 },
  sep:     { height: 1, backgroundColor: '#F3F4F6', margin: '2px 0' },
  secRow:  { display: 'flex', alignItems: 'center', gap: 4 },
  secLbl:  { fontSize: 16, fontWeight: 800, color: TEXT_PRI, letterSpacing: '0.8px', textTransform: 'uppercase', lineHeight: 1.1, flexShrink: 0, whiteSpace: 'nowrap' as const },

  fmtBtn:    { flex: 1, padding: '4px 7px', borderRadius: 5, backgroundColor: 'transparent', border: 'none', fontSize: 13, fontWeight: 600, color: '#6B7280', cursor: 'pointer', letterSpacing: '0.2px', whiteSpace: 'nowrap' as const, textAlign: 'center' as const, lineHeight: 1.25, transition: 'background-color 0.2s, color 0.2s' },
  fmtBtnOn:  { backgroundColor: NAVY, color: '#FFFFFF', fontWeight: 700, boxShadow: '0 1px 4px rgba(20,58,99,0.30)' } as React.CSSProperties,

  rodBox:      { display: 'flex', border: `1.5px solid ${BLUE_ACC}`, borderRadius: 6, backgroundColor: '#FAFAF8', overflow: 'hidden', minHeight: 54 },
  rodPart:     { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4px 4px', gap: 4 },
  rodPartLbl:  { fontSize: 13, fontWeight: 800, color: TEXT_PRI, letterSpacing: '0.5px', textAlign: 'center' },
  rodFeetInput:{ width: '100%', height: 34, border: `1px solid ${BORDER}`, borderRadius: 4, textAlign: 'center', fontSize: 19, fontWeight: 700, color: TEXT_PRI, background: '#fff', outline: 'none', padding: 0 },
  rodSelect:   { width: '100%', height: 32, border: `1px solid ${BORDER}`, borderRadius: 4, textAlign: 'center', fontSize: 17, fontWeight: 700, color: TEXT_PRI, background: '#fff', outline: 'none', cursor: 'pointer' },
  rodDiv:      { width: 1, backgroundColor: '#F3F4F6', flexShrink: 0 },
  clearAllBtn: { minWidth: 44, padding: '0 8px', flexShrink: 0, border: 'none', borderLeft: `1px solid #F3F4F6`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backgroundColor: `${SURFACE}88` },

  engInput:   { height: 36, width: '100%', backgroundColor: '#FFFFFF', border: `1.5px solid ${BORDER}`, borderRadius: 6, textAlign: 'center', fontSize: 19, fontWeight: 700, color: TEXT_PRI, outline: 'none', boxSizing: 'border-box', padding: '0 12px' },
  autoGenRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, flexWrap: 'wrap' as const },
  autoGenLbl: { fontSize: 15, color: TEXT_PRI, fontWeight: 600 },
  autoGenVal: { fontSize: 15, color: BLUE, fontWeight: 700 },
  warnMsg:    { fontSize: 14, color: '#EF4444', fontWeight: 600, padding: '4px 0' },

  autoBmBox:   { display: 'flex', alignItems: 'center', gap: 12, backgroundColor: NAVY, borderRadius: 6, padding: '7px 10px', border: '1.5px solid #2A5898' },
  knownElevBox:{ border: `1.5px solid ${GOLD}`, backgroundColor: '#1A3A5C' } as React.CSSProperties,
  autoBmLbl:   { fontSize: 14, fontWeight: 800, color: '#FFFFFF', letterSpacing: '0.6px', textTransform: 'uppercase' },
  autoBmDesc:  { fontSize: 14, color: '#F5F7FA', lineHeight: 1.5 },
  autoBmRight: { display: 'flex', alignItems: 'flex-end', gap: 3 },
  autoBmVal:   { fontSize: 20, fontWeight: 700, color: '#fff', fontFamily: 'monospace' },
  autoBmUnit:  { fontSize: 13, fontWeight: 700, color: '#F5F7FA', marginBottom: 2 },

  bmRow:   { display: 'flex', alignItems: 'center', gap: 8 },
  bmTxt:   { flex: 1, fontSize: 16, color: TEXT_PRI, lineHeight: 1.5, fontWeight: 600 },
  bmInput: { width: 92, height: 36, backgroundColor: '#FFFFFF', border: `1.5px solid #6B7280`, borderRadius: 6, textAlign: 'center', fontSize: 16, fontWeight: 700, color: TEXT_PRI, outline: 'none' },

  assignedBadge:  { display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: BLUE_DEEP, borderRadius: 6, padding: '8px 10px' },
  setLblBadge:    { backgroundColor: BLUE, borderRadius: 4, padding: '1px 5px', fontSize: 9, fontWeight: 800, color: '#fff', letterSpacing: '0.4px' },
  setOptBtnPri:   { width: '100%', backgroundColor: BLUE, border: 'none', borderRadius: 6, padding: '9px 12px', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', textAlign: 'left' },
  setOptBtnSec:   { width: '100%', backgroundColor: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '9px 12px', color: TEXT_SEC, fontSize: 15, fontWeight: 600, cursor: 'pointer', textAlign: 'left' },
  // Always-visible set assignment buttons
  setAssignBtn:    { width: '100%', backgroundColor: '#F3F4F6', border: `3px solid ${NAVY}`, borderRadius: 7, padding: '6px 12px', color: TEXT_PRI, fontSize: 18, fontWeight: 700, cursor: 'pointer', textAlign: 'left' as const, lineHeight: 1.35, boxSizing: 'border-box' as const, overflow: 'hidden' },
  setAssignBtnActive: { backgroundColor: '#F3F4F6', border: `3px solid ${GOLD}` } as React.CSSProperties,
  setAssignBtnDim: { backgroundColor: '#F3F4F6', border: `3px solid ${NAVY}` } as React.CSSProperties,
  removeAssignBtn: { width: '100%', background: 'none', border: 'none', color: '#EF4444', fontSize: 14, fontWeight: 600, cursor: 'pointer', textAlign: 'center' as const, padding: '4px 0' },

  timestampCard:{ backgroundColor: CARD, borderRadius: 8, border: `1px solid #F3F4F6`, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 2 },
  savedAt:      { fontSize: 13, color: TEXT_SEC, textAlign: 'center', lineHeight: 1.5, fontWeight: 600 },
  mapsBtn:      { backgroundColor: BLUE, borderRadius: 4, padding: '3px 8px', color: '#fff', fontSize: 9, fontWeight: 800, textDecoration: 'none', flexShrink: 0 },

  saveBtn:    { minHeight: 44, width: '100%', backgroundColor: BLUE, border: 'none', borderRadius: 10, color: '#fff', fontSize: 17, fontWeight: 800, cursor: 'pointer', letterSpacing: '0.3px', flexShrink: 0 },
  compareBtn: { height: 40, flex: 1, minWidth: 120, backgroundColor: NAVY, border: 'none', borderRadius: 10, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.3px' },
  slopeBtn:   { height: 40, flex: 1, minWidth: 120, backgroundColor: NAVY, border: 'none', borderRadius: 10, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.3px' },
};
