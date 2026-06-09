import React, { useState, useMemo } from 'react';
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
const SURFACE = '#F0EEE8';
const CARD    = '#FFFFFF';
const SCREEN  = '#F5F4F0';
const TEXT_P  = '#111827';
const TEXT_S  = '#374151';
const TEXT_D  = '#9CA3AF';

type Filter   = 'latest' | 'name' | 'search';
type PointType = 'benchmark' | 'derived' | 'standalone';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDateFull(ts: number, lang: string): string {
  return new Date(ts).toLocaleDateString(lang === 'es' ? 'es-MX' : 'en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
}

interface SetStats {
  benchmarkElev: number | null;
  highestBmElev: number | null;
  lowestBmElev:  number | null;
  range:         number | null;
}

function computeSetStats(setId: string, points: SurveyPoint[]): SetStats {
  const setPts = points.filter(p => p.setId === setId);
  const withBm = setPts.filter(p => (p.bmElevation ?? 0) > 0);
  if (withBm.length === 0) return { benchmarkElev: null, highestBmElev: null, lowestBmElev: null, range: null };
  const sorted = [...withBm].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  const refBm  = sorted[0].bmElevation!;
  const elevs  = withBm.map(p => p.bmElevation!);
  const high   = Math.max(...elevs);
  const low    = Math.min(...elevs);
  return { benchmarkElev: refBm, highestBmElev: high, lowestBmElev: low, range: withBm.length > 1 ? high - low : null };
}

// ─── Point type theming ───────────────────────────────────────────────────────
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

// ─── SetDetailView (bottom-sheet overlay) ─────────────────────────────────────
interface SetDetailProps {
  set:    SurveySet;
  points: SurveyPoint[];   // points in this set
  onClose: () => void;
}

function SetDetailView({ set, points, onClose }: SetDetailProps) {
  const { t } = useLang();
  const sorted = [...points].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { numeric: true }));

  // Resolve benchmark (earliest point with bmElevation > 0)
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

  function fmtRod(pt: SurveyPoint): string {
    const feet   = pt.rodFeet ?? '0';
    const inches = pt.rodInches ?? 0;
    const frac   = pt.rodFractionLabel ?? '';
    if (!inches && (!frac || frac === '0' || frac === 'None')) return `${feet} ft`;
    if (!frac || frac === '0' || frac === 'None') return `${feet}′ ${inches}″`;
    return `${feet}′ ${inches} ${frac}″`;
  }

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', zIndex: 200 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: '100%', maxWidth: 480, margin: '0 auto', backgroundColor: SCREEN, borderRadius: '20px 20px 0 0', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>

        {/* Handle */}
        <div style={{ alignSelf: 'center', width: 40, height: 4, backgroundColor: BORDER, borderRadius: 2, margin: '10px auto 4px' }} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', padding: '12px 16px', gap: 12, borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {set.setLabel && (
                <span style={{ backgroundColor: BLUE, borderRadius: 4, padding: '2px 6px', fontSize: 9, fontWeight: 800, color: '#fff', letterSpacing: 0.4 }}>{set.setLabel}</span>
              )}
              <span style={{ fontSize: 18, fontWeight: 700, color: TEXT_P }}>{set.name}</span>
            </div>
          </div>
          <button style={{ padding: '6px 12px', backgroundColor: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT_S, fontSize: 13, fontWeight: 600, cursor: 'pointer' }} onClick={onClose}>{t('close')}</button>
        </div>

        {/* Stats bar */}
        <div style={{ display: 'flex', padding: '8px 12px', gap: 8, borderBottom: `1px solid ${BORDER}`, flexWrap: 'wrap' }}>
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

        {/* Point list */}
        {sorted.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 }}>
            <span style={{ fontSize: 36 }}>📍</span>
            <p style={{ color: TEXT_S, textAlign: 'center', margin: 0 }}>{t('pointsInSet')}</p>
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                <div key={pt.id} style={{ backgroundColor: CARD, borderRadius: 10, border: `1px solid ${BORDER}`, borderLeft: `4px solid ${theme.border}`, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ width: 44, height: 44, backgroundColor: BLUE_D, borderRadius: 6, border: `1px solid ${BLUE}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: BLUE_A, letterSpacing: 0.5 }}>{pt.label}</span>
                    </div>
                    <div style={{ flex: 1 }}>
                      {pt.pointName && <div style={{ fontSize: 13, fontWeight: 700, color: TEXT_P }}>{pt.pointName}</div>}
                      {pt.takenBy   && <div style={{ fontSize: 11, color: TEXT_S }}>{pt.takenBy}</div>}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                      <span style={{ fontSize: 10, color: TEXT_D, backgroundColor: SURFACE, borderRadius: 3, padding: '1px 5px' }}>#{idx + 1}</span>
                      <span style={{ backgroundColor: theme.badgeBg, border: `1px solid ${theme.badgeBdr}`, borderRadius: 4, padding: '2px 5px', fontSize: 7.5, fontWeight: 800, color: theme.badgeTxt }}>{t(theme.labelKey)}</span>
                    </div>
                  </div>

                  {/* Data grid */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={sdS.cell}>
                      <span style={sdS.cellLbl}>{t('rodReading')}</span>
                      <span style={sdS.cellVal}>{fmtRod(pt)}</span>
                      <span style={sdS.cellSub}>{(pt.engineeringFeet ?? 0).toFixed(2)} ft</span>
                    </div>
                    {hasBm && (
                      <div style={sdS.cell}>
                        <span style={{ ...sdS.cellLbl, color: theme.badgeTxt }}>{elevLbl}</span>
                        <span style={{ ...sdS.cellVal, color: elevClr }}>{(pt.bmElevation ?? 0).toFixed(3)} ft</span>
                      </div>
                    )}
                  </div>

                  {/* Location */}
                  {addr && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: TEXT_S }}>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📍 {addr}</span>
                      {lat != null && lon != null && (
                        <a href={`https://www.google.com/maps/search/?api=1&query=${lat},${lon}`} target="_blank" rel="noreferrer"
                          style={{ backgroundColor: BLUE, borderRadius: 4, padding: '2px 7px', color: '#fff', fontSize: 9, fontWeight: 800, textDecoration: 'none' }}>{t('svsMapBtn')}</a>
                      )}
                    </div>
                  )}

                  {/* Timestamp */}
                  {pt.savedAt && (
                    <div style={{ fontSize: 10, color: TEXT_D, borderTop: `1px solid ${BORDER}`, paddingTop: 6 }}>
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
  stat:    { backgroundColor: SURFACE, borderRadius: 6, padding: '4px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 },
  statLbl: { fontSize: 7, fontWeight: 800, color: TEXT_D, letterSpacing: 0.5, textTransform: 'uppercase' },
  statVal: { fontSize: 13, fontWeight: 700, color: TEXT_P, fontFamily: 'monospace' },
  cell:    { flex: 1, backgroundColor: SURFACE, borderRadius: 6, padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 2 },
  cellLbl: { fontSize: 8, fontWeight: 800, color: TEXT_D, letterSpacing: 0.5, textTransform: 'uppercase' },
  cellVal: { fontSize: 13, fontWeight: 700, color: TEXT_P, fontFamily: 'monospace' },
  cellSub: { fontSize: 10, color: TEXT_S, fontFamily: 'monospace' },
};

// ─── Set Card ─────────────────────────────────────────────────────────────────
interface SetCardProps {
  set:          SurveySet;
  points:       SurveyPoint[];
  isSelected:   boolean;
  isSelectMode: boolean;
  onToggle:     () => void;
  onDelete:     () => void;
  onOpen:       () => void;
}

function SetCard({ set, points, isSelected, isSelectMode, onToggle, onDelete, onOpen }: SetCardProps) {
  const { t, lang } = useLang();
  const ptCount = points.filter(p => p.setId === set.id).length;
  const stats   = useMemo(() => computeSetStats(set.id, points), [set.id, points]);

  const handleClick = () => { if (isSelectMode) onToggle(); else onOpen(); };

  return (
    <div
      style={{
        backgroundColor: isSelected ? 'rgba(30,87,153,0.04)' : CARD, borderRadius: 10,
        border: `1px solid ${isSelected ? BLUE : BORDER}`,
        padding: 12, display: 'flex', flexDirection: 'column', gap: 8,
        cursor: 'pointer', userSelect: 'none',
      } as React.CSSProperties}
      onClick={handleClick}
    >
      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {isSelectMode && (
          <div style={{ width: 22, height: 22, borderRadius: 5, border: `2px solid ${isSelected ? BLUE_A : BORDER}`, backgroundColor: isSelected ? BLUE_A : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {isSelected && <span style={{ color: '#fff', fontSize: 12, fontWeight: 800, lineHeight: 1 }}>✓</span>}
          </div>
        )}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          {set.setLabel && (
            <span style={{ backgroundColor: BLUE, borderRadius: 4, padding: '2px 6px', fontSize: 9, fontWeight: 800, color: '#fff', letterSpacing: 0.4, flexShrink: 0 }}>{set.setLabel}</span>
          )}
          <span style={{ fontSize: 14, fontWeight: 700, color: TEXT_P, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{set.name}</span>
        </div>
        {!isSelectMode && (
          <button
            style={{ width: 30, height: 30, borderRadius: 6, backgroundColor: 'rgba(42,20,20,0.08)', border: 'none', cursor: 'pointer', fontSize: 14 }}
            onClick={e => { e.stopPropagation(); onDelete(); }}
            title={t('delete')}
          >🗑</button>
        )}
      </div>

      {/* Meta chips */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ backgroundColor: BLUE_D, borderRadius: 4, padding: '2px 6px', fontSize: 11, fontWeight: 600, color: BLUE_A }}>
          {strings[lang].svsPts(ptCount)}
        </span>
        <span style={{ fontSize: 11, color: TEXT_D }}>{strings[lang].svsCreated(fmtDateFull(set.createdAt, lang))}</span>
      </div>

      {/* Elevation stats */}
      {stats.benchmarkElev != null && (
        <div style={{ backgroundColor: SURFACE, borderRadius: 6, padding: '6px 8px', border: `1px solid ${BORDER}`, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={scS.statRow}>
            <span style={scS.statLbl}>{t('svsBenchmarkElev')}</span>
            <span style={{ ...scS.statVal, color: '#B8730A', fontWeight: 800 }}>{stats.benchmarkElev.toFixed(3)} ft</span>
          </div>
          {stats.highestBmElev != null && stats.highestBmElev !== stats.benchmarkElev && (
            <div style={scS.statRow}>
              <span style={scS.statLbl}>{t('svsHighestDerived')}</span>
              <span style={scS.statVal}>{stats.highestBmElev.toFixed(3)} ft</span>
            </div>
          )}
          {stats.lowestBmElev != null && stats.lowestBmElev !== stats.benchmarkElev && (
            <div style={scS.statRow}>
              <span style={scS.statLbl}>{t('svsLowestDerived')}</span>
              <span style={scS.statVal}>{stats.lowestBmElev.toFixed(3)} ft</span>
            </div>
          )}
          {stats.range != null && (
            <div style={scS.statRow}>
              <span style={scS.statLbl}>{t('svsElevRange')}</span>
              <span style={scS.statVal}>{stats.range.toFixed(3)} ft</span>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      {!isSelectMode && (
        <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 6, textAlign: 'right' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: BLUE_A }}>{t('viewDetails')}</span>
        </div>
      )}
    </div>
  );
}

const scS: Record<string, React.CSSProperties> = {
  statRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  statLbl: { fontSize: 9, fontWeight: 800, color: TEXT_D, letterSpacing: 0.5, textTransform: 'uppercase' },
  statVal: { fontSize: 11, fontWeight: 700, color: TEXT_P, fontFamily: 'monospace' },
};

// ─── Main Component ───────────────────────────────────────────────────────────
interface Props { projectId: string }

export default function ViewSetsScreen({ projectId }: Props) {
  const { t, lang } = useLang();
  const { getSets, getPoints, deleteSet } = useSurveyStore();
  const sets   = getSets(projectId);
  const points = getPoints(projectId);

  const [filter,       setFilter]       = useState<Filter>('latest');
  const [search,       setSearch]       = useState('');
  const [detailSet,    setDetailSet]    = useState<SurveySet | null>(null);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds,  setSelectedIds]  = useState<Set<string>>(new Set());

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

  const toggleSet   = (id: string) => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectAll   = () => setSelectedIds(new Set(displayed.map(s => s.id)));
  const clearSelect = () => { setSelectedIds(new Set()); setIsSelectMode(false); };

  const handleDeleteSingle = (s: SurveySet) => {
    if (!window.confirm(strings[lang].deleteSingleSet(s.name))) return;
    deleteSet(projectId, s.id);
  };

  const handleBulkDelete = () => {
    const count = selectedIds.size;
    if (!window.confirm(strings[lang].deleteBulkSets(count))) return;
    selectedIds.forEach(id => deleteSet(projectId, id));
    setSelectedIds(new Set());
    setIsSelectMode(false);
  };

  const handleDeleteAll = () => {
    if (sets.length === 0) return;
    if (!window.confirm(strings[lang].deleteAllSets(sets.length))) return;
    sets.forEach(s => deleteSet(projectId, s.id));
    setSelectedIds(new Set());
    setIsSelectMode(false);
  };

  const detailPoints = detailSet ? points.filter(p => p.setId === detailSet.id) : [];

  const FILTERS: { id: Filter; label: string }[] = [
    { id: 'latest', label: t('setLatest') },
    { id: 'name',   label: t('setByName') },
    { id: 'search', label: t('setSearch') },
  ];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>

      {/* Gold filter bar */}
      <div style={{ display: 'flex', backgroundColor: GOLD, padding: '6px 8px', gap: 6, flexShrink: 0 }}>
        {FILTERS.map(f => {
          const isActive = filter === f.id;
          return (
            <button key={f.id} style={{
              flex: 1, height: 40, borderRadius: 10,
              border: `1.5px solid ${isActive ? 'rgba(0,0,0,0.07)' : 'rgba(140,95,0,0.20)'}`,
              backgroundColor: isActive ? '#FFFFFF' : GOLD,
              color: '#163A63', fontSize: 12, fontWeight: 700,
              cursor: 'pointer', boxShadow: isActive ? '0 1px 4px rgba(0,0,0,0.10)' : 'none',
              whiteSpace: 'nowrap', overflow: 'hidden',
              transition: 'background-color 0.15s, border-color 0.15s, box-shadow 0.15s',
            }} onClick={() => setFilter(f.id)}>{f.label}</button>
          );
        })}
      </div>

      {/* Search input */}
      {filter === 'search' && (
        <div style={{ padding: '8px 12px', backgroundColor: CARD, borderBottom: `1px solid ${BORDER}` }}>
          <input
            style={{ width: '100%', height: 36, borderRadius: 8, border: `1px solid ${BORDER}`, padding: '0 12px', fontSize: 13, color: TEXT_P, outline: 'none', backgroundColor: SURFACE, boxSizing: 'border-box' }}
            placeholder={t('searchSets')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', backgroundColor: CARD, borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: TEXT_S, letterSpacing: 0.6, textTransform: 'uppercase' }}>
          {strings[lang].svsSets(sets.length)}
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          {!isSelectMode ? (
            <>
              <button style={tbS.btn} onClick={() => setIsSelectMode(true)}>{t('selectSets')}</button>
              {sets.length > 0 && (
                <button style={tbS.deleteBtn} onClick={handleDeleteAll}>{t('deleteAll')}</button>
              )}
            </>
          ) : (
            <>
              <button style={tbS.btn} onClick={selectAll}>{t('selectAll')}</button>
              <button style={tbS.btn} onClick={clearSelect}>{t('cancel')}</button>
            </>
          )}
        </div>
      </div>

      {/* List */}
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
        <div style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: isSelectMode && selectedIds.size > 0 ? 72 : 8 }}>
          {displayed.map(s => (
            <SetCard
              key={s.id}
              set={s}
              points={points}
              isSelected={selectedIds.has(s.id)}
              isSelectMode={isSelectMode}
              onToggle={() => toggleSet(s.id)}
              onDelete={() => handleDeleteSingle(s)}
              onOpen={() => setDetailSet(s)}
            />
          ))}
        </div>
      )}

      {/* Bulk action bar */}
      {isSelectMode && selectedIds.size > 0 && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: CARD, borderTop: `1px solid ${BORDER}`, padding: '10px 16px' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: TEXT_P }}>{selectedIds.size} {t('selected')}</span>
          <button
            style={{ backgroundColor: '#C0392B', border: 'none', borderRadius: 8, padding: '8px 16px', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
            onClick={handleBulkDelete}
          >{t('deleteSelected')}</button>
        </div>
      )}

      {/* SetDetailView overlay */}
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

const tbS: Record<string, React.CSSProperties> = {
  btn:       { backgroundColor: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '4px 8px', fontSize: 11, fontWeight: 600, color: TEXT_S, cursor: 'pointer' },
  deleteBtn: { backgroundColor: 'rgba(192,57,43,0.10)', border: '1px solid rgba(192,57,43,0.3)', borderRadius: 6, padding: '4px 8px', fontSize: 11, fontWeight: 700, color: '#C0392B', cursor: 'pointer' },
};
