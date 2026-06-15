import { Router, Request, Response } from 'express';
import { getDb } from '../db/connection';
import type { OutputSchedule, RunSummary, DailySummary, ComparisonResult } from '../models/types';

const router = Router();

// GET /api/v1/runs/:run_id/schedule - Get output schedule
router.get('/:run_id/schedule', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 96;
    const offset = (page - 1) * limit;

    // Optional filters
    const comfortFilter = req.query.comfort_status as string;
    const reasonFilter = req.query.reason_code as string;
    const dateFilter = req.query.date as string;

    let whereClause = 'WHERE run_id = ?';
    const params: any[] = [req.params.run_id];

    if (comfortFilter) {
      whereClause += ' AND comfort_status = ?';
      params.push(comfortFilter);
    }
    if (reasonFilter) {
      whereClause += ' AND reason_code = ?';
      params.push(reasonFilter);
    }
    if (dateFilter) {
      whereClause += ' AND timestamp_local LIKE ?';
      params.push(`${dateFilter}%`);
    }

    const total = db.prepare(`SELECT COUNT(*) as count FROM output_schedule ${whereClause}`).get(...params) as any;
    const schedule = db.prepare(
      `SELECT * FROM output_schedule ${whereClause} ORDER BY timestamp_local LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);

    res.json({ data: schedule, total: total.count, page, limit });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/runs/:run_id/summary - Get run summary
router.get('/:run_id/summary', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const run = db.prepare('SELECT * FROM optimization_runs WHERE run_id = ?').get(req.params.run_id) as any;
    if (!run) return res.status(404).json({ error: 'Run not found' });

    const profile = db.prepare('SELECT * FROM scenario_profiles WHERE scenario_id = ?').get(run.scenario_id) as any;

    const schedule = db.prepare(
      'SELECT * FROM output_schedule WHERE run_id = ? ORDER BY timestamp_local'
    ).all(req.params.run_id) as OutputSchedule[];

    const intervals = db.prepare(
      'SELECT * FROM interval_inputs WHERE scenario_id = ? AND timestamp_local >= ? AND timestamp_local < ? ORDER BY timestamp_local'
    ).all(run.scenario_id, run.evaluation_window_start, run.evaluation_window_end) as any[];

    // Calculate summary
    const summary = calculateRunSummary(req.params.run_id, run.scenario_id, profile?.name || run.scenario_id, schedule, intervals);
    res.json(summary);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/runs/:run_id/compare - Baseline vs optimized comparison
router.get('/:run_id/compare', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const optimizedRun = db.prepare('SELECT * FROM optimization_runs WHERE run_id = ?').get(req.params.run_id) as any;
    if (!optimizedRun) return res.status(404).json({ error: 'Run not found' });

    const profile = db.prepare('SELECT * FROM scenario_profiles WHERE scenario_id = ?').get(optimizedRun.scenario_id) as any;

    // Find the baseline run for same scenario and window
    const baselineRun = db.prepare(`
      SELECT * FROM optimization_runs WHERE scenario_id = ? AND algorithm_version LIKE '%baseline%'
      AND evaluation_window_start = ? AND evaluation_window_end = ?
      ORDER BY created_at DESC LIMIT 1
    `).get(optimizedRun.scenario_id, optimizedRun.evaluation_window_start, optimizedRun.evaluation_window_end) as any;

    if (!baselineRun) {
      return res.status(404).json({ error: 'No baseline run found for comparison. Run baseline first.' });
    }

    const baselineSchedule = db.prepare('SELECT * FROM output_schedule WHERE run_id = ? ORDER BY timestamp_local').all(baselineRun.run_id) as OutputSchedule[];
    const optimizedSchedule = db.prepare('SELECT * FROM output_schedule WHERE run_id = ? ORDER BY timestamp_local').all(req.params.run_id) as OutputSchedule[];

    const intervals = db.prepare(
      'SELECT * FROM interval_inputs WHERE scenario_id = ? AND timestamp_local >= ? AND timestamp_local < ? ORDER BY timestamp_local'
    ).all(optimizedRun.scenario_id, optimizedRun.evaluation_window_start, optimizedRun.evaluation_window_end) as any[];

    const scenarioName = profile?.name || optimizedRun.scenario_id;
    const baselineSummary = calculateRunSummary(baselineRun.run_id, baselineRun.scenario_id, scenarioName, baselineSchedule, intervals);
    const optimizedSummary = calculateRunSummary(req.params.run_id, optimizedRun.scenario_id, scenarioName, optimizedSchedule, intervals);

    // Calculate savings
    const safeDivide = (a: number, b: number) => b !== 0 ? (a / b) * 100 : 0;
    const costSaving = baselineSummary.total_cost_pkr - optimizedSummary.total_cost_pkr;
    const gridSaving = baselineSummary.total_grid_energy_kwh - optimizedSummary.total_grid_energy_kwh;
    const emissionsSaving = baselineSummary.total_emissions_kgco2e - optimizedSummary.total_emissions_kgco2e;
    const peakSaving = baselineSummary.peak_demand_kw - optimizedSummary.peak_demand_kw;

    // Find infeasible intervals
    const infeasible = optimizedSchedule
      .filter(row => row.comfort_status === 'infeasible' || row.comfort_status === 'unsafe')
      .map(row => ({
        timestamp_local: row.timestamp_local,
        estimated_indoor_temp_c: row.estimated_indoor_temp_c,
        comfort_max_c: profile?.comfort_max_c || 28,
        reason: row.explanation,
      }));

    const comparison: ComparisonResult = {
      baseline: baselineSummary,
      optimized: optimizedSummary,
      savings: {
        cost_pkr: Math.round(costSaving * 100) / 100,
        cost_pct: Math.round(safeDivide(costSaving, baselineSummary.total_cost_pkr) * 100) / 100,
        grid_energy_kwh: Math.round(gridSaving * 100) / 100,
        grid_energy_pct: Math.round(safeDivide(gridSaving, baselineSummary.total_grid_energy_kwh) * 100) / 100,
        emissions_kgco2e: Math.round(emissionsSaving * 100) / 100,
        emissions_pct: Math.round(safeDivide(emissionsSaving, baselineSummary.total_emissions_kgco2e) * 100) / 100,
        peak_demand_kw: Math.round(peakSaving * 100) / 100,
        peak_demand_pct: Math.round(safeDivide(peakSaving, baselineSummary.peak_demand_kw) * 100) / 100,
      },
      infeasible_intervals: infeasible,
    };

    res.json(comparison);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

function calculateRunSummary(
  runId: string, scenarioId: string, scenarioName: string,
  schedule: OutputSchedule[], intervals: any[]
): RunSummary {
  let totalCost = 0, totalGridEnergy = 0, totalSolarEnergy = 0, totalEmissions = 0;
  let peakDemandKw = 0, comfortWithin = 0, occupiedCount = 0, infeasibleCount = 0;

  const dailyMap = new Map<string, {
    cost: number; gridEnergy: number; solarEnergy: number; emissions: number;
    peakDemand: number; comfortWithin: number; occupiedCount: number; tempSum: number; tempCount: number;
  }>();

  for (let i = 0; i < schedule.length; i++) {
    const row = schedule[i];
    const day = row.timestamp_local.substring(0, 10);

    if (!dailyMap.has(day)) {
      dailyMap.set(day, { cost: 0, gridEnergy: 0, solarEnergy: 0, emissions: 0, peakDemand: 0, comfortWithin: 0, occupiedCount: 0, tempSum: 0, tempCount: 0 });
    }
    const daily = dailyMap.get(day)!;

    totalCost += row.interval_cost_pkr;
    totalGridEnergy += row.grid_energy_kwh;
    totalSolarEnergy += row.solar_energy_used_kwh;
    totalEmissions += row.interval_emissions_kgco2e;

    const gridPowerKw = row.grid_energy_kwh / 0.25;
    peakDemandKw = Math.max(peakDemandKw, gridPowerKw);

    daily.cost += row.interval_cost_pkr;
    daily.gridEnergy += row.grid_energy_kwh;
    daily.solarEnergy += row.solar_energy_used_kwh;
    daily.emissions += row.interval_emissions_kgco2e;
    daily.peakDemand = Math.max(daily.peakDemand, gridPowerKw);
    daily.tempSum += row.estimated_indoor_temp_c;
    daily.tempCount++;

    const interval = intervals[i];
    if (interval && interval.occupancy_count > 0) {
      occupiedCount++;
      daily.occupiedCount++;
      if (row.comfort_status === 'within_range') {
        comfortWithin++;
        daily.comfortWithin++;
      }
      if (row.comfort_status === 'infeasible') infeasibleCount++;
    }
  }

  // Calculate total solar available for utilization %
  let totalSolarAvailable = 0;
  for (const interval of intervals) {
    totalSolarAvailable += (interval.solar_available_kw || 0) * 0.25;
  }

  const dailySummaries: DailySummary[] = [];
  dailyMap.forEach((daily, date) => {
    dailySummaries.push({
      date,
      cost_pkr: Math.round(daily.cost * 100) / 100,
      grid_energy_kwh: Math.round(daily.gridEnergy * 100) / 100,
      solar_energy_kwh: Math.round(daily.solarEnergy * 100) / 100,
      emissions_kgco2e: Math.round(daily.emissions * 100) / 100,
      peak_demand_kw: Math.round(daily.peakDemand * 100) / 100,
      comfort_compliance_pct: daily.occupiedCount > 0 ? Math.round(daily.comfortWithin / daily.occupiedCount * 10000) / 100 : 100,
      avg_indoor_temp_c: daily.tempCount > 0 ? Math.round(daily.tempSum / daily.tempCount * 100) / 100 : 0,
    });
  });

  return {
    run_id: runId,
    scenario_id: scenarioId,
    scenario_name: scenarioName,
    total_cost_pkr: Math.round(totalCost * 100) / 100,
    total_grid_energy_kwh: Math.round(totalGridEnergy * 100) / 100,
    total_solar_energy_kwh: Math.round(totalSolarEnergy * 100) / 100,
    total_emissions_kgco2e: Math.round(totalEmissions * 100) / 100,
    peak_demand_kw: Math.round(peakDemandKw * 100) / 100,
    comfort_compliance_pct: occupiedCount > 0 ? Math.round(comfortWithin / occupiedCount * 10000) / 100 : 100,
    total_intervals: schedule.length,
    infeasible_intervals: infeasibleCount,
    solar_utilization_pct: totalSolarAvailable > 0 ? Math.round(totalSolarEnergy / totalSolarAvailable * 10000) / 100 : 0,
    battery_cycles: 0, // Simplified
    daily_summaries: dailySummaries,
  };
}

// GET /api/v1/history - List all runs
router.get('/', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const runs = db.prepare(`
      SELECT orr.*, sp.name as scenario_name,
        (SELECT COUNT(*) FROM output_schedule os WHERE os.run_id = orr.run_id) as interval_count
      FROM optimization_runs orr
      LEFT JOIN scenario_profiles sp ON orr.scenario_id = sp.scenario_id
      ORDER BY orr.created_at DESC
    `).all();
    res.json(runs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/v1/runs/:run_id
router.delete('/:run_id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM output_schedule WHERE run_id = ?').run(req.params.run_id);
    db.prepare('DELETE FROM optimization_runs WHERE run_id = ?').run(req.params.run_id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
