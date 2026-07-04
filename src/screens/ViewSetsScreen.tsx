import React, { useState, useMemo, useEffect } from 'react';
import { useSurveyStore } from '../stores/surveyStore';
import { SurveySet, SurveyPoint } from '../types';
import { fmtTimestamp } from '../constants';
import { useLang } from '../LangContext';
import { strings } from '../i18n';

// ─── Colors ───────────────────────────────────────────────────────────────────
const BLUE    = '#1E5799';
const BLUE_A  = '#3B82F6';
const BLUE_D  = 'rgba(30,87,153,0.12)';
const GOLD    = '#F4B02A';
const BORDER  = '#E5E7EB';
const BORDER_S = '#D1D5DB';
const SURFACE = '#F0EEE8';
const CARD    = '#FFFFFF';
const SCREEN  = '#F5F4F0';
const TEXT_P  = '#111827';
const TEXT_S  = '#374151';
const TEXT_D  = '#9CA3AF';
const RED     = '#C0392B';

type Filter    = 'latest' | 'name' | 'search';
type PointType = 'benchmark' | 'derived' | 'standalone';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDateFull(ts: number, lang: string): string {
  return new Date(ts).toLocaleDateString(lang === 'es' ? 'es-MX' : 'en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
}

// ─── Point type theming (used by SetDetailView) ───────────────────────────────
const TYPE_THEME: Record<PointType, { border: string; badgeBg: string; badgeBdr: string; badgeTxt: string; labelKey: string }> = {
  benchmark:  { border: '#F5A623', badgeBg: '#FFF3CD', badgeBdr: '#F5A623', badgeTxt: '#92610A', labelKey: 'spBenchmarkBadge' },
  derived:    { border: BLUE,      badgeBg: BLUE_D,    badgeBdr: BLUE,      badgeTxt: BLUE_A,    labelKey: 'spDerivedBadge'   },
  standalone: { border: BORDER,    badgeBg: SURFACE,   badgeBdr: BORDER,    badgeTxt: TEXT_D,    labelKey: 'spStandaloneBadge'},
};

const ELEV_LABEL_KEY: Record<PointType, string> = {
  benchmark:  'svsElevLabel',
  derived:    'svsDerivedBm',
  standalone: 'svsBmElev',
};

// ─── Stacked fraction display for FIF values ──────────────────────────────────
function StackedFIFSpan({ feet, inches, frac, color = '#111827', size = 14 }: {
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

// ─── SetDetailView (bottom-sheet) ─────────────────────────────────────────────
interface SetDetailProps {
  set:     SurveySet;
  points:  SurveyPoint[];
  onClose: () => void;
}

function SetDetailView({ set, points, onClose }: SetDetailProps) {
  const { t } = useLang();
  const sorted = [...points].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { numeric: true }));

  const referenceId = (() => {
    const cands = points.filter(p => (p.bmElevation ?? 0) > 0)
      .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
    return cands.length > 0 ? cands[0].id : null;
  })();

  const getType = (pt: SurveyPoint): PointType => {
    const hasBm = (pt.bmElevation ?? 0) > 0;
    if (pt.id === referenceId) return 'benchmark';
    if (hasBm) return 'derived';
    return 'standalone';
  };

  const withBm   = points.filter(p => (p.bmElevation ?? 0) > 0);
  const elevs    = withBm.map(p => p.bmElevation!);
  const highElev = elevs.length > 0 ? Math.max(...elevs) : null;
  const lowElev  = elevs.length > 0 ? Math.min(...elevs) : null;
  const refPt    = sorted.find(p => p.id === referenceId);


  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', zIndex: 200 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: '100%', maxWidth: 480, margin: '0 auto', backgroundColor: SCREEN, borderRadius: '20px 20px 0 0', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>

        <div style={{ alignSelf: 'center', width: 40, height: 4, backgroundColor: BORDER, borderRadius: 2, margin: '10px auto 4px' }} />

        <div style={{ display: 'flex', alignItems: 'flex-start', padding: '10px 14px', gap: 10, borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const }}>
              {set.setLabel && (
                <span style={{ backgroundColor: BLUE, borderRadius: 4, padding: '2px 7px', fontSize: 12, fontWeight: 800, color: '#fff', letterSpacing: 0.4 }}>{set.setLabel}</span>
              )}
              <span style={{ fontSize: 17, fontWeight: 700, color: TEXT_P }}>{set.name}</span>
            </div>
          </div>
          <button style={{ padding: '6px 12px', backgroundColor: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT_S, fontSize: 14, fontWeight: 700, cursor: 'pointer' }} onClick={onClose}>{t('close')}</button>
        </div>

        <div style={{ display: 'flex', padding: '7px 12px', gap: 7, borderBottom: `1px solid ${BORDER}`, flexWrap: 'wrap' as const }}>
          <div style={sdS.stat}>
            <span style={sdS.statLbl}>{t('statPoints')}</span>
            <span style={sdS.statVal}>{sorted.length}</span>
          </div>
          {refPt && (
            <div style={{ ...sdS.stat, backgroundColor: '#FFF3CD', border: `1px solid #F5A623` }}>
              <span style={{ ...sdS.statLbl, color: '#B8730A' }}>{t('statBenchmark')}</span>
              <span style={{ ...sdS.statVal, color: '#92610A' }}>{(refPt.bmElevation ?? 0).toFixed(3)} ft</span>
            </div>
          )}
          {highElev != null && highElev !== refPt?.bmElevation && (
            <div style={sdS.stat}>
              <span style={sdS.statLbl}>{t('statHighest')}</span>
              <span style={sdS.statVal}>{highElev.toFixed(3)} ft</span>
            </div>
          )}
          {lowElev != null && lowElev !== refPt?.bmElevation && (
            <div style={sdS.stat}>
              <span style={sdS.statLbl}>{t('statLowest')}</span>
              <span style={sdS.statVal}>{lowElev.toFixed(3)} ft</span>
            </div>
          )}
        </div>

        {sorted.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 }}>
            <span style={{ fontSize: 36 }}>📍</span>
            <p style={{ color: TEXT_S, textAlign: 'center', margin: 0 }}>{t('pointsInSet')}</p>
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sorted.map((pt, idx) => {
              const ptType  = getType(pt);
              const theme   = TYPE_THEME[ptType];
              const hasBm   = (pt.bmElevation ?? 0) > 0;
              const elevLbl = t(ELEV_LABEL_KEY[ptType]);
              const elevClr = ptType === 'benchmark' ? '#92610A' : ptType === 'derived' ? BLUE_A : TEXT_P;
              const addr    = pt.createdAddress;
              const lat     = pt.createdLatitude;
              const lon     = pt.createdLongitude;

              return (
                <div key={pt.id} style={{ backgroundColor: CARD, borderRadius: 8, border: `1px solid ${BORDER}`, borderLeft: `4px solid ${theme.border}`, padding: 10, display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ width: 42, height: 42, backgroundColor: BLUE_D, borderRadius: 6, border: `1px solid ${BLUE}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 14, fontWeight: 800, color: BLUE_A, letterSpacing: 0.5 }}>{pt.label}</span>
                    </div>
                    <div style={{ flex: 1 }}>
                      {pt.pointName && <div style={{ fontSize: 16, fontWeight: 700, color: TEXT_P }}>{pt.pointName}</div>}
                      {pt.takenBy   && <div style={{ fontSize: 13, fontWeight: 600, color: TEXT_S }}>{pt.takenBy}</div>}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: TEXT_S, backgroundColor: SURFACE, borderRadius: 3, padding: '1px 6px' }}>#{idx + 1}</span>
                      <span style={{ backgroundColor: theme.badgeBg, border: `1px solid ${theme.badgeBdr}`, borderRadius: 4, padding: '2px 7px', fontSize: 11, fontWeight: 800, color: theme.badgeTxt }}>{t(theme.labelKey)}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 7 }}>
                    <div style={sdS.cell}>
                      <span style={sdS.cellLbl}>{t('rodReading')}</span>
                      <StackedFIFSpan
                        feet={pt.rodFeet ?? '0'}
                        inches={pt.rodInches ?? 0}
                        frac={pt.rodFractionLabel ?? ''}
                        color={TEXT_P}
                        size={17}
                      />
                      <span style={sdS.cellSub}>{(pt.engineeringFeet ?? 0).toFixed(2)} ft</span>
                    </div>
                    {hasBm && (
                      <div style={sdS.cell}>
                        <span style={{ ...sdS.cellLbl, color: theme.badgeTxt }}>{elevLbl}</span>
                        <span style={{ ...sdS.cellVal, color: elevClr }}>{(pt.bmElevation ?? 0).toFixed(3)} ft</span>
                      </div>
                    )}
                  </div>

                  {addr && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: TEXT_P }}>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>📍 {addr}</span>
                      {lat != null && lon != null && (
                        <a href={`https://www.google.com/maps/search/?api=1&query=${lat},${lon}`} target="_blank" rel="noreferrer"
                          style={{ backgroundColor: BLUE, borderRadius: 4, padding: '3px 9px', color: '#fff', fontSize: 12, fontWeight: 800, textDecoration: 'none' }}>{t('svsMapBtn')}</a>
                      )}
                    </div>
                  )}

                  {pt.savedAt && (
                    <div style={{ fontSize: 13, fontWeight: 600, color: TEXT_S, borderTop: `1px solid ${BORDER}`, paddingTop: 5 }}>
                      {t('svsRecorded')}: {fmtTimestamp(pt.savedAt)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const sdS: Record<string, React.CSSProperties> = {
  stat:    { backgroundColor: SURFACE, borderRadius: 6, padding: '5px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 },
  statLbl: { fontSize: 11, fontWeight: 800, color: TEXT_S, letterSpacing: 0.5, textTransform: 'uppercase' },
  statVal: { fontSize: 16, fontWeight: 700, color: TEXT_P, fontFamily: 'monospace' },
  cell:    { flex: 1, backgroundColor: SURFACE, borderRadius: 6, padding: '7px 9px', display: 'flex', flexDirection: 'column', gap: 2 },
  cellLbl: { fontSize: 12, fontWeight: 800, color: TEXT_S, letterSpacing: 0.5, textTransform: 'uppercase' },
  cellVal: { fontSize: 17, fontWeight: 700, color: TEXT_P, fontFamily: 'monospace' },
  cellSub: { fontSize: 13, fontWeight: 600, color: TEXT_P, fontFamily: 'monospace' },
};

// ─── View All Sets Modal ───────────────────────────────────────────────────────
interface ViewAllSetsModalProps {
  sets:       SurveySet[];
  points:     SurveyPoint[];
  currentIdx: number;
  onSelect:   (idx: number) => void;
  onClose:    () => void;
}

function ViewAllSetsModal({ sets, points, currentIdx, onSelect, onClose }: ViewAllSetsModalProps) {
  const { t, lang } = useLang();
  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', zIndex: 200 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: '100%', maxWidth: 480, margin: '0 auto', backgroundColor: SCREEN, borderRadius: '18px 18px 0 0', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ alignSelf: 'center', width: 38, height: 4, backgroundColor: BORDER_S, borderRadius: 2, margin: '10px auto 4px' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 12px 6px', borderBottom: `1px solid ${BORDER}` }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: TEXT_P }}>{t('viewAllSets')}</span>
          <button style={{ padding: '6px 12px', backgroundColor: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 14, fontWeight: 700, color: TEXT_S, cursor: 'pointer' }} onClick={onClose}>{t('close')}</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '7px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
          {sets.map((s, idx) => {
            const ptCount = points.filter(p => p.setId === s.id).length;
            const isCur   = idx === currentIdx;
            return (
              <div key={s.id}
                style={{ backgroundColor: isCur ? BLUE_D : CARD, border: `1px solid ${isCur ? BLUE_A : BORDER}`, borderRadius: 7, padding: '9px 10px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                onClick={() => { onSelect(idx); onClose(); }}>
                {s.setLabel && (
                  <span style={{ backgroundColor: BLUE, borderRadius: 4, padding: '3px 8px', fontSize: 13, fontWeight: 800, color: '#fff', letterSpacing: 0.4, flexShrink: 0 }}>{s.setLabel}</span>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 17, fontWeight: 800, color: TEXT_P, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{s.name}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: TEXT_S, marginTop: 2 }}>{strings[lang].svsCreated(fmtDateFull(s.createdAt, lang))} · {strings[lang].svsPts(ptCount)}</div>
                </div>
                {isCur && <span style={{ fontSize: 18, fontWeight: 800, color: BLUE_A, flexShrink: 0 }}>✓</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Manage Sets Action Sheet ──────────────────────────────────────────────────
interface ManageSheetProps {
  hasSet:       boolean;
  onDeleteThis: () => void;
  onDeleteAll:  () => void;
  onClose:      () => void;
}

function ManageSheet({ hasSet, onDeleteThis, onDeleteAll, onClose }: ManageSheetProps) {
  const { t } = useLang();
  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end', zIndex: 200 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: '100%', maxWidth: 480, margin: '0 auto', backgroundColor: CARD, borderRadius: '16px 16px 0 0', overflow: 'hidden' }}>
        <div style={{ alignSelf: 'center', width: 38, height: 4, backgroundColor: BORDER_S, borderRadius: 2, margin: '10px auto 4px' }} />
        <div style={{ padding: '4px 12px 14px', display: 'flex', flexDirection: 'column', gap: 7 }}>
          {hasSet && (
            <button
              style={{ width: '100%', padding: '12px 14px', backgroundColor: 'rgba(192,57,43,0.06)', border: `1px solid rgba(192,57,43,0.25)`, borderRadius: 10, fontSize: 14, fontWeight: 700, color: RED, cursor: 'pointer', textAlign: 'left' as const }}
              onClick={onDeleteThis}
            >{t('deleteSelectedSet')}</button>
          )}
          <button
            style={{ width: '100%', padding: '12px 14px', backgroundColor: 'rgba(192,57,43,0.06)', border: `1px solid rgba(192,57,43,0.25)`, borderRadius: 10, fontSize: 14, fontWeight: 700, color: RED, cursor: 'pointer', textAlign: 'left' as const }}
            onClick={onDeleteAll}
          >{t('deleteAllSetsBtn')}</button>
          <button
            style={{ width: '100%', padding: '12px 14px', backgroundColor: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, fontSize: 14, fontWeight: 600, color: TEXT_S, cursor: 'pointer' }}
            onClick={onClose}
          >{t('cancel')}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
interface Props { projectId: string }

export default function ViewSetsScreen({ projectId }: Props) {
  const { t, lang } = useLang();
  const { getSets, getPoints, deleteSet, deletePoints } = useSurveyStore();
  const sets   = getSets(projectId);
  const points = getPoints(projectId);

  const [filter,       setFilter]       = useState<Filter>('latest');
  const [search,       setSearch]       = useState('');
  const [rawIdx,       setRawIdx]       = useState<number | null>(null);
  const [detailSet,    setDetailSet]    = useState<SurveySet | null>(null);
  const [showManage,   setShowManage]   = useState(false);
  const [showAllModal, setShowAllModal] = useState(false);

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

  // Reset navigator when filter/search changes
  useEffect(() => { setRawIdx(null); }, [filter, search]);

  const curIdx = rawIdx !== null
    ? Math.max(0, Math.min(rawIdx, displayed.length - 1))
    : 0;

  const curSet  = displayed[curIdx] ?? null;
  const ptCount = curSet ? points.filter(p => p.setId === curSet.id).length : 0;

  const detailPoints = detailSet ? points.filter(p => p.setId === detailSet.id) : [];

  const handleDeleteThis = () => {
    if (!curSet) return;
    setShowManage(false);
    if (!window.confirm(strings[lang].deleteSingleSet(curSet.name))) return;
    // Cascade: delete all points belonging to this set, then delete the set
    const ptIds = points.filter(p => p.setId === curSet.id).map(p => p.id);
    if (ptIds.length > 0) deletePoints(projectId, ptIds);
    deleteSet(projectId, curSet.id);
    setRawIdx(null);
  };

  const handleDeleteAll = () => {
    setShowManage(false);
    if (sets.length === 0) return;
    if (!window.confirm(strings[lang].deleteAllSets(sets.length))) return;
    // Cascade: delete all points for all sets first, then delete all sets
    const allPtIds = points.map(p => p.id);
    if (allPtIds.length > 0) deletePoints(projectId, allPtIds);
    sets.forEach(s => deleteSet(projectId, s.id));
    setRawIdx(null);
  };

  const FILTERS: { id: Filter; label: string }[] = [
    { id: 'latest', label: t('setLatest') },
    { id: 'name',   label: t('setByName') },
    { id: 'search', label: t('setSearch') },
  ];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>

      {/* Segmented filter control */}
      <div style={{ display: 'flex', backgroundColor: '#EEF4FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: 3, margin: '6px 8px', gap: 3, flexShrink: 0 }}>
        {FILTERS.map(f => {
          const isActive = filter === f.id;
          return (
            <button key={f.id} style={{
              flex: 1, height: 34, borderRadius: 7,
              border: 'none',
              backgroundColor: isActive ? '#DBEAFE' : 'transparent',
              color: isActive ? NAVY : '#6B7280',
              fontSize: 15, fontWeight: isActive ? 700 : 600,
              cursor: 'pointer', boxShadow: isActive ? '0 1px 3px rgba(20,58,99,0.12)' : 'none',
              whiteSpace: 'nowrap' as const, overflow: 'hidden',
              transition: 'background-color 0.2s, color 0.2s, box-shadow 0.2s',
            }} onClick={() => setFilter(f.id)}>{f.label}</button>
          );
        })}
      </div>

      {/* ── Search input ── */}
      {filter === 'search' && (
        <div style={{ padding: '6px 10px', backgroundColor: CARD, borderBottom: `1px solid ${BORDER}` }}>
          <input
            style={{ width: '100%', height: 36, borderRadius: 6, border: `1px solid ${BORDER}`, padding: '0 10px', fontSize: 15, color: TEXT_P, outline: 'none', backgroundColor: SURFACE, boxSizing: 'border-box' as const }}
            placeholder={t('searchSets')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
        </div>
      )}

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 10px', backgroundColor: CARD, borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: TEXT_P, letterSpacing: 0.6, textTransform: 'uppercase' as const }}>
          {strings[lang].svsSets(sets.length)}
        </span>
        {sets.length > 0 && (
          <button
            style={{ height: 30, padding: '0 12px', backgroundColor: BLUE_D, border: `1px solid ${BLUE}`, borderRadius: 6, fontSize: 13, fontWeight: 700, color: BLUE_A, cursor: 'pointer' }}
            onClick={() => setShowManage(true)}
          >{t('manageSets')}</button>
        )}
      </div>

      {/* ── Main scrollable body ── */}
      {displayed.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 }}>
          <span style={{ fontSize: 40 }}>🗂</span>
          <p style={{ fontSize: 15, fontWeight: 700, color: TEXT_P, margin: 0 }}>
            {filter === 'search' ? t('noSetsMatch') : t('noSetsYet')}
          </p>
          <p style={{ fontSize: 13, color: TEXT_S, textAlign: 'center', lineHeight: 1.5, margin: 0, maxWidth: 260 }}>
            {filter === 'search' ? strings[lang].noSetsMatchDesc(search) : t('createFirstSet')}
          </p>
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>

          {/* ── Single set card ── */}
          {curSet && (
            <div style={{ backgroundColor: CARD, borderRadius: 8, border: `1px solid ${BORDER}`, borderLeft: `4px solid ${BLUE}`, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>

              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {curSet.setLabel && (
                  <span style={{ backgroundColor: BLUE, borderRadius: 4, padding: '2px 7px', fontSize: 12, fontWeight: 800, color: '#fff', letterSpacing: 0.5, flexShrink: 0 }}>{curSet.setLabel}</span>
                )}
                <span style={{ fontSize: 17, fontWeight: 800, color: TEXT_P, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{curSet.name}</span>
              </div>

              {/* Info grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 10px' }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: TEXT_S, letterSpacing: 0.5, textTransform: 'uppercase' as const, marginBottom: 1 }}>{t('svsCreatedLabel')}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: TEXT_P }}>{fmtDateFull(curSet.createdAt, lang)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: TEXT_S, letterSpacing: 0.5, textTransform: 'uppercase' as const, marginBottom: 1 }}>{t('svsPointsLabel')}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: BLUE_A }}>{ptCount}</div>
                </div>
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  style={{ flex: 1, height: 36, backgroundColor: BLUE_D, border: `1px solid ${BLUE}`, borderRadius: 7, fontSize: 14, fontWeight: 700, color: BLUE_A, cursor: 'pointer' }}
                  onClick={() => setDetailSet(curSet)}
                >{t('viewSetDetails')}</button>
                <button
                  style={{ height: 36, padding: '0 14px', backgroundColor: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 7, fontSize: 14, fontWeight: 700, color: TEXT_S, cursor: 'pointer' }}
                  onClick={() => setShowAllModal(true)}
                >{t('viewAllSets')}</button>
              </div>
            </div>
          )}

          {/* ── Prev / Next navigation ── */}
          {displayed.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <button
                disabled={curIdx === 0}
                style={{ flex: 1, height: 34, backgroundColor: curIdx === 0 ? SURFACE : CARD, border: `1px solid ${curIdx === 0 ? BORDER : BLUE}`, borderRadius: 6, fontSize: 14, fontWeight: 700, color: curIdx === 0 ? TEXT_D : BLUE_A, cursor: curIdx === 0 ? 'default' : 'pointer', opacity: curIdx === 0 ? 0.4 : 1 }}
                onClick={() => setRawIdx(curIdx - 1)}
              >← {t('prevSet')}</button>
              <span style={{ fontSize: 13, fontWeight: 700, color: TEXT_S, whiteSpace: 'nowrap' as const }}>
                {curIdx + 1}/{displayed.length}
              </span>
              <button
                disabled={curIdx === displayed.length - 1}
                style={{ flex: 1, height: 34, backgroundColor: curIdx === displayed.length - 1 ? SURFACE : CARD, border: `1px solid ${curIdx === displayed.length - 1 ? BORDER : BLUE}`, borderRadius: 6, fontSize: 14, fontWeight: 700, color: curIdx === displayed.length - 1 ? TEXT_D : BLUE_A, cursor: curIdx === displayed.length - 1 ? 'default' : 'pointer', opacity: curIdx === displayed.length - 1 ? 0.4 : 1 }}
                onClick={() => setRawIdx(curIdx + 1)}
              >{t('nextSet')} →</button>
            </div>
          )}

          {/* Ad space */}
          <div style={{ height: 54, borderTop: `1px dashed ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 4 }}>
            <span style={{ fontSize: 10, color: TEXT_D, letterSpacing: 0.8, fontWeight: 600 }}>AD SPACE</span>
          </div>
        </div>
      )}

      {/* Manage Sets action sheet */}
      {showManage && (
        <ManageSheet
          hasSet={!!curSet}
          onDeleteThis={handleDeleteThis}
          onDeleteAll={handleDeleteAll}
          onClose={() => setShowManage(false)}
        />
      )}

      {/* View All Sets modal */}
      {showAllModal && (
        <ViewAllSetsModal
          sets={displayed}
          points={points}
          currentIdx={curIdx}
          onSelect={idx => setRawIdx(idx)}
          onClose={() => setShowAllModal(false)}
        />
      )}

      {/* Set detail overlay */}
      {detailSet && (
        <SetDetailView
          set={detailSet}
          points={detailPoints}
          onClose={() => setDetailSet(null)}
        />
      )}
    </div>
  );
}
