import * as XLSX from 'xlsx';
import fs from 'fs';
import { getDb } from '../db/connection';
import type { ImportSummary, IntervalInput } from '../models/types';
import { validateIntervalInputs, validateTimestampContinuity, validateScenarioProfile, validateEnergyAssets } from './validator';

/**
 * XLSX/CSV Import module — parses workbook sheets and upserts to database.
 */

function parseNumeric(val: any, fallback: number = 0): number {
  if (val === null || val === undefined || val === '') return fallback;
  const n = Number(val);
  return isNaN(n) ? fallback : n;
}

function parseBoolean(val: any): number {
  if (val === true || val === 1 || val === '1' || val === 'TRUE' || val === 'true' || val === 'Yes') return 1;
  return 0;
}

function normalizeColumnName(name: string): string {
  return name.trim().toLowerCase().replace(/[\s\-\.]+/g, '_').replace(/[()]/g, '');
}

function normalizeRowKeys(row: Record<string, any>): Record<string, any> {
  const normalized: Record<string, any> = {};
  for (const [key, value] of Object.entries(row)) {
    normalized[normalizeColumnName(key)] = value;
  }
  return normalized;
}

/**
 * Parse an Excel serial date number to ISO string.
 */
function excelDateToISO(serial: number | string): string {
  if (typeof serial === 'string') {
    // Already a string, try to parse it
    const d = new Date(serial);
    if (!isNaN(d.getTime())) {
      return d.toISOString().replace('Z', '').replace(/\.\d{3}$/, '');
    }
    return serial;
  }
  // Excel serial date
  const utc_days = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;
  const date_info = new Date(utc_value * 1000);
  const fractional_day = serial - Math.floor(serial) + 0.0000001;
  let total_seconds = Math.floor(86400 * fractional_day);
  const seconds = total_seconds % 60;
  total_seconds -= seconds;
  const hours = Math.floor(total_seconds / (60 * 60));
  const minutes = Math.floor(total_seconds / 60) % 60;

  const year = date_info.getUTCFullYear();
  const month = String(date_info.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date_info.getUTCDate()).padStart(2, '0');
  const h = String(hours).padStart(2, '0');
  const m = String(minutes).padStart(2, '0');
  const s = String(seconds).padStart(2, '0');

  return `${year}-${month}-${day}T${h}:${m}:${s}`;
}

/**
 * Import a full XLSX workbook with all sheets.
 */
export function importXLSX(filePath: string): ImportSummary {
  const workbook = XLSX.readFile(filePath);
  const db = getDb();

  let scenariosLoaded = 0;
  let appliancesLoaded = 0;
  let energyAssetsLoaded = 0;
  let intervalsLoaded = 0;
  const allIntervalRows: Partial<IntervalInput>[] = [];

  // ── Parse Scenario_Profiles sheet ──
  const profileSheet = workbook.Sheets['Scenario_Profiles'] || workbook.Sheets['scenario_profiles'];
  if (profileSheet) {
    const rows = XLSX.utils.sheet_to_json(profileSheet).map((r: any) => normalizeRowKeys(r));
    const upsertProfile = db.prepare(`
      INSERT OR REPLACE INTO scenario_profiles (scenario_id, name, timezone, building_type, area_m2, room_count, max_occupancy, insulation_level, sun_exposure, comfort_min_c, comfort_max_c, vulnerable_occupants, budget_pkr_per_day, maximum_grid_demand_kw, evaluation_focus)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const row of rows) {
      const sid = row.scenario_id || row.id;
      if (!sid) continue;
      upsertProfile.run(
        sid,
        row.name || row.scenario_name || sid,
        row.timezone || 'Asia/Karachi',
        row.building_type || 'Household',
        parseNumeric(row.area_m2, 100),
        parseNumeric(row.room_count, 1),
        parseNumeric(row.max_occupancy, 4),
        row.insulation_level || 'Medium',
        row.sun_exposure || 'Medium',
        parseNumeric(row.comfort_min_c, 22),
        parseNumeric(row.comfort_max_c, 28),
        parseBoolean(row.vulnerable_occupants),
        parseNumeric(row.budget_pkr_per_day, 500),
        parseNumeric(row.maximum_grid_demand_kw, 10),
        row.evaluation_focus || ''
      );
      scenariosLoaded++;
    }
  }

  // ── Parse Appliances sheet ──
  const applianceSheet = workbook.Sheets['Appliances'] || workbook.Sheets['appliances'];
  if (applianceSheet) {
    const rows = XLSX.utils.sheet_to_json(applianceSheet).map((r: any) => normalizeRowKeys(r));
    const upsertAppliance = db.prepare(`
      INSERT OR REPLACE INTO appliances (appliance_id, scenario_id, zone_id, appliance_type, quantity, rated_power_kw, cooling_capacity_kw, efficiency_label, min_runtime_minutes, min_setpoint_c, max_setpoint_c)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const row of rows) {
      const aid = row.appliance_id || `APP-${appliancesLoaded}`;
      const sid = row.scenario_id;
      if (!sid) continue;
      upsertAppliance.run(
        aid, sid,
        row.zone_id || 'ALL',
        row.appliance_type || 'Inverter AC',
        parseNumeric(row.quantity, 1),
        parseNumeric(row.rated_power_kw, 1.5),
        parseNumeric(row.cooling_capacity_kw, 3.5),
        row.efficiency_label || 'N/A',
        parseNumeric(row.min_runtime_minutes, 0),
        parseNumeric(row.min_setpoint_c, 16),
        parseNumeric(row.max_setpoint_c, 30)
      );
      appliancesLoaded++;
    }
  }

  // ── Parse Energy_Assets sheet ──
  const assetsSheet = workbook.Sheets['Energy_Assets'] || workbook.Sheets['energy_assets'];
  if (assetsSheet) {
    const rows = XLSX.utils.sheet_to_json(assetsSheet).map((r: any) => normalizeRowKeys(r));
    const upsertAsset = db.prepare(`
      INSERT OR REPLACE INTO energy_assets (scenario_id, solar_capacity_kw, solar_conversion_efficiency, battery_capacity_kwh, initial_soc_kwh, minimum_reserve_kwh, max_charge_kw, max_discharge_kw, charge_efficiency, discharge_efficiency)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const row of rows) {
      const sid = row.scenario_id;
      if (!sid) continue;
      upsertAsset.run(
        sid,
        parseNumeric(row.solar_capacity_kw, 0),
        parseNumeric(row.solar_conversion_efficiency, 0.18),
        parseNumeric(row.battery_capacity_kwh, 0),
        parseNumeric(row.initial_soc_kwh, 0),
        parseNumeric(row.minimum_reserve_kwh, 0),
        parseNumeric(row.max_charge_kw, 0),
        parseNumeric(row.max_discharge_kw, 0),
        parseNumeric(row.charge_efficiency, 0.95),
        parseNumeric(row.discharge_efficiency, 0.95)
      );
      energyAssetsLoaded++;
    }
  }

  // ── Parse Interval_Inputs sheet ──
  const intervalSheet = workbook.Sheets['Interval_Inputs'] || workbook.Sheets['interval_inputs'];
  if (intervalSheet) {
    const rows = XLSX.utils.sheet_to_json(intervalSheet).map((r: any) => normalizeRowKeys(r));
    const upsertInterval = db.prepare(`
      INSERT OR REPLACE INTO interval_inputs (scenario_id, timestamp_local, interval_minutes, temperature_c, relative_humidity_pct, heat_index_c, solar_irradiance_w_m2, solar_available_kw, occupancy_count, grid_available, tariff_type, tariff_pkr_per_kwh, grid_carbon_kgco2_per_kwh, non_cooling_load_kw, source_missing_flag)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertBatch = db.transaction((batchRows: any[]) => {
      for (const row of batchRows) {
        const sid = row.scenario_id;
        if (!sid) continue;
        const ts = excelDateToISO(row.timestamp_local);

        const intervalRow: Partial<IntervalInput> = {
          scenario_id: sid,
          timestamp_local: ts,
          interval_minutes: parseNumeric(row.interval_minutes, 15),
          temperature_c: parseNumeric(row.temperature_c),
          relative_humidity_pct: parseNumeric(row.relative_humidity_pct),
          heat_index_c: parseNumeric(row.heat_index_c, parseNumeric(row.temperature_c)),
          solar_irradiance_w_m2: parseNumeric(row.solar_irradiance_w_m2, 0),
          solar_available_kw: parseNumeric(row.solar_available_kw, 0),
          occupancy_count: parseNumeric(row.occupancy_count, 0),
          grid_available: parseBoolean(row.grid_available ?? 1),
          tariff_type: row.tariff_type || 'ON_PEAK',
          tariff_pkr_per_kwh: parseNumeric(row.tariff_pkr_per_kwh, 20),
          grid_carbon_kgco2_per_kwh: parseNumeric(row.grid_carbon_kgco2_per_kwh, 0.5),
          non_cooling_load_kw: parseNumeric(row.non_cooling_load_kw, 0.3),
          source_missing_flag: parseNumeric(row.source_missing_flag, 0),
        };

        allIntervalRows.push(intervalRow);

        upsertInterval.run(
          sid, ts,
          intervalRow.interval_minutes,
          intervalRow.temperature_c,
          intervalRow.relative_humidity_pct,
          intervalRow.heat_index_c,
          intervalRow.solar_irradiance_w_m2,
          intervalRow.solar_available_kw,
          intervalRow.occupancy_count,
          intervalRow.grid_available,
          intervalRow.tariff_type,
          intervalRow.tariff_pkr_per_kwh,
          intervalRow.grid_carbon_kgco2_per_kwh,
          intervalRow.non_cooling_load_kw,
          intervalRow.source_missing_flag
        );
        intervalsLoaded++;
      }
    });

    insertBatch(rows);
  }

  // ── Parse Baseline_Schedule sheet ──
  const baselineSheet = workbook.Sheets['Baseline_Schedule'] || workbook.Sheets['baseline_schedule'];
  if (baselineSheet) {
    const rows = XLSX.utils.sheet_to_json(baselineSheet).map((r: any) => normalizeRowKeys(r));
    const upsertBaseline = db.prepare(`
      INSERT OR REPLACE INTO baseline_schedule (scenario_id, timestamp_local, baseline_ac_units_on, baseline_ac_setpoint_c, baseline_fan_units_on)
      VALUES (?, ?, ?, ?, ?)
    `);

    const insertBaselineBatch = db.transaction((batchRows: any[]) => {
      for (const row of batchRows) {
        const sid = row.scenario_id;
        if (!sid) continue;
        const ts = excelDateToISO(row.timestamp_local);
        upsertBaseline.run(
          sid, ts,
          parseNumeric(row.baseline_ac_units_on, 0),
          row.baseline_ac_setpoint_c !== undefined && row.baseline_ac_setpoint_c !== '' ? parseNumeric(row.baseline_ac_setpoint_c) : null,
          parseNumeric(row.baseline_fan_units_on, 0)
        );
      }
    });

    insertBaselineBatch(rows);
  }

  // Validate
  const validation = validateIntervalInputs(allIntervalRows);

  return {
    scenarios_loaded: scenariosLoaded,
    appliances_loaded: appliancesLoaded,
    energy_assets_loaded: energyAssetsLoaded,
    intervals_loaded: intervalsLoaded,
    validation,
  };
}

/**
 * Import CSV file containing interval inputs.
 */
export function importCSV(filePath: string, scenarioId?: string): ImportSummary {
  const content = fs.readFileSync(filePath, 'utf-8');
  const workbook = XLSX.read(content, { type: 'string' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet).map((r: any) => {
    const normalized = normalizeRowKeys(r);
    if (scenarioId && !normalized.scenario_id) {
      normalized.scenario_id = scenarioId;
    }
    return normalized;
  });

  const db = getDb();
  const allIntervalRows: Partial<IntervalInput>[] = [];

  const upsertInterval = db.prepare(`
    INSERT OR REPLACE INTO interval_inputs (scenario_id, timestamp_local, interval_minutes, temperature_c, relative_humidity_pct, heat_index_c, solar_irradiance_w_m2, solar_available_kw, occupancy_count, grid_available, tariff_type, tariff_pkr_per_kwh, grid_carbon_kgco2_per_kwh, non_cooling_load_kw, source_missing_flag)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let intervalsLoaded = 0;

  const insertBatch = db.transaction((batchRows: any[]) => {
    for (const row of batchRows) {
      const sid = row.scenario_id || scenarioId;
      if (!sid) continue;
      const ts = typeof row.timestamp_local === 'number'
        ? excelDateToISO(row.timestamp_local)
        : String(row.timestamp_local);

      const intervalRow: Partial<IntervalInput> = {
        scenario_id: sid,
        timestamp_local: ts,
        interval_minutes: parseNumeric(row.interval_minutes, 15),
        temperature_c: parseNumeric(row.temperature_c),
        relative_humidity_pct: parseNumeric(row.relative_humidity_pct),
        heat_index_c: parseNumeric(row.heat_index_c, parseNumeric(row.temperature_c)),
        solar_irradiance_w_m2: parseNumeric(row.solar_irradiance_w_m2, 0),
        solar_available_kw: parseNumeric(row.solar_available_kw, 0),
        occupancy_count: parseNumeric(row.occupancy_count, 0),
        grid_available: parseBoolean(row.grid_available ?? 1),
        tariff_type: row.tariff_type || 'ON_PEAK',
        tariff_pkr_per_kwh: parseNumeric(row.tariff_pkr_per_kwh, 20),
        grid_carbon_kgco2_per_kwh: parseNumeric(row.grid_carbon_kgco2_per_kwh, 0.5),
        non_cooling_load_kw: parseNumeric(row.non_cooling_load_kw, 0.3),
        source_missing_flag: parseNumeric(row.source_missing_flag, 0),
      };

      allIntervalRows.push(intervalRow);
      upsertInterval.run(
        sid, ts, intervalRow.interval_minutes, intervalRow.temperature_c,
        intervalRow.relative_humidity_pct, intervalRow.heat_index_c,
        intervalRow.solar_irradiance_w_m2, intervalRow.solar_available_kw,
        intervalRow.occupancy_count, intervalRow.grid_available,
        intervalRow.tariff_type, intervalRow.tariff_pkr_per_kwh,
        intervalRow.grid_carbon_kgco2_per_kwh, intervalRow.non_cooling_load_kw,
        intervalRow.source_missing_flag
      );
      intervalsLoaded++;
    }
  });

  insertBatch(rows);

  const validation = validateIntervalInputs(allIntervalRows);

  return {
    scenarios_loaded: 0,
    appliances_loaded: 0,
    energy_assets_loaded: 0,
    intervals_loaded: intervalsLoaded,
    validation,
  };
}
