import { getDb } from '../db/connection';
import { runBaseline } from '../core/baseline-engine';
import { runOptimization } from '../core/optimizer';
import * as fs from 'fs';
import * as path from 'path';

async function generateOutputs() {
  const db = getDb();
  
  // Get all scenarios
  const scenarios = db.prepare('SELECT * FROM scenario_profiles').all() as any[];
  console.log(`Found ${scenarios.length} scenarios`);
  
  const allIntervalRows: any[] = [];
  const allSummaryRows: any[] = [];
  
  for (const scenario of scenarios) {
    console.log(`Processing scenario: ${scenario.name} (${scenario.scenario_id})`);
    
    // Get date range
    const range = db.prepare(
      'SELECT MIN(timestamp_local) as min_ts, MAX(timestamp_local) as max_ts FROM interval_inputs WHERE scenario_id = ?'
    ).get(scenario.scenario_id) as any;
    
    if (!range?.min_ts) {
      console.log(`  No data for ${scenario.scenario_id}, skipping`);
      continue;
    }
    
    // Use first 7 days (timezone-agnostic parsing to avoid local/UTC offset shifts)
    const windowStart = range.min_ts;
    const [datePart, timePart] = range.min_ts.split('T');
    const [year, month, day] = datePart.split('-').map(Number);
    const d = new Date(Date.UTC(year, month - 1, day));
    d.setUTCDate(d.getUTCDate() + 7);
    const pad = (n: number) => String(n).padStart(2, '0');
    const nextDatePart = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    const windowEnd = `${nextDatePart}T${timePart}`;
    
    try {
      // Run baseline
      console.log(`  Running baseline...`);
      const baseline = runBaseline(scenario.scenario_id, windowStart, windowEnd);
      
      // Run optimization
      console.log(`  Running optimization...`);
      const optimized = runOptimization(scenario.scenario_id, windowStart, windowEnd, {
        cost: 0.25,
        emissions: 0.25,
        comfort: 0.45,
        peak: 0.05
      });
      
      // Get output schedule rows (optimized only)
      const scheduleRows = db.prepare(
        'SELECT * FROM output_schedule WHERE run_id = ? ORDER BY timestamp_local'
      ).all(optimized.run_id) as any[];
      
      allIntervalRows.push(...scheduleRows);
      
      // Get daily summary (comparing baseline vs optimized)
      const dailyRows = db.prepare(`
        SELECT 
          ? as scenario_id,
          ? as scenario_name,
          SUBSTR(opt.timestamp_local, 1, 10) as date,
          SUM(base.interval_cost_pkr) as baseline_cost_pkr,
          SUM(opt.interval_cost_pkr) as optimized_cost_pkr,
          SUM(base.interval_emissions_kgco2e) as baseline_emissions_kgco2e,
          SUM(opt.interval_emissions_kgco2e) as optimized_emissions_kgco2e,
          SUM(base.grid_energy_kwh) as baseline_grid_energy_kwh,
          SUM(opt.grid_energy_kwh) as optimized_grid_energy_kwh,
          SUM(base.solar_energy_used_kwh) as baseline_solar_energy_kwh,
          SUM(opt.solar_energy_used_kwh) as optimized_solar_energy_kwh,
          MAX(base.grid_energy_kwh / 0.25) as baseline_peak_demand_kw,
          MAX(opt.grid_energy_kwh / 0.25) as optimized_peak_demand_kw,
          SUM(CASE WHEN base.comfort_status = 'within_range' THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as baseline_comfort_pct,
          SUM(CASE WHEN opt.comfort_status = 'within_range' THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as optimized_comfort_pct
        FROM output_schedule opt
        JOIN output_schedule base ON opt.timestamp_local = base.timestamp_local 
          AND opt.scenario_id = base.scenario_id
        WHERE opt.run_id = ? AND base.run_id = ?
        GROUP BY SUBSTR(opt.timestamp_local, 1, 10)
      `).all(scenario.scenario_id, scenario.name, optimized.run_id, baseline.run_id) as any[];
      
      allSummaryRows.push(...dailyRows);
      
      console.log(`  ✅ ${scheduleRows.length} optimized interval rows generated`);
    } catch (err: any) {
      console.error(`  ❌ Error: ${err.message}`);
    }
  }
  
  // Write outputs
  const outputDir = path.join(__dirname, '../../../outputs');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  
  // Write public_results.csv
  if (allIntervalRows.length > 0) {
    const cols = [
      'scenario_id', 'run_id', 'timestamp_local', 'recommended_ac_units_on',
      'recommended_ac_setpoint_c', 'recommended_fan_units_on', 'grid_energy_kwh',
      'solar_energy_used_kwh', 'battery_charge_kwh', 'battery_discharge_kwh',
      'battery_soc_kwh', 'cooling_energy_kwh', 'estimated_indoor_temp_c',
      'comfort_status', 'interval_cost_pkr', 'interval_emissions_kgco2e',
      'reason_code', 'explanation', 'constraint_violation_count'
    ];
    const csvLines = [cols.join(',')];
    allIntervalRows.forEach(row => {
      csvLines.push(cols.map(c => {
        const v = row[c];
        if (typeof v === 'string' && v.includes(',')) return `"${v}"`;
        return v ?? '';
      }).join(','));
    });
    fs.writeFileSync(path.join(outputDir, 'public_results.csv'), csvLines.join('\n'));
    console.log(`\n✅ public_results.csv: ${allIntervalRows.length} rows`);
  }
  
  // Write summary_results.csv
  if (allSummaryRows.length > 0) {
    const cols = Object.keys(allSummaryRows[0]);
    const csvLines = [cols.join(',')];
    allSummaryRows.forEach(row => {
      csvLines.push(cols.map(c => row[c] ?? '').join(','));
    });
    fs.writeFileSync(path.join(outputDir, 'summary_results.csv'), csvLines.join('\n'));
    console.log(`✅ summary_results.csv: ${allSummaryRows.length} rows`);
  }
  
  console.log('\nDone! Check /outputs folder.');
}

generateOutputs().catch(console.error);
