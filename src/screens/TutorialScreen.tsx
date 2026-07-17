import React, { useState } from 'react';

// ── Design tokens (mirror app tokens) ────────────────────────────────────────
const NAVY     = '#143A63';
const BLUE_ACC = '#3B82F6';
const BLUE_DEEP = 'rgba(30,87,153,0.10)';
const CARD     = '#FFFFFF';
const SURFACE  = '#F0EEE8';
const TEXT_PRI = '#111827';
const TEXT_SEC = '#374151';
const TEXT_DIS = '#9CA3AF';
const BORDER   = '#E5E7EB';

// ── Tutorial data ─────────────────────────────────────────────────────────────
interface VideoEntry {
  title:       string;
  description: string;
  youtubeId:   string | null;   // null → Coming Soon
}

interface TutorialCategory {
  id:      string;
  icon:    string;
  title:   string;
  color:   string;
  videos:  VideoEntry[];
}

const SAMPLE_VIDEO: VideoEntry = {
  title:       'Grade & Elevation Calculator — Overview',
  description: 'A quick introduction to the core workflows: adding points, comparing heights, and reading elevations.',
  youtubeId:   'jNQXAC9IVRw',   // placeholder — replace with real tutorial video ID
};

const CATEGORIES: TutorialCategory[] = [
  {
    id: 'getting-started', icon: '🚀', title: 'Getting Started', color: '#0284C7',
    videos: [
      { title: 'App overview and navigation',  description: 'Tour every tab and learn the core layout.',  youtubeId: null },
      { title: 'Creating your first project',  description: 'Set up a new survey project from scratch.',   youtubeId: null },
    ],
  },
  {
    id: 'survey-points', icon: '📍', title: 'Survey Points', color: '#7C3AED',
    videos: [
      { title: 'Adding a benchmark',           description: 'Record a known elevation as your reference.',  youtubeId: null },
      { title: 'Adding derived points',        description: 'Calculate elevations from rod readings.',       youtubeId: null },
      { title: 'Managing point sets',          description: 'Organise points into named sets.',              youtubeId: null },
    ],
  },
  {
    id: 'compare-height', icon: '⇅', title: 'Compare Height', color: '#059669',
    videos: [
      { title: 'Comparing two survey points',  description: 'See the height difference between any two points.',   youtubeId: null },
      { title: 'Setting a goal rod reading',   description: 'Enter a target rod reading and see fill/cut.',         youtubeId: null },
      { title: 'Setting a goal elevation',     description: 'Enter a target elevation and calculate the cut/fill.', youtubeId: null },
    ],
  },
  {
    id: 'slope', icon: '📐', title: 'Slope', color: '#D97706',
    videos: [
      { title: 'Creating slopes',              description: 'Define a slope between two survey points.',    youtubeId: null },
      { title: 'Reading slope results',        description: 'Interpret the percentage and ratio output.',   youtubeId: null },
    ],
  },
  {
    id: 'view-sets', icon: '🗂', title: 'View Sets', color: '#DC2626',
    videos: [
      { title: 'Creating sets',                description: 'Group related points into a named set.',      youtubeId: null },
      { title: 'Editing sets',                 description: 'Rename, reorder, and update set members.',    youtubeId: null },
      { title: 'Exporting sets',               description: 'Export set data as CSV for further analysis.',youtubeId: null },
    ],
  },
  {
    id: 'calculator', icon: '🧮', title: 'Calculator', color: '#0891B2',
    videos: [
      { title: 'Elevation calculator',         description: 'Convert between decimal feet and FIF.',       youtubeId: null },
      { title: 'Unit conversions',             description: 'Switch between feet, inches, and fractions.', youtubeId: null },
    ],
  },
];

// ── TutorialScreen component ──────────────────────────────────────────────────
export default function TutorialScreen() {
  const [expanded, setExpanded] = useState<string | null>('getting-started');

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
          <span style={s.pageHeaderTitle}>FAQ VIDEOS</span>
        </div>

        {/* Right: search button */}
        <button style={s.searchBtn} onClick={() => { /* search UI — coming soon */ }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
               stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <span style={s.searchBtnLabel}>Search</span>
        </button>

      </div>

      <div style={s.scrollArea}>

        {/* ── Featured Video ───────────────────────────────────────── */}
        <div style={s.featuredLabel}>Featured Video</div>
        <div style={s.videoCard}>
          <div style={s.videoEmbed}>
            <iframe
              src={`https://www.youtube.com/embed/${SAMPLE_VIDEO.youtubeId}?rel=0&modestbranding=1`}
              title={SAMPLE_VIDEO.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={s.videoIframe}
            />
          </div>
          <div style={s.videoMeta}>
            <div style={s.videoTitle}>{SAMPLE_VIDEO.title}</div>
            <div style={s.videoDesc}>{SAMPLE_VIDEO.description}</div>
          </div>
        </div>

        {/* ── Category sections ────────────────────────────────────── */}
        <div style={s.sectionLabel}>Tutorial Videos</div>
        <div style={s.categoriesList}>
          {CATEGORIES.map(cat => {
            const isOpen = expanded === cat.id;
            return (
              <div key={cat.id} style={s.categoryCard}>

                {/* Category header (tap to expand) */}
                <button
                  style={{ ...s.categoryHeader, borderBottom: isOpen ? `1px solid ${BORDER}` : 'none' }}
                  onClick={() => setExpanded(isOpen ? null : cat.id)}
                >
                  <div style={s.categoryLeft}>
                    <div style={{ ...s.categoryIconBox, backgroundColor: cat.color + '18', border: `1.5px solid ${cat.color}40` }}>
                      <span style={{ fontSize: 17 }}>{cat.icon}</span>
                    </div>
                    <div>
                      <div style={s.categoryTitle}>{cat.title}</div>
                      <div style={s.categoryMeta}>{cat.videos.length} tutorial{cat.videos.length !== 1 ? 's' : ''}</div>
                    </div>
                  </div>
                  <ChevronIcon open={isOpen} />
                </button>

                {/* Video list */}
                {isOpen && (
                  <div style={s.videoList}>
                    {cat.videos.map((vid, i) => (
                      <div key={i} style={{ ...s.videoRow, borderBottom: i < cat.videos.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
                        <div style={s.videoRowLeft}>
                          <div style={s.comingSoonBadge}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                                 stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polygon points="5 3 19 12 5 21 5 3" />
                            </svg>
                            <span>Coming Soon</span>
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

        {/* ── Footer note ──────────────────────────────────────────── */}
        <div style={s.footerNote}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
               stroke={TEXT_DIS} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>New tutorials are added regularly. Check back soon for more guides.</span>
        </div>

        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}

// ── Chevron icon ──────────────────────────────────────────────────────────────
function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="17" height="17" viewBox="0 0 24 24" fill="none"
      stroke={TEXT_SEC} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  root: {
    display:          'flex',
    flexDirection:    'column',
    flex:             1,
    overflow:         'hidden',
    backgroundColor:  SURFACE,
  },

  /* ── Header ── */
  pageHeader: {
    display:          'flex',
    alignItems:       'center',
    backgroundColor:  NAVY,
    padding:          '13px 14px',
    flexShrink:       0,
    gap:              10,
  },
  pageHeaderIcon: {
    width:            36,
    height:           36,
    borderRadius:     9,
    backgroundColor:  'rgba(255,255,255,0.12)',
    border:           '1.5px solid rgba(255,255,255,0.20)',
    display:          'flex',
    alignItems:       'center',
    justifyContent:   'center',
    flexShrink:       0,
  },
  pageHeaderCenter: {
    flex:             1,
    display:          'flex',
    alignItems:       'center',
    justifyContent:   'center',
  },
  pageHeaderTitle: {
    fontSize:         18,
    fontWeight:       900,
    color:            '#fff',
    letterSpacing:    1.5,
  },
  searchBtn: {
    display:          'flex',
    alignItems:       'center',
    gap:              5,
    backgroundColor:  'rgba(255,255,255,0.14)',
    border:           '1.5px solid rgba(255,255,255,0.25)',
    borderRadius:     20,
    padding:          '6px 11px',
    cursor:           'pointer',
    flexShrink:       0,
  },
  searchBtnLabel: {
    fontSize:         13,
    fontWeight:       700,
    color:            '#fff',
    letterSpacing:    0.2,
  },

  /* ── Scroll area ── */
  scrollArea: {
    flex:             1,
    overflowY:        'auto',
    padding:          '14px 12px 0',
  },

  /* ── Featured label ── */
  featuredLabel: {
    fontSize:         13,
    fontWeight:       800,
    color:            TEXT_PRI,
    letterSpacing:    0.1,
    marginBottom:     9,
    paddingLeft:      2,
  },

  /* ── Featured video card ── */
  videoCard: {
    backgroundColor:  CARD,
    borderRadius:     18,
    overflow:         'hidden',
    marginBottom:     18,
    boxShadow:        '0 4px 16px rgba(0,0,0,0.11)',
    border:           `1px solid ${BORDER}`,
  },
  videoEmbed: {
    position:         'relative',
    width:            '100%',
    paddingBottom:    '56.25%',   // 16:9
    backgroundColor:  '#000',
    overflow:         'hidden',
  },
  videoIframe: {
    position:         'absolute',
    top:              0,
    left:             0,
    width:            '100%',
    height:           '100%',
    border:           'none',
  },
  videoMeta: {
    padding:          '13px 16px 15px',
  },
  videoTitle: {
    fontSize:         15,
    fontWeight:       800,
    color:            TEXT_PRI,
    marginBottom:     5,
    lineHeight:       1.35,
  },
  videoDesc: {
    fontSize:         13,
    fontWeight:       500,
    color:            TEXT_SEC,
    lineHeight:       1.55,
  },

  /* ── Section label ── */
  sectionLabel: {
    fontSize:         13,
    fontWeight:       800,
    color:            TEXT_PRI,
    letterSpacing:    0.1,
    marginBottom:     9,
    paddingLeft:      2,
  },

  /* ── Category list ── */
  categoriesList: {
    display:          'flex',
    flexDirection:    'column',
    gap:              9,
    marginBottom:     12,
  },
  categoryCard: {
    backgroundColor:  CARD,
    borderRadius:     14,
    overflow:         'hidden',
    boxShadow:        '0 2px 8px rgba(0,0,0,0.08)',
    border:           `1px solid ${BORDER}`,
  },
  categoryHeader: {
    width:            '100%',
    display:          'flex',
    alignItems:       'center',
    justifyContent:   'space-between',
    padding:          '13px 16px',
    backgroundColor:  'transparent',
    border:           'none',
    cursor:           'pointer',
    textAlign:        'left',
    gap:              10,
  },
  categoryLeft: {
    display:          'flex',
    alignItems:       'center',
    gap:              12,
    flex:             1,
    minWidth:         0,
  },
  categoryIconBox: {
    width:            40,
    height:           40,
    borderRadius:     11,
    display:          'flex',
    alignItems:       'center',
    justifyContent:   'center',
    flexShrink:       0,
  },
  categoryTitle: {
    fontSize:         15,
    fontWeight:       800,
    color:            TEXT_PRI,
    lineHeight:       1.2,
  },
  categoryMeta: {
    fontSize:         12,
    fontWeight:       600,
    color:            TEXT_DIS,
    marginTop:        2,
  },
  videoList: {
    padding:          '0 16px',
  },
  videoRow: {
    display:          'flex',
    alignItems:       'flex-start',
    gap:              11,
    padding:          '11px 0',
  },
  videoRowLeft: {
    flexShrink:       0,
    paddingTop:       2,
  },
  comingSoonBadge: {
    display:          'flex',
    alignItems:       'center',
    gap:              4,
    backgroundColor:  BLUE_DEEP,
    border:           `1px solid ${BLUE_ACC}30`,
    borderRadius:     6,
    padding:          '3px 7px',
    fontSize:         10,
    fontWeight:       700,
    color:            BLUE_ACC,
    whiteSpace:       'nowrap',
  },
  videoRowRight: {
    flex:             1,
    minWidth:         0,
  },
  videoRowTitle: {
    fontSize:         13,
    fontWeight:       700,
    color:            TEXT_PRI,
    marginBottom:     3,
    lineHeight:       1.3,
  },
  videoRowDesc: {
    fontSize:         12,
    fontWeight:       500,
    color:            TEXT_SEC,
    lineHeight:       1.45,
  },

  /* ── Footer ── */
  footerNote: {
    display:          'flex',
    alignItems:       'flex-start',
    gap:              6,
    padding:          '10px 4px',
    fontSize:         11,
    fontWeight:       500,
    color:            TEXT_DIS,
    lineHeight:       1.5,
  },
};
