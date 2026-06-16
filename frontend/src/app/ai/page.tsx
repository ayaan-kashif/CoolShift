'use client';

import React, { useEffect, useState, useCallback } from 'react';
import api from '../../lib/api';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface Scenario { scenario_id: string; name: string; interval_count: number; }
interface Run { run_id: string; scenario_id: string; status: string; created_at: string; scenario_name: string; }
interface ModelParams {
  r_squared: number; mae: number; sample_count: number;
  coefficients: number[]; feature_names: string[]; trained_at: string;
}
interface ForecastPoint {
  timestamp_local: string; ml_predicted_temp_c: number;
  rc_baseline_temp_c: number; outdoor_temp_c: number; hour: number;
}
interface Anomaly {
  id: string; timestamp_local: string; type: string; severity: string;
  value: number; baseline: number; deviation_pct: number; explanation: string;
}
interface Recommendation {
  id: string; priority: 'P1' | 'P2' | 'P3'; category: string;
  title: string; description: string; estimated_saving_pkr: number; confidence: number; supporting_stat: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Colour helpers
// ─────────────────────────────────────────────────────────────────────────────
const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500/20 border-red-500/40 text-red-300',
  high:     'bg-orange-500/20 border-orange-500/40 text-orange-300',
  medium:   'bg-yellow-500/20 border-yellow-500/40 text-yellow-300',
  low:      'bg-blue-500/20 border-blue-500/40 text-blue-300',
};
const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-red-400', high: 'bg-orange-400', medium: 'bg-yellow-400', low: 'bg-blue-400',
};
const PRIORITY_COLORS: Record<string, string> = {
  P1: 'bg-red-500/20 text-red-300 border border-red-500/30',
  P2: 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30',
  P3: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
};
const CATEGORY_ICON: Record<string, string> = {
  cost: '💰', comfort: '🌡️', peak: '⚡', emissions: '🌿', resilience: '🛡️',
};
const ANOMALY_ICON: Record<string, string> = {
  ENERGY_SPIKE: '⚡', AC_SUDDEN_JUMP: '❄️', COMFORT_CLIFF: '🌡️',
  OUTAGE_HEAT_RISK: '🔴', SOLAR_CURTAILMENT: '☀️',
};

// ─────────────────────────────────────────────────────────────────────────────
// Mini SVG sparkline chart (no recharts dep needed)
// ─────────────────────────────────────────────────────────────────────────────
function MiniLineChart({
  data, width = 900, height = 220,
}: {
  data: ForecastPoint[];
  width?: number;
  height?: number;
}) {
  if (!data.length) return null;

  const pad = { top: 20, right: 20, bottom: 30, left: 42 };
  const W = width - pad.left - pad.right;
  const H = height - pad.top - pad.bottom;

  const allTemps = data.flatMap(d => [d.ml_predicted_temp_c, d.rc_baseline_temp_c, d.outdoor_temp_c]);
  const minT = Math.floor(Math.min(...allTemps)) - 1;
  const maxT = Math.ceil(Math.max(...allTemps)) + 1;

  const xScale = (i: number) => (i / (data.length - 1)) * W;
  const yScale = (t: number) => H - ((t - minT) / (maxT - minT)) * H;

  const toPath = (getter: (d: ForecastPoint) => number) =>
    data.map((d, i) => `${i === 0 ? 'M' : 'L'}${xScale(i).toFixed(1)},${yScale(getter(d)).toFixed(1)}`).join(' ');

  const mlPath = toPath(d => d.ml_predicted_temp_c);
  const rcPath = toPath(d => d.rc_baseline_temp_c);
  const outPath = toPath(d => d.outdoor_temp_c);

  // Comfort band (fixed 20–28 for display — adjust if profile passed)
  const comfortY1 = yScale(28);
  const comfortY2 = yScale(20);

  // X-axis labels every 8 intervals (2h)
  const xLabels = data
    .map((d, i) => ({ i, h: d.hour }))
    .filter(({ i }) => i % 8 === 0);

  // Y-axis ticks
  const yTicks = [];
  for (let t = minT; t <= maxT; t += 2) yTicks.push(t);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ fontFamily: 'Inter, sans-serif' }}>
      <g transform={`translate(${pad.left},${pad.top})`}>
        {/* Comfort band */}
        <rect x={0} y={comfortY1} width={W} height={comfortY2 - comfortY1}
          fill="#00d4aa" fillOpacity={0.07} />

        {/* Grid lines */}
        {yTicks.map(t => (
          <g key={t}>
            <line x1={0} y1={yScale(t)} x2={W} y2={yScale(t)} stroke="#ffffff12" strokeWidth={1} />
            <text x={-6} y={yScale(t) + 4} textAnchor="end" fill="#94A3B8" fontSize={10}>{t}°</text>
          </g>
        ))}

        {/* X-axis labels */}
        {xLabels.map(({ i, h }) => (
          <text key={i} x={xScale(i)} y={H + 18} textAnchor="middle" fill="#64748B" fontSize={10}>
            {`${h}:00`}
          </text>
        ))}

        {/* Outdoor temp */}
        <path d={outPath} fill="none" stroke="#f97316" strokeWidth={1.5} strokeDasharray="4,3" opacity={0.6} />

        {/* RC baseline */}
        <path d={rcPath} fill="none" stroke="#22d3ee" strokeWidth={2} strokeDasharray="6,4" opacity={0.8} />

        {/* ML predicted */}
        <path d={mlPath} fill="none" stroke="#a78bfa" strokeWidth={2.5} />

        {/* Dots at hour marks for ML */}
        {data.filter((_, i) => i % 8 === 0).map((d, idx) => {
          const xi = data.indexOf(d);
          return (
            <circle key={idx} cx={xScale(xi)} cy={yScale(d.ml_predicted_temp_c)}
              r={3} fill="#a78bfa" />
          );
        })}
      </g>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Feature importance horizontal bar
// ─────────────────────────────────────────────────────────────────────────────
function FeatureBar({ name, value, maxAbs }: { name: string; value: number; maxAbs: number }) {
  const pct = maxAbs > 0 ? Math.abs(value) / maxAbs : 0;
  const positive = value >= 0;
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="text-white/50 w-36 truncate shrink-0">{name}</span>
      <div className="flex-1 bg-white/5 rounded-full h-2 relative overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${positive ? 'bg-violet-500' : 'bg-rose-400'}`}
          style={{ width: `${(pct * 100).toFixed(1)}%` }}
        />
      </div>
      <span className={`w-14 text-right font-mono ${positive ? 'text-violet-300' : 'text-rose-300'}`}>
        {value > 0 ? '+' : ''}{value.toFixed(3)}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Metric card
// ─────────────────────────────────────────────────────────────────────────────
function MetricCard({ label, value, sub, accent = 'violet' }: {
  label: string; value: string; sub?: string; accent?: string;
}) {
  const accMap: Record<string, string> = {
    violet: 'text-violet-400', green: 'text-emerald-400', blue: 'text-sky-400', orange: 'text-orange-400',
  };
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
      <p className="text-[11px] text-white/40 uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-2xl font-bold ${accMap[accent] || accMap.violet}`}>{value}</p>
      {sub && <p className="text-[11px] text-white/30 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────
export default function AIInsightsPage() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedScenario, setSelectedScenario] = useState('');
  const [selectedRun, setSelectedRun] = useState('');

  const [modelParams, setModelParams] = useState<ModelParams | null>(null);
  const [forecast, setForecast] = useState<ForecastPoint[]>([]);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);

  const [training, setTraining] = useState(false);
  const [loadingForecast, setLoadingForecast] = useState(false);
  const [loadingAnomalies, setLoadingAnomalies] = useState(false);
  const [loadingRecs, setLoadingRecs] = useState(false);

  const [trainMsg, setTrainMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [anomalySummary, setAnomalySummary] = useState<any>(null);
  const [totalRecSaving, setTotalRecSaving] = useState(0);

  // ── Load initial data ──
  useEffect(() => {
    api.get('/api/v1/scenarios').then(r => setScenarios(r.data)).catch(() => {});
    api.get('/api/v1/runs').then(r => {
      const complete = r.data.filter((x: Run) => x.status === 'complete');
      setRuns(complete);
      if (complete.length > 0) setSelectedRun(complete[0].run_id);
    }).catch(() => {});
  }, []);

  // ── Auto-set scenario when runs change ──
  useEffect(() => {
    if (runs.length > 0 && scenarios.length > 0 && !selectedScenario) {
      setSelectedScenario(runs[0].scenario_id);
    }
  }, [runs, scenarios]);

  // ── Load model params when scenario changes ──
  useEffect(() => {
    if (!selectedScenario) return;
    api.get(`/api/v1/ai/model/${selectedScenario}`)
      .then(r => setModelParams(r.data))
      .catch(() => setModelParams(null));
  }, [selectedScenario]);

  // ── Train model ──
  const handleTrain = async () => {
    if (!selectedScenario) return;
    setTraining(true);
    setTrainMsg(null);
    try {
      const res = await api.post(`/api/v1/ai/train/${selectedScenario}`, {});
      setModelParams(res.data.model);
      setTrainMsg({ ok: true, text: `✅ Model trained on ${res.data.model.sample_count} samples — R² = ${res.data.model.r_squared.toFixed(4)}, MAE = ${res.data.model.mae.toFixed(2)}°C` });
    } catch (err: any) {
      setTrainMsg({ ok: false, text: `❌ ${err.response?.data?.error || 'Training failed'}` });
    } finally {
      setTraining(false);
    }
  };

  // ── Load forecast ──
  const handleForecast = useCallback(async () => {
    if (!selectedScenario) return;
    setLoadingForecast(true);
    try {
      const res = await api.get(`/api/v1/ai/forecast/${selectedScenario}`);
      setForecast(res.data.forecast || []);
    } catch (err: any) {
      setForecast([]);
    } finally {
      setLoadingForecast(false);
    }
  }, [selectedScenario]);

  // ── Auto-load forecast when scenario / model changes ──
  useEffect(() => { if (selectedScenario) handleForecast(); }, [selectedScenario, handleForecast]);

  // ── Load anomalies ──
  const handleAnomalies = useCallback(async () => {
    if (!selectedRun) return;
    setLoadingAnomalies(true);
    try {
      const res = await api.get(`/api/v1/ai/anomalies/${selectedRun}`);
      setAnomalies(res.data.anomalies || []);
      setAnomalySummary(res.data.summary);
    } catch {
      setAnomalies([]);
    } finally {
      setLoadingAnomalies(false);
    }
  }, [selectedRun]);

  // ── Load recommendations ──
  const handleRecommendations = useCallback(async () => {
    if (!selectedRun) return;
    setLoadingRecs(true);
    try {
      const res = await api.get(`/api/v1/ai/recommendations/${selectedRun}`);
      setRecommendations(res.data.recommendations || []);
      setTotalRecSaving(res.data.total_estimated_saving_pkr || 0);
    } catch {
      setRecommendations([]);
    } finally {
      setLoadingRecs(false);
    }
  }, [selectedRun]);

  // ── Auto-load when run changes ──
  useEffect(() => {
    if (selectedRun) { handleAnomalies(); handleRecommendations(); }
  }, [selectedRun, handleAnomalies, handleRecommendations]);

  const maxCoeffAbs = modelParams
    ? Math.max(...modelParams.coefficients.slice(0, -1).map(Math.abs))
    : 1;

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
            <span className="text-2xl">🤖</span>
            AI Insights
            <span className="text-xs bg-violet-500/20 text-violet-300 border border-violet-500/30 px-2 py-0.5 rounded-full">
              ML Engine
            </span>
          </h1>
          <p className="text-white/50 text-sm mt-1">
            Multivariate regression · Anomaly detection · Personalized recommendations
          </p>
        </div>

        {/* Global selectors */}
        <div className="flex gap-3 flex-wrap">
          <select
            id="scenario-select"
            className="bg-[#0F1C2E] border border-[#1E293B] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-violet-500"
            value={selectedScenario}
            onChange={e => setSelectedScenario(e.target.value)}
          >
            <option value="">— Select Scenario —</option>
            {scenarios.map(s => (
              <option key={s.scenario_id} value={s.scenario_id}>{s.name}</option>
            ))}
          </select>
          <select
            id="run-select"
            className="bg-[#0F1C2E] border border-[#1E293B] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-violet-500"
            value={selectedRun}
            onChange={e => setSelectedRun(e.target.value)}
          >
            <option value="">— Select Run —</option>
            {runs.map(r => (
              <option key={r.run_id} value={r.run_id}>
                {r.scenario_name} · {new Date(r.created_at).toLocaleDateString()}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── SECTION 1: ML Model Training ── */}
      <section className="bg-[#0A1628] border border-[#1E293B] rounded-2xl p-6 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              🧠 Temperature Prediction Model
            </h2>
            <p className="text-white/40 text-xs mt-0.5">
              Ordinary Least Squares regression · 7 features · trained on scenario data
            </p>
          </div>
          <button
            id="train-model-btn"
            onClick={handleTrain}
            disabled={!selectedScenario || training}
            className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-sm font-semibold transition-all shadow-[0_0_20px_rgba(139,92,246,0.4)] flex items-center gap-2"
          >
            {training ? (
              <><span className="animate-spin">⚙️</span> Training…</>
            ) : (
              <><span>🚀</span> Train Model</>
            )}
          </button>
        </div>

        {trainMsg && (
          <div className={`rounded-lg px-4 py-2.5 text-sm font-medium ${trainMsg.ok ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'bg-red-500/15 text-red-300 border border-red-500/30'}`}>
            {trainMsg.text}
          </div>
        )}

        {modelParams ? (
          <>
            {/* Metric row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MetricCard label="R² Score" value={modelParams.r_squared.toFixed(4)} sub="Fit quality (1.0 = perfect)" accent="violet" />
              <MetricCard label="MAE" value={`${modelParams.mae.toFixed(2)}°C`} sub="Mean absolute error" accent="blue" />
              <MetricCard label="Samples" value={modelParams.sample_count.toLocaleString()} sub="Training intervals" accent="green" />
              <MetricCard label="Trained" value={new Date(modelParams.trained_at).toLocaleDateString()} sub={new Date(modelParams.trained_at).toLocaleTimeString()} accent="orange" />
            </div>

            {/* Feature importance */}
            <div className="bg-white/3 border border-white/8 rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-white/50 uppercase tracking-widest mb-3">
                Feature Importance (Coefficient Magnitude)
              </p>
              {modelParams.feature_names.slice(0, -1).map((name, i) => (
                <FeatureBar key={name} name={name} value={modelParams.coefficients[i]} maxAbs={maxCoeffAbs} />
              ))}
            </div>
          </>
        ) : (
          <div className="text-center py-10 text-white/30 text-sm">
            {selectedScenario
              ? 'No trained model yet. Click "Train Model" to fit OLS regression on this scenario\'s data.'
              : 'Select a scenario above to train the temperature prediction model.'}
          </div>
        )}
      </section>

      {/* ── SECTION 2: 24h Temperature Forecast ── */}
      <section className="bg-[#0A1628] border border-[#1E293B] rounded-2xl p-6 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              📈 24-Hour Temperature Forecast
            </h2>
            <p className="text-white/40 text-xs mt-0.5">ML predicted vs RC physics baseline vs outdoor temperature</p>
          </div>
          <button
            id="refresh-forecast-btn"
            onClick={handleForecast}
            disabled={!selectedScenario || loadingForecast}
            className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 text-xs transition-all disabled:opacity-40"
          >
            {loadingForecast ? '⏳ Loading…' : '🔄 Refresh'}
          </button>
        </div>

        {/* Legend */}
        <div className="flex gap-5 flex-wrap text-xs text-white/60">
          <span className="flex items-center gap-2"><span className="w-5 h-0.5 bg-violet-500 inline-block rounded" />ML Predicted</span>
          <span className="flex items-center gap-2"><span className="w-5 h-0.5 bg-cyan-400 inline-block rounded border-dashed" style={{borderTop:'2px dashed #22d3ee', background:'none', height:0}} />RC Baseline</span>
          <span className="flex items-center gap-2"><span className="w-5 h-0.5 bg-orange-400 inline-block rounded" />Outdoor Temp</span>
          <span className="flex items-center gap-2"><span className="w-5 h-3 bg-teal-500/20 inline-block rounded border border-teal-500/30" />Comfort Band</span>
        </div>

        <div className="bg-[#060E1D] rounded-xl p-4 overflow-x-auto">
          {loadingForecast ? (
            <div className="h-48 flex items-center justify-center text-white/30 text-sm">⏳ Generating forecast…</div>
          ) : forecast.length > 0 ? (
            <MiniLineChart data={forecast} />
          ) : (
            <div className="h-48 flex items-center justify-center text-white/30 text-sm">
              {selectedScenario ? 'No interval data in this window.' : 'Select a scenario to view forecast.'}
            </div>
          )}
        </div>

        {forecast.length > 0 && (
          <div className="grid grid-cols-3 gap-4 text-xs">
            <div className="bg-violet-500/10 border border-violet-500/20 rounded-lg p-3">
              <p className="text-violet-300/60 mb-1">ML Peak Predicted</p>
              <p className="text-violet-300 font-bold text-base">
                {Math.max(...forecast.map(d => d.ml_predicted_temp_c)).toFixed(1)}°C
              </p>
            </div>
            <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-lg p-3">
              <p className="text-cyan-300/60 mb-1">RC Peak Baseline</p>
              <p className="text-cyan-300 font-bold text-base">
                {Math.max(...forecast.map(d => d.rc_baseline_temp_c)).toFixed(1)}°C
              </p>
            </div>
            <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-3">
              <p className="text-orange-300/60 mb-1">Outdoor Peak</p>
              <p className="text-orange-300 font-bold text-base">
                {Math.max(...forecast.map(d => d.outdoor_temp_c)).toFixed(1)}°C
              </p>
            </div>
          </div>
        )}
      </section>

      {/* ── SECTION 3: Anomaly Detection ── */}
      <section className="bg-[#0A1628] border border-[#1E293B] rounded-2xl p-6 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              🔍 Anomaly Detection
            </h2>
            <p className="text-white/40 text-xs mt-0.5">Rolling Z-score · AC jump detection · Comfort cliff · Outage risk · Solar curtailment</p>
          </div>
          <button
            id="refresh-anomalies-btn"
            onClick={handleAnomalies}
            disabled={!selectedRun || loadingAnomalies}
            className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 text-xs transition-all disabled:opacity-40"
          >
            {loadingAnomalies ? '⏳ Scanning…' : '🔄 Re-scan'}
          </button>
        </div>

        {/* Summary badges */}
        {anomalySummary && (
          <div className="flex gap-3 flex-wrap">
            {anomalySummary.total === 0 ? (
              <span className="text-emerald-400 text-sm font-medium">✅ No anomalies detected in this run</span>
            ) : (
              <>
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-red-500/20 text-red-300 border border-red-500/30">🔴 {anomalySummary.critical} Critical</span>
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-orange-500/20 text-orange-300 border border-orange-500/30">🟠 {anomalySummary.high} High</span>
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">🟡 {anomalySummary.medium} Medium</span>
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">🔵 {anomalySummary.low} Low</span>
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-white/10 text-white/60">Total: {anomalySummary.total}</span>
              </>
            )}
          </div>
        )}

        {loadingAnomalies ? (
          <div className="text-center py-8 text-white/30 text-sm">⏳ Scanning run for anomalies…</div>
        ) : anomalies.length === 0 ? (
          <div className="text-center py-8 text-white/30 text-sm">
            {selectedRun ? '✅ No anomalies detected in the selected run.' : 'Select a completed run above to scan for anomalies.'}
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
            {anomalies.map(a => (
              <div
                key={a.id}
                className={`rounded-xl border p-4 flex gap-4 items-start ${SEVERITY_COLORS[a.severity] || 'bg-white/5 border-white/10 text-white/70'}`}
              >
                <div className="text-xl shrink-0">{ANOMALY_ICON[a.type] || '⚠️'}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[a.severity]} shrink-0`} />
                    <span className="font-bold text-xs uppercase tracking-wider">{a.type.replace(/_/g, ' ')}</span>
                    <span className="text-xs opacity-60">{new Date(a.timestamp_local).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    <span className="ml-auto text-xs font-mono opacity-70">val={a.value.toFixed(3)}</span>
                  </div>
                  <p className="text-xs opacity-80 leading-relaxed">{a.explanation}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── SECTION 4: AI Recommendations ── */}
      <section className="bg-[#0A1628] border border-[#1E293B] rounded-2xl p-6 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              💡 AI Recommendations
            </h2>
            <p className="text-white/40 text-xs mt-0.5">Pattern-based personalized insights ranked by impact</p>
          </div>
          {totalRecSaving > 0 && (
            <div className="bg-emerald-500/15 border border-emerald-500/30 rounded-lg px-4 py-2 text-emerald-300 text-sm font-bold">
              💰 Est. Total Savings: PKR {totalRecSaving.toLocaleString()}
            </div>
          )}
        </div>

        {loadingRecs ? (
          <div className="text-center py-8 text-white/30 text-sm">⏳ Analysing run patterns…</div>
        ) : recommendations.length === 0 ? (
          <div className="text-center py-8 text-white/30 text-sm">
            {selectedRun ? 'No recommendations generated — run may be optimal already.' : 'Select a completed run to generate recommendations.'}
          </div>
        ) : (
          <div className="space-y-4">
            {recommendations.map(rec => (
              <div
                key={rec.id}
                className="bg-white/4 hover:bg-white/6 border border-white/8 rounded-xl p-5 transition-all duration-200 group"
              >
                <div className="flex items-start gap-4">
                  <div className="text-2xl shrink-0">{CATEGORY_ICON[rec.category] || '📊'}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${PRIORITY_COLORS[rec.priority]}`}>
                        {rec.priority}
                      </span>
                      <h3 className="font-bold text-white text-sm">{rec.title}</h3>
                    </div>
                    <p className="text-white/60 text-xs leading-relaxed mb-3">{rec.description}</p>
                    <div className="flex items-center gap-4 flex-wrap text-xs">
                      {rec.estimated_saving_pkr > 0 && (
                        <span className="text-emerald-400 font-semibold">
                          💰 PKR {rec.estimated_saving_pkr.toLocaleString()} potential saving
                        </span>
                      )}
                      {/* Confidence bar */}
                      <span className="flex items-center gap-1.5 text-white/40">
                        <span>Confidence:</span>
                        <div className="w-20 h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${rec.confidence > 80 ? 'bg-emerald-500' : rec.confidence > 60 ? 'bg-yellow-500' : 'bg-orange-500'}`}
                            style={{ width: `${rec.confidence}%` }}
                          />
                        </div>
                        <span>{rec.confidence}%</span>
                      </span>
                      <span className="text-white/30 italic">{rec.supporting_stat}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
