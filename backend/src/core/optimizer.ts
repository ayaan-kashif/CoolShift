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
  getThermalResistance, getThermalCapacitance, getSolarHeatGain,
  getOccupantHeatGain, type ThermalParams,
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
  // 2. Build and Solve LP Model Day-by-Day (Sequential)
  // ---------------------------------------------------------------------
  const socMin = energyAssets?.minimum_reserve_kwh || 0;
  const socMax = energyAssets?.battery_capacity_kwh || 0;
  const initialSoc = energyAssets?.initial_soc_kwh || 0;
  const batteryCap = energyAssets?.battery_capacity_kwh || 0;

  const initialTemp = estimateInitialIndoorTemp(intervals[0].temperature_c, profile.comfort_min_c, profile.comfort_max_c);

  // Group intervals by date
  const dateGroups: { [date: string]: { intv: IntervalInput; index: number }[] } = {};
  intervals.forEach((intv, idx) => {
    const date = intv.timestamp_local.substring(0, 10);
    if (!dateGroups[date]) {
      dateGroups[date] = [];
    }
    dateGroups[date].push({ intv, index: idx });
  });

  const dates = Object.keys(dateGroups).sort();

  let currentInitialTemp = initialTemp;
  let currentInitialSoc = initialSoc;
  const globalSolution: any = { feasible: true, result: 0 };

  const varName = (base: string, idx: number) => `${base}_${idx}`;

  for (const date of dates) {
    const dayIntervals = dateGroups[date];
    const startIndex = dayIntervals[0].index;
    const endIndex = dayIntervals[dayIntervals.length - 1].index;

    const model: any = {
      optimize: 'objective',
      opType: 'min',
      constraints: {},
      variables: {},
    };

    // Initial values for this day
    const dayPrevSocVar = `soc_${startIndex}`;
    model.variables[dayPrevSocVar] = { objective: 0 };
    const daySocInitLimit = `socInitLimit_${startIndex}`;
    model.constraints[daySocInitLimit] = { equal: currentInitialSoc };
    model.variables[dayPrevSocVar][daySocInitLimit] = 1;

    const dayPrevTempVar = `temp_${startIndex}`;
    model.variables[dayPrevTempVar] = { objective: 0 };
    const dayTempInitLimit = `tempInitLimit_${startIndex}`;
    model.constraints[dayTempInitLimit] = { equal: currentInitialTemp };
    model.variables[dayPrevTempVar][dayTempInitLimit] = 1;

    dayIntervals.forEach(({ intv, index: i }) => {
      const acUnitsVar = varName('acUnits', i);
      const fanUnitsVar = varName('fanUnits', i);
      const batChargeVar = varName('batCharge', i);
      const batDischargeVar = varName('batDischarge', i);
      const gridEnergyVar = varName('gridEnergy', i);
      const socVar = varName('soc', i + 1);
      const comfortDevVar = varName('comfortDev', i);
      const peakDemandVar = varName('peakDemand', i);
      const tempVar = varName('temp', i + 1);
      const coolingPowerVar = varName('coolingPower', i);
      const solarUsedVar = varName('solarUsed', i);
      const deficitVar = varName('deficit', i);

      // Register variables
      model.variables[acUnitsVar] = { objective: 0 };
      model.variables[fanUnitsVar] = { objective: 0 };
      model.variables[batChargeVar] = { objective: 0 };
      model.variables[batDischargeVar] = { objective: 0 };
      model.variables[gridEnergyVar] = { objective: 0 };
      model.variables[socVar] = { objective: 0 };
      model.variables[comfortDevVar] = { objective: weights.comfort * 5000 }; // high penalty for comfort deviation
      model.variables[peakDemandVar] = { objective: weights.peak * 50 };
      model.variables[tempVar] = { objective: 0 };
      model.variables[coolingPowerVar] = { objective: 0 };
      model.variables[solarUsedVar] = { objective: 0 };
      model.variables[deficitVar] = { objective: 100000 }; // high penalty for unmet energy load

      // Bounds constraints with proper variable mapping
      const acLimit = `acLimit_${i}`;
      model.constraints[acLimit] = { max: totalAcUnits };
      model.variables[acUnitsVar][acLimit] = 1;

      const fanLimit = `fanLimit_${i}`;
      model.constraints[fanLimit] = { max: totalFanUnits };
      model.variables[fanUnitsVar][fanLimit] = 1;

      const tempLimit = `tempLimit_${i}`;
      model.constraints[tempLimit] = { min: 10, max: 60 };
      model.variables[tempVar][tempLimit] = 1;

      const coolingPowerLimit = `coolingPowerLimit_${i}`;
      model.constraints[coolingPowerLimit] = { max: 0 };
      model.variables[coolingPowerVar][coolingPowerLimit] = 1;
      model.variables[acUnitsVar][coolingPowerLimit] = -avgCoolingCapacityKw;

      const maxSolar = intv.solar_available_kw * 0.25;
      const solarLimit = `solarLimit_${i}`;
      model.constraints[solarLimit] = { max: maxSolar };
      model.variables[solarUsedVar][solarLimit] = 1;

      const deficitLimit = `deficitLimit_${i}`;
      model.constraints[deficitLimit] = { min: 0 };
      model.variables[deficitVar][deficitLimit] = 1;

      const socLimit = `socLimit_${i}`;
      const batChargeLimit = `batChargeLimit_${i}`;
      const batDischargeLimit = `batDischargeLimit_${i}`;

      if (batteryCap > 0) {
        model.constraints[socLimit] = { min: socMin, max: socMax };
        model.variables[socVar][socLimit] = 1;

        const maxCharge = maxChargeable(energyAssets!, socMax, intv.interval_minutes);
        const maxDischarge = maxDischargeable(energyAssets!, socMax, intv.interval_minutes, true);

        model.constraints[batChargeLimit] = { max: maxCharge };
        model.variables[batChargeVar][batChargeLimit] = 1;

        model.constraints[batDischargeLimit] = { max: maxDischarge };
        model.variables[batDischargeVar][batDischargeLimit] = 1;
      } else {
        model.constraints[socLimit] = { equal: 0 };
        model.variables[socVar][socLimit] = 1;

        model.constraints[batChargeLimit] = { equal: 0 };
        model.variables[batChargeVar][batChargeLimit] = 1;

        model.constraints[batDischargeLimit] = { equal: 0 };
        model.variables[batDischargeVar][batDischargeLimit] = 1;
      }

      // Grid Availability
      const gridLimit = `gridLimit_${i}`;
      if (!intv.grid_available) {
        model.constraints[gridLimit] = { equal: 0 };
        model.variables[gridEnergyVar][gridLimit] = 1;
      } else {
        model.constraints[gridLimit] = { min: 0 };
        model.variables[gridEnergyVar][gridLimit] = 1;
      }

      // Energy Balance Constraint with deficit
      const energyBal = `energyBal_${i}`;
      model.constraints[energyBal] = { equal: intv.non_cooling_load_kw * 0.25 };
      model.variables[gridEnergyVar][energyBal] = 1;
      model.variables[solarUsedVar][energyBal] = 1;
      model.variables[batDischargeVar][energyBal] = 1;
      model.variables[deficitVar][energyBal] = 1;
      model.variables[batChargeVar][energyBal] = -1;
      model.variables[acUnitsVar][energyBal] = -avgRatedPowerKw * 0.25;
      model.variables[fanUnitsVar][energyBal] = -0.075 * 0.25;

      // Grid Cost & Carbon Emissions added to Objective
      model.variables[gridEnergyVar]['objective'] =
        weights.cost * intv.tariff_pkr_per_kwh + weights.emissions * intv.grid_carbon_kgco2_per_kwh;

      // Peak Demand
      const peakLimitConstraint = `peakLimitConstraint_${i}`;
      model.constraints[peakLimitConstraint] = { max: profile.maximum_grid_demand_kw };

      const peakLink = `peakLink_${i}`;
      model.constraints[peakLink] = { max: 0 };
      model.variables[gridEnergyVar][peakLink] = 4; // gridEnergy / 0.25
      model.variables[peakDemandVar][peakLink] = -1;
      model.variables[peakDemandVar][peakLimitConstraint] = 1;

      // Battery SOC evolution: soc_{i+1} = soc_i + charge * eta_c - discharge / eta_d
      if (batteryCap > 0) {
        const etaCharge = energyAssets?.charge_efficiency || 0.95;
        const etaDischarge = energyAssets?.discharge_efficiency || 0.95;
        const socEq = `socEq_${i}`;
        model.constraints[socEq] = { equal: 0 };
        model.variables[socVar][socEq] = 1;
        model.variables[`soc_${i}`][socEq] = -1;
        model.variables[batChargeVar][socEq] = -etaCharge;
        model.variables[batDischargeVar][socEq] = 1 / etaDischarge;
      }

      // Temperature evolution: tempVar_{i+1} = alpha * tempVar_i + gamma_i - beta * coolingPowerVar_i
      const R = getThermalResistance(profile.insulation_level);
      const C = getThermalCapacitance(profile.area_m2, profile.insulation_level);
      const dt = intv.interval_minutes / 60; // 0.25

      const alpha = 1 - dt / (C * R);
      const beta = dt / C;

      const T_eff = 0.7 * intv.temperature_c + 0.3 * intv.heat_index_c;
      const Q_env_fixed = T_eff / R;
      const Q_solar = getSolarHeatGain(intv.solar_irradiance_w_m2, profile.area_m2, profile.sun_exposure);
      const Q_occ = getOccupantHeatGain(intv.occupancy_count);

      const gamma_i = beta * (Q_env_fixed + Q_solar + Q_occ);

      const tempEq = `tempEq_${i}`;
      model.constraints[tempEq] = { equal: gamma_i };
      model.variables[tempVar][tempEq] = 1;
      model.variables[`temp_${i}`][tempEq] = -alpha;
      model.variables[coolingPowerVar][tempEq] = beta;

      // Comfort Dev constraints using the tempVar
      if (intv.occupancy_count > 0) {
        const comfortMaxLink = `comfortMaxLink_${i}`;
        model.constraints[comfortMaxLink] = { max: profile.comfort_max_c };
        model.variables[tempVar][comfortMaxLink] = 1;
        model.variables[comfortDevVar][comfortMaxLink] = -1;

        const comfortMinLink = `comfortMinLink_${i}`;
        model.constraints[comfortMinLink] = { min: profile.comfort_min_c };
        model.variables[tempVar][comfortMinLink] = 1;
        model.variables[comfortDevVar][comfortMinLink] = 1;
      }
    });

    const daySolution = Solver.Solve(model) as any;
    if (!daySolution.feasible) {
      globalSolution.feasible = false;
    }

    // Merge day solution
    Object.keys(daySolution).forEach(key => {
      if (key !== 'feasible' && key !== 'result' && key !== 'bounded') {
        globalSolution[key] = daySolution[key];
      }
    });

    globalSolution.result += daySolution.result || 0;

    // Simulate day's actual outcomes step-by-step to compute ending state for the next day's LP
    const thermalParams: ThermalParams = {
      insulation_level: profile.insulation_level,
      sun_exposure: profile.sun_exposure,
      area_m2: profile.area_m2,
    };

    for (let i = startIndex; i <= endIndex; i++) {
      const interval = intervals[i];
      let acUnitsOn = Math.round(globalSolution[varName('acUnits', i)] || 0);
      acUnitsOn = Math.max(0, Math.min(totalAcUnits, acUnitsOn));

      let acSetpoint: number | null = null;
      if (acUnitsOn > 0) {
        const coolingPowerSolved = globalSolution[varName('coolingPower', i)] || 0;
        const maxCooling = acUnitsOn * avgCoolingCapacityKw;
        if (maxCooling > 0) {
          const eff = Math.max(0, Math.min(1.0, coolingPowerSolved / maxCooling));
          const calculatedSetpoint = currentInitialTemp - eff * 5.0;
          acSetpoint = Math.round(
            Math.max(
              acAppliances[0].min_setpoint_c,
              Math.min(acAppliances[0].max_setpoint_c, calculatedSetpoint)
            )
          );
        } else {
          acSetpoint = Math.round(
            Math.max(
              acAppliances[0].min_setpoint_c,
              Math.min(acAppliances[0].max_setpoint_c, profile.comfort_max_c - 1)
            )
          );
        }
      }

      const coolingPower = calculateCoolingPower(acUnitsOn, acSetpoint, currentInitialTemp, avgCoolingCapacityKw);

      currentInitialTemp = stepThermalModel(thermalParams, { indoor_temp_c: currentInitialTemp }, {
        outdoor_temp_c: interval.temperature_c,
        heat_index_c: interval.heat_index_c,
        solar_irradiance_w_m2: interval.solar_irradiance_w_m2,
        occupancy_count: interval.occupancy_count,
        cooling_power_kw: coolingPower,
        interval_minutes: interval.interval_minutes,
      });

      // Update battery SoC
      let batCharge = globalSolution[varName('batCharge', i)] || 0;
      let batDischarge = globalSolution[varName('batDischarge', i)] || 0;

      const acEnergy = calculateACEnergy(acUnitsOn, avgRatedPowerKw, interval.interval_minutes);
      const fanEnergy = calculateFanEnergy(Math.round(globalSolution[varName('fanUnits', i)] || 0), interval.interval_minutes);
      const coolingEnergy = acEnergy + fanEnergy;
      const nonCoolingKwh = interval.non_cooling_load_kw * (interval.interval_minutes / 60);
      const totalDemandKwh = coolingEnergy + nonCoolingKwh;

      if (!interval.grid_available) {
        const solarAvailableKwh = interval.solar_available_kw * (interval.interval_minutes / 60);
        const solarUsedKwh = Math.min(solarAvailableKwh, totalDemandKwh);
        const deficit = totalDemandKwh - solarUsedKwh;
        if (deficit > 0 && energyAssets && energyAssets.battery_capacity_kwh > 0) {
          const maxDisch = maxDischargeable(energyAssets, currentInitialSoc, interval.interval_minutes, true);
          const dischargeKwh = Math.min(deficit, maxDisch);
          const result = applyDischarge(energyAssets, currentInitialSoc, dischargeKwh, true);
          currentInitialSoc = result.newSoc;
        } else {
          const excess = solarAvailableKwh - solarUsedKwh;
          if (excess > 0 && energyAssets && energyAssets.battery_capacity_kwh > 0) {
            const maxCh = maxChargeable(energyAssets, currentInitialSoc, interval.interval_minutes);
            const chargeKwh = Math.min(excess, maxCh);
            const result = applyCharge(energyAssets, currentInitialSoc, chargeKwh);
            currentInitialSoc = result.newSoc;
          }
        }
      } else {
        if (batCharge > 0 && energyAssets && energyAssets.battery_capacity_kwh > 0) {
          const maxCh = maxChargeable(energyAssets, currentInitialSoc, interval.interval_minutes);
          const chargeKwh = Math.min(batCharge, maxCh);
          const result = applyCharge(energyAssets, currentInitialSoc, chargeKwh);
          currentInitialSoc = result.newSoc;
        } else if (batDischarge > 0 && energyAssets && energyAssets.battery_capacity_kwh > 0) {
          const maxDisch = maxDischargeable(energyAssets, currentInitialSoc, interval.interval_minutes, false);
          const dischargeKwh = Math.min(batDischarge, maxDisch);
          const result = applyDischarge(energyAssets, currentInitialSoc, dischargeKwh, false);
          currentInitialSoc = result.newSoc;
        }
      }
    }
  }

  // ---------------------------------------------------------------------
  // 3. Post-Process & Simulate Actual Outputs based on Global Solution
  // ---------------------------------------------------------------------
  const solution = globalSolution;
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

      // Read solver decisions
      let acUnitsOn = Math.round(solution[varName('acUnits', i)] || 0);
      let fanUnitsOn = Math.round(solution[varName('fanUnits', i)] || 0);
      let batCharge = solution[varName('batCharge', i)] || 0;
      let batDischarge = solution[varName('batDischarge', i)] || 0;

      acUnitsOn = Math.max(0, Math.min(totalAcUnits, acUnitsOn));
      fanUnitsOn = Math.max(0, Math.min(totalFanUnits, fanUnitsOn));

      let acSetpoint: number | null = null;
      if (acUnitsOn > 0) {
        const coolingPowerSolved = solution[varName('coolingPower', i)] || 0;
        const maxCooling = acUnitsOn * avgCoolingCapacityKw;
        if (maxCooling > 0) {
          const eff = Math.max(0, Math.min(1.0, coolingPowerSolved / maxCooling));
          const calculatedSetpoint = indoorTemp - eff * 5.0;
          acSetpoint = Math.round(
            Math.max(
              acAppliances[0].min_setpoint_c,
              Math.min(acAppliances[0].max_setpoint_c, calculatedSetpoint)
            )
          );
        } else {
          acSetpoint = Math.round(
            Math.max(
              acAppliances[0].min_setpoint_c,
              Math.min(acAppliances[0].max_setpoint_c, profile.comfort_max_c - 1)
            )
          );
        }
      }

      const coolingPower = calculateCoolingPower(acUnitsOn, acSetpoint, indoorTemp, avgCoolingCapacityKw);

      indoorTemp = stepThermalModel(thermalParams, { indoor_temp_c: indoorTemp }, {
        outdoor_temp_c: interval.temperature_c,
        heat_index_c: interval.heat_index_c,
        solar_irradiance_w_m2: interval.solar_irradiance_w_m2,
        occupancy_count: interval.occupancy_count,
        cooling_power_kw: coolingPower,
        interval_minutes: interval.interval_minutes,
      });

      const acEnergy = calculateACEnergy(acUnitsOn, avgRatedPowerKw, interval.interval_minutes);
      const fanEnergy = calculateFanEnergy(fanUnitsOn, interval.interval_minutes);
      const coolingEnergy = acEnergy + fanEnergy;
      const nonCoolingKwh = interval.non_cooling_load_kw * (interval.interval_minutes / 60);
      const totalDemandKwh = coolingEnergy + nonCoolingKwh;

      const solarAvailableKwh = interval.solar_available_kw * (interval.interval_minutes / 60);
      let solarUsedKwh = 0;

      let gridEnergyKwh = 0;
      let chargeKwh = 0;
      let dischargeKwh = 0;

      if (!interval.grid_available) {
        solarUsedKwh = Math.min(solarAvailableKwh, totalDemandKwh);
        const deficit = totalDemandKwh - solarUsedKwh;
        if (deficit > 0 && energyAssets && energyAssets.battery_capacity_kwh > 0) {
          const maxDisch = maxDischargeable(energyAssets, batterySoc, interval.interval_minutes, true);
          dischargeKwh = Math.min(deficit, maxDisch);
          const result = applyDischarge(energyAssets, batterySoc, dischargeKwh, true);
          dischargeKwh = result.actualDischarged;
          batterySoc = result.newSoc;
        } else {
          const excess = solarAvailableKwh - solarUsedKwh;
          if (excess > 0 && energyAssets && energyAssets.battery_capacity_kwh > 0) {
            const maxCh = maxChargeable(energyAssets, batterySoc, interval.interval_minutes);
            chargeKwh = Math.min(excess, maxCh);
            const result = applyCharge(energyAssets, batterySoc, chargeKwh);
            chargeKwh = result.actualCharged;
            batterySoc = result.newSoc;
          }
        }
      } else {
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
        
        solarUsedKwh = Math.min(solarAvailableKwh, totalDemandKwh + chargeKwh);
        gridEnergyKwh = Math.max(0, totalDemandKwh + chargeKwh - solarUsedKwh - dischargeKwh);
      }

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
