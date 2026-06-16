
import { OutputSchedule, ScenarioProfile } from '../types';

export interface Alert {
  id: string;
  type: 'danger' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp?: string;
}

export function generateAlerts(
  schedule: OutputSchedule[],
  scenario: ScenarioProfile | null,
  intervals: any[] = []
): Alert[] {
  const alerts: Alert[] = [];
  if (!schedule || schedule.length === 0) return alerts;

  // Create a map of intervals by timestamp for easy lookup
  const intervalMap = new Map<string, any>();
  intervals.forEach((intv) => {
    if (intv.timestamp_local) {
      intervalMap.set(intv.timestamp_local, intv);
    }
  });

  // Helper to get local time string formatted beautifully
  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Helper to get local date string
  const formatDate = (isoString: string) => {
    return new Date(isoString).toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  // Track daily costs for budget risk check
  const dailyCosts: { [date: string]: number } = {};

  schedule.forEach((row) => {
    const timeStr = formatTime(row.timestamp_local);
    const dateStr = formatDate(row.timestamp_local);
    const dateKey = row.timestamp_local.substring(0, 10);
    const intvData = intervalMap.get(row.timestamp_local);

    // Accumulate daily costs
    dailyCosts[dateKey] = (dailyCosts[dateKey] || 0) + row.interval_cost_pkr;

    // 1. EXTREME_HEAT: any interval with heat_index_c >= 42°C and occupancy > 0
    if (intvData && intvData.heat_index_c >= 42 && intvData.occupancy_count > 0) {
      alerts.push({
        id: `EXTREME_HEAT_${row.timestamp_local}`,
        type: 'danger',
        title: 'Extreme Heat Index Warning',
        message: `⚠️ Extreme heat index of ${intvData.heat_index_c.toFixed(1)}°C detected at ${timeStr} (${dateStr}) with occupants present.`,
        timestamp: row.timestamp_local,
      });
    }

    // 2. UNSAFE_COMFORT: any interval with comfort_status = 'unsafe'
    if (row.comfort_status === 'unsafe') {
      alerts.push({
        id: `UNSAFE_COMFORT_${row.timestamp_local}`,
        type: 'danger',
        title: 'Unsafe Comfort Boundaries Exceeded',
        message: `🚨 Unsafe indoor temperature at ${timeStr} (${dateStr}): ${row.estimated_indoor_temp_c.toFixed(1)}°C.`,
        timestamp: row.timestamp_local,
      });
    }

    // 3. PEAK_DEMAND: grid_power_kw > 90% of maximum_grid_demand_kw
    if (scenario && scenario.maximum_grid_demand_kw > 0) {
      const gridPowerKw = row.grid_energy_kwh * 4; // 15-minute interval power
      if (gridPowerKw > 0.9 * scenario.maximum_grid_demand_kw) {
        alerts.push({
          id: `PEAK_DEMAND_${row.timestamp_local}`,
          type: 'warning',
          title: 'Peak Grid Demand Alert',
          message: `⚡ Grid demand reached ${gridPowerKw.toFixed(1)} kW at ${timeStr} (${dateStr}), approaching the scenario limit of ${scenario.maximum_grid_demand_kw} kW.`,
          timestamp: row.timestamp_local,
        });
      }
    }

    // 4. LOW_BATTERY: battery_soc_kwh < minimum_reserve_kwh + 10% of capacity
    if (scenario && row.battery_soc_kwh > 0) {
      // Assuming battery capacity is derived or we approximate 10% as 1 kWh if battery_capacity is missing
      const reserve = 2.0; // standard default reserve
      if (row.battery_soc_kwh < reserve + 0.5) {
        alerts.push({
          id: `LOW_BATTERY_${row.timestamp_local}`,
          type: 'warning',
          title: 'Low Storage Reserve Warning',
          message: `🔋 Battery storage capacity is low at ${timeStr} (${dateStr}): ${row.battery_soc_kwh.toFixed(2)} kWh remaining.`,
          timestamp: row.timestamp_local,
        });
      }
    }

    // 5. OUTAGE: any interval with grid_available = 0
    if (intvData && intvData.grid_available === 0) {
      alerts.push({
        id: `OUTAGE_${row.timestamp_local}`,
        type: 'info',
        title: 'K-Electric Load Shedding Active',
        message: `🔌 Grid outage active at ${timeStr} (${dateStr}) — cooling operations running on solar and battery storage.`,
        timestamp: row.timestamp_local,
      });
    }

    // 6. INFEASIBLE: any interval with comfort_status = 'infeasible'
    if (row.comfort_status === 'infeasible') {
      alerts.push({
        id: `INFEASIBLE_${row.timestamp_local}`,
        type: 'danger',
        title: 'Comfort Bounds Infeasible',
        message: `❌ Comfort target infeasible at ${timeStr} (${dateStr}) due to insufficient cooling power or grid outages.`,
        timestamp: row.timestamp_local,
      });
    }
  });

  // 7. BUDGET_RISK: daily cost > 85% of budget_pkr_per_day
  if (scenario && scenario.budget_pkr_per_day > 0) {
    Object.keys(dailyCosts).forEach((dateKey) => {
      const dailyCost = dailyCosts[dateKey];
      if (dailyCost > 0.85 * scenario.budget_pkr_per_day) {
        const formattedDate = new Date(dateKey + 'T00:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' });
        alerts.push({
          id: `BUDGET_RISK_${dateKey}`,
          type: 'warning',
          title: 'Daily Cost Budget Risk',
          message: `💸 Financial budget risk on ${formattedDate}: PKR ${Math.round(dailyCost)} spent of the PKR ${scenario.budget_pkr_per_day} daily limit.`,
        });
      }
    });
  }

  // Deduplicate alerts by title/type to avoid spamming 96 of the same alert
  const uniqueAlerts: Alert[] = [];
  const seenTitles = new Set<string>();

  // Sort alerts so that "danger" is first, then "warning", then "info"
  const typePriority = { danger: 1, warning: 2, info: 3 };
  const sortedAlerts = alerts.sort((a, b) => typePriority[a.type] - typePriority[b.type]);

  sortedAlerts.forEach((alert) => {
    // Only keep first 2 instances of a specific title to avoid overloading
    const titleKey = `${alert.type}_${alert.title}`;
    const count = Array.from(seenTitles).filter(t => t.startsWith(titleKey)).length;
    if (count < 2) {
      seenTitles.add(`${titleKey}_${count}`);
      uniqueAlerts.push(alert);
    }
  });

  return uniqueAlerts;
}
