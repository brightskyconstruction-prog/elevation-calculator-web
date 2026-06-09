// ─── Rod reading dropdown options ─────────────────────────────────────────────

export const INCHES_OPTIONS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i),
  label: `${i}"`,
}));

export const FRACTION_OPTIONS = [
  { value: '0',        label: 'None'  },
  { value: '0.0625',   label: '1/16'  },
  { value: '0.125',    label: '1/8'   },
  { value: '0.1875',   label: '3/16'  },
  { value: '0.25',     label: '1/4'   },
  { value: '0.3125',   label: '5/16'  },
  { value: '0.375',    label: '3/8'   },
  { value: '0.4375',   label: '7/16'  },
  { value: '0.5',      label: '1/2'   },
  { value: '0.5625',   label: '9/16'  },
  { value: '0.625',    label: '5/8'   },
  { value: '0.6875',   label: '11/16' },
  { value: '0.75',     label: '3/4'   },
  { value: '0.8125',   label: '13/16' },
  { value: '0.875',    label: '7/8'   },
  { value: '0.9375',   label: '15/16' },
];

// ─── Formatting helpers ────────────────────────────────────────────────────────

export function toEngFt(feet: string, inches: number, fraction: number): number {
  const f = parseFloat(feet);
  if (isNaN(f) || f < 0) return 0;
  return f + inches / 12 + fraction / 12;
}

export function fromEngFt(eng: number): {
  feet: string; inches: number; fraction: number; frLabel: string;
} {
  if (isNaN(eng) || eng < 0) return { feet: '', inches: 0, fraction: 0, frLabel: 'None' };
  const totalIn    = eng * 12;
  const ft         = Math.floor(totalIn / 12);
  const remIn      = totalIn - ft * 12;
  const inFloor    = Math.floor(remIn);
  const frDec      = remIn - inFloor;
  const sixteenths = Math.round(frDec * 16);
  const snappedFr  = sixteenths / 16;
  const frOpt      = FRACTION_OPTIONS.find(o => Math.abs(parseFloat(o.value) - snappedFr) < 0.001)
                     ?? FRACTION_OPTIONS[0];
  return { feet: String(ft), inches: inFloor, fraction: snappedFr, frLabel: frOpt.label };
}

export function fmtFIF(feet: string, inches: number, frLabel: string): string {
  const f = parseFloat(feet);
  if (isNaN(f) && inches === 0) return '—';
  const fr = frLabel && frLabel !== 'None' ? ` ${frLabel}` : '';
  return `${isNaN(f) ? 0 : f}'-${inches}${fr}"`;
}

export function fmtTimestamp(ts: number | string): string {
  const d = typeof ts === 'number' ? new Date(ts) : new Date(ts);
  const days   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  let h = d.getHours();
  const m    = String(d.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}, at ${h}:${m} ${ampm}`;
}
