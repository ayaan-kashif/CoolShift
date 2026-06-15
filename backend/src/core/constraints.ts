import type { OutputSchedule, EnergyAsset, IntervalInput } from '../models/types';

/**
 * Constraint validation module.
 * Validates all hard constraints from PRD §4.4 on output schedule rows.
 */

export interface ConstraintViolation {
  timestamp: string;
  constraint: string;
  message: string;
  severity: 'error' | 'warning';
}

/**
 * Validate energy balance for an interval:
 * grid + solar + discharge = cooling + charge + non_cooling
 * Tolerance: ±0.001 kWh
 */
export function validateEnergyBalance(
  row: OutputSchedule,
  nonCoolingLoadKwh: number,
  tolerance: number = 0.001
): ConstraintViolation | null {
  const supply = row.grid_energy_kwh + row.solar_energy_used_kwh + row.battery_discharge_kwh;
  const demand = row.cooling_energy_kwh + row.battery_charge_kwh + nonCoolingLoadKwh;
  const diff = Math.abs(supply - demand);

  if (diff > tolerance) {
    return {
      timestamp: row.timestamp_local,
      constraint: 'ENERGY_BALANCE',
      message: `Energy balance violated: supply=${supply.toFixed(4)}, demand=${demand.toFixed(4)}, diff=${diff.toFixed(4)} kWh`,
      severity: 'error',
    };
  }
  return null;
}

/**
 * Validate no grid energy during outage.
 */
export function validateOutageConstraint(
  row: OutputSchedule,
  gridAvailable: boolean
): ConstraintViolation | null {
  if (!gridAvailable && row.grid_energy_kwh > 0.0001) {
    return {
      timestamp: row.timestamp_local,
      constraint: 'OUTAGE_GRID_ZERO',
      message: `Grid energy used (${row.grid_energy_kwh.toFixed(4)} kWh) during outage`,
      severity: 'error',
    };
  }
  return null;
}

/**
 * Validate battery SoC bounds.
 */
export function validateBatterySoC(
  row: OutputSchedule,
  assets: EnergyAsset | null
): ConstraintViolation | null {
  if (!assets || assets.battery_capacity_kwh <= 0) return null;

  if (row.battery_soc_kwh < -0.001) {
    return {
      timestamp: row.timestamp_local,
      constraint: 'BATTERY_SOC_NEGATIVE',
      message: `Battery SoC is negative: ${row.battery_soc_kwh.toFixed(4)} kWh`,
      severity: 'error',
    };
  }
  if (row.battery_soc_kwh > assets.battery_capacity_kwh + 0.001) {
    return {
      timestamp: row.timestamp_local,
      constraint: 'BATTERY_SOC_OVER_CAPACITY',
      message: `Battery SoC exceeds capacity: ${row.battery_soc_kwh.toFixed(4)} > ${assets.battery_capacity_kwh} kWh`,
      severity: 'error',
    };
  }
  return null;
}

/**
 * Validate charge/discharge rates.
 */
export function validateBatteryRates(
  row: OutputSchedule,
  assets: EnergyAsset | null,
  intervalMinutes: number = 15
): ConstraintViolation[] {
  if (!assets || assets.battery_capacity_kwh <= 0) return [];
  const violations: ConstraintViolation[] = [];
  const intervalHours = intervalMinutes / 60;

  if (row.battery_charge_kwh > assets.max_charge_kw * intervalHours + 0.001) {
    violations.push({
      timestamp: row.timestamp_local,
      constraint: 'BATTERY_CHARGE_RATE',
      message: `Charge rate exceeded: ${row.battery_charge_kwh.toFixed(4)} > max ${(assets.max_charge_kw * intervalHours).toFixed(4)} kWh`,
      severity: 'error',
    });
  }
  if (row.battery_discharge_kwh > assets.max_discharge_kw * intervalHours + 0.001) {
    violations.push({
      timestamp: row.timestamp_local,
      constraint: 'BATTERY_DISCHARGE_RATE',
      message: `Discharge rate exceeded: ${row.battery_discharge_kwh.toFixed(4)} > max ${(assets.max_discharge_kw * intervalHours).toFixed(4)} kWh`,
      severity: 'error',
    });
  }
  if (row.battery_charge_kwh > 0.0001 && row.battery_discharge_kwh > 0.0001) {
    violations.push({
      timestamp: row.timestamp_local,
      constraint: 'BATTERY_SIMULTANEOUS',
      message: `Simultaneous charge and discharge detected`,
      severity: 'error',
    });
  }

  return violations;
}

/**
 * Validate appliance limits.
 */
export function validateApplianceLimits(
  row: OutputSchedule,
  maxAcUnits: number,
  maxFanUnits: number
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  if (row.recommended_ac_units_on > maxAcUnits) {
    violations.push({
      timestamp: row.timestamp_local,
      constraint: 'AC_UNITS_EXCEEDED',
      message: `AC units on (${row.recommended_ac_units_on}) exceeds max (${maxAcUnits})`,
      severity: 'error',
    });
  }
  if (row.recommended_fan_units_on > maxFanUnits) {
    violations.push({
      timestamp: row.timestamp_local,
      constraint: 'FAN_UNITS_EXCEEDED',
      message: `Fan units on (${row.recommended_fan_units_on}) exceeds max (${maxFanUnits})`,
      severity: 'error',
    });
  }

  return violations;
}

/**
 * Validate cost calculation accuracy.
 */
export function validateCostCalculation(
  row: OutputSchedule,
  tariffPkrPerKwh: number,
  tolerance: number = 0.001
): ConstraintViolation | null {
  const expectedCost = row.grid_energy_kwh * tariffPkrPerKwh;
  if (Math.abs(row.interval_cost_pkr - expectedCost) > tolerance) {
    return {
      timestamp: row.timestamp_local,
      constraint: 'COST_ACCURACY',
      message: `Cost mismatch: calculated=${row.interval_cost_pkr.toFixed(4)}, expected=${expectedCost.toFixed(4)}`,
      severity: 'warning',
    };
  }
  return null;
}

/**
 * Validate emissions calculation accuracy.
 */
export function validateEmissionsCalculation(
  row: OutputSchedule,
  carbonFactor: number,
  tolerance: number = 0.001
): ConstraintViolation | null {
  const expectedEmissions = row.grid_energy_kwh * carbonFactor;
  if (Math.abs(row.interval_emissions_kgco2e - expectedEmissions) > tolerance) {
    return {
      timestamp: row.timestamp_local,
      constraint: 'EMISSIONS_ACCURACY',
      message: `Emissions mismatch: calculated=${row.interval_emissions_kgco2e.toFixed(4)}, expected=${expectedEmissions.toFixed(4)}`,
      severity: 'warning',
    };
  }
  return null;
}

/**
 * Run all constraint validations on a complete output schedule.
 */
export function validateFullSchedule(
  schedule: OutputSchedule[],
  intervals: IntervalInput[],
  assets: EnergyAsset | null,
  maxAcUnits: number,
  maxFanUnits: number
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  for (let i = 0; i < schedule.length; i++) {
    const row = schedule[i];
    const interval = intervals[i];
    if (!interval) continue;

    const nonCoolingKwh = interval.non_cooling_load_kw * (interval.interval_minutes / 60);

    // Energy balance
    const energyViolation = validateEnergyBalance(row, nonCoolingKwh);
    if (energyViolation) violations.push(energyViolation);

    // Outage constraint
    const outageViolation = validateOutageConstraint(row, !!interval.grid_available);
    if (outageViolation) violations.push(outageViolation);

    // Battery constraints
    const socViolation = validateBatterySoC(row, assets);
    if (socViolation) violations.push(socViolation);

    const rateViolations = validateBatteryRates(row, assets, interval.interval_minutes);
    violations.push(...rateViolations);

    // Appliance limits
    const applianceViolations = validateApplianceLimits(row, maxAcUnits, maxFanUnits);
    violations.push(...applianceViolations);

    // Cost accuracy
    const costViolation = validateCostCalculation(row, interval.tariff_pkr_per_kwh);
    if (costViolation) violations.push(costViolation);

    // Emissions accuracy
    const emissionsViolation = validateEmissionsCalculation(row, interval.grid_carbon_kgco2_per_kwh);
    if (emissionsViolation) violations.push(emissionsViolation);
  }

  return violations;
}
