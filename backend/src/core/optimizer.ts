// file:///C:/Users/Hp/OneDrive/Desktop%202/CoolShift/CoolShift/backend/src/core/optimizer.ts
import { getDb } from '../db/connection';
import { v4 as uuid } from 'uuid';
// @ts-ignore
import Solver from 'javascript-lp-solver';
import type {
  ScenarioProfile, Appliance, EnergyAsset, IntervalInput,
  OutputSchedule, OptimizationRun,
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

export function runOptimization(
  scenarioId: string,
  windowStart: string,
  windowEnd: string,
  weights: { cost: number; emissions: number; comfort: number; peak: number }
): OptimizationResult {
  const db = getDb();
  const startTime = Date.now();

  // 1. Load scenario profile and configurations
  const profile = db.prepare('SELECT * FROM scenario_profiles WHERE scenario_id = ?').get(scenarioId) as ScenarioProfile;
  if (!profile) throw new Error(`Scenario not found: ${scenarioId}`);

  const appliances = db.prepare('SELECT * FROM appliances WHERE scenario_id = ?').all(scenarioId) as Appliance[];
  const assets = db.prepare('SELECT * FROM energy_assets WHERE scenario_id = ?').get(scenarioId) as EnergyAsset | undefined;
  const energyAssets = assets || null;

  // Load interval inputs
  const intervals = db.prepare(
    'SELECT * FROM interval_inputs WHERE scenario_id = ? AND timestamp_local >= ? AND timestamp_local < ? ORDER BY timestamp_local'
  ).all(scenarioId, windowStart, windowEnd) as IntervalInput[];

  if (intervals.length === 0) {
    throw new Error(`No interval data found for scenario ${scenarioId} between ${windowStart} and ${windowEnd}`);
  }

  // Calculate cooling parameters
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

  const runId = uuid();

  // Create optimization run record
  const run: OptimizationRun = {
    run_id: runId,
    scenario_id: scenarioId,
    algorithm_version: 'v1.2.0-lpsolver',
    objective_weights: JSON.stringify(weights),
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

  // ---------------------------------------------------------------------
  // 2. Build and Solve LP Model
  // ---------------------------------------------------------------------
  const model: any = {
    optimize: 'objective',
    opType: 'min',
    constraints: {},
    variables: {},
    ints: {},
  };

  const varName = (base: string, idx: number) => `${base}_${idx}`;

  // Peak demand variable bound
  model.constraints['peak_limit'] = { max: profile.maximum_grid_demand_kw };

  // Battery capacity and reserves
  const socMin = energyAssets?.minimum_reserve_kwh || 0;
  const socMax = energyAssets?.battery_capacity_kwh || 0;
  const initialSoc = energyAssets?.initial_soc_kwh || 0;
  const batteryCap = energyAssets?.battery_capacity_kwh || 0;

  let prevSocVar = 'soc_0';
  model.variables[prevSocVar] = { objective: 0 };
  model.constraints[prevSocVar] = { equal: initialSoc };

  intervals.forEach((intv, i) => {
    const acUnitsVar = varName('acUnits', i);
    const fanUnitsVar = varName('fanUnits', i);
    const batChargeVar = varName('batCharge', i);
    const batDischargeVar = varName('batDischarge', i);
    const gridEnergyVar = varName('gridEnergy', i);
    const socVar = varName('soc', i + 1);
    const comfortDevVar = varName('comfortDev', i);
    const peakDemandVar = varName('peakDemand', i);

    // Register variables
    model.variables[acUnitsVar] = { objective: 0 };
    model.variables[fanUnitsVar] = { objective: 0 };
    model.variables[batChargeVar] = { objective: 0 };
    model.variables[batDischargeVar] = { objective: 0 };
    model.variables[gridEnergyVar] = { objective: 0 };
    model.variables[socVar] = { objective: 0 };
    model.variables[comfortDevVar] = { objective: weights.comfort * 10 }; // Scale comfort impact
    model.variables[peakDemandVar] = { objective: weights.peak * 50 }; // Scale peak impact

    // Constraints for variables
    model.ints[acUnitsVar] = 1;
    model.ints[fanUnitsVar] = 1;

    model.constraints[acUnitsVar] = { min: 0, max: totalAcUnits };
    model.constraints[fanUnitsVar] = { min: 0, max: totalFanUnits };

    if (batteryCap > 0) {
      model.constraints[socVar] = { min: socMin, max: socMax };
      const maxCharge = maxChargeable(energyAssets!, socMax, intv.interval_minutes);
      const maxDischarge = maxDischargeable(energyAssets!, socMax, intv.interval_minutes, true);
      model.constraints[batChargeVar] = { min: 0, max: maxCharge };
      model.constraints[batDischargeVar] = { min: 0, max: maxDischarge };
    } else {
      model.constraints[socVar] = { equal: 0 };
      model.constraints[batChargeVar] = { equal: 0 };
      model.constraints[batDischargeVar] = { equal: 0 };
    }

    // Grid Availability
    if (!intv.grid_available) {
      model.constraints[gridEnergyVar] = { equal: 0 };
    } else {
      model.constraints[gridEnergyVar] = { min: 0 };
    }

    // Energy Balance Constraint: grid + solar_used + discharge = ac_energy + fan_energy + non_cooling + charge
    // Coefficients:
    const energyBal = varName('energyBal', i);
    model.constraints[energyBal] = { equal: intv.non_cooling_load_kw * 0.25 };
    model.variables[gridEnergyVar][energyBal] = 1;
    model.variables[batDischargeVar][energyBal] = 1;
    model.variables[batChargeVar][energyBal] = -1;
    model.variables[acUnitsVar][energyBal] = -avgRatedPowerKw * 0.25;
    model.variables[fanUnitsVar][energyBal] = -0.075 * 0.25;

    // Grid Cost & Carbon Emissions added to Objective
    model.variables[gridEnergyVar]['objective'] =
      weights.cost * intv.tariff_pkr_per_kwh + weights.emissions * intv.grid_carbon_kgco2_per_kwh;

    // Peak Demand constraint linking: grid_energy / 0.25 <= peakLimit
    const peakLink = varName('peakLink', i);
    model.constraints[peakLink] = { max: 0 };
    model.variables[gridEnergyVar][peakLink] = 4; // gridEnergy / 0.25
    model.variables[peakDemandVar][peakLink] = -1;
    model.variables[peakDemandVar]['peak_limit'] = 1;

    // Battery SOC evolution: soc_{i+1} = soc_i + charge * eta_c - discharge / eta_d
    if (batteryCap > 0) {
      const etaCharge = energyAssets?.charge_efficiency || 0.95;
      const etaDischarge = energyAssets?.discharge_efficiency || 0.95;
      const socEq = varName('socEq', i);
      model.constraints[socEq] = { equal: 0 };
      model.variables[socVar][socEq] = 1;
      model.variables[prevSocVar][socEq] = -1;
      model.variables[batChargeVar][socEq] = -etaCharge;
      model.variables[batDischargeVar][socEq] = 1 / etaDischarge;
    }

    // Comfort Dev constraints
    if (intv.occupancy_count > 0) {
      const comfortMaxLink = varName('comfortMaxLink', i);
      model.constraints[comfortMaxLink] = { max: profile.comfort_max_c };
      model.variables[acUnitsVar][comfortMaxLink] = -0.5; // cooling approximation
      model.variables[comfortDevVar][comfortMaxLink] = -1;

      const comfortMinLink = varName('comfortMinLink', i);
      model.constraints[comfortMinLink] = { min: profile.comfort_min_c };
      model.variables[acUnitsVar][comfortMinLink] = -0.5;
      model.variables[comfortDevVar][comfortMinLink] = 1;
    }

    prevSocVar = socVar;
  });

  const solution = Solver.Solve(model) as any;

  // ---------------------------------------------------------------------
  // 3. Post-Process & Simulate Actual Outputs based on Solver Outputs
  // ---------------------------------------------------------------------
  const thermalParams: ThermalParams = {
    insulation_level: profile.insulation_level,
    sun_exposure: profile.sun_exposure,
    area_m2: profile.area_m2,
  };

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
    INSERT INTO output_schedule (
      run_id, scenario_id, timestamp_local, recommended_ac_units_on,
      recommended_ac_setpoint_c, recommended_fan_units_on, grid_energy_kwh, solar_energy_used_kwh,
      battery_charge_kwh, battery_discharge_kwh, battery_soc_kwh, cooling_energy_kwh,
      estimated_indoor_temp_c, comfort_status, interval_cost_pkr, interval_emissions_kgco2e,
      reason_code, explanation, constraint_violation_count, is_baseline
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `);

  const insertAll = db.transaction(() => {
    for (let i = 0; i < intervals.length; i++) {
      const interval = intervals[i];
      const day = interval.timestamp_local.substring(0, 10);
      if (day !== currentDay) {
        dailyCost = 0;
        currentDay = day;
      }

      // Read solver decisions, rounding to integers for units
      let acUnitsOn = Math.round(solution[varName('acUnits', i)] || 0);
      let fanUnitsOn = Math.round(solution[varName('fanUnits', i)] || 0);
      let batCharge = solution[varName('batCharge', i)] || 0;
      let batDischarge = solution[varName('batDischarge', i)] || 0;

      // Handle simple boundaries
      acUnitsOn = Math.max(0, Math.min(totalAcUnits, acUnitsOn));
      fanUnitsOn = Math.max(0, Math.min(totalFanUnits, fanUnitsOn));

      // Calculate setpoint target based on solver activity
      let acSetpoint: number | null = null;
      if (acUnitsOn > 0) {
        acSetpoint = Math.round(
          Math.max(
            acAppliances[0].min_setpoint_c,
            Math.min(acAppliances[0].max_setpoint_c, profile.comfort_max_c - 1)
          )
        );
      }

      // Thermal calculations
      const coolingPower = calculateCoolingPower(acUnitsOn, acSetpoint, indoorTemp, avgCoolingCapacityKw);

      indoorTemp = stepThermalModel(thermalParams, { indoor_temp_c: indoorTemp }, {
        outdoor_temp_c: interval.temperature_c,
        heat_index_c: interval.heat_index_c,
        solar_irradiance_w_m2: interval.solar_irradiance_w_m2,
        occupancy_count: interval.occupancy_count,
        cooling_power_kw: coolingPower,
        interval_minutes: interval.interval_minutes,
      });

      // Energy balance calculations
      const acEnergy = calculateACEnergy(acUnitsOn, avgRatedPowerKw, interval.interval_minutes);
      const fanEnergy = calculateFanEnergy(fanUnitsOn, interval.interval_minutes);
      const coolingEnergy = acEnergy + fanEnergy;
      const nonCoolingKwh = interval.non_cooling_load_kw * (interval.interval_minutes / 60);
      const totalDemandKwh = coolingEnergy + nonCoolingKwh;

      const solarAvailableKwh = interval.solar_available_kw * (interval.interval_minutes / 60);
      let solarUsedKwh = Math.min(solarAvailableKwh, totalDemandKwh);

      let gridEnergyKwh = 0;
      let chargeKwh = 0;
      let dischargeKwh = 0;

      if (!interval.grid_available) {
        const deficit = totalDemandKwh - solarUsedKwh;
        if (deficit > 0 && energyAssets && energyAssets.battery_capacity_kwh > 0) {
          const maxDisch = maxDischargeable(energyAssets, batterySoc, interval.interval_minutes, true);
          dischargeKwh = Math.min(deficit, maxDisch);
          const result = applyDischarge(energyAssets, batterySoc, dischargeKwh, true);
          dischargeKwh = result.actualDischarged;
          batterySoc = result.newSoc;
        }
      } else {
        // Charge or discharge battery
        if (batCharge > 0 && energyAssets && energyAssets.battery_capacity_kwh > 0) {
          const maxCh = maxChargeable(energyAssets, batterySoc, interval.interval_minutes);
          chargeKwh = Math.min(batCharge, maxCh);
          const result = applyCharge(energyAssets, batterySoc, chargeKwh);
          chargeKwh = result.actualCharged;
          batterySoc = result.newSoc;
        } else if (batDischarge > 0 && energyAssets && energyAssets.battery_capacity_kwh > 0) {
          const maxDisch = maxDischargeable(energyAssets, batterySoc, interval.interval_minutes, false);
          dischargeKwh = Math.min(batDischarge, maxDisch);
          const result = applyDischarge(energyAssets, batterySoc, dischargeKwh, false);
          dischargeKwh = result.actualDischarged;
          batterySoc = result.newSoc;
        }
        gridEnergyKwh = Math.max(0, totalDemandKwh + chargeKwh - solarUsedKwh - dischargeKwh);
      }

      // Track stats
      const gridPowerKw = gridEnergyKwh / (interval.interval_minutes / 60);
      peakDemandKw = Math.max(peakDemandKw, gridPowerKw);

      const intervalCost = gridEnergyKwh * interval.tariff_pkr_per_kwh;
      const intervalEmissions = gridEnergyKwh * interval.grid_carbon_kgco2_per_kwh;

      totalCost += intervalCost;
      totalGridEnergy += gridEnergyKwh;
      totalSolarEnergy += solarUsedKwh;
      totalEmissions += intervalEmissions;
      dailyCost += intervalCost;

      const comfortStatus = getComfortStatus(indoorTemp, profile.comfort_min_c, profile.comfort_max_c, interval.occupancy_count);
      if (interval.occupancy_count > 0) {
        occupiedCount++;
        if (comfortStatus === 'within_range') comfortWithinCount++;
        if (comfortStatus === 'infeasible') infeasibleCount++;
      }

      const reason = determineReasonCode(
        interval, energyAssets, batterySoc, acUnitsOn, i > 0 ? acUnitsOn : 0,
        comfortStatus, dailyCost, profile.budget_pkr_per_day,
        gridPowerKw, profile.maximum_grid_demand_kw
      );

      insertStmt.run(
        runId, scenarioId, interval.timestamp_local, acUnitsOn,
        acSetpoint, fanUnitsOn, gridEnergyKwh, solarUsedKwh,
        chargeKwh, dischargeKwh, batterySoc, coolingEnergy,
        indoorTemp, comfortStatus, intervalCost, intervalEmissions,
        reason.code, reason.explanation, 0
      );
    }
  });

  insertAll();

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

export default { runOptimization };
