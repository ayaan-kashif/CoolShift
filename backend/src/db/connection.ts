import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { config } from '../config';

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    const dbDir = path.dirname(config.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    db = new Database(config.dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initializeSchema(db);
  }
  return db;
}

function initializeSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS scenario_profiles (
      scenario_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      timezone TEXT NOT NULL DEFAULT 'Asia/Karachi',
      building_type TEXT NOT NULL CHECK(building_type IN ('Household','School','Office','Clinic','Retail')),
      area_m2 REAL NOT NULL,
      room_count INTEGER NOT NULL DEFAULT 1,
      max_occupancy INTEGER NOT NULL,
      insulation_level TEXT NOT NULL CHECK(insulation_level IN ('Low','Medium','High')),
      sun_exposure TEXT NOT NULL CHECK(sun_exposure IN ('Low','Medium','High')),
      comfort_min_c REAL NOT NULL,
      comfort_max_c REAL NOT NULL,
      vulnerable_occupants INTEGER NOT NULL DEFAULT 0,
      budget_pkr_per_day REAL NOT NULL DEFAULT 0,
      maximum_grid_demand_kw REAL NOT NULL DEFAULT 10,
      evaluation_focus TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS appliances (
      appliance_id TEXT PRIMARY KEY,
      scenario_id TEXT NOT NULL REFERENCES scenario_profiles(scenario_id) ON DELETE CASCADE,
      zone_id TEXT NOT NULL DEFAULT 'ALL',
      appliance_type TEXT NOT NULL CHECK(appliance_type IN ('Inverter AC','Window AC','Ceiling fan','Portable AC')),
      quantity INTEGER NOT NULL DEFAULT 1,
      rated_power_kw REAL NOT NULL,
      cooling_capacity_kw REAL NOT NULL DEFAULT 0,
      efficiency_label TEXT DEFAULT 'N/A',
      min_runtime_minutes INTEGER NOT NULL DEFAULT 0,
      min_setpoint_c REAL DEFAULT 16,
      max_setpoint_c REAL DEFAULT 30
    );

    CREATE TABLE IF NOT EXISTS energy_assets (
      scenario_id TEXT PRIMARY KEY REFERENCES scenario_profiles(scenario_id) ON DELETE CASCADE,
      solar_capacity_kw REAL NOT NULL DEFAULT 0,
      solar_conversion_efficiency REAL NOT NULL DEFAULT 0.18,
      battery_capacity_kwh REAL NOT NULL DEFAULT 0,
      initial_soc_kwh REAL NOT NULL DEFAULT 0,
      minimum_reserve_kwh REAL NOT NULL DEFAULT 0,
      max_charge_kw REAL NOT NULL DEFAULT 0,
      max_discharge_kw REAL NOT NULL DEFAULT 0,
      charge_efficiency REAL NOT NULL DEFAULT 0.95,
      discharge_efficiency REAL NOT NULL DEFAULT 0.95
    );

    CREATE TABLE IF NOT EXISTS interval_inputs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scenario_id TEXT NOT NULL REFERENCES scenario_profiles(scenario_id) ON DELETE CASCADE,
      timestamp_local TEXT NOT NULL,
      interval_minutes INTEGER NOT NULL DEFAULT 15,
      temperature_c REAL NOT NULL,
      relative_humidity_pct REAL NOT NULL,
      heat_index_c REAL NOT NULL,
      solar_irradiance_w_m2 REAL NOT NULL DEFAULT 0,
      solar_available_kw REAL NOT NULL DEFAULT 0,
      occupancy_count INTEGER NOT NULL DEFAULT 0,
      grid_available INTEGER NOT NULL DEFAULT 1,
      tariff_type TEXT NOT NULL CHECK(tariff_type IN ('OFF_PEAK','ON_PEAK','PEAK')),
      tariff_pkr_per_kwh REAL NOT NULL,
      grid_carbon_kgco2_per_kwh REAL NOT NULL DEFAULT 0.5,
      non_cooling_load_kw REAL NOT NULL DEFAULT 0.3,
      source_missing_flag INTEGER NOT NULL DEFAULT 0,
      UNIQUE(scenario_id, timestamp_local)
    );

    CREATE TABLE IF NOT EXISTS baseline_schedule (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scenario_id TEXT NOT NULL REFERENCES scenario_profiles(scenario_id) ON DELETE CASCADE,
      timestamp_local TEXT NOT NULL,
      baseline_ac_units_on INTEGER NOT NULL DEFAULT 0,
      baseline_ac_setpoint_c REAL,
      baseline_fan_units_on INTEGER NOT NULL DEFAULT 0,
      UNIQUE(scenario_id, timestamp_local)
    );

    CREATE TABLE IF NOT EXISTS optimization_runs (
      run_id TEXT PRIMARY KEY,
      scenario_id TEXT NOT NULL REFERENCES scenario_profiles(scenario_id) ON DELETE CASCADE,
      algorithm_version TEXT NOT NULL DEFAULT 'v1.0.0-greedy',
      objective_weights TEXT NOT NULL DEFAULT '{}',
      evaluation_window_start TEXT NOT NULL,
      evaluation_window_end TEXT NOT NULL,
      run_duration_seconds REAL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','complete','failed')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS output_schedule (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL REFERENCES optimization_runs(run_id) ON DELETE CASCADE,
      scenario_id TEXT NOT NULL,
      timestamp_local TEXT NOT NULL,
      recommended_ac_units_on INTEGER NOT NULL DEFAULT 0,
      recommended_ac_setpoint_c REAL,
      recommended_fan_units_on INTEGER NOT NULL DEFAULT 0,
      grid_energy_kwh REAL NOT NULL DEFAULT 0,
      solar_energy_used_kwh REAL NOT NULL DEFAULT 0,
      battery_charge_kwh REAL NOT NULL DEFAULT 0,
      battery_discharge_kwh REAL NOT NULL DEFAULT 0,
      battery_soc_kwh REAL NOT NULL DEFAULT 0,
      cooling_energy_kwh REAL NOT NULL DEFAULT 0,
      estimated_indoor_temp_c REAL NOT NULL,
      comfort_status TEXT NOT NULL DEFAULT 'within_range',
      interval_cost_pkr REAL NOT NULL DEFAULT 0,
      interval_emissions_kgco2e REAL NOT NULL DEFAULT 0,
      reason_code TEXT NOT NULL DEFAULT 'NORMAL',
      explanation TEXT DEFAULT '',
      constraint_violation_count INTEGER NOT NULL DEFAULT 0,
      is_baseline INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_interval_inputs_scenario ON interval_inputs(scenario_id);
    CREATE INDEX IF NOT EXISTS idx_interval_inputs_scenario_time ON interval_inputs(scenario_id, timestamp_local);
    CREATE INDEX IF NOT EXISTS idx_output_schedule_run ON output_schedule(run_id);
    CREATE INDEX IF NOT EXISTS idx_output_schedule_scenario ON output_schedule(scenario_id);
    CREATE INDEX IF NOT EXISTS idx_optimization_runs_scenario ON optimization_runs(scenario_id);
    CREATE INDEX IF NOT EXISTS idx_baseline_schedule_scenario ON baseline_schedule(scenario_id, timestamp_local);

    CREATE TABLE IF NOT EXISTS ai_model_params (
      scenario_id TEXT PRIMARY KEY REFERENCES scenario_profiles(scenario_id) ON DELETE CASCADE,
      coefficients TEXT NOT NULL,
      feature_names TEXT NOT NULL,
      r_squared REAL,
      mae REAL,
      trained_at TEXT,
      sample_count INTEGER
    );
  `);
}

export function closeDb(): void {
  if (db) {
    db.close();
  }
}
