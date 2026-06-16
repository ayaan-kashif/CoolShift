import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { ScenarioProfile, ObjectiveWeights, OptimizationResult } from '../types';

export interface CoolShiftStore {
  scenarios: ScenarioProfile[];
  selectedScenarioId: string | null;
  weights: ObjectiveWeights;
  lastRunResult: OptimizationResult | null;
  globalAlert: { type: 'success' | 'error' | 'warning'; message: string } | null;
  alertCount: number;
  sidebarCollapsed: boolean;

  setScenarios: (s: ScenarioProfile[]) => void;
  setSelectedScenario: (id: string) => void;
  setWeights: (w: Partial<ObjectiveWeights>) => void;
  setLastRunResult: (r: OptimizationResult) => void;
  setGlobalAlert: (a: { type: 'success' | 'error' | 'warning'; message: string } | null) => void;
  setAlertCount: (n: number) => void;
  setSidebarCollapsed: (b: boolean) => void;
}

export const useCoolShiftStore = create<CoolShiftStore>()(
  devtools((set) => ({
    scenarios: [],
    selectedScenarioId: null,
    weights: { cost: 0.4, emissions: 0.3, comfort: 0.2, peak: 0.1 },
    lastRunResult: null,
    globalAlert: null,
    alertCount: 0,
    sidebarCollapsed: false,
    setScenarios: (s) => set({ scenarios: s }),
    setSelectedScenario: (id) => set({ selectedScenarioId: id }),
    setWeights: (w) =>
      set((state) => ({ weights: { ...state.weights, ...w } })),
    setLastRunResult: (r) => set({ lastRunResult: r }),
    setGlobalAlert: (a) => set({ globalAlert: a }),
    setAlertCount: (n) => set({ alertCount: n }),
    setSidebarCollapsed: (b) => set({ sidebarCollapsed: b }),
  }))
);
