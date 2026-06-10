import React from 'react';

// ─── Telescoping leveling rod (grade rod) ─────────────────────────────────────
// Matches the Philadelphia-style telescoping survey rod:
//   • 5 sections, each narrower going up (staircase silhouette)
//   • White faces with subtle left/right shading
//   • Bold black numbers per section, red accents at key readings
//   • Measurement tick marks on both left and right edges
//   • Black rubber cap at top, black foot at base

interface Props {
  /** 'large' = splash screen hero (70 × 244 px rendered)
   *  'small' = login card icon (24 × 84 px rendered)  */
  size?: 'large' | 'small';
}

// Section definition: [x, y, w, h, label, labelColor, labelFontSize]
type Sec = readonly [number, number, number, number, string, string, number];

// ViewBox is always 76 × 290; only rendered pixel size changes.
const SECTIONS: Sec[] = [
  // x   y    w   h   label  color       fontSize
  [ 4,  230, 68, 50,  '9',  '#111111',  26 ],   // bottom / widest
  [ 9,  182, 58, 48,  '1',  '#111111',  26 ],
  [14,  134, 48, 48,  '2',  '#111111',  26 ],
  [19,   86, 38, 48,  '3',  '#111111',  26 ],
  [24,   38, 28, 48, '25',  '#BB0000',  16 ],   // top / narrowest — red
];

// Collar joints: [junctionY, leftCollarX1, leftCollarX2, rightCollarX1, rightCollarX2]
// (the horizontal shelf visible at each section boundary)
const COLLARS = [
  [230, 4,  9,  67, 72],   // A → B
  [182, 9,  14, 62, 67],   // B → C
  [134, 14, 19, 57, 62],   // C → D
  [ 86, 19, 24, 52, 57],   // D → E
] as const;

export function LevelingRodIcon({ size = 'large' }: Props) {
  const renderW = size === 'large' ? 70  : 24;
  const renderH = size === 'large' ? 244 : 84;

  return (
    <svg
      viewBox="0 0 76 290"
      width={renderW}
      height={renderH}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        {/* Subtle side-to-side gradient so each face looks slightly 3-D */}
        <linearGradient id="rodFaceGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"    stopColor="#c8c8c8" />
          <stop offset="10%"   stopColor="#f4f4f4" />
          <stop offset="90%"   stopColor="#f4f4f4" />
          <stop offset="100%"  stopColor="#bbbbbb" />
        </linearGradient>
      </defs>

      {/* ── Black rubber top cap ─────────────────────────────────────── */}
      <rect x={23} y={24} width={30} height={16} rx={3} fill="#111111" />
      {/* Narrow ridge on top of cap */}
      <rect x={27} y={22} width={22} height={4}  rx={2} fill="#222222" />

      {/* ── Rod sections ────────────────────────────────────────────── */}
      {SECTIONS.map(([x, y, w, h, label, labelColor, labelFS], i) => {
        // Number anchor: slightly right of center, ~60% from top of section
        const numX = x + w * 0.56;
        const numY = y + h * 0.67;

        return (
          <g key={i}>
            {/* Section face */}
            <rect
              x={x} y={y} width={w} height={h}
              fill="url(#rodFaceGrad)"
              stroke="#A8A8A8"
              strokeWidth="0.6"
            />

            {/* Tick marks — left edge */}
            {Array.from({ length: 7 }, (_, j) => {
              const ty = y + 5 + j * 7;
              if (ty > y + h - 2) return null;
              const major = j % 2 === 0;
              return (
                <line
                  key={j}
                  x1={x}              y1={ty}
                  x2={x + (major ? 11 : 6)} y2={ty}
                  stroke="#111111"
                  strokeWidth={major ? 1.3 : 0.8}
                />
              );
            })}

            {/* Tick marks — right edge */}
            {Array.from({ length: 7 }, (_, j) => {
              const ty = y + 5 + j * 7;
              if (ty > y + h - 2) return null;
              const major = j % 2 === 0;
              return (
                <line
                  key={j}
                  x1={x + w}                 y1={ty}
                  x2={x + w - (major ? 11 : 6)} y2={ty}
                  stroke="#111111"
                  strokeWidth={major ? 1.3 : 0.8}
                />
              );
            })}

            {/* Large number label */}
            <text
              x={numX}
              y={numY}
              textAnchor="middle"
              fill={labelColor}
              fontSize={labelFS}
              fontWeight="900"
              fontFamily="'Arial Black', Arial, sans-serif"
            >
              {label}
            </text>
          </g>
        );
      })}

      {/* ── Collar / step lines at each section junction ────────────── */}
      {COLLARS.map(([jy, lx1, lx2, rx1, rx2], i) => (
        <g key={i}>
          {/* Left shelf */}
          <line x1={lx1} y1={jy} x2={lx2} y2={jy} stroke="#888888" strokeWidth="1.2" />
          {/* Right shelf */}
          <line x1={rx1} y1={jy} x2={rx2} y2={jy} stroke="#888888" strokeWidth="1.2" />
        </g>
      ))}

      {/* ── Bottom foot / base ──────────────────────────────────────── */}
      <rect x={2}  y={278} width={72} height={7}  rx={2}   fill="#111111" />
      <rect x={0}  y={284} width={76} height={4}  rx={1.5} fill="#1a1a1a" />
    </svg>
  );
}
