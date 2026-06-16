/**
 * Anomaly Detector — Statistical energy and comfort anomaly detection.
 *
 * Techniques used:
 *  1. Rolling Z-score on grid_energy_kwh  → energy spike detection
 *  2. Consecutive AC unit jump detection  → sudden load changes
 *  3. Comfort cliff detection             → indoor temp jump > 2°C in one interval
 *  4. Outage + high temp combo            → vulnerable period detection
 *  5. Solar curtailment                   → solar available but AC off
 */

export type AnomalySeverity = 'critical' | 'high' | 'medium' | 'low';

export interface Anomaly {
  id: string;
  timestamp_local: string;
  type:
    | 'ENERGY_SPIKE'
    | 'AC_SUDDEN_JUMP'
    | 'COMFORT_CLIFF'
    | 'OUTAGE_HEAT_RISK'
    | 'SOLAR_CURTAILMENT';
  severity: AnomalySeverity;
  value: number;
  baseline: number;
  deviation_pct: number;
  explanation: string;
}

// -------------------------------------------------------------------
// Rolling statistics helpers
// -------------------------------------------------------------------

function rollingMeanStd(
  values: number[],
  windowSize: number,
  idx: number
): { mean: number; std: number } {
  const start = Math.max(0, idx - windowSize);
  const slice = values.slice(start, idx);
  if (slice.length === 0) return { mean: 0, std: 0 };
  const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
  const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / slice.length;
  return { mean, std: Math.sqrt(variance) };
}

// -------------------------------------------------------------------
// Main detector
// -------------------------------------------------------------------

/**
 * Detect anomalies in a completed run's output_schedule.
 * @param schedule  Rows from output_schedule table
 * @param intervals Matching rows from interval_inputs (same scenario/window)
 * @param zThreshold  Z-score threshold for energy spikes (default 2.5)
 */
export function detectAnomalies(
  schedule: any[],
  intervals: any[],
  zThreshold = 2.5
): Anomaly[] {
  const anomalies: Anomaly[] = [];
  if (!schedule || schedule.length === 0) return anomalies;

  const ROLLING_WINDOW = 8; // 2 hours of 15-min intervals

  const energyValues = schedule.map(r => r.grid_energy_kwh as number);
  const intervalMap = new Map<string, any>();
  intervals.forEach(intv => intervalMap.set(intv.timestamp_local, intv));

  for (let i = 0; i < schedule.length; i++) {
    const row = schedule[i];
    const prev = i > 0 ? schedule[i - 1] : null;
    const intv = intervalMap.get(row.timestamp_local);

    // ---- 1. Energy spike (rolling Z-score) ----
    const { mean, std } = rollingMeanStd(energyValues, ROLLING_WINDOW, i);
    if (std > 0.01 && energyValues[i] > 0) {
      const z = (energyValues[i] - mean) / std;
      if (z > zThreshold) {
        const dev = mean > 0 ? ((energyValues[i] - mean) / mean) * 100 : 100;
        anomalies.push({
          id: `ENERGY_SPIKE_${row.timestamp_local}`,
          timestamp_local: row.timestamp_local,
          type: 'ENERGY_SPIKE',
          severity: z > 4 ? 'critical' : z > 3 ? 'high' : 'medium',
          value: Math.round(energyValues[i] * 1000) / 1000,
          baseline: Math.round(mean * 1000) / 1000,
          deviation_pct: Math.round(dev * 10) / 10,
          explanation: `Grid energy ${energyValues[i].toFixed(3)} kWh is ${z.toFixed(1)}σ above the 2-hour rolling average of ${mean.toFixed(3)} kWh — possible demand surge or sudden load addition.`,
        });
      }
    }

    // ---- 2. Sudden AC unit jump ----
    if (prev) {
      const acDiff = Math.abs(
        (row.recommended_ac_units_on || 0) - (prev.recommended_ac_units_on || 0)
      );
      if (acDiff >= 2) {
        anomalies.push({
          id: `AC_SUDDEN_JUMP_${row.timestamp_local}`,
          timestamp_local: row.timestamp_local,
          type: 'AC_SUDDEN_JUMP',
          severity: acDiff >= 3 ? 'high' : 'medium',
          value: row.recommended_ac_units_on,
          baseline: prev.recommended_ac_units_on,
          deviation_pct: 0,
          explanation: `AC units jumped by ${acDiff} in a single 15-minute interval (${prev.recommended_ac_units_on} → ${row.recommended_ac_units_on}). This can cause grid demand spikes and compressor stress.`,
        });
      }
    }

    // ---- 3. Comfort cliff (temp jumps >2°C) ----
    if (prev) {
      const tempDiff = row.estimated_indoor_temp_c - prev.estimated_indoor_temp_c;
      if (tempDiff > 2.0) {
        anomalies.push({
          id: `COMFORT_CLIFF_${row.timestamp_local}`,
          timestamp_local: row.timestamp_local,
          type: 'COMFORT_CLIFF',
          severity: tempDiff > 4 ? 'critical' : tempDiff > 3 ? 'high' : 'medium',
          value: row.estimated_indoor_temp_c,
          baseline: prev.estimated_indoor_temp_c,
          deviation_pct: 0,
          explanation: `Indoor temperature rose sharply by ${tempDiff.toFixed(1)}°C in one interval (${prev.estimated_indoor_temp_c.toFixed(1)} → ${row.estimated_indoor_temp_c.toFixed(1)}°C). Likely due to a sudden drop in cooling or grid outage.`,
        });
      }
    }

    // ---- 4. Outage + high heat risk ----
    if (intv && intv.grid_available === 0 && row.estimated_indoor_temp_c > 33) {
      anomalies.push({
        id: `OUTAGE_HEAT_RISK_${row.timestamp_local}`,
        timestamp_local: row.timestamp_local,
        type: 'OUTAGE_HEAT_RISK',
        severity: row.estimated_indoor_temp_c > 38 ? 'critical' : 'high',
        value: row.estimated_indoor_temp_c,
        baseline: 33,
        deviation_pct: Math.round(((row.estimated_indoor_temp_c - 33) / 33) * 100 * 10) / 10,
        explanation: `Grid outage detected while indoor temperature is ${row.estimated_indoor_temp_c.toFixed(1)}°C — a potential health risk if occupants are present. Battery/solar coverage insufficient.`,
      });
    }

    // ---- 5. Solar curtailment (solar > 0 but AC off during occupied hours) ----
    if (
      intv &&
      intv.solar_available_kw > 1.0 &&
      (row.recommended_ac_units_on || 0) === 0 &&
      intv.occupancy_count > 0 &&
      row.estimated_indoor_temp_c > 26
    ) {
      anomalies.push({
        id: `SOLAR_CURTAILMENT_${row.timestamp_local}`,
        timestamp_local: row.timestamp_local,
        type: 'SOLAR_CURTAILMENT',
        severity: 'low',
        value: intv.solar_available_kw,
        baseline: 0,
        deviation_pct: 0,
        explanation: `${intv.solar_available_kw.toFixed(1)} kW solar available but AC is off during occupied hours with indoor temp at ${row.estimated_indoor_temp_c.toFixed(1)}°C. Free cooling opportunity missed.`,
      });
    }
  }

  // Deduplicate same type within 4-interval window (1 hour)
  const deduped: Anomaly[] = [];
  const lastSeen = new Map<string, number>();

  for (const a of anomalies) {
    const last = lastSeen.get(a.type) ?? -999;
    const cur = anomalies.indexOf(a);
    if (cur - last >= 4) {
      deduped.push(a);
      lastSeen.set(a.type, cur);
    }
  }

  // Sort: critical → high → medium → low
  const sev: Record<AnomalySeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return deduped.sort((a, b) => sev[a.severity] - sev[b.severity]);
}
