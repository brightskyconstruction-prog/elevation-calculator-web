import React, { useState, useRef, useCallback } from 'react';
import { useLang } from '../LangContext';
import { strings } from '../i18n';

// ── Design tokens (mirror app tokens) ────────────────────────────────────────
const NAVY      = '#143A63';
const BLUE_ACC  = '#3B82F6';
const BLUE_DEEP = 'rgba(30,87,153,0.10)';
const CARD      = '#FFFFFF';
const SURFACE   = '#F0EEE8';
const TEXT_PRI  = '#111827';
const TEXT_SEC  = '#374151';   // dark charcoal — used for secondary text
const TEXT_MID  = '#4B5563';   // gray-600 — replaces TEXT_DIS for readable contrast
const BORDER    = '#E5E7EB';

// ── Category color palette ────────────────────────────────────────────────────
const CAT_COLORS: Record<string, string> = {
  'getting-started': '#0284C7',
  'survey-points':   '#7C3AED',
  'compare-height':  '#059669',
  'slope':           '#D97706',
  'view-sets':       '#DC2626',
  'calculator':      '#0891B2',
};

const CAT_ICONS: Record<string, string> = {
  'getting-started': '🚀',
  'survey-points':   '📍',
  'compare-height':  '⇅',
  'slope':           '📐',
  'view-sets':       '🗂',
  'calculator':      '🧮',
};

const FEATURED_YOUTUBE_ID = 'jNQXAC9IVRw';  // replace with real tutorial video ID

// ── TutorialScreen component ──────────────────────────────────────────────────
export default function TutorialScreen() {
  const { t, lang } = useLang();

  const [expanded,    setExpanded]    = useState<string | null>('getting-started');
  const [searchOpen,  setSearchOpen]  = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Build localized category/video data inside the component
  const CATEGORIES = [
    {
      id: 'getting-started',
      title: t('tutCatGettingStarted'),
      videos: [
        { title: t('tutGS1Title'), description: t('tutGS1Desc'), youtubeId: null },
        { title: t('tutGS2Title'), description: t('tutGS2Desc'), youtubeId: null },
      ],
    },
    {
      id: 'survey-points',
      title: t('tutCatSurveyPoints'),
      videos: [
        { title: t('tutSP1Title'), description: t('tutSP1Desc'), youtubeId: null },
        { title: t('tutSP2Title'), description: t('tutSP2Desc'), youtubeId: null },
        { title: t('tutSP3Title'), description: t('tutSP3Desc'), youtubeId: null },
      ],
    },
    {
      id: 'compare-height',
      title: t('tutCatCompareHeight'),
      videos: [
        { title: t('tutCH1Title'), description: t('tutCH1Desc'), youtubeId: null },
        { title: t('tutCH2Title'), description: t('tutCH2Desc'), youtubeId: null },
        { title: t('tutCH3Title'), description: t('tutCH3Desc'), youtubeId: null },
      ],
    },
    {
      id: 'slope',
      title: t('tutCatSlope'),
      videos: [
        { title: t('tutSL1Title'), description: t('tutSL1Desc'), youtubeId: null },
        { title: t('tutSL2Title'), description: t('tutSL2Desc'), youtubeId: null },
      ],
    },
    {
      id: 'view-sets',
      title: t('tutCatViewSets'),
      videos: [
        { title: t('tutVS1Title'), description: t('tutVS1Desc'), youtubeId: null },
        { title: t('tutVS2Title'), description: t('tutVS2Desc'), youtubeId: null },
        { title: t('tutVS3Title'), description: t('tutVS3Desc'), youtubeId: null },
      ],
    },
    {
      id: 'calculator',
      title: t('tutCatCalculator'),
      videos: [
        { title: t('tutCA1Title'), description: t('tutCA1Desc'), youtubeId: null },
        { title: t('tutCA2Title'), description: t('tutCA2Desc'), youtubeId: null },
      ],
    },
  ];

  // ── Search filtering ──────────────────────────────────────────────
  const q = searchQuery.trim().toLowerCase();
  const filteredCategories = q
    ? CATEGORIES
        .map(cat => {
          const catMatch = cat.title.toLowerCase().includes(q);
          const matchedVideos = cat.videos.filter(
            v =>
              v.title.toLowerCase().includes(q) ||
              v.description.toLowerCase().includes(q),
          );
          // Include category if it matches by name OR has matching videos
          if (catMatch) return { ...cat, videos: cat.videos };
          if (matchedVideos.length > 0) return { ...cat, videos: matchedVideos };
          return null;
        })
        .filter(Boolean) as typeof CATEGORIES
    : CATEGORIES;

  const hasNoResults = q.length > 0 && filteredCategories.length === 0;

  // ── Open search & auto-focus ──────────────────────────────────────
  const openSearch = useCallback(() => {
    setSearchOpen(true);
    // rAF ensures the input is mounted before we try to focus it
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
  }, []);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery('');
  }, []);

  return (
    <div style={s.root}>

      {/* ── Page header ──────────────────────────────────────────── */}
      <div style={s.pageHeader}>

        {/* Left: FAQ icon */}
        <div style={s.pageHeaderIcon}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
               stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>

        {/* Center: title */}
        <div style={s.pageHeaderCenter}>
          <span style={s.pageHeaderTitle}>{t('tutFaqVideos')}</span>
        </div>

        {/* Right: search button */}
        <button style={s.searchBtn} onClick={openSearch} aria-label={t('tutSearch')}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
               stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <span style={s.searchBtnLabel}>{t('tutSearch')}</span>
        </button>
      </div>

      {/* ── Search bar (shown when open) ──────────────────────────── */}
      {searchOpen && (
        <>
        <style>{`
          .tut-search-input,
          .tut-search-input:focus,
          .tut-search-input:active {
            outline: none !important;
            box-shadow: none !important;
            border: none !important;
            -webkit-appearance: none !important;
            appearance: none !important;
            background-color: transparent !important;
          }
        `}</style>
        <div style={s.searchBar}>
          <div style={s.searchInputWrap}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                 stroke={TEXT_MID} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                 style={{ flexShrink: 0 }}>
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={searchInputRef}
              type="text"
              className="tut-search-input"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={t('tutSearchPlaceholder')}
              style={s.searchInput}
              autoComplete="off"
              enterKeyHint="search"
            />
            {searchQuery.length > 0 && (
              <button style={s.searchClearBtn} onClick={() => setSearchQuery('')} aria-label="Clear">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                     stroke={TEXT_MID} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
          <button style={s.searchCancelBtn} onClick={closeSearch}>
            {t('cancel')}
          </button>
        </div>
        </>
      )}

      <div style={s.scrollArea}>

        {/* ── No results ───────────────────────────────────────────── */}
        {hasNoResults && (
          <div style={s.noResultsCard}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
                 stroke={TEXT_MID} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                 style={{ marginBottom: 10 }}>
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <div style={s.noResultsTitle}>{t('tutNoResults')}</div>
            <div style={s.noResultsHint}>{t('tutNoResultsHint')}</div>
          </div>
        )}

        {/* ── Featured Video (hidden during active search) ──────────── */}
        {!q && (
          <>
            <div style={s.sectionHeading}>{t('tutFeaturedVideo')}</div>
            <div style={s.videoCard}>
              <div style={s.videoEmbed}>
                <iframe
                  src={`https://www.youtube.com/embed/${FEATURED_YOUTUBE_ID}?rel=0&modestbranding=1`}
                  title={t('tutFeaturedTitle')}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  style={s.videoIframe}
                />
              </div>
              <div style={s.videoMeta}>
                <div style={s.videoTitle}>{t('tutFeaturedTitle')}</div>
                <div style={s.videoDesc}>{t('tutFeaturedDesc')}</div>
              </div>
            </div>
          </>
        )}

        {/* ── Tutorial Categories ───────────────────────────────────── */}
        {!hasNoResults && (
          <>
            <div style={s.sectionHeading}>{t('tutTutorialVideos')}</div>
            <div style={s.categoriesList}>
              {filteredCategories.map(cat => {
                const isOpen = expanded === cat.id || (q.length > 0);
                const color  = CAT_COLORS[cat.id] ?? '#0284C7';
                const icon   = CAT_ICONS[cat.id]  ?? '📋';
                return (
                  <div key={cat.id} style={s.categoryCard}>

                    {/* Category header */}
                    <button
                      style={{ ...s.categoryHeader, borderBottom: isOpen ? `1px solid ${BORDER}` : 'none' }}
                      onClick={() => !q && setExpanded(isOpen ? null : cat.id)}
                    >
                      <div style={s.categoryLeft}>
                        <div style={{ ...s.categoryIconBox, backgroundColor: color + '18', border: `1.5px solid ${color}40` }}>
                          <span style={{ fontSize: 18 }}>{icon}</span>
                        </div>
                        <div>
                          <div style={s.categoryTitle}>{cat.title}</div>
                          <div style={s.categoryMeta}>
                            {strings[lang].tutCount(cat.videos.length)}
                          </div>
                        </div>
                      </div>
                      {!q && <ChevronIcon open={isOpen} />}
                    </button>

                    {/* Video list */}
                    {isOpen && (
                      <div style={s.videoList}>
                        {cat.videos.map((vid, i) => (
                          <div
                            key={i}
                            style={{
                              ...s.videoRow,
                              borderBottom: i < cat.videos.length - 1 ? `1px solid ${BORDER}` : 'none',
                            }}
                          >
                            <div style={s.videoRowLeft}>
                              <div style={s.comingSoonBadge}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                                     stroke="currentColor" strokeWidth="2.5"
                                     strokeLinecap="round" strokeLinejoin="round">
                                  <polygon points="5 3 19 12 5 21 5 3" />
                                </svg>
                                <span>{t('tutComingSoon')}</span>
                              </div>
                            </div>
                            <div style={s.videoRowRight}>
                              <div style={s.videoRowTitle}>{vid.title}</div>
                              <div style={s.videoRowDesc}>{vid.description}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ── Footer note ──────────────────────────────────────────── */}
        {!q && (
          <div style={s.footerNote}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                 stroke={TEXT_MID} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{t('tutFooterNote')}</span>
          </div>
        )}

        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}

// ── Chevron icon ──────────────────────────────────────────────────────────────
function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke={TEXT_SEC} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{
        transform:  open ? 'rotate(180deg)' : 'rotate(0deg)',
        transition: 'transform 0.2s',
        flexShrink: 0,
      }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {

  /* ── Root ── */
  root: {
    display:         'flex',
    flexDirection:   'column',
    flex:            1,
    overflow:        'hidden',
    backgroundColor: SURFACE,
  },

  /* ── Header ── */
  pageHeader: {
    display:         'flex',
    alignItems:      'center',
    backgroundColor: NAVY,
    padding:         '13px 14px',
    flexShrink:      0,
    gap:             10,
  },
  pageHeaderIcon: {
    width:           36,
    height:          36,
    borderRadius:    9,
    backgroundColor: 'rgba(255,255,255,0.12)',
    border:          '1.5px solid rgba(255,255,255,0.20)',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
  },
  pageHeaderCenter: {
    flex:            1,
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
  },
  pageHeaderTitle: {
    fontSize:        20,
    fontWeight:      900,
    color:           '#fff',
    letterSpacing:   1.5,
  },
  searchBtn: {
    display:         'flex',
    alignItems:      'center',
    gap:             5,
    backgroundColor: 'rgba(255,255,255,0.14)',
    border:          '1.5px solid rgba(255,255,255,0.25)',
    borderRadius:    20,
    padding:         '6px 11px',
    cursor:          'pointer',
    flexShrink:      0,
  },
  searchBtnLabel: {
    fontSize:        13,
    fontWeight:      700,
    color:           '#fff',
    letterSpacing:   0.2,
  },

  /* ── Search bar ── */
  searchBar: {
    display:         'flex',
    alignItems:      'center',
    gap:             8,
    backgroundColor: NAVY,
    padding:         '0 12px 12px',
    flexShrink:      0,
  },
  searchInputWrap: {
    flex:            1,
    display:         'flex',
    alignItems:      'center',
    gap:             8,
    backgroundColor: CARD,
    borderRadius:    12,
    padding:         '9px 12px',
    border:          `1.5px solid ${BORDER}`,
  },
  searchInput: {
    flex:              1,
    border:            'none',
    outline:           'none',
    boxShadow:         'none',
    WebkitAppearance:  'none',
    appearance:        'none',
    fontSize:          15,
    fontWeight:        500,
    color:             TEXT_PRI,
    backgroundColor:   'transparent',
    minWidth:          0,
  },
  searchClearBtn: {
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    background:      'none',
    border:          'none',
    padding:         2,
    cursor:          'pointer',
    flexShrink:      0,
  },
  searchCancelBtn: {
    fontSize:        14,
    fontWeight:      700,
    color:           '#fff',
    background:      'none',
    border:          'none',
    cursor:          'pointer',
    flexShrink:      0,
    padding:         '4px 2px',
    letterSpacing:   0.1,
  },

  /* ── Scroll area ── */
  scrollArea: {
    flex:            1,
    overflowY:       'auto',
    padding:         '14px 12px 0',
  },

  /* ── No results ── */
  noResultsCard: {
    display:         'flex',
    flexDirection:   'column',
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: CARD,
    borderRadius:    16,
    padding:         '32px 24px',
    marginBottom:    16,
    border:          `1px solid ${BORDER}`,
    boxShadow:       '0 2px 8px rgba(0,0,0,0.06)',
    textAlign:       'center',
  },
  noResultsTitle: {
    fontSize:        16,
    fontWeight:      800,
    color:           TEXT_PRI,
    marginBottom:    6,
  },
  noResultsHint: {
    fontSize:        14,
    fontWeight:      500,
    color:           TEXT_MID,
    lineHeight:      1.5,
  },

  /* ── Section headings ── */
  sectionHeading: {
    fontSize:        14,
    fontWeight:      800,
    color:           TEXT_PRI,
    letterSpacing:   0.1,
    marginBottom:    9,
    paddingLeft:     2,
  },

  /* ── Featured video card ── */
  videoCard: {
    backgroundColor: CARD,
    borderRadius:    18,
    overflow:        'hidden',
    marginBottom:    18,
    boxShadow:       '0 4px 16px rgba(0,0,0,0.11)',
    border:          `1px solid ${BORDER}`,
  },
  videoEmbed: {
    position:        'relative',
    width:           '100%',
    paddingBottom:   '56.25%',
    backgroundColor: '#000',
    overflow:        'hidden',
  },
  videoIframe: {
    position:        'absolute',
    top:             0,
    left:            0,
    width:           '100%',
    height:          '100%',
    border:          'none',
  },
  videoMeta: {
    padding:         '13px 16px 15px',
  },
  videoTitle: {
    fontSize:        16,
    fontWeight:      800,
    color:           TEXT_PRI,
    marginBottom:    5,
    lineHeight:      1.35,
  },
  videoDesc: {
    fontSize:        14,
    fontWeight:      500,
    color:           TEXT_SEC,
    lineHeight:      1.55,
  },

  /* ── Category list ── */
  categoriesList: {
    display:         'flex',
    flexDirection:   'column',
    gap:             9,
    marginBottom:    12,
  },
  categoryCard: {
    backgroundColor: CARD,
    borderRadius:    14,
    overflow:        'hidden',
    boxShadow:       '0 2px 8px rgba(0,0,0,0.08)',
    border:          `1px solid ${BORDER}`,
  },
  categoryHeader: {
    width:           '100%',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'space-between',
    padding:         '13px 16px',
    backgroundColor: 'transparent',
    border:          'none',
    cursor:          'pointer',
    textAlign:       'left',
    gap:             10,
  },
  categoryLeft: {
    display:         'flex',
    alignItems:      'center',
    gap:             12,
    flex:            1,
    minWidth:        0,
  },
  categoryIconBox: {
    width:           40,
    height:          40,
    borderRadius:    11,
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
  },
  categoryTitle: {
    fontSize:        16,
    fontWeight:      800,
    color:           TEXT_PRI,
    lineHeight:      1.2,
  },
  categoryMeta: {
    fontSize:        13,
    fontWeight:      600,
    color:           TEXT_MID,
    marginTop:       2,
  },
  videoList: {
    padding:         '0 16px',
  },
  videoRow: {
    display:         'flex',
    alignItems:      'flex-start',
    gap:             11,
    padding:         '11px 0',
  },
  videoRowLeft: {
    flexShrink:      0,
    paddingTop:      2,
  },
  comingSoonBadge: {
    display:         'flex',
    alignItems:      'center',
    gap:             4,
    backgroundColor: BLUE_DEEP,
    border:          `1px solid ${BLUE_ACC}30`,
    borderRadius:    6,
    padding:         '3px 7px',
    fontSize:        11,
    fontWeight:      700,
    color:           BLUE_ACC,
    whiteSpace:      'nowrap',
  },
  videoRowRight: {
    flex:            1,
    minWidth:        0,
  },
  videoRowTitle: {
    fontSize:        14,
    fontWeight:      700,
    color:           TEXT_PRI,
    marginBottom:    3,
    lineHeight:      1.3,
  },
  videoRowDesc: {
    fontSize:        13,
    fontWeight:      500,
    color:           TEXT_SEC,
    lineHeight:      1.45,
  },

  /* ── Footer ── */
  footerNote: {
    display:         'flex',
    alignItems:      'flex-start',
    gap:             6,
    padding:         '10px 4px',
    fontSize:        12,
    fontWeight:      500,
    color:           TEXT_MID,
    lineHeight:      1.5,
  },
};
