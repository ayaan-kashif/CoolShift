/**
 * ML Temperature Model — Multivariate Ordinary Least Squares (OLS) Linear Regression
 *
 * Features used:
 *   x0 = outdoor_temp_c
 *   x1 = heat_index_c
 *   x2 = solar_irradiance_w_m2 (normalised / 1000)
 *   x3 = occupancy_count
 *   x4 = sin(2π * hour / 24)   ← cyclic time encoding
 *   x5 = cos(2π * hour / 24)
 *   x6 = 1  (bias / intercept)
 *
 * Target:
 *   y = estimated_indoor_temp_c  (from output_schedule of past runs)
 *   Falls back to a synthetic target derived from outdoor + heat-index blend
 *   when no historic output_schedule is available.
 *
 * Training:  β = (XᵀX)⁻¹Xᵀy  computed entirely in TypeScript.
 * Inference: ŷ = Xβ
 */

import { getDb } from '../db/connection';

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------

export interface MLModelParams {
  scenario_id: string;
  coefficients: number[];      // [β0..β6]
  feature_names: string[];
  r_squared: number;
  mae: number;
  trained_at: string;
  sample_count: number;
}

export interface TempForecastPoint {
  timestamp_local: string;
  ml_predicted_temp_c: number;
  rc_baseline_temp_c: number;   // from existing RC thermal model estimate
  outdoor_temp_c: number;
  hour: number;
}

// -------------------------------------------------------------------
// Feature extraction
// -------------------------------------------------------------------

function extractFeatures(
  outdoor_temp_c: number,
  heat_index_c: number,
  solar_irradiance_w_m2: number,
  occupancy_count: number,
  timestamp_local: string
): number[] {
  const hour = new Date(timestamp_local).getHours() +
    new Date(timestamp_local).getMinutes() / 60;
  const sinH = Math.sin((2 * Math.PI * hour) / 24);
  const cosH = Math.cos((2 * Math.PI * hour) / 24);
  return [
    outdoor_temp_c,
    heat_index_c,
    solar_irradiance_w_m2 / 1000,
    occupancy_count,
    sinH,
    cosH,
    1, // bias
  ];
}

// -------------------------------------------------------------------
// OLS matrix helpers (pure TS, no external deps)
// -------------------------------------------------------------------

/** Matrix multiply A (m×k) × B (k×n) → C (m×n) */
function matMul(A: number[][], B: number[][]): number[][] {
  const m = A.length;
  const k = A[0].length;
  const n = B[0].length;
  const C = Array.from({ length: m }, () => new Array(n).fill(0));
  for (let i = 0; i < m; i++)
    for (let j = 0; j < n; j++)
      for (let p = 0; p < k; p++)
        C[i][j] += A[i][p] * B[p][j];
  return C;
}

/** Transpose matrix */
function transpose(A: number[][]): number[][] {
  return A[0].map((_, j) => A.map(row => row[j]));
}

/** Invert a square matrix via Gauss-Jordan elimination */
function invertMatrix(A: number[][]): number[][] | null {
  const n = A.length;
  const aug = A.map((row, i) => {
    const identity = new Array(n).fill(0);
    identity[i] = 1;
    return [...row, ...identity];
  });

  for (let col = 0; col < n; col++) {
    // Partial pivoting
    let maxRow = col;
    for (let row = col + 1; row < n; row++)
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col]))
        maxRow = row;
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];

    if (Math.abs(aug[col][col]) < 1e-12) return null; // singular

    const pivot = aug[col][col];
    for (let j = 0; j < 2 * n; j++) aug[col][j] /= pivot;

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = aug[row][col];
      for (let j = 0; j < 2 * n; j++)
        aug[row][j] -= factor * aug[col][j];
    }
  }
  return aug.map(row => row.slice(n));
}

/** Solve OLS: β = (XᵀX)⁻¹Xᵀy */
function solveOLS(X: number[][], y: number[]): number[] | null {
  const Xt = transpose(X);
  const XtX = matMul(Xt, X);
  const XtX_inv = invertMatrix(XtX);
  if (!XtX_inv) return null;
  const Xty = matMul(Xt, y.map(v => [v]));
  const beta = matMul(XtX_inv, Xty);
  return beta.map(r => r[0]);
}

// -------------------------------------------------------------------
// Training
// -------------------------------------------------------------------

/**
 * Train the ML temperature model for a given scenario.
 * Uses historic output_schedule (if available) or synthesises targets
 * from interval_inputs using a simple blend formula.
 */
export function trainThermalModel(scenarioId: string): MLModelParams {
  const db = getDb();

  // Load interval inputs
  const intervals = db.prepare(
    'SELECT * FROM interval_inputs WHERE scenario_id = ? ORDER BY timestamp_local'
  ).all(scenarioId) as any[];

  if (intervals.length < 10) {
    throw new Error(`Not enough interval data to train (need ≥10, got ${intervals.length})`);
  }

  // Load historic output_schedule temperatures (best-effort)
  const historic = db.prepare(`
    SELECT os.timestamp_local, os.estimated_indoor_temp_c
    FROM output_schedule os
    JOIN optimization_runs orr ON os.run_id = orr.run_id
    WHERE os.scenario_id = ? AND orr.status = 'complete'
    ORDER BY os.timestamp_local
  `).all(scenarioId) as any[];

  const tempMap = new Map<string, number>();
  historic.forEach((h: any) => tempMap.set(h.timestamp_local, h.estimated_indoor_temp_c));

  // Build X, y matrices
  const X: number[][] = [];
  const y: number[] = [];

  for (const intv of intervals) {
    const features = extractFeatures(
      intv.temperature_c,
      intv.heat_index_c,
      intv.solar_irradiance_w_m2,
      intv.occupancy_count,
      intv.timestamp_local
    );

    // Use real output temp if available, else synthesise
    const target = tempMap.has(intv.timestamp_local)
      ? tempMap.get(intv.timestamp_local)!
      : 0.6 * intv.temperature_c + 0.4 * intv.heat_index_c - 1.5; // synthetic blend

    X.push(features);
    y.push(target);
  }

  const beta = solveOLS(X, y);
  if (!beta) {
    throw new Error('OLS solution failed — matrix may be singular. Add more varied data.');
  }

  // Compute R² and MAE
  const yMean = y.reduce((a, b) => a + b, 0) / y.length;
  let ssTot = 0;
  let ssRes = 0;
  let maeSum = 0;

  for (let i = 0; i < X.length; i++) {
    const yHat = X[i].reduce((s, xi, j) => s + xi * beta[j], 0);
    ssTot += (y[i] - yMean) ** 2;
    ssRes += (y[i] - yHat) ** 2;
    maeSum += Math.abs(y[i] - yHat);
  }

  const rSquared = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;
  const mae = maeSum / X.length;

  const params: MLModelParams = {
    scenario_id: scenarioId,
    coefficients: beta.map(v => Math.round(v * 10000) / 10000),
    feature_names: [
      'outdoor_temp_c', 'heat_index_c', 'solar_irradiance_norm',
      'occupancy_count', 'sin_hour', 'cos_hour', 'bias'
    ],
    r_squared: Math.round(rSquared * 10000) / 10000,
    mae: Math.round(mae * 10000) / 10000,
    trained_at: new Date().toISOString(),
    sample_count: X.length,
  };

  // Upsert into DB
  db.prepare(`
    INSERT INTO ai_model_params
      (scenario_id, coefficients, feature_names, r_squared, mae, trained_at, sample_count)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(scenario_id) DO UPDATE SET
      coefficients = excluded.coefficients,
      feature_names = excluded.feature_names,
      r_squared = excluded.r_squared,
      mae = excluded.mae,
      trained_at = excluded.trained_at,
      sample_count = excluded.sample_count
  `).run(
    params.scenario_id,
    JSON.stringify(params.coefficients),
    JSON.stringify(params.feature_names),
    params.r_squared,
    params.mae,
    params.trained_at,
    params.sample_count
  );

  return params;
}

// -------------------------------------------------------------------
// Inference / Forecast
// -------------------------------------------------------------------

/** Load trained model params from DB */
export function loadModelParams(scenarioId: string): MLModelParams | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM ai_model_params WHERE scenario_id = ?').get(scenarioId) as any;
  if (!row) return null;
  return {
    ...row,
    coefficients: JSON.parse(row.coefficients),
    feature_names: JSON.parse(row.feature_names),
  };
}

/** Predict a single temperature given features and model coefficients */
export function predictIndoorTemp(features: number[], coefficients: number[]): number {
  const raw = features.reduce((s, xi, j) => s + xi * coefficients[j], 0);
  return Math.round(Math.max(10, Math.min(60, raw)) * 100) / 100;
}

/**
 * Generate a 24-hour (96-interval) temperature forecast for a scenario,
 * comparing ML model vs the simple RC baseline.
 */
export function generateTempForecast(
  scenarioId: string,
  windowStart: string,
  windowEnd: string
): TempForecastPoint[] {
  const db = getDb();
  const params = loadModelParams(scenarioId);

  const intervals = db.prepare(
    'SELECT * FROM interval_inputs WHERE scenario_id = ? AND timestamp_local >= ? AND timestamp_local < ? ORDER BY timestamp_local'
  ).all(scenarioId, windowStart, windowEnd) as any[];

  const profile = db.prepare('SELECT * FROM scenario_profiles WHERE scenario_id = ?').get(scenarioId) as any;
  const comfortMid = profile ? (profile.comfort_min_c + profile.comfort_max_c) / 2 : 24;

  return intervals.map(intv => {
    const features = extractFeatures(
      intv.temperature_c,
      intv.heat_index_c,
      intv.solar_irradiance_w_m2,
      intv.occupancy_count,
      intv.timestamp_local
    );

    const ml_predicted = params
      ? predictIndoorTemp(features, params.coefficients)
      : 0.6 * intv.temperature_c + 0.4 * intv.heat_index_c - 1.5;

    // RC baseline: simple blend used before ML
    const rc_baseline = Math.round(
      (0.3 * intv.temperature_c + 0.7 * comfortMid) * 100
    ) / 100;

    const hour = new Date(intv.timestamp_local).getHours();

    return {
      timestamp_local: intv.timestamp_local,
      ml_predicted_temp_c: ml_predicted,
      rc_baseline_temp_c: rc_baseline,
      outdoor_temp_c: intv.temperature_c,
      hour,
    };
  });
}
