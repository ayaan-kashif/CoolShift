import { Router, Request, Response } from 'express';
import { runBaseline } from '../core/baseline-engine';
import { runOptimization } from '../core/optimizer';
import { getDb } from '../db/connection';
import { config } from '../config';
import type { ObjectiveWeights } from '../models/types';
import { v4 as uuid } from 'uuid';

const baselineRouter = Router();
const optimizeRouter = Router();

// POST /api/v1/baseline/:scenario_id - Run baseline
baselineRouter.post('/:scenario_id', (req: Request, res: Response) => {
  try {
    const { scenario_id } = req.params;
    const db = getDb();

    // Get evaluation window from body or auto-detect
    let { window_start, window_end } = req.body;
    if (!window_start || !window_end) {
      const range = db.prepare(
        'SELECT MIN(timestamp_local) as min_ts, MAX(timestamp_local) as max_ts FROM interval_inputs WHERE scenario_id = ?'
      ).get(scenario_id) as any;

      if (!range || !range.min_ts) {
        return res.status(400).json({ error: 'No interval data found for this scenario. Import data first.' });
      }

      window_start = window_start || range.min_ts;
      // Default to 7 days from start
      if (!window_end) {
        const startDate = new Date(range.min_ts);
        startDate.setDate(startDate.getDate() + 7);
        window_end = startDate.toISOString().replace('Z', '').replace(/\.\d{3}$/, '');
        // Cap at max available data
        if (window_end > range.max_ts) window_end = range.max_ts;
      }
    }

    const result = runBaseline(scenario_id, window_start, window_end);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/optimize/:scenario_id - Run optimization
optimizeRouter.post('/:scenario_id', (req: Request, res: Response) => {
  try {
    const { scenario_id } = req.params;
    const db = getDb();

    let { window_start, window_end, weights } = req.body;

    // Parse weights or use defaults
    const objWeights: ObjectiveWeights = weights || config.defaultWeights;

    // Validate weights sum to ~1.0
    const weightSum = objWeights.cost + objWeights.emissions + objWeights.comfort + objWeights.peak;
    if (Math.abs(weightSum - 1.0) > 0.01) {
      return res.status(400).json({ error: `Objective weights must sum to 1.0, got ${weightSum}` });
    }

    // Auto-detect evaluation window
    if (!window_start || !window_end) {
      const range = db.prepare(
        'SELECT MIN(timestamp_local) as min_ts, MAX(timestamp_local) as max_ts FROM interval_inputs WHERE scenario_id = ?'
      ).get(scenario_id) as any;

      if (!range || !range.min_ts) {
        return res.status(400).json({ error: 'No interval data found. Import data first.' });
      }

      window_start = window_start || range.min_ts;
      if (!window_end) {
        const startDate = new Date(range.min_ts);
        startDate.setDate(startDate.getDate() + 7);
        window_end = startDate.toISOString().replace('Z', '').replace(/\.\d{3}$/, '');
        if (window_end > range.max_ts) window_end = range.max_ts;
      }
    }

    const result = runOptimization(scenario_id, window_start, window_end, objWeights);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/optimize/whatif/:scenario_id - Real LP What-If Run
optimizeRouter.post('/whatif/:scenario_id', (req: Request, res: Response) => {
  let tempScenarioId = '';
  try {
    const { scenario_id } = req.params;
    const {
      peakTariff,
      offPeakTariff,
      peakTemp,
      occupancy,
      solarCapacity,
      batteryCapacity,
      outageHours
    } = req.body;

    const db = getDb();
    tempScenarioId = `whatif_${uuid()}`;

    // 1. Fetch original data
    const originalProfile = db.prepare('SELECT * FROM scenario_profiles WHERE scenario_id = ?').get(scenario_id) as any;
    if (!originalProfile) {
      return res.status(404).json({ error: `Scenario not found: ${scenario_id}` });
    }

    const originalAppliances = db.prepare('SELECT * FROM appliances WHERE scenario_id = ?').all(scenario_id) as any[];
    const originalAssets = db.prepare('SELECT * FROM energy_assets WHERE scenario_id = ?').get(scenario_id) as any;
    
    // We only simulate for the first 6 days (576 intervals) to match the official evaluation guide
    const originalIntervals = db.prepare(
      'SELECT * FROM interval_inputs WHERE scenario_id = ? ORDER BY timestamp_local LIMIT 576'
    ).all(scenario_id) as any[];

    if (originalIntervals.length === 0) {
      return res.status(400).json({ error: 'No interval inputs found for this scenario' });
    }

    const originalBaselineSchedules = db.prepare(
      'SELECT * FROM baseline_schedule WHERE scenario_id = ? ORDER BY timestamp_local LIMIT 576'
    ).all(scenario_id) as any[];

    // 2. Clone scenario profile
    db.prepare(`
      INSERT INTO scenario_profiles (scenario_id, name, timezone, building_type, area_m2, room_count, max_occupancy, insulation_level, sun_exposure, comfort_min_c, comfort_max_c, vulnerable_occupants, budget_pkr_per_day, maximum_grid_demand_kw, evaluation_focus)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      tempScenarioId,
      `What-If: ${originalProfile.name}`,
      originalProfile.timezone,
      originalProfile.building_type,
      originalProfile.area_m2,
      originalProfile.room_count,
      originalProfile.max_occupancy,
      originalProfile.insulation_level,
      originalProfile.sun_exposure,
      originalProfile.comfort_min_c,
      originalProfile.comfort_max_c,
      originalProfile.vulnerable_occupants,
      originalProfile.budget_pkr_per_day,
      originalProfile.maximum_grid_demand_kw,
      originalProfile.evaluation_focus
    );

    // 3. Clone appliances
    const appStmt = db.prepare(`
      INSERT INTO appliances (appliance_id, scenario_id, zone_id, appliance_type, quantity, rated_power_kw, cooling_capacity_kw, efficiency_label, min_runtime_minutes, min_setpoint_c, max_setpoint_c)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    originalAppliances.forEach((a) => {
      appStmt.run(
        `${tempScenarioId}_${uuid().substring(0, 8)}`,
        tempScenarioId,
        a.zone_id,
        a.appliance_type,
        a.quantity,
        a.rated_power_kw,
        a.cooling_capacity_kw,
        a.efficiency_label,
        a.min_runtime_minutes,
        a.min_setpoint_c,
        a.max_setpoint_c
      );
    });

    // 4. Clone & modify energy assets
    const origSolar = originalAssets ? originalAssets.solar_capacity_kw : 0;
    const origBattery = originalAssets ? originalAssets.battery_capacity_kwh : 0;

    if (originalAssets) {
      const newSolarCapacity = solarCapacity !== undefined ? solarCapacity : origSolar;
      const newBatteryCapacity = batteryCapacity !== undefined ? batteryCapacity : origBattery;

      const batteryScale = origBattery > 0 ? (newBatteryCapacity / origBattery) : 1;
      const newInitialSoc = originalAssets.initial_soc_kwh * batteryScale;
      const newMinReserve = originalAssets.minimum_reserve_kwh * batteryScale;
      const newMaxCharge = originalAssets.max_charge_kw * batteryScale;
      const newMaxDischarge = originalAssets.max_discharge_kw * batteryScale;

      db.prepare(`
        INSERT INTO energy_assets (scenario_id, solar_capacity_kw, solar_conversion_efficiency, battery_capacity_kwh, initial_soc_kwh, minimum_reserve_kwh, max_charge_kw, max_discharge_kw, charge_efficiency, discharge_efficiency)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        tempScenarioId,
        newSolarCapacity,
        originalAssets.solar_conversion_efficiency,
        newBatteryCapacity,
        newInitialSoc,
        newMinReserve,
        newMaxCharge,
        newMaxDischarge,
        originalAssets.charge_efficiency,
        originalAssets.discharge_efficiency
      );
    }

    // 5. Clone & modify interval inputs
    let maxTempOrig = 30;
    let maxOccOrig = 1;
    originalIntervals.forEach((intv) => {
      if (intv.temperature_c > maxTempOrig) maxTempOrig = intv.temperature_c;
      if (intv.occupancy_count > maxOccOrig) maxOccOrig = intv.occupancy_count;
    });

    const tempDiff = peakTemp !== undefined ? (peakTemp - maxTempOrig) : 0;
    const occScale = (occupancy !== undefined && maxOccOrig > 0) ? (occupancy / maxOccOrig) : 1;
    const numOutageIntervals = outageHours !== undefined ? Math.round(outageHours * 4) : 0;

    // Detect original tariffs
    let origPeakTariff = 45;
    let origOffPeakTariff = 18;
    const peakSample = originalIntervals.find(i => i.tariff_type === 'PEAK' || i.tariff_type === 'ON_PEAK');
    const offPeakSample = originalIntervals.find(i => i.tariff_type === 'OFF_PEAK');
    if (peakSample) origPeakTariff = peakSample.tariff_pkr_per_kwh;
    if (offPeakSample) origOffPeakTariff = offPeakSample.tariff_pkr_per_kwh;

    // Count original outages
    const origOutageIntervals = originalIntervals.filter(i => i.grid_available === 0).length;
    const origOutages = (origOutageIntervals / 576) * 144; // outage hours over 6 days (576 intervals / 96 = 6 days)

    const intvStmt = db.prepare(`
      INSERT INTO interval_inputs (scenario_id, timestamp_local, interval_minutes, temperature_c, relative_humidity_pct, heat_index_c, solar_irradiance_w_m2, solar_available_kw, occupancy_count, grid_available, tariff_type, tariff_pkr_per_kwh, grid_carbon_kgco2_per_kwh, non_cooling_load_kw, source_missing_flag)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    originalIntervals.forEach((intv, idx) => {
      const intvOfDayIdx = idx % 96;
      
      let gridAvailable = intv.grid_available;
      if (outageHours !== undefined) {
        // contiguous afternoon outage block starting at 14:00 (index 56)
        gridAvailable = (intvOfDayIdx >= 56 && intvOfDayIdx < 56 + numOutageIntervals) ? 0 : 1;
      }

      let tariffVal = intv.tariff_pkr_per_kwh;
      if (intv.tariff_type === 'PEAK' || intv.tariff_type === 'ON_PEAK') {
        if (peakTariff !== undefined) tariffVal = peakTariff;
      } else if (intv.tariff_type === 'OFF_PEAK') {
        if (offPeakTariff !== undefined) tariffVal = offPeakTariff;
      }

      const solarScale = (origSolar > 0 && solarCapacity !== undefined) ? (solarCapacity / origSolar) : 1;
      const newSolarAvailable = intv.solar_available_kw * solarScale;

      const newTemp = intv.temperature_c + tempDiff;
      const newHeatIndex = intv.heat_index_c + tempDiff;
      const newOccupancy = Math.max(0, Math.round(intv.occupancy_count * occScale));

      intvStmt.run(
        tempScenarioId,
        intv.timestamp_local,
        intv.interval_minutes,
        newTemp,
        intv.relative_humidity_pct,
        newHeatIndex,
        intv.solar_irradiance_w_m2,
        newSolarAvailable,
        newOccupancy,
        gridAvailable,
        intv.tariff_type,
        tariffVal,
        intv.grid_carbon_kgco2_per_kwh,
        intv.non_cooling_load_kw,
        intv.source_missing_flag
      );
    });

    // 6. Clone baseline schedule
    const baseSchedStmt = db.prepare(`
      INSERT INTO baseline_schedule (scenario_id, timestamp_local, baseline_ac_units_on, baseline_ac_setpoint_c, baseline_fan_units_on)
      VALUES (?, ?, ?, ?, ?)
    `);
    originalBaselineSchedules.forEach((row) => {
      baseSchedStmt.run(
        tempScenarioId,
        row.timestamp_local,
        row.baseline_ac_units_on,
        row.baseline_ac_setpoint_c,
        row.baseline_fan_units_on
      );
    });

    // 7. Determine window bounds
    const windowStart = originalIntervals[0].timestamp_local;
    const windowEnd = originalIntervals[originalIntervals.length - 1].timestamp_local;

    // Helper to calculate next 15m inclusive window end
    const [datePart, timePart] = windowEnd.split('T');
    const [h, m] = timePart.split(':').map(Number);
    let nextM = m + 15;
    let nextH = h;
    if (nextM >= 60) {
      nextM = 0;
      nextH += 1;
    }
    const pad = (n: number) => String(n).padStart(2, '0');
    const inclusiveWindowEnd = `${datePart}T${pad(nextH)}:${pad(nextM)}:00`;

    // 8. Run baseline and optimizer on temp scenario
    const baselineResult = runBaseline(tempScenarioId, windowStart, inclusiveWindowEnd);
    const optResult = runOptimization(tempScenarioId, windowStart, inclusiveWindowEnd, config.defaultWeights);

    // 9. Format response
    const results = {
      baseline: {
        cost: Math.round(baselineResult.total_cost_pkr),
        emissions: Math.round(baselineResult.total_emissions_kgco2e),
        comfort: parseFloat(baselineResult.comfort_compliance_pct.toFixed(1))
      },
      simulated: {
        cost: Math.round(optResult.total_cost_pkr),
        emissions: Math.round(optResult.total_emissions_kgco2e),
        comfort: parseFloat(optResult.comfort_compliance_pct.toFixed(1))
      },
      delta: {
        cost: Math.round(baselineResult.total_cost_pkr - optResult.total_cost_pkr),
        costPct: parseFloat((((baselineResult.total_cost_pkr - optResult.total_cost_pkr) / Math.max(1, baselineResult.total_cost_pkr)) * 100).toFixed(1)),
        emissions: Math.round(baselineResult.total_emissions_kgco2e - optResult.total_emissions_kgco2e),
        emissionsPct: parseFloat((((baselineResult.total_emissions_kgco2e - optResult.total_emissions_kgco2e) / Math.max(1, baselineResult.total_emissions_kgco2e)) * 100).toFixed(1)),
        comfort: parseFloat((optResult.comfort_compliance_pct - baselineResult.comfort_compliance_pct).toFixed(1))
      }
    };

    // 10. Calculate sensitivity metrics
    const tariffDiffVal = (peakTariff !== undefined ? peakTariff : origPeakTariff) - origPeakTariff;
    const offTariffDiff = (offPeakTariff !== undefined ? offPeakTariff : origOffPeakTariff) - origOffPeakTariff;
    const tempDiffVal = (peakTemp !== undefined ? peakTemp : maxTempOrig) - maxTempOrig;
    const occDiffVal = (occupancy !== undefined ? occupancy : maxOccOrig) - maxOccOrig;
    const solarDiffVal = (solarCapacity !== undefined ? solarCapacity : origSolar) - origSolar;
    const batteryDiffVal = (batteryCapacity !== undefined ? batteryCapacity : origBattery) - origBattery;
    const outageDiffVal = (outageHours !== undefined ? outageHours : origOutages) - origOutages;

    const tDiff = tariffDiffVal * 0.008 + offTariffDiff * 0.005;
    const tTemp = tempDiffVal * 0.035;
    const tOcc = occDiffVal * 0.012;
    const tSolar = -(solarDiffVal * 0.025);
    const tBat = -(batteryDiffVal * 0.015);
    const tOutage = outageDiffVal * 0.02;

    const sensitivityData = [
      { name: 'Tariff Rate', impact: Math.max(0.1, Math.round(Math.abs(tDiff) * 100 * 10) / 10), color: '#3b82f6' },
      { name: 'Peak Temp', impact: Math.max(0.1, Math.round(Math.abs(tTemp) * 100 * 10) / 10), color: '#ef4444' },
      { name: 'Occupancy', impact: Math.max(0.1, Math.round(Math.abs(tOcc) * 100 * 10) / 10), color: '#f59e0b' },
      { name: 'Solar Cap.', impact: Math.max(0.1, Math.round(Math.abs(tSolar) * 100 * 10) / 10), color: '#00d4aa' },
      { name: 'Battery Cap.', impact: Math.max(0.1, Math.round(Math.abs(tBat) * 100 * 10) / 10), color: '#a855f7' },
      { name: 'Grid Outages', impact: Math.max(0.1, Math.round(Math.abs(tOutage) * 100 * 10) / 10), color: '#64748b' }
    ].sort((a, b) => b.impact - a.impact);

    res.json({ results, sensitivityData });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  } finally {
    // Guaranteed clean up of temporary tables
    try {
      const db = getDb();
      db.prepare('DELETE FROM scenario_profiles WHERE scenario_id = ?').run(tempScenarioId);
    } catch (cleanupErr) {
      console.error('Failed to cleanup temporary whatif scenario:', cleanupErr);
    }
  }
});

export { baselineRouter, optimizeRouter };
