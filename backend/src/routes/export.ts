import { Router, Request, Response } from 'express';
import { getDb } from '../db/connection';
import * as XLSX from 'xlsx';
import type { OutputSchedule } from '../models/types';

const router = Router();

// GET /api/v1/export/:run_id/csv - Download CSV
router.get('/:run_id/csv', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const run = db.prepare('SELECT * FROM optimization_runs WHERE run_id = ?').get(req.params.run_id) as any;
    if (!run) return res.status(404).json({ error: 'Run not found' });

    const schedule = db.prepare(
      'SELECT * FROM output_schedule WHERE run_id = ? ORDER BY timestamp_local'
    ).all(req.params.run_id) as OutputSchedule[];

    // Build CSV with exact column names from template
    const columns = [
      'scenario_id', 'run_id', 'timestamp_local', 'recommended_ac_units_on',
      'recommended_ac_setpoint_c', 'recommended_fan_units_on', 'grid_energy_kwh',
      'solar_energy_used_kwh', 'battery_charge_kwh', 'battery_discharge_kwh',
      'battery_soc_kwh', 'cooling_energy_kwh', 'estimated_indoor_temp_c',
      'comfort_status', 'interval_cost_pkr', 'interval_emissions_kgco2e',
      'reason_code', 'explanation', 'constraint_violation_count'
    ];

    let csv = columns.join(',') + '\n';
    for (const row of schedule) {
      const values = columns.map(col => {
        const val = (row as any)[col];
        if (val === null || val === undefined) return '';
        if (typeof val === 'string' && (val.includes(',') || val.includes('"') || val.includes('\n'))) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return String(val);
      });
      csv += values.join(',') + '\n';
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=coolshift_output_${run.scenario_id}_${req.params.run_id.slice(0, 8)}.csv`);
    res.send(csv);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/export/:run_id/xlsx - Download XLSX
router.get('/:run_id/xlsx', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const run = db.prepare('SELECT * FROM optimization_runs WHERE run_id = ?').get(req.params.run_id) as any;
    if (!run) return res.status(404).json({ error: 'Run not found' });

    const schedule = db.prepare(
      'SELECT scenario_id, run_id, timestamp_local, recommended_ac_units_on, recommended_ac_setpoint_c, recommended_fan_units_on, grid_energy_kwh, solar_energy_used_kwh, battery_charge_kwh, battery_discharge_kwh, battery_soc_kwh, cooling_energy_kwh, estimated_indoor_temp_c, comfort_status, interval_cost_pkr, interval_emissions_kgco2e, reason_code, explanation, constraint_violation_count FROM output_schedule WHERE run_id = ? ORDER BY timestamp_local'
    ).all(req.params.run_id);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(schedule);
    XLSX.utils.book_append_sheet(wb, ws, 'Output_Schedule');

    // Add summary sheet
    const summaryData = db.prepare(`
      SELECT 
        COUNT(*) as total_intervals,
        SUM(grid_energy_kwh) as total_grid_energy_kwh,
        SUM(solar_energy_used_kwh) as total_solar_energy_kwh,
        SUM(interval_cost_pkr) as total_cost_pkr,
        SUM(interval_emissions_kgco2e) as total_emissions_kgco2e,
        MAX(grid_energy_kwh / 0.25) as peak_demand_kw,
        SUM(CASE WHEN comfort_status = 'within_range' THEN 1 ELSE 0 END) as comfort_within,
        SUM(CASE WHEN comfort_status = 'infeasible' THEN 1 ELSE 0 END) as infeasible_count
      FROM output_schedule WHERE run_id = ?
    `).get(req.params.run_id) as any;

    const summarySheet = XLSX.utils.json_to_sheet([summaryData]);
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=coolshift_output_${run.scenario_id}_${req.params.run_id.slice(0, 8)}.xlsx`);
    res.send(buffer);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/export/:run_id/summary-csv - Download summary CSV
router.get('/:run_id/summary-csv', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const schedule = db.prepare(`
      SELECT 
        scenario_id,
        SUBSTR(timestamp_local, 1, 10) as date,
        SUM(grid_energy_kwh) as grid_energy_kwh,
        SUM(solar_energy_used_kwh) as solar_energy_kwh,
        SUM(interval_cost_pkr) as cost_pkr,
        SUM(interval_emissions_kgco2e) as emissions_kgco2e,
        MAX(grid_energy_kwh / 0.25) as peak_demand_kw,
        AVG(estimated_indoor_temp_c) as avg_indoor_temp_c,
        COUNT(*) as intervals
      FROM output_schedule WHERE run_id = ?
      GROUP BY scenario_id, SUBSTR(timestamp_local, 1, 10)
      ORDER BY date
    `).all(req.params.run_id);

    const columns = Object.keys(schedule[0] || {});
    let csv = columns.join(',') + '\n';
    for (const row of schedule) {
      csv += columns.map(col => (row as any)[col]).join(',') + '\n';
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=coolshift_summary_${req.params.run_id.slice(0, 8)}.csv`);
    res.send(csv);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
