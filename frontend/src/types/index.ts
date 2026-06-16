// file:///C:/Users/Hp/OneDrive/Desktop%202/CoolShift/CoolShift/frontend/src/types/index.ts
/**
 * Central TypeScript type definitions for the CoolShift frontend.
 * These mirror the backend interfaces verbatim so that API calls are type‑safe.
 */

export interface OptimizationResult {
  run_id: string;
  scenario_id: string;
  total_intervals: number;
  total_cost_pkr: number;
  total_grid_energy_kwh: number;
  total_solar_energy_kwh: number;
  total_emissions_kgco2e: number;
  peak_demand_kw: number;
  comfort_compliance_pct: number;
  infeasible_count: number;
  run_duration_seconds: number;
}

export interface OutputSchedule {
  run_id: string;
  scenario_id: string;
  timestamp_local: string;
  recommended_ac_units_on: number;
  recommended_ac_setpoint_c: number | null;
  recommended_fan_units_on: number;
  grid_energy_kwh: number;
  solar_energy_used_kwh: number;
  battery_charge_kwh: number;
  battery_discharge_kwh: number;
  battery_soc_kwh: number;
  cooling_energy_kwh: number;
  estimated_indoor_temp_c: number;
  comfort_status: "within_range" | "warning" | "unsafe" | "infeasible";
  interval_cost_pkr: number;
  interval_emissions_kgco2e: number;
  reason_code: string;
  explanation: string;
  constraint_violation_count: number;
}

export interface RunSummary {
  run_id: string;
  scenario_id: string;
  total_intervals: number;
  total_cost_pkr: number;
  total_grid_energy_kwh: number;
  total_solar_energy_kwh: number;
  total_emissions_kgco2e: number;
  peak_demand_kw: number;
  comfort_compliance_pct: number;
  infeasible_count: number;
  run_duration_seconds: number;
}

export interface ComparisonResult {
  baseline: RunSummary;
  optimized: RunSummary;
  savings: {
    cost_pkr: number;
    cost_pct: number;
    grid_energy_kwh: number;
    grid_energy_pct: number;
    emissions_kgco2e: number;
    emissions_pct: number;
    peak_demand_kw: number;
    peak_demand_pct: number;
  };
  infeasible_intervals: {
    timestamp_local: string;
    estimated_indoor_temp_c: number;
    comfort_max_c: number;
    reason: string;
  }[];
}

/* UI‑specific types */
export interface ScenarioProfile {
  scenario_id: string;
  name: string;
  building_type: string;
  area_m2: number;
  room_count: number;
  max_occupancy: number;
  insulation_level: "Low" | "Medium" | "High";
  sun_exposure: "Low" | "Medium" | "High";
  comfort_min_c: number;
  comfort_max_c: number;
  vulnerable_occupants: boolean;
  budget_pkr_per_day: number;
  maximum_grid_demand_kw: number;
}

export interface ObjectiveWeights {
  cost: number;
  emissions: number;
  comfort: number;
  peak: number;
}
