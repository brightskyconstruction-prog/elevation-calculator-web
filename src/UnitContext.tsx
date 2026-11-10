import React, { createContext, useContext, useState } from 'react';

// ─── Types ─────────────────────────────────────────────────────────────────────
export type UnitSystem = 'imperial' | 'metric';

export const FT_TO_M = 0.3048;

// ─── Metric input options ──────────────────────────────────────────────────────
/** Centimeter options (0–99) for metric FIF-style input */
export const CM_OPTIONS = Array.from({ length: 100 }, (_, i) => ({
  value: String(i),
  label: `${i} cm`,
}));

/** Millimeter options (0–9) for sub-centimeter precision */
export const MM_OPTIONS = Array.from({ length: 10 }, (_, i) => ({
  value: String(i),
  label: `${i} mm`,
}));

// ─── Context shape ─────────────────────────────────────────────────────────────
interface UnitCtx {
  unitSystem:    UnitSystem;
  setUnitSystem: (u: UnitSystem) => void;
  isMetric:      boolean;
  unitLabel:     'ft' | 'm';

  /** Format a value stored in decimal feet as an elevation (3 decimals) */
  fmtElev: (ft: number) => string;
  /** Format a value stored in decimal feet as a distance (2 decimals) */
  fmtDist: (ft: number) => string;
  /** Format a signed difference stored in decimal feet (3 decimals, sign prefix) */
  fmtDiff: (ft: number) => string;
  /** Convert a user-entered display value to decimal feet for storage */
  displayToFt: (val: number) => number;
  /** Convert decimal feet to the display unit */
  ftToDisplay: (ft: number) => number;
  /**
   * Format a rod reading (stored in ft) as a short metric string "X m YY cm"
   * or as "X.XX ft" in imperial mode (use alongside StackedFIF as needed).
   */
  fmtRodReading: (ft: number) => string;
}

// ─── Default context (imperial) ────────────────────────────────────────────────
const UnitContext = createContext<UnitCtx>({
  unitSystem:    'imperial',
  setUnitSystem: () => {},
  isMetric:      false,
  unitLabel:     'ft',
  fmtElev:       (ft) => `${ft.toFixed(3)} ft`,
  fmtDist:       (ft) => `${ft.toFixed(2)} ft`,
  fmtDiff:       (ft) => `${ft >= 0 ? '+' : ''}${ft.toFixed(3)} ft`,
  displayToFt:   (v)  => v,
  ftToDisplay:   (ft) => ft,
  fmtRodReading: (ft) => `${ft.toFixed(2)} ft`,
});

// ─── Provider ──────────────────────────────────────────────────────────────────
export function UnitProvider({ children }: { children: React.ReactNode }) {
  const [unitSystem, setUnitState] = useState<UnitSystem>(() => {
    try {
      const s = localStorage.getItem('app:unitSystem');
      return s === 'metric' ? 'metric' : 'imperial';
    } catch { return 'imperial'; }
  });

  const setUnitSystem = (u: UnitSystem) => {
    setUnitState(u);
    try { localStorage.setItem('app:unitSystem', u); } catch {}
  };

  const isMetric  = unitSystem === 'metric';
  const unitLabel = isMetric ? 'm' : 'ft';

  const fmtElev = (ft: number): string => {
    if (isNaN(ft)) return '—';
    const v = isMetric ? ft * FT_TO_M : ft;
    return `${v.toFixed(3)} ${unitLabel}`;
  };

  const fmtDist = (ft: number): string => {
    if (isNaN(ft)) return '—';
    const v = isMetric ? ft * FT_TO_M : ft;
    return `${v.toFixed(2)} ${unitLabel}`;
  };

  const fmtDiff = (ft: number): string => {
    if (isNaN(ft)) return '—';
    const v = isMetric ? ft * FT_TO_M : ft;
    return `${v >= 0 ? '+' : ''}${Math.abs(v).toFixed(3)} ${unitLabel}`;
  };

  const ftToDisplay  = (ft: number)  => isMetric ? ft * FT_TO_M : ft;
  const displayToFt  = (val: number) => isMetric ? val / FT_TO_M : val;

  const fmtRodReading = (ft: number): string => {
    if (isNaN(ft) || ft <= 0) return '—';
    if (isMetric) {
      const meters   = ft * FT_TO_M;
      const wholeM   = Math.floor(meters);
      const cm       = Math.round((meters - wholeM) * 100);
      return `${wholeM} m ${String(cm).padStart(2, '0')} cm`;
    }
    return `${ft.toFixed(2)} ft`;
  };

  return (
    <UnitContext.Provider value={{
      unitSystem, setUnitSystem, isMetric, unitLabel,
      fmtElev, fmtDist, fmtDiff, ftToDisplay, displayToFt, fmtRodReading,
    }}>
      {children}
    </UnitContext.Provider>
  );
}

// ─── Hook ──────────────────────────────────────────────────────────────────────
export function useUnit(): UnitCtx {
  return useContext(UnitContext);
}
