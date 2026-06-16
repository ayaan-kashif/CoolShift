/**
 * AI Recommendations Engine
 *
 * Analyses a completed optimization run + scenario profile to generate
 * ranked, personalized, plain-English recommendations for the operator.
 *
 * Categories:
 *  P1 (High)   — Direct cost/safety impact
 *  P2 (Medium) — Efficiency improvements
 *  P3 (Low)    — Comfort / long-term suggestions
 */

import { getDb } from '../db/connection';

export interface Recommendation {
  id: string;
  priority: 'P1' | 'P2' | 'P3';
  category: 'cost' | 'comfort' | 'peak' | 'emissions' | 'resilience';
  title: string;
  description: string;
  estimated_saving_pkr: number;
  confidence: number; // 0–100
  supporting_stat: string;
}

// -------------------------------------------------------------------
// Helper — tariff periods
// -------------------------------------------------------------------
function getTariffPeriod(hour: number): 'off_peak' | 'on_peak' | 'peak' {
  if (hour >= 19 && hour < 23) return 'peak';
  if ((hour >= 9 && hour < 19) || (hour >= 23 && hour < 24)) return 'on_peak';
  return 'off_peak';
}

// -------------------------------------------------------------------
// Main generator
// -------------------------------------------------------------------
export function generateRecommendations(runId: string, scenarioId: string): Recommendation[] {
  const db = getDb();
  const recs: Recommendation[] = [];

  const profile = db.prepare('SELECT * FROM scenario_profiles WHERE scenario_id = ?').get(scenarioId) as any;
  const energyAssets = db.prepare('SELECT * FROM energy_assets WHERE scenario_id = ?').get(scenarioId) as any;
  if (!profile) throw new Error(`Scenario not found: ${scenarioId}`);

  const schedule = db.prepare(
    'SELECT * FROM output_schedule WHERE run_id = ? ORDER BY timestamp_local'
  ).all(runId) as any[];

  const run = db.prepare('SELECT * FROM optimization_runs WHERE run_id = ?').get(runId) as any;
  if (!run) throw new Error(`Run not found: ${runId}`);

  const intervals = db.prepare(
    'SELECT * FROM interval_inputs WHERE scenario_id = ? AND timestamp_local >= ? AND timestamp_local < ? ORDER BY timestamp_local'
  ).all(scenarioId, run.evaluation_window_start, run.evaluation_window_end) as any[];

  if (schedule.length === 0) return recs;

  // Build an interval map
  const intervalMap = new Map<string, any>();
  intervals.forEach(intv => intervalMap.set(intv.timestamp_local, intv));

  // -------------------------------------------------------------------
  // Aggregate stats
  // -------------------------------------------------------------------
  let totalCost = 0;
  let peakCost = 0;
  let offPeakCost = 0;
  let peakGridKwh = 0;
  let offPeakGridKwh = 0;
  let totalGridKwh = 0;
  let totalSolarAvailableKwh = 0;
  let totalSolarUsedKwh = 0;
  let solarWastedWhileAcOff = 0;
  let preCoolOpportunities = 0;
  let outageHighTempCount = 0;
  let warmRelaxIntervals = 0; // temp < comfort_max - 1.5, AC on
  let comfortViolations = 0;
  let occupiedIntervals = 0;

  for (let i = 0; i < schedule.length; i++) {
    const row = schedule[i];
    const intv = intervalMap.get(row.timestamp_local);
    const hour = new Date(row.timestamp_local).getHours();
    const period = getTariffPeriod(hour);

    totalCost += row.interval_cost_pkr;
    totalGridKwh += row.grid_energy_kwh;
    totalSolarUsedKwh += row.solar_energy_used_kwh;

    if (intv) {
      const solarAvail = (intv.solar_available_kw || 0) * 0.25;
      totalSolarAvailableKwh += solarAvail;

      if (period === 'peak' || period === 'on_peak') {
        peakCost += row.interval_cost_pkr;
        peakGridKwh += row.grid_energy_kwh;
      } else {
        offPeakCost += row.interval_cost_pkr;
        offPeakGridKwh += row.grid_energy_kwh;
      }

      // Pre-cool opportunity: 1–2 hours before peak, AC not fully on, temp near comfort max
      if (hour >= 17 && hour < 19) {
        const acOn = row.recommended_ac_units_on || 0;
        const maxAc = 4; // approx
        if (acOn < maxAc && row.estimated_indoor_temp_c >= profile.comfort_max_c - 1.5) {
          preCoolOpportunities++;
        }
      }

      // Solar wasted while AC off during occupied daylight hours
      if (
        solarAvail > 0.25 &&
        (row.recommended_ac_units_on || 0) === 0 &&
        intv.occupancy_count > 0 &&
        hour >= 9 && hour <= 17
      ) {
        solarWastedWhileAcOff += solarAvail;
      }

      // Outage + high temp
      if (intv.grid_available === 0 && row.estimated_indoor_temp_c > 33) {
        outageHighTempCount++;
      }

      // Comfort relaxation opportunities (AC on, temp well within comfort band)
      if (intv.occupancy_count > 0) {
        occupiedIntervals++;
        if (
          row.estimated_indoor_temp_c < profile.comfort_max_c - 1.5 &&
          (row.recommended_ac_units_on || 0) > 0
        ) {
          warmRelaxIntervals++;
        }
        if (row.comfort_status === 'unsafe' || row.comfort_status === 'infeasible') {
          comfortViolations++;
        }
      }
    }
  }

  const peakCostPct = totalCost > 0 ? (peakCost / totalCost) * 100 : 0;
  const solarUtilPct = totalSolarAvailableKwh > 0
    ? (totalSolarUsedKwh / totalSolarAvailableKwh) * 100
    : 100;
  const comfortViolationPct = occupiedIntervals > 0
    ? (comfortViolations / occupiedIntervals) * 100
    : 0;
  const relaxPct = occupiedIntervals > 0
    ? (warmRelaxIntervals / occupiedIntervals) * 100
    : 0;

  // -------------------------------------------------------------------
  // Recommendation 1: Off-peak shift
  // -------------------------------------------------------------------
  if (peakCostPct > 30) {
    const potentialSaving = peakCost * 0.25; // ~25% saving if shifted
    recs.push({
      id: 'REC_OFFPEAK_SHIFT',
      priority: 'P1',
      category: 'cost',
      title: 'Shift Cooling Load to Off-Peak Hours',
      description: `${peakCostPct.toFixed(0)}% of your energy cost (PKR ${Math.round(peakCost)}) occurs during peak/on-peak tariff hours. Pre-cooling the building by 1–2°C before peak periods (6–7 PM) and relaxing setpoints during peak hours can reduce this cost by approximately 20–25% without sacrificing comfort.`,
      estimated_saving_pkr: Math.round(potentialSaving),
      confidence: 82,
      supporting_stat: `Peak-hour cost: PKR ${Math.round(peakCost)} of PKR ${Math.round(totalCost)} total`,
    });
  }

  // -------------------------------------------------------------------
  // Recommendation 2: Pre-cooling window
  // -------------------------------------------------------------------
  if (preCoolOpportunities >= 4) {
    const saving = peakCost * 0.15;
    recs.push({
      id: 'REC_PRECOOL',
      priority: 'P1',
      category: 'cost',
      title: 'Enable Pre-Cooling Before Evening Peak',
      description: `Detected ${preCoolOpportunities} 15-minute intervals (5–7 PM) where the building could be cooled more aggressively at off-peak rates before the evening tariff peak begins. Running AC at full capacity 1–2 hours earlier stores "thermal mass" in the building and reduces peak-hour consumption.`,
      estimated_saving_pkr: Math.round(saving),
      confidence: 76,
      supporting_stat: `${preCoolOpportunities} pre-cool opportunity windows identified`,
    });
  }

  // -------------------------------------------------------------------
  // Recommendation 3: Solar utilisation
  // -------------------------------------------------------------------
  if (solarUtilPct < 80 && totalSolarAvailableKwh > 0) {
    const wastedKwh = totalSolarAvailableKwh - totalSolarUsedKwh;
    const wastedCost = wastedKwh * 35; // avg PKR/kWh
    recs.push({
      id: 'REC_SOLAR_UTIL',
      priority: 'P2',
      category: 'emissions',
      title: 'Improve Solar Energy Utilisation',
      description: `Only ${solarUtilPct.toFixed(0)}% of available solar energy was used (${wastedKwh.toFixed(1)} kWh wasted). Consider scheduling non-critical loads (battery charging, pre-cooling) during peak solar hours (10 AM–3 PM) to capture more free renewable energy and reduce grid dependency.`,
      estimated_saving_pkr: Math.round(wastedCost),
      confidence: 88,
      supporting_stat: `${wastedKwh.toFixed(1)} kWh solar wasted, est. PKR ${Math.round(wastedCost)} value`,
    });
  }

  // -------------------------------------------------------------------
  // Recommendation 4: Comfort setpoint relaxation
  // -------------------------------------------------------------------
  if (relaxPct > 40) {
    const potentialKwhSaved = totalGridKwh * 0.08;
    const saving = potentialKwhSaved * 28;
    recs.push({
      id: 'REC_SETPOINT_RELAX',
      priority: 'P2',
      category: 'comfort',
      title: 'Relax AC Setpoint During Cool Periods',
      description: `In ${relaxPct.toFixed(0)}% of occupied intervals, indoor temperature was more than 1.5°C below the comfort ceiling while AC was running. Raising the setpoint by 1°C during these periods maintains full comfort while reducing compressor load by approximately 8%. Consider dynamic setpoints rather than fixed values.`,
      estimated_saving_pkr: Math.round(saving),
      confidence: 71,
      supporting_stat: `${warmRelaxIntervals} of ${occupiedIntervals} occupied intervals over-cooled`,
    });
  }

  // -------------------------------------------------------------------
  // Recommendation 5: Battery / resilience (if battery exists)
  // -------------------------------------------------------------------
  if (outageHighTempCount > 0) {
    const risk = outageHighTempCount >= 4 ? 'critical' : 'moderate';
    recs.push({
      id: 'REC_RESILIENCE',
      priority: 'P1',
      category: 'resilience',
      title: `Address ${outageHighTempCount} High-Temperature Outage Periods`,
      description: `During ${outageHighTempCount} grid outage intervals, indoor temperature exceeded 33°C — a ${risk} health risk. ${
        energyAssets && energyAssets.battery_capacity_kwh > 0
          ? `Current battery capacity (${energyAssets.battery_capacity_kwh} kWh) is insufficient for full outage coverage. Consider increasing storage by ${Math.ceil(outageHighTempCount * 0.5)} kWh.`
          : 'No battery storage is configured. Adding even 5 kWh of storage would significantly improve resilience during K-Electric load-shedding periods.'
      }`,
      estimated_saving_pkr: 0,
      confidence: 91,
      supporting_stat: `${outageHighTempCount} outage intervals with temp > 33°C detected`,
    });
  }

  // -------------------------------------------------------------------
  // Recommendation 6: Comfort violation reduction
  // -------------------------------------------------------------------
  if (comfortViolationPct > 5) {
    recs.push({
      id: 'REC_COMFORT_FIX',
      priority: 'P1',
      category: 'comfort',
      title: 'Reduce Comfort Violations',
      description: `${comfortViolationPct.toFixed(1)}% of occupied intervals had comfort violations (unsafe or infeasible temperatures). Primary causes: AC capacity insufficient for peak outdoor heat, or grid outages during hot periods. Review AC unit count, cooling capacity ratings, and consider adding battery backup for outage periods.`,
      estimated_saving_pkr: 0,
      confidence: 94,
      supporting_stat: `${comfortViolations} of ${occupiedIntervals} occupied intervals in violation`,
    });
  }

  // -------------------------------------------------------------------
  // Recommendation 7: Insulation improvement (if thermal drift is high)
  // -------------------------------------------------------------------
  if (profile.insulation_level === 'Low') {
    recs.push({
      id: 'REC_INSULATION',
      priority: 'P3',
      category: 'cost',
      title: 'Upgrade Building Insulation',
      description: `Building is currently rated "Low" insulation, meaning heat transfers rapidly from the outdoor environment. Upgrading to "Medium" insulation typically reduces cooling energy requirements by 15–25% and improves the system's ability to maintain comfort during grid outages. Consider roof insulation and double-glazed windows as first steps.`,
      estimated_saving_pkr: Math.round(totalCost * 0.18),
      confidence: 65,
      supporting_stat: `Low insulation = fast thermal decay → higher AC runtime needed`,
    });
  }

  // Sort: P1 first, then by confidence descending
  const pOrder: Record<string, number> = { P1: 0, P2: 1, P3: 2 };
  return recs.sort((a, b) =>
    pOrder[a.priority] !== pOrder[b.priority]
      ? pOrder[a.priority] - pOrder[b.priority]
      : b.confidence - a.confidence
  );
}
