import React, { useState, useMemo, useRef } from 'react';
import { useLang } from '../LangContext';
import { strings } from '../i18n';

// ── Design tokens ─────────────────────────────────────────────────────────────
const NAVY      = '#143A63';
const BLUE_ACC  = '#3B82F6';
const BLUE_DEEP = 'rgba(30,87,153,0.10)';
const CARD      = '#FFFFFF';
const SURFACE   = '#F0EEE8';
const TEXT_PRI  = '#111827';
const TEXT_SEC  = '#374151';
const TEXT_MID  = '#4B5563';
const BORDER    = '#E5E7EB';

// ── Video category metadata ───────────────────────────────────────────────────
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
const FEATURED_YOUTUBE_ID = 'jNQXAC9IVRw';

// ── FAQ data ──────────────────────────────────────────────────────────────────
const FAQ_CATEGORIES = [
  {
    id: 'getting-started', title: 'Getting Started', icon: '🚀', color: '#0284C7',
    items: [
      { q: 'What is Grade and Elevation Calculator?', a: 'A free professional field tool for construction crews and surveyors. It handles rod readings, benchmark verification, grade calculations, and elevation tracking — replacing paper field books for everyday site work.' },
      { q: 'Who is this app designed for?', a: 'Construction crews, site engineers, surveyors, and field workers who need fast, accurate elevation data on-site. Works equally well for beginners and experienced survey professionals.' },
      { q: 'Can I use the app offline?', a: 'Yes. The app is a Progressive Web App (PWA) that works fully offline. All data saves locally on your device and syncs to the cloud automatically when you\'re back online.' },
      { q: 'Which devices are supported?', a: 'Any modern iOS or Android device via Chrome, Safari, or Edge. Install it to your home screen for a native app feel — no app store download required.' },
      { q: 'How do I change the language?', a: 'Tap EN or ES in the top navigation bar. Your preference is remembered across sessions.' },
    ],
  },
  {
    id: 'points', title: 'Points', icon: '📍', color: '#7C3AED',
    items: [
      { q: 'What is a Point?', a: 'A Point is a single rod reading at a specific location. Each point stores the rod reading value, a label (PT1, PT2…), an optional name, and whether it was taken at a benchmark.' },
      { q: 'What does PT mean?', a: 'PT stands for Point — a numbered label auto-assigned to each rod reading. Labels increment automatically and can be paired with a custom name for easier identification on site.' },
      { q: 'How do I create a new point?', a: 'Tap the Point tab, enter your rod reading in Ft-In-Fraction or Decimal Feet format, optionally add a name, choose the set, and tap Save Point. The point saves instantly.' },
      { q: 'How do I rename a point?', a: 'Go to Manage Points, tap the point card to open its details, tap Edit, update the name, and save.' },
      { q: 'How do I delete a point?', a: 'Open the point from Manage Points and tap Delete. You can also select multiple points for batch deletion. Deleted points cannot be recovered.' },
      { q: 'How are point numbers generated?', a: 'Point numbers (PT1, PT2…) are assigned automatically in sequence. Deleted numbers are not reused — the next point continues from the highest existing number.' },
    ],
  },
  {
    id: 'benchmark', title: 'Benchmark', icon: '🎯', color: '#059669',
    items: [
      { q: 'What is a benchmark?', a: 'A benchmark is a known reference elevation point — typically a permanent marker with a verified elevation (e.g. 986.50 ft above sea level). All other survey elevations are calculated relative to it.' },
      { q: 'What is "Reading at a Benchmark / Known Elevation"?', a: 'This toggle on the point entry screen tells the app your rod reading was taken at a known elevation point. When set to Yes, you also enter the known elevation. The app uses these two values to compute the Height of Instrument (HI).' },
      { q: 'When should I select Yes?', a: 'Select Yes when your rod is held on a benchmark or verified turning point. This is your backsight (BS) reading.\n\nFormula: HI = Known Elevation + BS rod reading.' },
      { q: 'When should I select No?', a: 'Select No for all foresight (FS) readings — points whose elevation you\'re calculating.\n\nFormula: Elevation = HI − FS rod reading.' },
      { q: 'How does the benchmark affect calculations?', a: 'The benchmark establishes the Height of Instrument: HI = Benchmark Elevation + BS rod. Every foresight thereafter uses Elevation = HI − FS. This chain continues through each instrument setup in the set.' },
      { q: 'How are derived benchmark elevations calculated?', a: 'When you move the instrument, take a backsight on the previous turning point (now known) to establish a new HI. The app tracks this elevation chain automatically through all points in the set.' },
    ],
  },
  {
    id: 'rod-reading', title: 'Rod Reading', icon: '📏', color: '#B45309',
    items: [
      { q: 'How do I enter rod readings?', a: 'On the Point tab, choose your format — Ft-In-Fraction or Decimal Ft — and enter the value you read off the leveling rod. Ft-In-Fraction uses separate fields for feet, inches, and fraction for precise entry.' },
      { q: 'Difference between Ft-In-Fraction and Decimal Feet?', a: 'Ft-In-Fraction lets you enter readings exactly as marked — e.g. 8′-3½″. Decimal Feet uses a single number like 8.29 ft. Both store the same measurement internally.' },
      { q: 'Which format should I use?', a: 'Use Ft-In-Fraction if your rod is marked in feet, inches, and fractions (common on US construction sites). Use Decimal Feet if your rod is marked in tenths and hundredths.' },
      { q: 'Can I switch between formats?', a: 'Yes. The toggle at the top of the point entry form switches instantly and converts the current value automatically — no data is lost.' },
    ],
  },
  {
    id: 'sets', title: 'Sets', icon: '🗂️', color: '#DC2626',
    items: [
      { q: 'What is a Set?', a: 'A Set is a named group of survey points — like a page in your field book. Points in the same set share an instrument setup or survey run. Sets make it easy to organize, compare, and export related readings.' },
      { q: 'Why should I create sets?', a: 'Sets keep your survey organized by location, date, or instrument setup. They also enable per-set CSV export and allow you to review all readings within a single run.' },
      { q: 'Difference between Current Set and New Set?', a: '"Current Set" adds the point to your active set. "Create a new set with this point as the first point" starts a fresh group — use this when you move the instrument to a new location.' },
      { q: 'Can I rename a set?', a: 'Yes. Open View Sets, tap the set, and use the Edit option to give it a descriptive name like "Sewer Run A" or "Building Pad 3".' },
      { q: 'Can I delete a set?', a: 'Yes. In View Sets, use the Delete option. This also removes all points within it. Export the set as CSV first if you need to keep the data.' },
      { q: 'How are sets organized?', a: 'Sets appear in View Sets in reverse chronological order (most recent first). Each card shows the set name, creation date, and total point count.' },
    ],
  },
  {
    id: 'compare-height', title: 'Compare Height', icon: '⇅', color: '#059669',
    items: [
      { q: 'How does Compare Height work?', a: 'Select a From point and a To point. The app instantly shows the elevation difference, direction (Cut or Fill), and the value in both decimal and Ft-In-Fraction formats.' },
      { q: 'How do I compare two points?', a: 'Tap the Compare Height tab, select your reference (From) and comparison (To) points from the dropdowns. The result updates instantly.' },
      { q: 'What does Cut mean?', a: 'Cut means the To point is lower than the From point — you need to remove material to reach that elevation. Shown as a negative elevation difference.' },
      { q: 'What does Fill mean?', a: 'Fill means the To point is higher than the From point — you need to add material to reach that elevation. Shown as a positive elevation difference.' },
      { q: 'What is elevation difference?', a: 'Elevation difference = To elevation − From elevation.\n\n• Positive = Fill (To is higher)\n• Negative = Cut (To is lower)\n\nDisplayed in both decimal feet and Ft-In-Fraction.' },
    ],
  },
  {
    id: 'slope', title: 'Slope', icon: '📐', color: '#D97706',
    items: [
      { q: 'How is slope calculated?', a: 'Slope = Rise ÷ Run. Rise is the vertical elevation change between two points. Run is the horizontal distance. The app expresses slope as a percentage, ratio, and decimal.' },
      { q: 'What is percent slope?', a: 'Percent slope = (Rise ÷ Run) × 100. A 2% slope means 2 ft of elevation change per 100 ft of horizontal distance. Typical drainage requirements call for a minimum of 1–2% slope.' },
      { q: 'What is ratio slope?', a: 'Ratio slope = 1:N — 1 unit of rise for every N units of run.\n\nExample: 1:50 = 2% grade = 1 ft rise per 50 ft of horizontal run.' },
      { q: 'What are Rise and Run?', a: 'Rise is the vertical elevation change between two points. Run is the horizontal distance between them. Both are required to calculate grade or slope.' },
      { q: 'Common surveying slope examples', a: '• Sidewalk drainage: 1–2% (1:100 to 1:50)\n• Parking lots: 1–5%\n• Road grades: 0.5–8%\n• Driveway approach: up to 20%\n• 4:1 cut slope = 25%' },
    ],
  },
  {
    id: 'calculator', title: 'Calculator', icon: '🧮', color: '#0891B2',
    items: [
      { q: 'What calculations are available?', a: 'The Calculator tab provides: Ft-In-Fraction ↔ Decimal Feet conversion, elevation calculation from a known HI and rod reading, and common engineering unit conversions. More tools are being added.' },
      { q: 'How do I convert Feet-Inches to Decimal Feet?', a: 'Open the Calculator tab and select the Ft-In-Fraction to Decimal converter. Enter feet, inches, and fraction separately — the decimal equivalent appears instantly.' },
      { q: 'How do engineering conversions work?', a: 'Select the unit you\'re converting from, enter the value, and select the target unit. Supports feet, inches, millimeters, and meters — useful when site drawings use mixed unit systems.' },
    ],
  },
  {
    id: 'view-sets', title: 'View Sets', icon: '📋', color: '#7C3AED',
    items: [
      { q: 'How do I open a set?', a: 'Tap the View Sets tab and tap any set card to expand it. You\'ll see all points with their labels, rod readings, and calculated elevations.' },
      { q: 'How do I export a set?', a: 'Open a set in View Sets and tap the Export button. This downloads a CSV file with all point labels, names, rod readings, and elevations — ready for Excel or Google Sheets.' },
      { q: 'How do I compare sets?', a: 'You can compare individual points across sets using the Compare Height tab. Full set-vs-set comparison is planned for a future update.' },
      { q: 'How do I delete a set?', a: 'In View Sets, use the Delete option within the set details. All points within the set are also deleted. Export the data first if you need to keep it.' },
    ],
  },
  {
    id: 'data', title: 'Data & Sync', icon: '☁️', color: '#0284C7',
    items: [
      { q: 'Is my data saved automatically?', a: 'Yes. Every point saves instantly to local storage on your device. When signed in and online, data also syncs to the cloud in the background after each change.' },
      { q: 'Can I export my work?', a: 'Yes. Open any set in View Sets and tap Export to download a CSV with all points and values — ready to open in any spreadsheet application.' },
      { q: 'Will clearing browser data delete my data?', a: 'If you\'re signed in with cloud sync, your data is safely stored in the cloud and restores on next sign-in. Without an account, data lives in browser local storage and may be lost if the browser data is cleared.' },
      { q: 'Is cloud sync available?', a: 'Yes. Create a free account with your email to enable automatic cloud sync. Your data syncs every time you make a change and restores on any device when you sign in.' },
    ],
  },
  {
    id: 'troubleshooting', title: 'Troubleshooting', icon: '🔧', color: '#DC2626',
    items: [
      { q: 'The app is not calculating correctly', a: 'Check that your benchmark point has "Reading at a Benchmark" set to Yes with the correct known elevation entered. All foresight points should have it set to No. Also verify the rod reading format (Ft-In vs Decimal).' },
      { q: 'My benchmark elevation looks wrong', a: 'Confirm you\'ve entered the known field elevation of the benchmark marker (e.g. 986.50 ft) separately from the rod reading (e.g. 4.87 ft). These are two distinct values — the field elevation and the rod reading taken at that point.' },
      { q: 'Points are missing after re-login', a: 'Your data restores automatically from the cloud on sign-in. If points are missing, check your internet connection and try signing out and back in. Data from guest sessions is not synced to the cloud.' },
      { q: 'Export is not working', a: 'Ensure your browser allows file downloads. On iOS, tap Share in the download prompt and choose Save to Files. On Android, the file saves to your Downloads folder automatically.' },
      { q: 'The language is not changing', a: 'Tap EN or ES in the top navigation bar. If it doesn\'t respond, try refreshing the page. Your language setting is stored locally and persists across sessions.' },
    ],
  },
];

// ── Component ─────────────────────────────────────────────────────────────────
export default function TutorialScreen() {
  const { t, lang } = useLang();

  const [activeSubTab,  setActiveSubTab]  = useState<'faq' | 'videos'>('faq');
  const [faqSearch,     setFaqSearch]     = useState('');
  const [vidSearch,     setVidSearch]     = useState('');
  const [openFaqCats,   setOpenFaqCats]   = useState<Set<string>>(new Set(['getting-started']));
  const [openFaqItems,  setOpenFaqItems]  = useState<Set<string>>(new Set());
  const [expandedVid,   setExpandedVid]   = useState<string | null>('getting-started');

  const faqSearchRef = useRef<HTMLInputElement>(null);
  const vidSearchRef = useRef<HTMLInputElement>(null);

  const toggleFaqCat = (id: string) =>
    setOpenFaqCats(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const toggleFaqItem = (key: string) =>
    setOpenFaqItems(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  // ── Video categories (localised) ──────────────────────────────────
  const CATEGORIES = useMemo(() => [
    { id: 'getting-started', title: t('tutCatGettingStarted'), videos: [
        { title: t('tutGS1Title'), description: t('tutGS1Desc'), youtubeId: null },
        { title: t('tutGS2Title'), description: t('tutGS2Desc'), youtubeId: null },
      ],
    },
    { id: 'survey-points', title: t('tutCatSurveyPoints'), videos: [
        { title: t('tutSP1Title'), description: t('tutSP1Desc'), youtubeId: null },
        { title: t('tutSP2Title'), description: t('tutSP2Desc'), youtubeId: null },
        { title: t('tutSP3Title'), description: t('tutSP3Desc'), youtubeId: null },
      ],
    },
    { id: 'compare-height', title: t('tutCatCompareHeight'), videos: [
        { title: t('tutCH1Title'), description: t('tutCH1Desc'), youtubeId: null },
        { title: t('tutCH2Title'), description: t('tutCH2Desc'), youtubeId: null },
        { title: t('tutCH3Title'), description: t('tutCH3Desc'), youtubeId: null },
      ],
    },
    { id: 'slope', title: t('tutCatSlope'), videos: [
        { title: t('tutSL1Title'), description: t('tutSL1Desc'), youtubeId: null },
        { title: t('tutSL2Title'), description: t('tutSL2Desc'), youtubeId: null },
      ],
    },
    { id: 'view-sets', title: t('tutCatViewSets'), videos: [
        { title: t('tutVS1Title'), description: t('tutVS1Desc'), youtubeId: null },
        { title: t('tutVS2Title'), description: t('tutVS2Desc'), youtubeId: null },
        { title: t('tutVS3Title'), description: t('tutVS3Desc'), youtubeId: null },
      ],
    },
    { id: 'calculator', title: t('tutCatCalculator'), videos: [
        { title: t('tutCA1Title'), description: t('tutCA1Desc'), youtubeId: null },
        { title: t('tutCA2Title'), description: t('tutCA2Desc'), youtubeId: null },
      ],
    },
  ], [t]);

  // ── FAQ search filtering ──────────────────────────────────────────
  const faqQ = faqSearch.trim().toLowerCase();
  const filteredFaq = useMemo(() => {
    if (!faqQ) return FAQ_CATEGORIES;
    return FAQ_CATEGORIES.map(cat => {
      const catHit   = cat.title.toLowerCase().includes(faqQ);
      const hitItems = cat.items.filter(
        item => item.q.toLowerCase().includes(faqQ) || item.a.toLowerCase().includes(faqQ),
      );
      if (catHit)           return { ...cat };
      if (hitItems.length)  return { ...cat, items: hitItems };
      return null;
    }).filter(Boolean) as typeof FAQ_CATEGORIES;
  }, [faqQ]);

  // ── Video search filtering ────────────────────────────────────────
  const vidQ = vidSearch.trim().toLowerCase();
  const filteredVids = useMemo(() => {
    if (!vidQ) return CATEGORIES;
    return CATEGORIES.map(cat => {
      const catHit    = cat.title.toLowerCase().includes(vidQ);
      const hitVideos = cat.videos.filter(
        v => v.title.toLowerCase().includes(vidQ) || v.description.toLowerCase().includes(vidQ),
      );
      if (catHit)          return { ...cat };
      if (hitVideos.length) return { ...cat, videos: hitVideos };
      return null;
    }).filter(Boolean) as typeof CATEGORIES;
  }, [vidQ, CATEGORIES]);

  const faqEmpty = faqQ.length > 0 && filteredFaq.length === 0;
  const vidEmpty = vidQ.length > 0 && filteredVids.length === 0;

  return (
    <div style={s.root}>

      {/* ── Segmented control ─────────────────────────────────────── */}
      <div style={s.segmentedWrap}>
        <div style={s.segmented}>
          {(['faq', 'videos'] as const).map(tab => (
            <button
              key={tab}
              style={{
                ...s.segBtn,
                ...(activeSubTab === tab ? s.segBtnActive : {}),
              }}
              onClick={() => setActiveSubTab(tab)}
              aria-pressed={activeSubTab === tab}
            >
              {tab === 'faq' ? 'FAQ' : 'Tutorial Videos'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Search bar ────────────────────────────────────────────── */}
      <div style={s.searchWrap}>
        <style>{`
          .help-search { outline:none!important; box-shadow:none!important;
            border:none!important; -webkit-appearance:none!important;
            appearance:none!important; background:transparent!important; }
        `}</style>
        <div style={s.searchInner}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
               stroke={TEXT_MID} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
               style={{ flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            ref={activeSubTab === 'faq' ? faqSearchRef : vidSearchRef}
            type="text"
            className="help-search"
            value={activeSubTab === 'faq' ? faqSearch : vidSearch}
            onChange={e =>
              activeSubTab === 'faq'
                ? setFaqSearch(e.target.value)
                : setVidSearch(e.target.value)
            }
            placeholder={activeSubTab === 'faq' ? 'Search FAQs…' : 'Search tutorial videos…'}
            style={s.searchInput}
            autoComplete="off"
            enterKeyHint="search"
          />
          {(activeSubTab === 'faq' ? faqSearch : vidSearch).length > 0 && (
            <button
              style={s.searchClear}
              onClick={() => activeSubTab === 'faq' ? setFaqSearch('') : setVidSearch('')}
              aria-label="Clear search"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                   stroke={TEXT_MID} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* ── Scroll area ───────────────────────────────────────────── */}
      <div style={s.scrollArea}>

        {/* ══════════════ FAQ TAB ══════════════ */}
        {activeSubTab === 'faq' && (
          <>
            {faqEmpty ? (
              <EmptyState label="No FAQs found." hint="Try a different keyword." />
            ) : (
              <div style={s.list}>
                {filteredFaq.map(cat => {
                  const catOpen = faqQ.length > 0 || openFaqCats.has(cat.id);
                  return (
                    <div key={cat.id} style={s.catCard}>

                      {/* Category header */}
                      <button
                        style={{
                          ...s.catHeader,
                          borderBottom: catOpen ? `1px solid ${BORDER}` : 'none',
                        }}
                        onClick={() => faqQ.length === 0 && toggleFaqCat(cat.id)}
                      >
                        <div style={s.catLeft}>
                          <div style={{
                            ...s.catIconBox,
                            backgroundColor: cat.color + '18',
                            border: `1.5px solid ${cat.color}40`,
                          }}>
                            <span style={{ fontSize: 18 }}>{cat.icon}</span>
                          </div>
                          <div>
                            <div style={s.catTitle}>{cat.title}</div>
                            <div style={s.catMeta}>{cat.items.length} questions</div>
                          </div>
                        </div>
                        {faqQ.length === 0 && <ChevronIcon open={catOpen} />}
                      </button>

                      {/* FAQ items */}
                      <div style={{
                        maxHeight: catOpen ? 9999 : 0,
                        overflow: 'hidden',
                        transition: 'max-height 0.35s ease',
                      }}>
                        {cat.items.map((item, idx) => {
                          const itemKey = `${cat.id}-${idx}`;
                          const itemOpen = faqQ.length > 0 || openFaqItems.has(itemKey);
                          return (
                            <div
                              key={itemKey}
                              style={{
                                borderBottom: idx < cat.items.length - 1
                                  ? `1px solid ${BORDER}` : 'none',
                              }}
                            >
                              {/* Question row */}
                              <button
                                style={s.faqQ}
                                onClick={() => toggleFaqItem(itemKey)}
                              >
                                <span style={s.faqQText}>{item.q}</span>
                                <span style={{
                                  ...s.faqChevron,
                                  transform: itemOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                                }}>
                                  ▾
                                </span>
                              </button>

                              {/* Answer */}
                              <div style={{
                                maxHeight: itemOpen ? 1200 : 0,
                                overflow: 'hidden',
                                transition: 'max-height 0.3s ease',
                              }}>
                                <div style={s.faqA}>
                                  {item.a.split('\n').map((line, li) => (
                                    <span key={li}>
                                      {line}
                                      {li < item.a.split('\n').length - 1 && <br />}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ══════════════ TUTORIAL VIDEOS TAB ══════════════ */}
        {activeSubTab === 'videos' && (
          <>
            {vidEmpty ? (
              <EmptyState label="No tutorials found." hint="Try a different keyword." />
            ) : (
              <>
                {/* Featured video — only when not searching */}
                {!vidQ && (
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

                {/* Tutorial categories */}
                <div style={s.sectionHeading}>{t('tutTutorialVideos')}</div>
                <div style={s.list}>
                  {filteredVids.map(cat => {
                    const isOpen = expandedVid === cat.id || vidQ.length > 0;
                    const color  = CAT_COLORS[cat.id] ?? '#0284C7';
                    const icon   = CAT_ICONS[cat.id]  ?? '📋';
                    return (
                      <div key={cat.id} style={s.catCard}>
                        <button
                          style={{
                            ...s.catHeader,
                            borderBottom: isOpen ? `1px solid ${BORDER}` : 'none',
                          }}
                          onClick={() => !vidQ && setExpandedVid(isOpen ? null : cat.id)}
                        >
                          <div style={s.catLeft}>
                            <div style={{
                              ...s.catIconBox,
                              backgroundColor: color + '18',
                              border: `1.5px solid ${color}40`,
                            }}>
                              <span style={{ fontSize: 18 }}>{icon}</span>
                            </div>
                            <div>
                              <div style={s.catTitle}>{cat.title}</div>
                              <div style={s.catMeta}>
                                {strings[lang].tutCount(cat.videos.length)}
                              </div>
                            </div>
                          </div>
                          {!vidQ && <ChevronIcon open={isOpen} />}
                        </button>

                        <div style={{
                          maxHeight: isOpen ? 9999 : 0,
                          overflow: 'hidden',
                          transition: 'max-height 0.35s ease',
                        }}>
                          <div style={s.videoList}>
                            {cat.videos.map((vid, i) => (
                              <div
                                key={i}
                                style={{
                                  ...s.videoRow,
                                  borderBottom: i < cat.videos.length - 1
                                    ? `1px solid ${BORDER}` : 'none',
                                }}
                              >
                                <div style={s.videoRowLeft}>
                                  <div style={s.comingSoonBadge}>
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                                         stroke="currentColor" strokeWidth="2.5"
                                         strokeLinecap="round" strokeLinejoin="round">
                                      <polygon points="5 3 19 12 5 21 5 3"/>
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
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}

        {/* Footer note */}
        <div style={s.footerNote}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
               stroke={TEXT_MID} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span>{t('tutFooterNote')}</span>
        </div>
        <div style={{ height: 28 }} />
      </div>
    </div>
  );
}

// ── Subcomponents ─────────────────────────────────────────────────────────────
function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
         stroke={TEXT_MID} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
         style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.22s ease', flexShrink: 0 }}>
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  );
}

function EmptyState({ label, hint }: { label: string; hint: string }) {
  return (
    <div style={s.emptyCard}>
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
           stroke={TEXT_MID} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
           style={{ marginBottom: 12, opacity: 0.55 }}>
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <div style={s.emptyLabel}>{label}</div>
      <div style={s.emptyHint}>{hint}</div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {

  root: {
    display: 'flex', flexDirection: 'column', flex: 1,
    overflow: 'hidden', backgroundColor: SURFACE,
  },

  /* Segmented control */
  segmentedWrap: {
    backgroundColor: CARD,
    padding: '10px 14px 8px',
    borderBottom: `1px solid ${BORDER}`,
    flexShrink: 0,
  },
  segmented: {
    display: 'flex', borderRadius: 12,
    backgroundColor: '#EEF2F7',
    padding: 3, gap: 0,
  },
  segBtn: {
    flex: 1, padding: '9px 6px',
    fontSize: '14px', fontWeight: 600,
    color: TEXT_MID, backgroundColor: 'transparent',
    border: 'none', borderRadius: 10,
    cursor: 'pointer', transition: 'background 0.18s, color 0.18s, box-shadow 0.18s',
    letterSpacing: '0.01em',
  },
  segBtnActive: {
    color: '#FFFFFF', backgroundColor: NAVY,
    boxShadow: '0 2px 8px rgba(20,58,99,0.22)',
    fontWeight: 700,
  },

  /* Search */
  searchWrap: {
    backgroundColor: CARD, padding: '8px 14px 10px',
    borderBottom: `1px solid ${BORDER}`, flexShrink: 0,
  },
  searchInner: {
    display: 'flex', alignItems: 'center', gap: 8,
    backgroundColor: '#F3F4F6', borderRadius: 12,
    padding: '9px 12px', border: `1.5px solid ${BORDER}`,
  },
  searchInput: {
    flex: 1, border: 'none', outline: 'none', boxShadow: 'none',
    fontSize: 15, fontWeight: 500, color: TEXT_PRI,
    backgroundColor: 'transparent', minWidth: 0,
  },
  searchClear: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'none', border: 'none', padding: 2,
    cursor: 'pointer', flexShrink: 0,
  },

  /* Scroll area */
  scrollArea: {
    flex: 1, overflowY: 'auto', padding: '14px 12px 0',
  },

  /* List */
  list: {
    display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 14,
  },

  /* Category card */
  catCard: {
    backgroundColor: CARD, borderRadius: 14,
    overflow: 'hidden', border: `1px solid ${BORDER}`,
    boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
  },
  catHeader: {
    width: '100%', display: 'flex', alignItems: 'center',
    justifyContent: 'space-between', padding: '13px 16px',
    backgroundColor: 'transparent', border: 'none',
    cursor: 'pointer', textAlign: 'left', gap: 10,
  },
  catLeft: {
    display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0,
  },
  catIconBox: {
    width: 40, height: 40, borderRadius: 11,
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  catTitle: {
    fontSize: 16, fontWeight: 800, color: TEXT_PRI, lineHeight: 1.2,
  },
  catMeta: {
    fontSize: 13, fontWeight: 600, color: TEXT_MID, marginTop: 2,
  },

  /* FAQ Q&A */
  faqQ: {
    width: '100%', display: 'flex', alignItems: 'center',
    justifyContent: 'space-between', gap: 10,
    padding: '12px 16px', backgroundColor: 'transparent',
    border: 'none', cursor: 'pointer', textAlign: 'left',
  },
  faqQText: {
    fontSize: 14, fontWeight: 700, color: TEXT_PRI, lineHeight: 1.4, flex: 1,
  },
  faqChevron: {
    fontSize: 16, color: TEXT_MID, flexShrink: 0,
    transition: 'transform 0.22s ease', display: 'inline-block',
  },
  faqA: {
    padding: '0 16px 14px 16px',
    fontSize: 14, fontWeight: 500, color: TEXT_SEC,
    lineHeight: 1.65, borderTop: `1px solid ${BORDER}`,
    paddingTop: 10,
  },

  /* Section headings */
  sectionHeading: {
    fontSize: 14, fontWeight: 800, color: TEXT_PRI,
    letterSpacing: 0.1, marginBottom: 9, paddingLeft: 2,
  },

  /* Featured video card */
  videoCard: {
    backgroundColor: CARD, borderRadius: 18, overflow: 'hidden',
    marginBottom: 18, boxShadow: '0 4px 16px rgba(0,0,0,0.11)',
    border: `1px solid ${BORDER}`,
  },
  videoEmbed: {
    position: 'relative', width: '100%', paddingBottom: '56.25%',
    backgroundColor: '#000', overflow: 'hidden',
  },
  videoIframe: {
    position: 'absolute', top: 0, left: 0,
    width: '100%', height: '100%', border: 'none',
  },
  videoMeta: { padding: '13px 16px 15px' },
  videoTitle: {
    fontSize: 16, fontWeight: 800, color: TEXT_PRI,
    marginBottom: 5, lineHeight: 1.35,
  },
  videoDesc: {
    fontSize: 14, fontWeight: 500, color: TEXT_SEC, lineHeight: 1.55,
  },

  /* Video list inside category */
  videoList: { padding: '0 16px' },
  videoRow: {
    display: 'flex', alignItems: 'flex-start', gap: 11, padding: '11px 0',
  },
  videoRowLeft: { flexShrink: 0, paddingTop: 2 },
  comingSoonBadge: {
    display: 'flex', alignItems: 'center', gap: 4,
    backgroundColor: BLUE_DEEP, border: `1px solid ${BLUE_ACC}30`,
    borderRadius: 6, padding: '3px 7px',
    fontSize: 11, fontWeight: 700, color: BLUE_ACC, whiteSpace: 'nowrap',
  },
  videoRowRight: { flex: 1, minWidth: 0 },
  videoRowTitle: {
    fontSize: 14, fontWeight: 700, color: TEXT_PRI, marginBottom: 3, lineHeight: 1.3,
  },
  videoRowDesc: {
    fontSize: 13, fontWeight: 500, color: TEXT_SEC, lineHeight: 1.45,
  },

  /* Empty state */
  emptyCard: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', backgroundColor: CARD,
    borderRadius: 16, padding: '36px 24px', marginBottom: 16,
    border: `1px solid ${BORDER}`, boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
    textAlign: 'center',
  },
  emptyLabel: {
    fontSize: 16, fontWeight: 800, color: TEXT_PRI, marginBottom: 6,
  },
  emptyHint: {
    fontSize: 14, fontWeight: 500, color: TEXT_MID, lineHeight: 1.5,
  },

  /* Footer */
  footerNote: {
    display: 'flex', alignItems: 'flex-start', gap: 6,
    padding: '10px 4px', fontSize: 12, fontWeight: 500,
    color: TEXT_MID, lineHeight: 1.5,
  },
};
