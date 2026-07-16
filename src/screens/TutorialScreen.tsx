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
const GREEN    = '#1F8A4D';

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
        <div style={s.pageHeaderIcon}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
               stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>
        <div>
          <div style={s.pageHeaderTitle}>Tutorials</div>
          <div style={s.pageHeaderSub}>Learn how to use Grade &amp; Elevation Calculator</div>
        </div>
      </div>

      <div style={s.scrollArea}>

        {/* ── Intro card ───────────────────────────────────────────── */}
        <div style={s.introCard}>
          <div style={s.introIconRow}>
            <span style={s.introEmoji}>🎓</span>
            <span style={s.introHeadline}>Step-by-step video guides</span>
          </div>
          <p style={s.introText}>
            Learn every feature of the app through quick step-by-step videos.
            Watch tutorials whenever you need help using any tool.
          </p>
        </div>

        {/* ── Featured sample video ────────────────────────────────── */}
        <div style={s.sectionLabel}>FEATURED TUTORIAL</div>
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
        <div style={s.sectionLabel}>ALL TUTORIALS</div>
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
                    <div style={{ ...s.categoryIconBox, backgroundColor: cat.color + '18', border: `1.5px solid ${cat.color}30` }}>
                      <span style={{ fontSize: 16 }}>{cat.icon}</span>
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
      width="16" height="16" viewBox="0 0 24 24" fill="none"
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
    display:       'flex',
    flexDirection: 'column',
    flex:          1,
    overflow:      'hidden',
    backgroundColor: SURFACE,
  },
  pageHeader: {
    display:         'flex',
    alignItems:      'center',
    gap:             12,
    backgroundColor: NAVY,
    padding:         '14px 16px',
    flexShrink:      0,
  },
  pageHeaderIcon: {
    width:           40,
    height:          40,
    borderRadius:    10,
    backgroundColor: 'rgba(255,255,255,0.12)',
    border:          '1.5px solid rgba(255,255,255,0.20)',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
  },
  pageHeaderTitle: {
    fontSize:      17,
    fontWeight:    800,
    color:         '#fff',
    letterSpacing: 0.2,
  },
  pageHeaderSub: {
    fontSize:   12,
    fontWeight: 500,
    color:      'rgba(255,255,255,0.70)',
    marginTop:  2,
  },
  scrollArea: {
    flex:      1,
    overflowY: 'auto',
    padding:   '12px 12px 0',
  },
  introCard: {
    backgroundColor: CARD,
    borderRadius:    14,
    padding:         '14px 16px',
    marginBottom:    12,
    boxShadow:       '0 1px 6px rgba(0,0,0,0.07)',
    border:          `1px solid ${BORDER}`,
  },
  introIconRow: {
    display:     'flex',
    alignItems:  'center',
    gap:         8,
    marginBottom: 8,
  },
  introEmoji: {
    fontSize: 22,
  },
  introHeadline: {
    fontSize:   15,
    fontWeight: 800,
    color:      TEXT_PRI,
  },
  introText: {
    fontSize:   13,
    fontWeight: 500,
    color:      TEXT_SEC,
    lineHeight: 1.55,
    margin:     0,
  },
  sectionLabel: {
    fontSize:      10,
    fontWeight:    800,
    color:         TEXT_DIS,
    letterSpacing: 1,
    marginBottom:  8,
    paddingLeft:   2,
  },
  videoCard: {
    backgroundColor: CARD,
    borderRadius:    14,
    overflow:        'hidden',
    marginBottom:    16,
    boxShadow:       '0 2px 10px rgba(0,0,0,0.09)',
    border:          `1px solid ${BORDER}`,
  },
  videoEmbed: {
    position:       'relative',
    width:          '100%',
    paddingBottom:  '56.25%',   // 16:9
    backgroundColor: '#000',
    overflow:       'hidden',
  },
  videoIframe: {
    position: 'absolute',
    top:      0,
    left:     0,
    width:    '100%',
    height:   '100%',
    border:   'none',
  },
  videoMeta: {
    padding: '12px 14px',
  },
  videoTitle: {
    fontSize:     14,
    fontWeight:   800,
    color:        TEXT_PRI,
    marginBottom: 4,
  },
  videoDesc: {
    fontSize:   12,
    fontWeight: 500,
    color:      TEXT_SEC,
    lineHeight: 1.5,
  },
  categoriesList: {
    display:       'flex',
    flexDirection: 'column',
    gap:           8,
    marginBottom:  12,
  },
  categoryCard: {
    backgroundColor: CARD,
    borderRadius:    12,
    overflow:        'hidden',
    boxShadow:       '0 1px 5px rgba(0,0,0,0.07)',
    border:          `1px solid ${BORDER}`,
  },
  categoryHeader: {
    width:           '100%',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'space-between',
    padding:         '11px 14px',
    backgroundColor: 'transparent',
    border:          'none',
    cursor:          'pointer',
    textAlign:       'left',
    gap:             10,
  },
  categoryLeft: {
    display:    'flex',
    alignItems: 'center',
    gap:        10,
    flex:       1,
    minWidth:   0,
  },
  categoryIconBox: {
    width:          36,
    height:         36,
    borderRadius:   9,
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },
  categoryTitle: {
    fontSize:   14,
    fontWeight: 800,
    color:      TEXT_PRI,
  },
  categoryMeta: {
    fontSize:   11,
    fontWeight: 600,
    color:      TEXT_DIS,
    marginTop:  1,
  },
  videoList: {
    padding: '0 14px',
  },
  videoRow: {
    display:     'flex',
    alignItems:  'flex-start',
    gap:         10,
    padding:     '10px 0',
  },
  videoRowLeft: {
    flexShrink: 0,
    paddingTop: 2,
  },
  comingSoonBadge: {
    display:         'flex',
    alignItems:      'center',
    gap:             4,
    backgroundColor: BLUE_DEEP,
    border:          `1px solid ${BLUE_ACC}30`,
    borderRadius:    5,
    padding:         '3px 6px',
    fontSize:        10,
    fontWeight:      700,
    color:           BLUE_ACC,
    whiteSpace:      'nowrap',
  },
  videoRowRight: {
    flex:    1,
    minWidth: 0,
  },
  videoRowTitle: {
    fontSize:     13,
    fontWeight:   700,
    color:        TEXT_PRI,
    marginBottom: 2,
  },
  videoRowDesc: {
    fontSize:   11,
    fontWeight: 500,
    color:      TEXT_SEC,
    lineHeight: 1.4,
  },
  footerNote: {
    display:    'flex',
    alignItems: 'flex-start',
    gap:        6,
    padding:    '10px 4px',
    fontSize:   11,
    fontWeight: 500,
    color:      TEXT_DIS,
    lineHeight: 1.5,
  },
};
