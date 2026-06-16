import { getDb } from '../db/connection';
import { runOptimization } from '../core/optimizer';

async function main() {
  const db = getDb();
  console.log("Running check for PUB-B...");
  
  // Get scenario profile
  const scenarioId = 'PUB-B';
  const range = db.prepare(
    'SELECT MIN(timestamp_local) as min_ts FROM interval_inputs WHERE scenario_id = ?'
  ).get(scenarioId) as any;
  
  const windowStart = range.min_ts;
  const [datePart, timePart] = range.min_ts.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  const nextDatePart = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const windowEnd = `${nextDatePart}T${timePart}`;
  
  console.log(`Window: ${windowStart} to ${windowEnd}`);
  
  const result = runOptimization(scenarioId, windowStart, windowEnd, {
    cost: 0.4,
    emissions: 0.3,
    comfort: 0.25,
    peak: 0.05
  });
  
  console.log("Optimization finished:", result);
}

main().catch(console.error);
