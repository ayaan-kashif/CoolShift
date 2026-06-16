import express from 'express';
import cors from 'cors';
import path from 'path';
import { config } from './config';
import { getDb } from './db/connection';
import scenarioRoutes from './routes/scenarios';
import importRoutes from './routes/import';
import { baselineRouter, optimizeRouter } from './routes/engines';
import runsRouter from './routes/runs';
import exportRouter from './routes/export';
import aiRouter from './routes/ai';

const app = express();

// Middleware
const allowedOrigins = config.corsOrigin.split(',').map(o => o.trim());
app.use(cors({ 
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      callback(new Error(`Not allowed by CORS: ${origin}`));
    }
  }, 
  credentials: true 
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/api/v1/health', (req, res) => {
  try {
    const db = getDb();
    const scenarioCount = (db.prepare('SELECT COUNT(*) as c FROM scenario_profiles').get() as any).c;
    const intervalCount = (db.prepare('SELECT COUNT(*) as c FROM interval_inputs').get() as any).c;
    const runCount = (db.prepare('SELECT COUNT(*) as c FROM optimization_runs').get() as any).c;
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: {
        scenarios: scenarioCount,
        intervals: intervalCount,
        runs: runCount,
      },
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// API Routes
app.use('/api/v1/scenarios', scenarioRoutes);
app.use('/api/v1/import', importRoutes);
app.use('/api/v1/baseline', baselineRouter);
app.use('/api/v1/optimize', optimizeRouter);
app.use('/api/v1/runs', runsRouter);
app.use('/api/v1/export', exportRouter);
app.use('/api/v1/ai', aiRouter);

// Alias for history
app.get('/api/v1/history', (req, res) => {
  const db = getDb();
  try {
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

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// Initialize database on startup
getDb();
console.log('📦 Database initialized');

// Start server
app.listen(config.port, config.host, () => {
  console.log(`🚀 CoolShift API running on http://${config.host}:${config.port}`);
  console.log(`📊 Environment: ${config.environment}`);
  console.log(`🌐 CORS origin: ${config.corsOrigin}`);
});

export default app;
