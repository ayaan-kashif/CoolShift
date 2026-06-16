// ─── Enums ───────────────────────────────────────────────────────────────────

export type BuildingType = 'Household' | 'School' | 'Office' | 'Clinic' | 'Retail';
export type InsulationLevel = 'Low' | 'Medium' | 'High';
export type SunExposure = 'Low' | 'Medium' | 'High';
export type TariffType = 'OFF_PEAK' | 'ON_PEAK' | 'PEAK';
export type ComfortStatus = 'within_range' | 'warning' | 'unsafe' | 'infeasible';
export type RunStatus = 'pending' | 'running' | 'complete' | 'failed';

export type ReasonCode =
  | 'HEAT_RISK'
  | 'SOLAR_AVAILABLE'
  | 'PEAK_TARIFF'
  | 'OFF_PEAK_CHEAP'
  | 'OUTAGE'
  | 'BATTERY_LOW'
  | 'BATTERY_CHARGING'
  | 'COMFORT_RISK'
  | 'INFEASIBLE'
  | 'DEMAND_LIMIT'
  | 'BUDGET_RISK'
  | 'PRE_COOL'
  | 'NORMAL'
  | 'GRID_OUTAGE'
  | 'INSUFFICIENT_CAPACITY';

// ─── Database Row Types ──────────────────────────────────────────────────────

export interface ScenarioProfile {
  scenario_id: string;
  name: string;
  timezone: string;
  building_type: BuildingType;
  area_m2: number;
  room_count: number;
  max_occupancy: number;
  insulation_level: InsulationLevel;
  sun_exposure: SunExposure;
  comfort_min_c: number;
  comfort_max_c: number;
  vulnerable_occupants: boolean;
  budget_pkr_per_day: number;
  maximum_grid_demand_kw: number;
  evaluation_focus: string;
  created_at: string;
}

export interface Appliance {
  appliance_id: string;
  scenario_id: string;
  zone_id: string;
  appliance_type: 'Inverter AC' | 'Window AC' | 'Ceiling fan' | 'Portable AC';
  quantity: number;
  rated_power_kw: number;
  cooling_capacity_kw: number;
  efficiency_label: string;
  min_runtime_minutes: number;
  min_setpoint_c: number;
  max_setpoint_c: number;
}

export interface EnergyAsset {
  scenario_id: string;
  solar_capacity_kw: number;
  solar_conversion_efficiency: number;
  battery_capacity_kwh: number;
  initial_soc_kwh: number;
  minimum_reserve_kwh: number;
  max_charge_kw: number;
  max_discharge_kw: number;
  charge_efficiency: number;
  discharge_efficiency: number;
}

export interface IntervalInput {
  id?: number;
  scenario_id: string;
  timestamp_local: string;
  interval_minutes: number;
  temperature_c: number;
  relative_humidity_pct: number;
  heat_index_c: number;
  solar_irradiance_w_m2: number;
  solar_available_kw: number;
  occupancy_count: number;
  grid_available: number;
  tariff_type: TariffType;
  tariff_pkr_per_kwh: number;
  grid_carbon_kgco2_per_kwh: number;
  non_cooling_load_kw: number;
  source_missing_flag: number;
}

export interface OptimizationRun {
  run_id: string;
  scenario_id: string;
  algorithm_version: string;
  objective_weights: string; // JSON string
  evaluation_window_start: string;
  evaluation_window_end: string;
  run_duration_seconds: number;
  status: RunStatus;
  created_at: string;
}

export interface OutputSchedule {
  id?: number;
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
  comfort_status: ComfortStatus;
  interval_cost_pkr: number;
  interval_emissions_kgco2e: number;
  reason_code: ReasonCode;
  explanation: string;
  constraint_violation_count: number;
  is_baseline: boolean;
}

// ─── API Types ───────────────────────────────────────────────────────────────

export interface ObjectiveWeights {
  cost: number;
  emissions: number;
  comfort: number;
  peak: number;
}

export interface ValidationReport {
  rows_parsed: number;
  rows_valid: number;
  rows_flagged: number;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export interface ValidationIssue {
  row: number;
  column: string;
  message: string;
  value?: any;
}

export interface ImportSummary {
  scenarios_loaded: number;
  appliances_loaded: number;
  energy_assets_loaded: number;
  intervals_loaded: number;
  validation: ValidationReport;
}

export interface RunSummary {
  run_id: string;
  scenario_id: string;
  scenario_name: string;
  total_cost_pkr: number;
  total_grid_energy_kwh: number;
  total_solar_energy_kwh: number;
  total_emissions_kgco2e: number;
  peak_demand_kw: number;
  comfort_compliance_pct: number;
  total_intervals: number;
  infeasible_intervals: number;
  solar_utilization_pct: number;
  battery_cycles: number;
  daily_summaries: DailySummary[];
}

export interface DailySummary {
  date: string;
  cost_pkr: number;
  grid_energy_kwh: number;
  solar_energy_kwh: number;
  emissions_kgco2e: number;
  peak_demand_kw: number;
  comfort_compliance_pct: number;
  avg_indoor_temp_c: number;
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
  infeasible_intervals: InfeasibleInterval[];
}

export interface InfeasibleInterval {
  timestamp_local: string;
  estimated_indoor_temp_c: number;
  comfort_max_c: number;
  reason: string;
}

export interface ScenarioDetail {
  profile: ScenarioProfile;
  appliances: Appliance[];
  energy_assets: EnergyAsset | null;
}

// ─── Baseline Schedule Input (from XLSX) ─────────────────────────────────────

export interface BaselineScheduleRow {
  scenario_id: string;
  timestamp_local: string;
  baseline_ac_units_on: number;
  baseline_ac_setpoint_c: number | null;
  baseline_fan_units_on: number;
}
