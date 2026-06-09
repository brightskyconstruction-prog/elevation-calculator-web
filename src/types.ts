// ─── Core domain types ─────────────────────────────────────────────────────────

export interface SurveyPoint {
  id:               string;
  projectId:        string;
  label:            string;           // auto-generated e.g. "TP1"
  pointName?:       string;
  takenBy?:         string;
  setId?:           string;

  // Rod reading
  rodFeet?:          string;
  rodInches?:        number;
  rodFractionDec?:   number;
  rodFractionLabel?: string;
  engineeringFeet:   number;

  // Elevations
  bmElevation:  number;               // benchmark elevation at this point
  elevation:    number;               // = bmElevation + engineeringFeet

  // Metadata
  savedAt?:     string;               // ISO timestamp of last save
  createdAt:    number;               // Date.now()
  updatedAt:    number;

  // GPS
  createdAddress?:   string;
  createdLatitude?:  number;
  createdLongitude?: number;
}

export interface SurveySet {
  id:        string;
  projectId: string;
  name:      string;
  setLabel?: string;                  // short badge e.g. "S1"
  datum?:    number;
  createdAt: number;
  updatedAt: number;
}

export interface Project {
  id:        string;
  name:      string;
  createdAt: number;
  updatedAt: number;
}

export interface HistItem {
  id:        string;
  type:      'calculator' | 'converter';
  label:     string;
  valA:      number;
  valB:      number;
  result:    number;
  unit?:     string;
  createdAt: number;
}

// ─── Tab identifiers ───────────────────────────────────────────────────────────

export type MainTab   = 'add' | 'points' | 'sets' | 'calc';
export type CalcTab   = 'calculator' | 'converter';
export type PointsTab = 'compare' | 'graph' | 'single';
export type SetsTab   = 'latest' | 'name' | 'search';
