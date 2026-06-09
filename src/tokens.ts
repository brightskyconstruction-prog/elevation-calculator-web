// ─── Design Tokens ────────────────────────────────────────────────────────────
// Mirrors the mobile app's tokens.ts palette

export const Colors = {
  primary: {
    navy:    '#143A63',
    darker:  '#0D2740',
    dark:    '#143A63',
    mid:     '#1E5799',
    light:   'rgba(20,58,99,0.08)',
  },
  brand: {
    gold:        '#F2B533',
    goldDeep:    '#D4940A',
    goldLight:   'rgba(242,181,51,0.15)',
    blue:        '#1E5799',
    blueAccent:  '#3B82F6',
    blueDeeper:  'rgba(30,87,153,0.12)',
  },
  background: {
    screen:  '#F5F4F0',
    card:    '#FFFFFF',
    surface: '#F0EEE8',
    raised:  '#FAFAF8',
    white:   '#FFFFFF',
  },
  text: {
    primary:   '#111827',
    secondary: '#374151',
    disabled:  '#9CA3AF',
    inverse:   '#FFFFFF',
    navy:      '#143A63',
  },
  border: {
    default: '#E5E7EB',
    subtle:  '#F3F4F6',
    strong:  '#D1D5DB',
  },
  status: {
    success: '#16A34A',
    error:   '#DC2626',
    warning: '#D97706',
    info:    '#2563EB',
  },
} as const;

export const FontSize = {
  xs:     '11px',
  sm:     '13px',
  body:   '14px',
  bodyLg: '15px',
  lg:     '16px',
  xl:     '18px',
  '2xl':  '20px',
  '3xl':  '24px',
  title:  '28px',
} as const;

export const FontWeight = {
  regular:   '400',
  medium:    '500',
  semibold:  '600',
  bold:      '700',
  extrabold: '800',
} as const;

export const Radius = {
  xs:  '4px',
  sm:  '6px',
  md:  '10px',
  lg:  '14px',
  xl:  '18px',
  full:'9999px',
} as const;

export const Spacing = {
  0:  '0px',
  1:  '4px',
  2:  '8px',
  3:  '12px',
  4:  '16px',
  5:  '20px',
  6:  '24px',
  7:  '28px',
  8:  '32px',
  10: '40px',
  12: '48px',
} as const;

export const Shadow = {
  sm:  '0 1px 2px rgba(0,0,0,0.06)',
  md:  '0 2px 8px rgba(0,0,0,0.08)',
  lg:  '0 4px 16px rgba(0,0,0,0.10)',
  xl:  '0 8px 24px rgba(0,0,0,0.12)',
  navy:'0 3px 10px rgba(20,58,99,0.30)',
  gold:'0 3px 10px rgba(242,181,51,0.35)',
} as const;
