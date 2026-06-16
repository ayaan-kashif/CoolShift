import { Router, Request, Response } from 'express';
import { getDb } from '../db/connection';
import { trainThermalModel, generateTempForecast, loadModelParams } from '../core/ml-temperature-model';
import { detectAnomalies } from '../core/anomaly-detector';
import { generateRecommendations } from '../core/ai-recommendations';

const router = Router();

// -----------------------------------------------------------------------
// POST /api/v1/ai/train/:scenario_id
// Train the ML temperature model on a scenario's interval data.
// -----------------------------------------------------------------------
router.post('/train/:scenario_id', (req: Request, res: Response) => {
  try {
    const params = trainThermalModel(req.params.scenario_id);
    res.json({
      success: true,
      message: 'ML model trained successfully',
      model: params,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// -----------------------------------------------------------------------
// GET /api/v1/ai/model/:scenario_id
// Return current trained model params (or null if not trained yet)
// -----------------------------------------------------------------------
router.get('/model/:scenario_id', (req: Request, res: Response) => {
  try {
    const params = loadModelParams(req.params.scenario_id);
    if (!params) {
      return res.status(404).json({ error: 'No trained model found. Call POST /train first.' });
    }
    res.json(params);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------------------
// GET /api/v1/ai/forecast/:scenario_id
// Generate 24-hour ML temperature forecast vs RC baseline
// Query params: window_start (ISO), window_end (ISO)
// Defaults to first available window in the scenario's interval data
// -----------------------------------------------------------------------
router.get('/forecast/:scenario_id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { scenario_id } = req.params;

    // Determine window
    let windowStart = req.query.window_start as string;
    let windowEnd = req.query.window_end as string;

    if (!windowStart || !windowEnd) {
      // Auto-detect: use first 96 intervals (1 day)
      const first = db.prepare(
        'SELECT timestamp_local FROM interval_inputs WHERE scenario_id = ? ORDER BY timestamp_local LIMIT 1'
      ).get(scenario_id) as any;
      const last96 = db.prepare(
        'SELECT timestamp_local FROM interval_inputs WHERE scenario_id = ? ORDER BY timestamp_local LIMIT 1 OFFSET 95'
      ).get(scenario_id) as any;

      if (!first) {
        return res.status(400).json({ error: 'No interval data found for this scenario.' });
      }

      windowStart = first.timestamp_local;
      windowEnd = last96
        ? last96.timestamp_local
        : new Date(new Date(first.timestamp_local).getTime() + 24 * 60 * 60 * 1000).toISOString();
    }

    const forecast = generateTempForecast(scenario_id, windowStart, windowEnd);
    const modelParams = loadModelParams(scenario_id);

    res.json({
      scenario_id,
      window_start: windowStart,
      window_end: windowEnd,
      model_trained: !!modelParams,
      r_squared: modelParams?.r_squared ?? null,
      mae: modelParams?.mae ?? null,
      sample_count: modelParams?.sample_count ?? null,
      forecast,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------------------
// GET /api/v1/ai/anomalies/:run_id
// Detect anomalies in a completed run's schedule
// Query param: z_threshold (default 2.5)
// -----------------------------------------------------------------------
router.get('/anomalies/:run_id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { run_id } = req.params;
    const zThreshold = parseFloat(req.query.z_threshold as string) || 2.5;

    const run = db.prepare('SELECT * FROM optimization_runs WHERE run_id = ?').get(run_id) as any;
    if (!run) return res.status(404).json({ error: 'Run not found' });

    const schedule = db.prepare(
      'SELECT * FROM output_schedule WHERE run_id = ? ORDER BY timestamp_local'
    ).all(run_id) as any[];

    const intervals = db.prepare(
      'SELECT * FROM interval_inputs WHERE scenario_id = ? AND timestamp_local >= ? AND timestamp_local < ? ORDER BY timestamp_local'
    ).all(run.scenario_id, run.evaluation_window_start, run.evaluation_window_end) as any[];

    const anomalies = detectAnomalies(schedule, intervals, zThreshold);

    // Summary counts by severity
    const summary = {
      critical: anomalies.filter(a => a.severity === 'critical').length,
      high: anomalies.filter(a => a.severity === 'high').length,
      medium: anomalies.filter(a => a.severity === 'medium').length,
      low: anomalies.filter(a => a.severity === 'low').length,
      total: anomalies.length,
    };

    res.json({
      run_id,
      scenario_id: run.scenario_id,
      z_threshold: zThreshold,
      summary,
      anomalies,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------------------
// GET /api/v1/ai/recommendations/:run_id
// Generate personalized recommendations for a completed run
// -----------------------------------------------------------------------
router.get('/recommendations/:run_id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { run_id } = req.params;

    const run = db.prepare('SELECT * FROM optimization_runs WHERE run_id = ?').get(run_id) as any;
    if (!run) return res.status(404).json({ error: 'Run not found' });

    const recs = generateRecommendations(run_id, run.scenario_id);

    const totalEstimatedSaving = recs.reduce((s, r) => s + r.estimated_saving_pkr, 0);

    res.json({
      run_id,
      scenario_id: run.scenario_id,
      total_recommendations: recs.length,
      total_estimated_saving_pkr: totalEstimatedSaving,
      recommendations: recs,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
