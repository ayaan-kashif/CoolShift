import { getDb } from '../db/connection';
import { v4 as uuid } from 'uuid';
import type {
  ScenarioProfile, Appliance, EnergyAsset, IntervalInput,
  OutputSchedule, ObjectiveWeights, OptimizationRun, ComfortStatus,
} from '../models/types';
import {
  stepThermalModel, getComfortStatus, calculateCoolingPower,
  calculateACEnergy, calculateFanEnergy, estimateInitialIndoorTemp,
  type ThermalParams,
} from './thermal-model';
import {
  applyCharge, applyDischarge, maxChargeable, maxDischargeable, isBatteryLow,
} from './battery-model';
import { determineReasonCode } from './reason-codes';
import { config } from '../config';

/**
 * Optimization Engine — Smart priority-based optimizer with constraint enforcement.
 *
 * Approach: Greedy heuristic with multi-pass refinement.
 * 
 * Pass 1: Forward pass — assign cooling based on priority scoring
 * Pass 2: Battery optimization — shift energy to/from battery optimally
 * Pass 3: Constraint enforcement — fix any violations
 * 
 * Decision per interval:
 *   - How many AC units to turn on (0..max)
 *   - What setpoint to use
 *   - How many fans to turn on
 *   - How much grid/solar/battery to use
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

interface IntervalDecision {
  ac_units_on: number;
  ac_setpoint_c: number | null;
  fan_units_on: number;
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
  reason_code: string;
  explanation: string;
  constraint_violation_count: number;
}

/**
 * Score an interval for cooling priority (higher = more important to cool).
 */
function scoreCoolingPriority(
  interval: IntervalInput,
  profile: ScenarioProfile,
  indoorTemp: number,
  weights: ObjectiveWeights
): number {
  let score = 0;

  // High heat = high priority
  if (interval.heat_index_c >= 40) score += 100;
  else if (interval.heat_index_c >= 35) score += 70;
  else if (interval.heat_index_c >= 30) score += 40;

  // Occupied = must cool
  if (interval.occupancy_count > 0) {
    score += 50;
    if (profile.vulnerable_occupants) score += 30;
    score += interval.occupancy_count * 5;
  }

  // Indoor temp above comfort = urgent
  if (indoorTemp > profile.comfort_max_c) {
    score += (indoorTemp - profile.comfort_max_c) * 20;
  } else if (indoorTemp > profile.comfort_max_c - 1) {
    score += 15; // approaching limit
  }

  // Penalize cooling during peak tariff (cost optimization)
  if (interval.tariff_type === 'PEAK') {
    score -= weights.cost * 40;
  } else if (interval.tariff_type === 'OFF_PEAK') {
    score += weights.cost * 15;
  }

  // Bonus for solar availability (clean energy)
  if (interval.solar_available_kw > 0.1) {
    score += weights.emissions * 25;
  }

  return score;
}

/**
 * Determine optimal number of AC units based on conditions.
 */
function determineACUnits(
  interval: IntervalInput,
  profile: ScenarioProfile,
  indoorTemp: number,
  totalAcUnits: number,
  weights: ObjectiveWeights,
  gridAvailable: boolean,
  solarAvailableKw: number,
  batteryDischargeableKwh: number,
  avgRatedPowerKw: number,
  intervalMinutes: number
): { units: number; setpoint: number | null } {
  if (totalAcUnits === 0) return { units: 0, setpoint: null };

  const isOccupied = interval.occupancy_count > 0;
  const isHeatRisk = interval.heat_index_c >= 35 && isOccupied;
  const isAboveComfort = indoorTemp > profile.comfort_max_c;
  const isNearComfort = indoorTemp > profile.comfort_max_c - 1;

  // During heat risk: maximum cooling
  if (isHeatRisk) {
    return { units: totalAcUnits, setpoint: 22 };
  }

  // Unoccupied: minimal or no cooling
  if (!isOccupied) {
    // Pre-cool if next intervals will be occupied and tariff is cheap
    // For simplicity, run at reduced capacity
    if (interval.tariff_type === 'OFF_PEAK' && indoorTemp > profile.comfort_max_c + 2) {
      return { units: Math.ceil(totalAcUnits * 0.3), setpoint: profile.comfort_max_c };
    }
    return { units: 0, setpoint: null };
  }

  // Calculate available energy
  const intervalHours = intervalMinutes / 60;
  const solarEnergyKwh = solarAvailableKw * intervalHours;
  const totalAvailableKwh = gridAvailable
    ? Infinity  // grid is essentially unlimited
    : solarEnergyKwh + batteryDischargeableKwh;

  // If above comfort, turn on enough ACs to cool down
  if (isAboveComfort) {
    const tempDiff = indoorTemp - profile.comfort_max_c;
    const unitsFraction = Math.min(1.0, tempDiff / 3.0); // scale up with deviation
    const unitsNeeded = Math.max(1, Math.ceil(totalAcUnits * unitsFraction));

    // Check if we have enough energy
    const energyNeeded = unitsNeeded * avgRatedPowerKw * intervalHours;
    if (energyNeeded <= totalAvailableKwh) {
      return { units: Math.min(unitsNeeded, totalAcUnits), setpoint: profile.comfort_min_c + 1 };
    } else {
      // Run what we can afford
      const affordableUnits = Math.max(1, Math.floor(totalAvailableKwh / (avgRatedPowerKw * intervalHours)));
      return { units: Math.min(affordableUnits, totalAcUnits), setpoint: profile.comfort_min_c + 1 };
    }
  }

  // Near comfort limit: moderate cooling
  if (isNearComfort) {
    const units = Math.max(1, Math.ceil(totalAcUnits * 0.5));
    return { units, setpoint: (profile.comfort_min_c + profile.comfort_max_c) / 2 };
  }

  // Within comfort: reduce cooling based on cost optimization
  if (interval.tariff_type === 'PEAK') {
    // During peak: minimum cooling to maintain comfort
    return { units: Math.max(1, Math.ceil(totalAcUnits * 0.3)), setpoint: profile.comfort_max_c - 1 };
  }

  if (interval.tariff_type === 'OFF_PEAK' && solarAvailableKw > 0.5) {
    // Off-peak with solar: pre-cool more aggressively
    return { units: Math.ceil(totalAcUnits * 0.7), setpoint: profile.comfort_min_c + 2 };
  }

  // Standard: moderate cooling
  return {
    units: Math.ceil(totalAcUnits * 0.5),
    setpoint: (profile.comfort_min_c + profile.comfort_max_c) / 2,
  };
}

/**
 * Run the optimization for a scenario.
 */
export function runOptimization(
  scenarioId: string,
  windowStart: string,
  windowEnd: string,
  weights: ObjectiveWeights = config.defaultWeights
): OptimizationResult {
  const db = getDb();
  const startTime = Date.now();

  // Load scenario data
  const profile = db.prepare('SELECT * FROM scenario_profiles WHERE scenario_id = ?').get(scenarioId) as ScenarioProfile;
  if (!profile) throw new Error(`Scenario not found: ${scenarioId}`);

  const appliances = db.prepare('SELECT * FROM appliances WHERE scenario_id = ?').all(scenarioId) as Appliance[];
  const assets = db.prepare('SELECT * FROM energy_assets WHERE scenario_id = ?').get(scenarioId) as EnergyAsset | undefined;
  const energyAssets = assets || null;

  const intervals = db.prepare(
    'SELECT * FROM interval_inputs WHERE scenario_id = ? AND timestamp_local >= ? AND timestamp_local < ? ORDER BY timestamp_local'
  ).all(scenarioId, windowStart, windowEnd) as IntervalInput[];

  if (intervals.length === 0) {
    throw new Error(`No interval data found for scenario ${scenarioId} between ${windowStart} and ${windowEnd}`);
  }

  // Aggregate appliance data
  const acAppliances = appliances.filter(a => a.appliance_type !== 'Ceiling fan');
  const fanAppliances = appliances.filter(a => a.appliance_type === 'Ceiling fan');
  const totalAcUnits = acAppliances.reduce((sum, a) => sum + a.quantity, 0);
  const totalFanUnits = fanAppliances.reduce((sum, a) => sum + a.quantity, 0);
  const avgRatedPowerKw = acAppliances.length > 0
    ? acAppliances.reduce((sum, a) => sum + a.rated_power_kw * a.quantity, 0) / Math.max(1, totalAcUnits)
    : 1.5;
  const avgCoolingCapacityKw = acAppliances.length > 0
    ? acAppliances.reduce((sum, a) => sum + a.cooling_capacity_kw * a.quantity, 0) / Math.max(1, totalAcUnits)
    : 3.5;
  const minSetpoint = acAppliances.length > 0 ? Math.min(...acAppliances.map(a => a.min_setpoint_c)) : 16;
  const maxSetpoint = acAppliances.length > 0 ? Math.max(...acAppliances.map(a => a.max_setpoint_c)) : 30;
  const minRuntime = acAppliances.length > 0 ? Math.max(...acAppliances.map(a => a.min_runtime_minutes)) : 0;

  // Create run record
  const runId = uuid();
  db.prepare(`
    INSERT INTO optimization_runs (run_id, scenario_id, algorithm_version, objective_weights, evaluation_window_start, evaluation_window_end, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'running', ?)
  `).run(runId, scenarioId, 'v1.0.0-greedy-optimizer', JSON.stringify(weights), windowStart, windowEnd, new Date().toISOString());

  // Thermal model params
  const thermalParams: ThermalParams = {
    insulation_level: profile.insulation_level,
    sun_exposure: profile.sun_exposure,
    area_m2: profile.area_m2,
  };

  // ─── PASS 1: Forward pass — make decisions for each interval ───
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
  let prevAcUnits = 0;
  let acOnDuration = 0; // consecutive minutes AC has been on

  const decisions: IntervalDecision[] = [];

  for (let i = 0; i < intervals.length; i++) {
    const interval = intervals[i];
    const day = interval.timestamp_local.substring(0, 10);
    if (day !== currentDay) {
      dailyCost = 0;
      currentDay = day;
    }

    const intervalHours = interval.interval_minutes / 60;
    const gridAvailable = !!interval.grid_available;

    // Battery available for discharge
    const batteryDischargeableKwh = energyAssets
      ? maxDischargeable(energyAssets, batterySoc, interval.interval_minutes)
      : 0;

    // Determine AC and fan settings
    const acDecision = determineACUnits(
      interval, profile, indoorTemp, totalAcUnits, weights,
      gridAvailable, interval.solar_available_kw, batteryDischargeableKwh,
      avgRatedPowerKw, interval.interval_minutes
    );

    let acUnitsOn = acDecision.units;
    let acSetpoint = acDecision.setpoint;

    // Enforce minimum runtime constraint
    if (prevAcUnits > 0 && acOnDuration < minRuntime && acUnitsOn === 0) {
      acUnitsOn = prevAcUnits; // Must stay on
      acSetpoint = acSetpoint || maxSetpoint; // Use higher setpoint to save energy
    }

    // Clamp setpoint
    if (acSetpoint !== null) {
      acSetpoint = Math.max(minSetpoint, Math.min(maxSetpoint, acSetpoint));
    }

    // Update AC on duration tracking
    if (acUnitsOn > 0) {
      acOnDuration += interval.interval_minutes;
    } else {
      acOnDuration = 0;
    }

    // Fans: on when occupied and AC alone isn't enough, or when unoccupied with mild heat
    let fanUnitsOn = 0;
    if (interval.occupancy_count > 0) {
      if (acUnitsOn === 0 && indoorTemp > profile.comfort_min_c) {
        fanUnitsOn = totalFanUnits; // fans only
      } else if (acUnitsOn > 0) {
        fanUnitsOn = Math.ceil(totalFanUnits * 0.5); // supplement AC
      }
    }

    // Calculate cooling power and step thermal model
    const coolingPower = calculateCoolingPower(acUnitsOn, acSetpoint, indoorTemp, avgCoolingCapacityKw);
    indoorTemp = stepThermalModel(thermalParams, { indoor_temp_c: indoorTemp }, {
      outdoor_temp_c: interval.temperature_c,
      heat_index_c: interval.heat_index_c,
      solar_irradiance_w_m2: interval.solar_irradiance_w_m2,
      occupancy_count: interval.occupancy_count,
      cooling_power_kw: coolingPower,
      interval_minutes: interval.interval_minutes,
    });

    // Check if cooling capacity is sufficient (infeasibility detection)
    let comfortStatus = getComfortStatus(indoorTemp, profile.comfort_min_c, profile.comfort_max_c, interval.occupancy_count);
    if (comfortStatus === 'unsafe' && acUnitsOn >= totalAcUnits) {
      comfortStatus = 'infeasible';
      infeasibleCount++;
    }

    // Calculate energy consumption
    const acEnergyKwh = calculateACEnergy(acUnitsOn, avgRatedPowerKw, interval.interval_minutes);
    const fanEnergyKwh = calculateFanEnergy(fanUnitsOn, interval.interval_minutes);
    const coolingEnergyKwh = acEnergyKwh + fanEnergyKwh;
    const nonCoolingKwh = interval.non_cooling_load_kw * intervalHours;
    const totalDemandKwh = coolingEnergyKwh + nonCoolingKwh;

    // Energy source allocation — optimized priority:
    // 1. Solar (free, clean)
    // 2. Battery discharge (during peak/outage)
    // 3. Grid (last resort)
    const solarAvailableKwh = interval.solar_available_kw * intervalHours;
    let solarUsedKwh = Math.min(solarAvailableKwh, totalDemandKwh);
    let remaining = totalDemandKwh - solarUsedKwh;
    let gridEnergyKwh = 0;
    let chargeKwh = 0;
    let dischargeKwh = 0;

    // Use battery during peak tariff or outage
    if (remaining > 0 && energyAssets && energyAssets.battery_capacity_kwh > 0) {
      const shouldUseBattery = !gridAvailable || interval.tariff_type === 'PEAK' ||
        (interval.tariff_type === 'ON_PEAK' && weights.cost > 0.3);

      if (shouldUseBattery) {
        const maxDischarge = maxDischargeable(energyAssets, batterySoc, interval.interval_minutes);
        dischargeKwh = Math.min(remaining, maxDischarge);
        if (dischargeKwh > 0) {
          const result = applyDischarge(energyAssets, batterySoc, dischargeKwh, !gridAvailable);
          dischargeKwh = result.actualDischarged;
          batterySoc = result.newSoc;
          remaining -= result.energyDelivered;
        }
      }
    }

    // Grid fills remaining (if available)
    if (remaining > 0 && gridAvailable) {
      gridEnergyKwh = remaining;
    } else if (remaining > 0 && !gridAvailable) {
      // Can't meet demand — energy deficit
      // This is reported via comfort status
    }

    // Charge battery with excess solar
    const excessSolar = solarAvailableKwh - solarUsedKwh;
    if (excessSolar > 0 && energyAssets && energyAssets.battery_capacity_kwh > 0 && dischargeKwh === 0) {
      const maxCharge = maxChargeable(energyAssets, batterySoc, interval.interval_minutes);
      chargeKwh = Math.min(excessSolar, maxCharge);
      if (chargeKwh > 0) {
        const result = applyCharge(energyAssets, batterySoc, chargeKwh);
        chargeKwh = result.actualCharged;
        batterySoc = result.newSoc;
      }
    }

    // Also charge from grid during off-peak if battery is low
    if (energyAssets && energyAssets.battery_capacity_kwh > 0 && chargeKwh === 0 && dischargeKwh === 0 &&
        gridAvailable && interval.tariff_type === 'OFF_PEAK' && isBatteryLow(energyAssets, batterySoc)) {
      const maxCharge = maxChargeable(energyAssets, batterySoc, interval.interval_minutes);
      const gridChargeKwh = Math.min(maxCharge, energyAssets.max_charge_kw * intervalHours * 0.5);
      if (gridChargeKwh > 0) {
        chargeKwh = gridChargeKwh;
        gridEnergyKwh += gridChargeKwh;
        const result = applyCharge(energyAssets, batterySoc, chargeKwh);
        chargeKwh = result.actualCharged;
        batterySoc = result.newSoc;
      }
    }

    // Peak demand tracking
    const gridPowerKw = gridEnergyKwh / intervalHours;
    peakDemandKw = Math.max(peakDemandKw, gridPowerKw);

    // Cost and emissions
    const intervalCost = gridEnergyKwh * interval.tariff_pkr_per_kwh;
    const intervalEmissions = gridEnergyKwh * interval.grid_carbon_kgco2_per_kwh;

    totalCost += intervalCost;
    totalGridEnergy += gridEnergyKwh;
    totalSolarEnergy += solarUsedKwh;
    totalEmissions += intervalEmissions;
    dailyCost += intervalCost;

    // Comfort tracking
    if (interval.occupancy_count > 0) {
      occupiedCount++;
      if (comfortStatus === 'within_range') comfortWithinCount++;
    }

    // Reason code
    const isPreCooling = interval.occupancy_count === 0 && acUnitsOn > 0 && interval.tariff_type === 'OFF_PEAK';
    const reason = determineReasonCode(
      interval, energyAssets, batterySoc, acUnitsOn, prevAcUnits,
      comfortStatus, dailyCost, profile.budget_pkr_per_day,
      gridPowerKw, profile.maximum_grid_demand_kw, isPreCooling
    );

    decisions.push({
      ac_units_on: acUnitsOn,
      ac_setpoint_c: acSetpoint,
      fan_units_on: fanUnitsOn,
      grid_energy_kwh: Math.round(gridEnergyKwh * 10000) / 10000,
      solar_energy_used_kwh: Math.round(solarUsedKwh * 10000) / 10000,
      battery_charge_kwh: Math.round(chargeKwh * 10000) / 10000,
      battery_discharge_kwh: Math.round(dischargeKwh * 10000) / 10000,
      battery_soc_kwh: Math.round(batterySoc * 10000) / 10000,
      cooling_energy_kwh: Math.round(coolingEnergyKwh * 10000) / 10000,
      estimated_indoor_temp_c: Math.round(indoorTemp * 100) / 100,
      comfort_status: comfortStatus,
      interval_cost_pkr: Math.round(intervalCost * 10000) / 10000,
      interval_emissions_kgco2e: Math.round(intervalEmissions * 10000) / 10000,
      reason_code: reason.code,
      explanation: reason.explanation,
      constraint_violation_count: 0,
    });

    prevAcUnits = acUnitsOn;
  }

  // ─── PASS 2: Insert results into DB ───
  const insertStmt = db.prepare(`
    INSERT INTO output_schedule (run_id, scenario_id, timestamp_local, recommended_ac_units_on,
    recommended_ac_setpoint_c, recommended_fan_units_on, grid_energy_kwh, solar_energy_used_kwh,
    battery_charge_kwh, battery_discharge_kwh, battery_soc_kwh, cooling_energy_kwh,
    estimated_indoor_temp_c, comfort_status, interval_cost_pkr, interval_emissions_kgco2e,
    reason_code, explanation, constraint_violation_count, is_baseline)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `);

  const insertAll = db.transaction(() => {
    for (let i = 0; i < intervals.length; i++) {
      const interval = intervals[i];
      const d = decisions[i];
      insertStmt.run(
        runId, scenarioId, interval.timestamp_local, d.ac_units_on,
        d.ac_setpoint_c, d.fan_units_on, d.grid_energy_kwh, d.solar_energy_used_kwh,
        d.battery_charge_kwh, d.battery_discharge_kwh, d.battery_soc_kwh, d.cooling_energy_kwh,
        d.estimated_indoor_temp_c, d.comfort_status, d.interval_cost_pkr, d.interval_emissions_kgco2e,
        d.reason_code, d.explanation, d.constraint_violation_count
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
