import type { EnergyAsset } from '../models/types';

/**
 * Battery Model — tracks state of charge (SoC) with charge/discharge efficiencies.
 * 
 * Rules:
 * - No simultaneous charge and discharge in same interval
 * - SoC never exceeds capacity or falls below 0
 * - Minimum reserve enforced unless emergency mode
 * - Charge/discharge rates limited by max_charge_kw and max_discharge_kw
 */

export interface BatteryState {
  soc_kwh: number; // current state of charge
}

export interface BatteryAction {
  charge_kwh: number;    // energy charged this interval
  discharge_kwh: number; // energy discharged this interval
  new_soc_kwh: number;   // SoC after action
  emergency_mode: boolean; // true if reserve was violated
  violation: string | null; // constraint violation description
}

/**
 * Calculate maximum energy that can be charged this interval.
 */
export function maxChargeable(
  assets: EnergyAsset,
  currentSoc: number,
  intervalMinutes: number
): number {
  if (assets.battery_capacity_kwh <= 0) return 0;
  
  const maxByRate = assets.max_charge_kw * (intervalMinutes / 60);
  const maxByCapacity = assets.battery_capacity_kwh - currentSoc;
  return Math.max(0, Math.min(maxByRate, maxByCapacity));
}

/**
 * Calculate maximum energy that can be discharged this interval.
 * Respects minimum reserve unless forceEmergency is true.
 */
export function maxDischargeable(
  assets: EnergyAsset,
  currentSoc: number,
  intervalMinutes: number,
  forceEmergency: boolean = false
): number {
  if (assets.battery_capacity_kwh <= 0) return 0;
  
  const maxByRate = assets.max_discharge_kw * (intervalMinutes / 60);
  const minSoc = forceEmergency ? 0 : assets.minimum_reserve_kwh;
  const maxByReserve = currentSoc - minSoc;
  return Math.max(0, Math.min(maxByRate, maxByReserve));
}

/**
 * Apply a charge action to the battery.
 * Returns the actual energy stored (after efficiency losses).
 */
export function applyCharge(
  assets: EnergyAsset,
  currentSoc: number,
  chargeEnergy: number
): { actualCharged: number; newSoc: number } {
  const effectiveCharge = chargeEnergy * assets.charge_efficiency;
  const maxCapacity = assets.battery_capacity_kwh;
  const actualStored = Math.min(effectiveCharge, maxCapacity - currentSoc);
  
  return {
    actualCharged: actualStored > 0 ? chargeEnergy : 0,
    newSoc: Math.min(maxCapacity, currentSoc + actualStored),
  };
}

/**
 * Apply a discharge action to the battery.
 * Returns the actual energy delivered to the system (after efficiency losses).
 */
export function applyDischarge(
  assets: EnergyAsset,
  currentSoc: number,
  dischargeEnergy: number,
  forceEmergency: boolean = false
): { actualDischarged: number; energyDelivered: number; newSoc: number; emergency: boolean } {
  const minSoc = forceEmergency ? 0 : assets.minimum_reserve_kwh;
  const available = Math.max(0, currentSoc - minSoc);
  const actualDischarged = Math.min(dischargeEnergy, available);
  const energyDelivered = actualDischarged * assets.discharge_efficiency;
  const newSoc = currentSoc - actualDischarged;
  
  return {
    actualDischarged,
    energyDelivered,
    newSoc: Math.max(0, newSoc),
    emergency: newSoc < assets.minimum_reserve_kwh,
  };
}

/**
 * Calculate battery action for an interval.
 * Decides whether to charge, discharge, or idle based on energy needs and solar availability.
 */
export function calculateBatteryAction(
  assets: EnergyAsset,
  currentSoc: number,
  solarAvailableKw: number,
  demandKw: number,
  gridAvailable: boolean,
  intervalMinutes: number
): BatteryAction {
  if (assets.battery_capacity_kwh <= 0) {
    return {
      charge_kwh: 0,
      discharge_kwh: 0,
      new_soc_kwh: 0,
      emergency_mode: false,
      violation: null,
    };
  }

  const intervalHours = intervalMinutes / 60;
  const solarEnergyKwh = solarAvailableKw * intervalHours;
  const demandEnergyKwh = demandKw * intervalHours;
  
  let charge_kwh = 0;
  let discharge_kwh = 0;
  let newSoc = currentSoc;
  let emergency = false;

  // If solar exceeds demand, charge battery with excess
  if (solarEnergyKwh > demandEnergyKwh) {
    const excess = solarEnergyKwh - demandEnergyKwh;
    const maxCharge = maxChargeable(assets, currentSoc, intervalMinutes);
    charge_kwh = Math.min(excess, maxCharge);
    const chargeResult = applyCharge(assets, currentSoc, charge_kwh);
    charge_kwh = chargeResult.actualCharged;
    newSoc = chargeResult.newSoc;
  }
  // If demand exceeds solar and grid is unavailable, discharge battery
  else if (demandEnergyKwh > solarEnergyKwh && !gridAvailable) {
    const deficit = demandEnergyKwh - solarEnergyKwh;
    const maxDischarge = maxDischargeable(assets, currentSoc, intervalMinutes, false);
    discharge_kwh = Math.min(deficit, maxDischarge);
    
    if (discharge_kwh < deficit && maxDischarge < deficit) {
      // Try emergency mode
      const emergencyMax = maxDischargeable(assets, currentSoc, intervalMinutes, true);
      if (emergencyMax > discharge_kwh) {
        discharge_kwh = Math.min(deficit, emergencyMax);
        emergency = true;
      }
    }
    
    const dischargeResult = applyDischarge(assets, currentSoc, discharge_kwh, emergency);
    discharge_kwh = dischargeResult.actualDischarged;
    newSoc = dischargeResult.newSoc;
    emergency = dischargeResult.emergency;
  }

  return {
    charge_kwh: Math.round(charge_kwh * 10000) / 10000,
    discharge_kwh: Math.round(discharge_kwh * 10000) / 10000,
    new_soc_kwh: Math.round(newSoc * 10000) / 10000,
    emergency_mode: emergency,
    violation: null,
  };
}

/**
 * Validate battery constraints for an output row.
 */
export function validateBatteryConstraints(
  assets: EnergyAsset,
  soc: number,
  charge: number,
  discharge: number,
  intervalMinutes: number
): string[] {
  const violations: string[] = [];
  const intervalHours = intervalMinutes / 60;

  if (soc < -0.001) {
    violations.push(`Battery SoC negative: ${soc.toFixed(4)} kWh`);
  }
  if (soc > assets.battery_capacity_kwh + 0.001) {
    violations.push(`Battery SoC exceeds capacity: ${soc.toFixed(4)} > ${assets.battery_capacity_kwh} kWh`);
  }
  if (charge > 0 && discharge > 0) {
    violations.push(`Simultaneous charge (${charge.toFixed(4)}) and discharge (${discharge.toFixed(4)})`);
  }
  if (charge > assets.max_charge_kw * intervalHours + 0.001) {
    violations.push(`Charge exceeds max rate: ${charge.toFixed(4)} > ${(assets.max_charge_kw * intervalHours).toFixed(4)} kWh`);
  }
  if (discharge > assets.max_discharge_kw * intervalHours + 0.001) {
    violations.push(`Discharge exceeds max rate: ${discharge.toFixed(4)} > ${(assets.max_discharge_kw * intervalHours).toFixed(4)} kWh`);
  }

  return violations;
}

/**
 * Check if battery SoC is low (near minimum reserve).
 */
export function isBatteryLow(assets: EnergyAsset, currentSoc: number): boolean {
  if (assets.battery_capacity_kwh <= 0) return false;
  return currentSoc <= assets.minimum_reserve_kwh * 1.2;
}
