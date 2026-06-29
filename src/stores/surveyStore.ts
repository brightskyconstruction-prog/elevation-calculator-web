import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { SurveyPoint, SurveySet, Project, HistItem } from '../types';

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const DEFAULT_PROJECT_ID = 'default-project';

// ─── Label generators ─────────────────────────────────────────────────────────

function generateLabel(existingPoints: SurveyPoint[]): string {
  // Use PT1, PT2, PT3... style labels
  let n = existingPoints.length + 1;
  while (existingPoints.some(p => p.label === `PT${n}`)) n++;
  return `PT${n}`;
}

function generateSetLabel(existingSets: SurveySet[]): string {
  let n = existingSets.length + 1;
  while (existingSets.some(s => s.setLabel === `SET-${n}`)) n++;
  return `SET-${n}`;
}

// ─── State ────────────────────────────────────────────────────────────────────

interface SurveyState {
  projects:        Project[];
  points:          SurveyPoint[];
  sets:            SurveySet[];
  history:         HistItem[];
  activeProjectId: string;

  // Project
  ensureDefaultProject: () => string;
  getProject:           (id: string) => Project | undefined;

  // Points
  addPoint:    (projectId: string, pt: SurveyPoint) => void;
  updatePoint: (projectId: string, id: string, data: Partial<SurveyPoint>) => void;
  deletePoint: (projectId: string, id: string) => void;
  deletePoints:(projectId: string, ids: string[]) => void;
  getPoints:   (projectId: string) => SurveyPoint[];
  nextLabel:   (projectId: string) => string;

  // Sets
  addSet:             (projectId: string, s: SurveySet) => void;
  updateSet:          (projectId: string, id: string, data: Partial<SurveySet>) => void;
  deleteSet:          (projectId: string, id: string) => void;
  getSets:            (projectId: string) => SurveySet[];
  nextSetLabel:       (projectId: string) => string;
  migrateSetsLabels:  (projectId: string) => void;

  // History
  addHistItem:  (item: Omit<HistItem, 'id' | 'createdAt'>) => void;
  clearHistory: () => void;

  // Cloud sync
  /** Replace all store state in-memory from cloud data (called after login). */
  hydrate: (data: {
    projects:        Project[];
    points:          SurveyPoint[];
    sets:            SurveySet[];
    history:         HistItem[];
    activeProjectId: string;
  }) => void;
  /** Clear all user data in-memory (called on logout). */
  resetStore: () => void;
}

export const useSurveyStore = create<SurveyState>()(
  persist(
    (set, get) => ({
      projects:        [],
      points:          [],
      sets:            [],
      history:         [],
      activeProjectId: DEFAULT_PROJECT_ID,

      // ── Project ──────────────────────────────────────────────────────────────

      ensureDefaultProject() {
        const { projects } = get();
        if (!projects.find(p => p.id === DEFAULT_PROJECT_ID)) {
          const p: Project = {
            id: DEFAULT_PROJECT_ID, name: 'My Project',
            createdAt: Date.now(), updatedAt: Date.now(),
          };
          set(s => ({ projects: [...s.projects, p] }));
        }
        return DEFAULT_PROJECT_ID;
      },

      getProject(id) {
        return get().projects.find(p => p.id === id);
      },

      // ── Points ───────────────────────────────────────────────────────────────

      addPoint(_projectId, pt) {
        set(s => ({ points: [...s.points, pt] }));
      },

      updatePoint(_projectId, id, data) {
        set(s => ({
          points: s.points.map(p =>
            p.id === id ? { ...p, ...data, updatedAt: Date.now() } : p
          ),
        }));
      },

      deletePoint(_projectId, id) {
        set(s => ({ points: s.points.filter(p => p.id !== id) }));
      },

      deletePoints(_projectId, ids) {
        const idSet = new Set(ids);
        set(s => ({ points: s.points.filter(p => !idSet.has(p.id)) }));
      },

      getPoints(projectId) {
        return get().points.filter(p => p.projectId === projectId);
      },

      nextLabel(projectId) {
        return generateLabel(get().points.filter(p => p.projectId === projectId));
      },

      // ── Sets ─────────────────────────────────────────────────────────────────

      addSet(_projectId, s) {
        set(st => ({ sets: [...st.sets, s] }));
      },

      updateSet(_projectId, id, data) {
        set(s => ({
          sets: s.sets.map(st =>
            st.id === id ? { ...st, ...data, updatedAt: Date.now() } : st
          ),
        }));
      },

      deleteSet(_projectId, id) {
        set(s => ({
          sets:   s.sets.filter(st => st.id !== id),
          points: s.points.map(p => p.setId === id ? { ...p, setId: undefined } : p),
        }));
      },

      getSets(projectId) {
        return get().sets.filter(s => s.projectId === projectId);
      },

      nextSetLabel(projectId) {
        return generateSetLabel(get().sets.filter(s => s.projectId === projectId));
      },

      migrateSetsLabels(projectId) {
        const sets = get().sets.filter(s => s.projectId === projectId);
        sets.forEach((s, i) => {
          if (!s.setLabel) {
            get().updateSet(projectId, s.id, { setLabel: `SET-${i + 1}` });
          }
        });
      },

      // ── History ───────────────────────────────────────────────────────────────

      addHistItem(item) {
        const h: HistItem = { ...item, id: uid(), createdAt: Date.now() };
        set(s => ({ history: [h, ...s.history].slice(0, 100) }));
      },

      clearHistory() {
        set({ history: [] });
      },

      // ── Cloud sync ────────────────────────────────────────────────────────────

      hydrate(data) {
        set({
          projects:        data.projects,
          points:          data.points,
          sets:            data.sets,
          history:         data.history,
          activeProjectId: data.activeProjectId || DEFAULT_PROJECT_ID,
        });
      },

      resetStore() {
        set({
          projects:        [],
          points:          [],
          sets:            [],
          history:         [],
          activeProjectId: DEFAULT_PROJECT_ID,
        });
      },
    }),
    {
      name: 'elevation-calculator-v1',
      partialize: state => ({
        projects:        state.projects,
        points:          state.points,
        sets:            state.sets,
        history:         state.history,
        activeProjectId: state.activeProjectId,
      }),
    }
  )
);
