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
        cost: 0.4,
        emissions: 0.3,
        comfort: 0.25,
        peak: 0.05
      });
      
      // Get output schedule rows
      const scheduleRows = db.prepare(
        'SELECT * FROM output_schedule WHERE run_id = ? ORDER BY timestamp_local'
      ).all(optimized.run_id) as any[];
      
      allIntervalRows.push(...scheduleRows);
      
      // Get daily summary
      const dailyRows = db.prepare(`
        SELECT 
          ? as scenario_id,
          ? as scenario_name,
          SUBSTR(timestamp_local, 1, 10) as date,
          SUM(interval_cost_pkr) as optimized_cost_pkr,
          SUM(interval_emissions_kgco2e) as optimized_emissions_kgco2e,
          SUM(grid_energy_kwh) as grid_energy_kwh,
          SUM(solar_energy_used_kwh) as solar_energy_kwh,
          MAX(grid_energy_kwh / 0.25) as peak_demand_kw,
          SUM(CASE WHEN comfort_status = 'within_range' AND recommended_ac_units_on >= 0 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as comfort_pct
        FROM output_schedule WHERE run_id = ?
        GROUP BY SUBSTR(timestamp_local, 1, 10)
      `).all(scenario.scenario_id, scenario.name, optimized.run_id) as any[];
      
      allSummaryRows.push(...dailyRows);
      
      console.log(`  ✅ ${scheduleRows.length} interval rows generated`);
    } catch (err: any) {
      console.error(`  ❌ Error: ${err.message}`);
    }
  }
  
  // Write outputs
  const outputDir = path.join(__dirname, '../../../outputs');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  
  // Write public_results.csv
  if (allIntervalRows.length > 0) {
    const cols = Object.keys(allIntervalRows[0]);
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
