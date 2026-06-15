import { Router, Request, Response } from 'express';
import { runBaseline } from '../core/baseline-engine';
import { runOptimization } from '../core/optimizer';
import { getDb } from '../db/connection';
import { config } from '../config';
import type { ObjectiveWeights } from '../models/types';

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

export { baselineRouter, optimizeRouter };
