interface Props {
  size?: number;
  color?: string;
}

// SVG crosshair icon matching the mobile SurveyIcon
export function SurveyIcon({ size = 32, color = '#143A63' }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="16" cy="16" r="10" stroke={color} strokeWidth="2" fill="none" />
      <circle cx="16" cy="16" r="3" fill={color} />
      <line x1="16" y1="4" x2="16" y2="10" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <line x1="16" y1="22" x2="16" y2="28" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <line x1="4"  y1="16" x2="10" y2="16" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <line x1="22" y1="16" x2="28" y2="16" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
