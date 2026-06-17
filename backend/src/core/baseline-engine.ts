import { getDb } from '../db/connection';
import { v4 as uuid } from 'uuid';
import type {
  ScenarioProfile, Appliance, EnergyAsset, IntervalInput,
  OutputSchedule, BaselineScheduleRow, OptimizationRun, ComfortStatus,
} from '../models/types';
import {
  stepThermalModel, getComfortStatus, calculateCoolingPower,
  calculateACEnergy, calculateFanEnergy, estimateInitialIndoorTemp,
  type ThermalParams,
} from './thermal-model';
import {
  applyCharge, applyDischarge, maxChargeable, maxDischargeable,
} from './battery-model';
import { determineReasonCode } from './reason-codes';
import { validateEnergyBalance } from './constraints';

/**
 * Baseline Engine — calculates what happens with the "naive" or original
 * appliance schedule (from the Baseline_Schedule sheet or a default).
 */

export interface BaselineResult {
  run_id: string;
  scenario_id: string;
  total_intervals: number;
  total_cost_pkr: number;
  total_grid_energy_kwh: number;
  total_emissions_kgco2e: number;
  peak_demand_kw: number;
  comfort_compliance_pct: number;
  total_solar_energy_kwh?: number;
  infeasible_count?: number;
  run_duration_seconds?: number;
}

/**
 * Run baseline calculation for a scenario and evaluation window.
 */
export function runBaseline(
  scenarioId: string,
  windowStart: string,
  windowEnd: string
): BaselineResult {
  const db = getDb();
  const startTime = Date.now();

  // Load scenario data
  const profile = db.prepare('SELECT * FROM scenario_profiles WHERE scenario_id = ?').get(scenarioId) as ScenarioProfile;
  if (!profile) throw new Error(`Scenario not found: ${scenarioId}`);

  const appliances = db.prepare('SELECT * FROM appliances WHERE scenario_id = ?').all(scenarioId) as Appliance[];
  const assets = db.prepare('SELECT * FROM energy_assets WHERE scenario_id = ?').get(scenarioId) as EnergyAsset | undefined;
  const energyAssets = assets || null;

  // Load interval inputs for the window
  const intervals = db.prepare(
    'SELECT * FROM interval_inputs WHERE scenario_id = ? AND timestamp_local >= ? AND timestamp_local < ? ORDER BY timestamp_local'
  ).all(scenarioId, windowStart, windowEnd) as IntervalInput[];

  if (intervals.length === 0) {
    throw new Error(`No interval data found for scenario ${scenarioId} between ${windowStart} and ${windowEnd}`);
  }

  // Load baseline schedule (if exists)
  const baselineSchedule = db.prepare(
    'SELECT * FROM baseline_schedule WHERE scenario_id = ? AND timestamp_local >= ? AND timestamp_local < ? ORDER BY timestamp_local'
  ).all(scenarioId, windowStart, windowEnd) as BaselineScheduleRow[];

  // Create a map for fast lookup
  const baselineMap = new Map<string, BaselineScheduleRow>();
  baselineSchedule.forEach(row => baselineMap.set(row.timestamp_local, row));

  // Calculate aggregate appliance data
  const acAppliances = appliances.filter(a => a.appliance_type !== 'Ceiling fan');
  const fanAppliances = appliances.filter(a => a.appliance_type === 'Ceiling fan');

  const totalAcUnits = acAppliances.reduce((sum, a) => sum + a.quantity, 0);
  const totalFanUnits = fanAppliances.reduce((sum, a) => sum + a.quantity, 0);
  const avgRatedPowerKw = acAppliances.length > 0
    ? acAppliances.reduce((sum, a) => sum + a.rated_power_kw * a.quantity, 0) / totalAcUnits
    : 1.5;
  const avgCoolingCapacityKw = acAppliances.length > 0
    ? acAppliances.reduce((sum, a) => sum + a.cooling_capacity_kw * a.quantity, 0) / totalAcUnits
    : 3.5;
  const defaultSetpoint = acAppliances.length > 0
    ? (acAppliances[0].min_setpoint_c + acAppliances[0].max_setpoint_c) / 2
    : 24;

  // Create optimization run record
  const runId = uuid();
  const run: OptimizationRun = {
    run_id: runId,
    scenario_id: scenarioId,
    algorithm_version: 'v1.0.0-baseline',
    objective_weights: JSON.stringify({ cost: 1, emissions: 0, comfort: 0, peak: 0 }),
    evaluation_window_start: windowStart,
    evaluation_window_end: windowEnd,
    run_duration_seconds: 0,
    status: 'running',
    created_at: new Date().toISOString(),
  };

  db.prepare(`
    INSERT INTO optimization_runs (run_id, scenario_id, algorithm_version, objective_weights, evaluation_window_start, evaluation_window_end, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(run.run_id, run.scenario_id, run.algorithm_version, run.objective_weights,
    run.evaluation_window_start, run.evaluation_window_end, run.status, run.created_at);

  // Thermal model params
  const thermalParams: ThermalParams = {
    insulation_level: profile.insulation_level,
    sun_exposure: profile.sun_exposure,
    area_m2: profile.area_m2,
  };

  // Process each interval
  let indoorTemp = estimateInitialIndoorTemp(intervals[0].temperature_c, profile.comfort_min_c, profile.comfort_max_c);
  let batterySoc = energyAssets?.initial_soc_kwh || 0;
  let totalCost = 0;
  let totalGridEnergy = 0;
  let totalSolarEnergy = 0;
  let totalEmissions = 0;
  let peakDemandKw = 0;
  let comfortWithinCount = 0;
  let occupiedCount = 0;
  let infeasibleCount = 0;
  let dailyCost = 0;
  let currentDay = '';

  const insertStmt = db.prepare(`
    INSERT INTO output_schedule (run_id, scenario_id, timestamp_local, recommended_ac_units_on,
    recommended_ac_setpoint_c, recommended_fan_units_on, grid_energy_kwh, solar_energy_used_kwh,
    battery_charge_kwh, battery_discharge_kwh, battery_soc_kwh, cooling_energy_kwh,
    estimated_indoor_temp_c, comfort_status, interval_cost_pkr, interval_emissions_kgco2e,
    reason_code, explanation, constraint_violation_count, is_baseline)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);

  const insertAll = db.transaction(() => {
    for (let i = 0; i < intervals.length; i++) {
      const interval = intervals[i];
      const day = interval.timestamp_local.substring(0, 10);
      if (day !== currentDay) {
        dailyCost = 0;
        currentDay = day;
      }

      // Get baseline schedule for this interval (or use defaults)
      const bsRow = baselineMap.get(interval.timestamp_local);
      let acUnitsOn = bsRow ? bsRow.baseline_ac_units_on : (interval.occupancy_count > 0 ? Math.min(totalAcUnits, Math.ceil(totalAcUnits * 0.7)) : 0);
      let fanUnitsOn = bsRow ? bsRow.baseline_fan_units_on : (interval.occupancy_count > 0 ? totalFanUnits : 0);

      // Enforce power constraints during grid outages in baseline
      if (!interval.grid_available) {
        const maxDischargeKwh = energyAssets ? maxDischargeable(energyAssets, batterySoc, interval.interval_minutes, true) : 0;
        const solarAvailableKwh = interval.solar_available_kw * (interval.interval_minutes / 60);
        const maxEnergyAvailable = solarAvailableKwh + maxDischargeKwh;
        const nonCoolingKwh = interval.non_cooling_load_kw * (interval.interval_minutes / 60);
        const maxCoolingEnergyAvailable = Math.max(0, maxEnergyAvailable - nonCoolingKwh);

        const fanPowerKwhPerUnit = 0.075 * (interval.interval_minutes / 60);
        const maxFansOn = fanPowerKwhPerUnit > 0 ? Math.floor(maxCoolingEnergyAvailable / fanPowerKwhPerUnit) : 0;
        fanUnitsOn = Math.min(fanUnitsOn, maxFansOn);

        const remainingCoolingEnergy = Math.max(0, maxCoolingEnergyAvailable - fanUnitsOn * fanPowerKwhPerUnit);
        const acPowerKwhPerUnit = avgRatedPowerKw * (interval.interval_minutes / 60);
        const maxAcsOn = acPowerKwhPerUnit > 0 ? Math.floor(remainingCoolingEnergy / acPowerKwhPerUnit) : 0;
        acUnitsOn = Math.min(acUnitsOn, maxAcsOn);
      }

      const acSetpoint = acUnitsOn > 0 ? (bsRow && bsRow.baseline_ac_setpoint_c !== null && bsRow.baseline_ac_setpoint_c !== undefined ? bsRow.baseline_ac_setpoint_c : defaultSetpoint) : null;

      // Calculate cooling power
      const coolingPower = calculateCoolingPower(acUnitsOn, acSetpoint, indoorTemp, avgCoolingCapacityKw);

      // Step thermal model
      indoorTemp = stepThermalModel(thermalParams, { indoor_temp_c: indoorTemp }, {
        outdoor_temp_c: interval.temperature_c,
        heat_index_c: interval.heat_index_c,
        solar_irradiance_w_m2: interval.solar_irradiance_w_m2,
        occupancy_count: interval.occupancy_count,
        cooling_power_kw: coolingPower,
        interval_minutes: interval.interval_minutes,
      });

      // Calculate energy consumption
      const acEnergyKwh = calculateACEnergy(acUnitsOn, avgRatedPowerKw, interval.interval_minutes);
      const fanEnergyKwh = calculateFanEnergy(fanUnitsOn, interval.interval_minutes);
      const coolingEnergyKwh = acEnergyKwh + fanEnergyKwh;
      const nonCoolingKwh = interval.non_cooling_load_kw * (interval.interval_minutes / 60);
      const totalDemandKwh = coolingEnergyKwh + nonCoolingKwh;

      // Energy source allocation (baseline: simple priority — solar first, then grid)
      const solarAvailableKwh = interval.solar_available_kw * (interval.interval_minutes / 60);
      let solarUsedKwh = Math.min(solarAvailableKwh, totalDemandKwh);
      let gridEnergyKwh = 0;
      let chargeKwh = 0;
      let dischargeKwh = 0;

      if (!interval.grid_available) {
        // No grid: use solar + battery
        const solarDeficit = totalDemandKwh - solarUsedKwh;
        if (solarDeficit > 0 && energyAssets && energyAssets.battery_capacity_kwh > 0) {
          const maxDischarge = maxDischargeable(energyAssets, batterySoc, interval.interval_minutes, true);
          dischargeKwh = Math.min(solarDeficit, maxDischarge);
          const result = applyDischarge(energyAssets, batterySoc, dischargeKwh, true);
          dischargeKwh = result.actualDischarged;
          batterySoc = result.newSoc;
        }
      } else {
        // Grid available: use solar, then grid
        gridEnergyKwh = Math.max(0, totalDemandKwh - solarUsedKwh);

        // Charge battery with excess solar
        const excessSolar = solarAvailableKwh - solarUsedKwh;
        if (excessSolar > 0 && energyAssets && energyAssets.battery_capacity_kwh > 0) {
          const maxCharge = maxChargeable(energyAssets, batterySoc, interval.interval_minutes);
          chargeKwh = Math.min(excessSolar, maxCharge);
          const result = applyCharge(energyAssets, batterySoc, chargeKwh);
          chargeKwh = result.actualCharged;
          batterySoc = result.newSoc;
        }
      }

      // Track peak demand
      const gridPowerKw = gridEnergyKwh / (interval.interval_minutes / 60);
      peakDemandKw = Math.max(peakDemandKw, gridPowerKw);

      // Calculate cost and emissions
      const intervalCost = gridEnergyKwh * interval.tariff_pkr_per_kwh;
      const intervalEmissions = gridEnergyKwh * interval.grid_carbon_kgco2_per_kwh;

      totalCost += intervalCost;
      totalGridEnergy += gridEnergyKwh;
      totalSolarEnergy += solarUsedKwh;
      totalEmissions += intervalEmissions;
      dailyCost += intervalCost;

      // Comfort status
      const comfortStatus = getComfortStatus(indoorTemp, profile.comfort_min_c, profile.comfort_max_c, interval.occupancy_count);
      if (interval.occupancy_count > 0) {
        occupiedCount++;
        if (comfortStatus === 'within_range') comfortWithinCount++;
        else infeasibleCount++;
      }

      // Reason code
      const reason = determineReasonCode(
        interval, energyAssets, batterySoc, acUnitsOn, i > 0 ? (baselineMap.get(intervals[i - 1].timestamp_local)?.baseline_ac_units_on || 0) : 0,
        comfortStatus, dailyCost, profile.budget_pkr_per_day,
        gridPowerKw, profile.maximum_grid_demand_kw
      );

      // Round values
      const row = {
        gridEnergy: Math.round(gridEnergyKwh * 10000) / 10000,
        solarUsed: Math.round(solarUsedKwh * 10000) / 10000,
        charge: Math.round(chargeKwh * 10000) / 10000,
        discharge: Math.round(dischargeKwh * 10000) / 10000,
        soc: Math.round(batterySoc * 10000) / 10000,
        coolingEnergy: Math.round(coolingEnergyKwh * 10000) / 10000,
        indoorTemp: Math.round(indoorTemp * 100) / 100,
        cost: Math.round(intervalCost * 10000) / 10000,
        emissions: Math.round(intervalEmissions * 10000) / 10000,
      };

      insertStmt.run(
        runId, scenarioId, interval.timestamp_local, acUnitsOn,
        acSetpoint, fanUnitsOn, row.gridEnergy, row.solarUsed,
        row.charge, row.discharge, row.soc, row.coolingEnergy,
        row.indoorTemp, comfortStatus, row.cost, row.emissions,
        reason.code, reason.explanation, 0
      );
    }
  });

  insertAll();

  // Update run status
  const duration = (Date.now() - startTime) / 1000;
  db.prepare('UPDATE optimization_runs SET status = ?, run_duration_seconds = ? WHERE run_id = ?')
    .run('complete', duration, runId);

  return {
    run_id: runId,
    scenario_id: scenarioId,
    total_intervals: intervals.length,
    total_cost_pkr: Math.round(totalCost * 100) / 100,
    total_grid_energy_kwh: Math.round(totalGridEnergy * 100) / 100,
    total_solar_energy_kwh: Math.round(totalSolarEnergy * 100) / 100,
    total_emissions_kgco2e: Math.round(totalEmissions * 100) / 100,
    peak_demand_kw: Math.round(peakDemandKw * 100) / 100,
    comfort_compliance_pct: occupiedCount > 0 ? Math.round(comfortWithinCount / occupiedCount * 10000) / 100 : 100,
    infeasible_count: infeasibleCount,
    run_duration_seconds: Math.round(duration * 100) / 100,
  };
}
