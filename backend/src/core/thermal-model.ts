import { config } from '../config';
import type { InsulationLevel, SunExposure } from '../models/types';

/**
 * Simplified Resistance-Capacitance (RC) thermal model.
 *
 * Formula:
 *   T_indoor(t) = T_indoor(t-1) + dt × [
 *     (T_outdoor - T_indoor) / R_thermal
 *     - Q_cooling / C_thermal
 *     + Q_occupancy / C_thermal
 *     + Q_solar / C_thermal
 *   ]
 *
 * Where:
 *   R_thermal = thermal resistance (°C·h/kW), depends on insulation
 *   C_thermal = thermal capacitance (kWh/°C), depends on area and insulation
 *   Q_cooling = cooling power applied (kW)
 *   Q_occupancy = heat gain from occupants (kW)
 *   Q_solar = solar heat gain through building (kW)
 *   dt = time step (hours) = 0.25 for 15-min intervals
 */

export interface ThermalParams {
  insulation_level: InsulationLevel;
  sun_exposure: SunExposure;
  area_m2: number;
}

export interface ThermalState {
  indoor_temp_c: number;
}

export interface ThermalInputs {
  outdoor_temp_c: number;
  heat_index_c: number;
  solar_irradiance_w_m2: number;
  occupancy_count: number;
  cooling_power_kw: number; // total cooling capacity applied
  interval_minutes: number;
}

/**
 * Calculate R_thermal (thermal resistance) based on insulation level.
 * Higher R = slower heat transfer from outside = better insulation.
 * Units: °C·h/kW
 */
export function getThermalResistance(insulation: InsulationLevel): number {
  return config.thermal.resistance[insulation];
}

/**
 * Calculate C_thermal (thermal capacitance) based on area and insulation.
 * Higher C = more thermal mass = slower temperature changes.
 * Units: kWh/°C
 */
export function getThermalCapacitance(area_m2: number, insulation: InsulationLevel): number {
  const base = config.thermal.capacitanceBase[insulation];
  return base * (area_m2 / 100);
}

/**
 * Calculate solar heat gain through the building envelope.
 * Units: kW
 */
export function getSolarHeatGain(
  solar_irradiance_w_m2: number,
  area_m2: number,
  sun_exposure: SunExposure
): number {
  const coeff = config.thermal.solarHeatGainCoeff[sun_exposure];
  // Convert W/m² to kW, apply coefficient and effective area (fraction of total)
  return (solar_irradiance_w_m2 / 1000) * area_m2 * coeff;
}

/**
 * Calculate occupant heat gain.
 * Units: kW
 */
export function getOccupantHeatGain(occupancy_count: number): number {
  return occupancy_count * config.thermal.occupantHeatGain;
}

/**
 * Step the thermal model forward by one interval.
 * Returns the new indoor temperature.
 */
export function stepThermalModel(
  params: ThermalParams,
  prevState: ThermalState,
  inputs: ThermalInputs
): number {
  const R = getThermalResistance(params.insulation_level);
  const C = getThermalCapacitance(params.area_m2, params.insulation_level);
  const dt = inputs.interval_minutes / 60; // convert to hours

  // Use effective outdoor temperature (blend of dry-bulb and heat index for humidity effect)
  const T_eff = 0.7 * inputs.outdoor_temp_c + 0.3 * inputs.heat_index_c;

  // Heat flows (kW)
  const Q_envelope = (T_eff - prevState.indoor_temp_c) / R; // heat gain from outside
  const Q_solar = getSolarHeatGain(inputs.solar_irradiance_w_m2, params.area_m2, params.sun_exposure);
  const Q_occupancy = getOccupantHeatGain(inputs.occupancy_count);
  const Q_cooling = inputs.cooling_power_kw; // cooling is heat removal

  // Temperature change
  const dT = dt * (Q_envelope + Q_solar + Q_occupancy - Q_cooling) / C;

  // Clamp to reasonable range
  const newTemp = Math.max(10, Math.min(60, prevState.indoor_temp_c + dT));
  return Math.round(newTemp * 100) / 100; // round to 2 decimal places
}

/**
 * Determine comfort status based on indoor temperature and comfort range.
 */
export function getComfortStatus(
  indoor_temp_c: number,
  comfort_min_c: number,
  comfort_max_c: number,
  occupancy_count: number
): 'within_range' | 'warning' | 'unsafe' | 'infeasible' {
  // If no one is present, comfort is not evaluated but still tracked
  if (occupancy_count === 0) {
    return 'within_range';
  }

  if (indoor_temp_c >= comfort_min_c && indoor_temp_c <= comfort_max_c) {
    return 'within_range';
  }

  const deviation = Math.max(
    comfort_min_c - indoor_temp_c,
    indoor_temp_c - comfort_max_c
  );

  if (deviation <= 1.0) {
    return 'warning';
  }

  return 'unsafe';
}

/**
 * Calculate the cooling power (kW) from AC settings.
 */
export function calculateCoolingPower(
  ac_units_on: number,
  ac_setpoint_c: number | null,
  indoor_temp_c: number,
  cooling_capacity_per_unit_kw: number
): number {
  if (ac_units_on === 0 || ac_setpoint_c === null) {
    return 0;
  }

  // Cooling power is proportional to the temperature difference between indoor and setpoint
  // When indoor > setpoint, AC cools actively. When indoor ≤ setpoint, no cooling needed.
  const tempDiff = indoor_temp_c - ac_setpoint_c;
  if (tempDiff <= 0) {
    return 0; // Room is already at or below setpoint
  }

  // Effectiveness scales with temperature difference, capped at rated capacity
  const effectiveness = Math.min(1.0, tempDiff / 5.0); // Full capacity at 5°C diff
  return ac_units_on * cooling_capacity_per_unit_kw * effectiveness;
}

/**
 * Calculate electrical energy consumed by AC units for a given interval.
 * Units: kWh
 */
export function calculateACEnergy(
  ac_units_on: number,
  rated_power_per_unit_kw: number,
  interval_minutes: number
): number {
  return ac_units_on * rated_power_per_unit_kw * (interval_minutes / 60);
}

/**
 * Calculate electrical energy consumed by fans for a given interval.
 * Fans typically consume ~0.075 kW each.
 * Units: kWh
 */
export function calculateFanEnergy(
  fan_units_on: number,
  interval_minutes: number,
  fan_power_kw: number = 0.075
): number {
  return fan_units_on * fan_power_kw * (interval_minutes / 60);
}

/**
 * Estimate initial indoor temperature based on outdoor conditions.
 * Used when no previous temperature is available.
 */
export function estimateInitialIndoorTemp(
  outdoor_temp_c: number,
  comfort_min_c: number,
  comfort_max_c: number
): number {
  // Assume indoor starts near the middle of comfort range if outdoor is extreme,
  // or tracks outdoor somewhat if within a reasonable range
  const comfortMid = (comfort_min_c + comfort_max_c) / 2;
  if (outdoor_temp_c >= comfort_min_c && outdoor_temp_c <= comfort_max_c) {
    return outdoor_temp_c;
  }
  // Blend between outdoor and comfort midpoint
  return 0.3 * outdoor_temp_c + 0.7 * comfortMid;
}
