import type { IntervalInput, EnergyAsset, ReasonCode } from '../models/types';
import { isBatteryLow } from './battery-model';

/**
 * Reason codes and human-readable explanation generator.
 * Each interval gets a primary reason code explaining the optimizer's decision.
 */

export interface ReasonCodeResult {
  code: ReasonCode;
  explanation: string;
}

/**
 * Determine the primary reason code for an interval based on conditions.
 * Priority order determines which code takes precedence when multiple conditions apply.
 */
export function determineReasonCode(
  interval: IntervalInput,
  assets: EnergyAsset | null,
  batterySoc: number,
  acUnitsOn: number,
  prevAcUnitsOn: number,
  comfortStatus: string,
  dailyCostSoFar: number,
  budgetPerDay: number,
  gridDemandKw: number,
  maxGridDemandKw: number,
  isPreCooling: boolean = false
): ReasonCodeResult {
  // Priority 1: Grid outage
  if (!interval.grid_available) {
    return {
      code: 'OUTAGE',
      explanation: `Grid power unavailable at ${interval.timestamp_local}. System running on solar/battery only.`,
    };
  }

  // Priority 2: Infeasible comfort
  if (comfortStatus === 'infeasible') {
    return {
      code: 'INFEASIBLE',
      explanation: `Comfort target cannot be achieved with available cooling capacity at ${interval.timestamp_local}. All available resources are being utilized.`,
    };
  }

  // Priority 3: Heat risk
  if (interval.heat_index_c >= 35 && interval.occupancy_count > 0) {
    return {
      code: 'HEAT_RISK',
      explanation: `Extreme heat index of ${interval.heat_index_c}°C detected with ${interval.occupancy_count} occupants present. Maximum cooling applied for safety.`,
    };
  }

  // Priority 4: Comfort risk
  if (comfortStatus === 'warning' || comfortStatus === 'unsafe') {
    return {
      code: 'COMFORT_RISK',
      explanation: `Indoor temperature approaching comfort limits. Cooling adjusted to maintain occupant comfort.`,
    };
  }

  // Priority 5: Budget risk
  if (budgetPerDay > 0 && dailyCostSoFar >= budgetPerDay * 0.85) {
    return {
      code: 'BUDGET_RISK',
      explanation: `Daily cost (PKR ${dailyCostSoFar.toFixed(0)}) approaching budget ceiling (PKR ${budgetPerDay.toFixed(0)}). Reducing non-essential cooling.`,
    };
  }

  // Priority 6: Demand limit
  if (maxGridDemandKw > 0 && gridDemandKw >= maxGridDemandKw * 0.9) {
    return {
      code: 'DEMAND_LIMIT',
      explanation: `Grid demand (${gridDemandKw.toFixed(2)} kW) approaching limit (${maxGridDemandKw.toFixed(2)} kW). Reducing grid draw.`,
    };
  }

  // Priority 7: Peak tariff
  if (interval.tariff_type === 'PEAK') {
    return {
      code: 'PEAK_TARIFF',
      explanation: `Peak tariff period (PKR ${interval.tariff_pkr_per_kwh}/kWh). Minimizing grid usage and utilizing solar/battery where possible.`,
    };
  }

  // Priority 8: Pre-cooling
  if (isPreCooling) {
    return {
      code: 'PRE_COOL',
      explanation: `Pre-cooling building during off-peak rates to build thermal buffer before upcoming peak period.`,
    };
  }

  // Priority 9: Battery low
  if (assets && assets.battery_capacity_kwh > 0 && isBatteryLow(assets, batterySoc)) {
    return {
      code: 'BATTERY_LOW',
      explanation: `Battery SoC (${batterySoc.toFixed(2)} kWh) near minimum reserve (${assets.minimum_reserve_kwh} kWh). Prioritizing battery charging.`,
    };
  }

  // Priority 10: Battery charging
  if (assets && assets.battery_capacity_kwh > 0 && interval.solar_available_kw > 0.1) {
    if (batterySoc < assets.battery_capacity_kwh * 0.9) {
      return {
        code: 'BATTERY_CHARGING',
        explanation: `Charging battery from solar surplus. Current SoC: ${batterySoc.toFixed(2)} kWh.`,
      };
    }
  }

  // Priority 11: Solar available
  if (interval.solar_available_kw > 0.1) {
    return {
      code: 'SOLAR_AVAILABLE',
      explanation: `Solar power available (${interval.solar_available_kw.toFixed(2)} kW). Prioritizing solar for cooling to reduce grid dependency.`,
    };
  }

  // Priority 12: Off-peak cheap
  if (interval.tariff_type === 'OFF_PEAK') {
    return {
      code: 'OFF_PEAK_CHEAP',
      explanation: `Off-peak tariff period (PKR ${interval.tariff_pkr_per_kwh}/kWh). Good opportunity for cooling at lower cost.`,
    };
  }

  // Default: Normal operation
  return {
    code: 'NORMAL',
    explanation: `Standard operation. Cooling adjusted based on current conditions and occupancy.`,
  };
}

/**
 * Generate a trade-off summary statement for a day's optimization.
 */
export function generateTradeOffSummary(
  baselineCost: number,
  optimizedCost: number,
  comfortCompliancePct: number,
  solarUtilizationPct: number,
  peakReductionPct: number
): string {
  const costSavingPct = baselineCost > 0
    ? ((baselineCost - optimizedCost) / baselineCost * 100).toFixed(1)
    : '0';

  const parts: string[] = [];

  if (parseFloat(costSavingPct) > 0) {
    parts.push(`Cost reduced by ${costSavingPct}% (PKR ${(baselineCost - optimizedCost).toFixed(0)} saved)`);
  }

  if (solarUtilizationPct > 0) {
    parts.push(`${solarUtilizationPct.toFixed(0)}% solar utilization`);
  }

  if (peakReductionPct > 0) {
    parts.push(`peak demand reduced by ${peakReductionPct.toFixed(0)}%`);
  }

  parts.push(`comfort maintained at ${comfortCompliancePct.toFixed(1)}% compliance`);

  return parts.join('; ') + '.';
}

/**
 * Get color for a reason code badge.
 */
export function getReasonCodeColor(code: ReasonCode): string {
  const colors: Record<ReasonCode, string> = {
    HEAT_RISK: '#ef4444',      // red
    SOLAR_AVAILABLE: '#10b981', // emerald
    PEAK_TARIFF: '#f59e0b',     // amber
    OFF_PEAK_CHEAP: '#3b82f6',  // blue
    OUTAGE: '#6b7280',          // gray
    BATTERY_LOW: '#f97316',     // orange
    BATTERY_CHARGING: '#8b5cf6', // violet
    COMFORT_RISK: '#f43f5e',    // rose
    INFEASIBLE: '#dc2626',      // dark red
    DEMAND_LIMIT: '#eab308',    // yellow
    BUDGET_RISK: '#ec4899',     // pink
    PRE_COOL: '#06b6d4',        // cyan
    NORMAL: '#22c55e',          // green
  };
  return colors[code] || '#6b7280';
}
