// file:///C:/Users/Hp/OneDrive/Desktop%202/CoolShift/CoolShift/frontend/src/app/optimize/page.tsx
'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import api from '../../lib/api';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import AlertBanner from '../../components/ui/AlertBanner';
import Badge from '../../components/ui/Badge';
import { useCoolShiftStore } from '../../lib/store';

function OptimizeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const scenarioIdFromUrl = searchParams.get('scenario_id');

  const {
    scenarios,
    selectedScenarioId,
    weights,
    lastRunResult,
    setScenarios,
    setSelectedScenario,
    setWeights,
    setLastRunResult,
  } = useCoolShiftStore();

  const [loadingScenarios, setLoadingScenarios] = useState(true);
  const [running, setRunning] = useState(false);
  const [runMode, setRunMode] = useState<'baseline' | 'optimization' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Optional custom dates
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Load scenarios
  useEffect(() => {
    const fetchScenarios = async () => {
      try {
        const res = await api.get('/api/v1/scenarios');
        setScenarios(res.data);
        if (res.data.length > 0) {
          if (scenarioIdFromUrl && res.data.some((s: any) => s.scenario_id === scenarioIdFromUrl)) {
            setSelectedScenario(scenarioIdFromUrl);
          } else if (!selectedScenarioId) {
            setSelectedScenario(res.data[0].scenario_id);
          }
        }
      } catch (err: any) {
        setError('Failed to load scenarios.');
      } finally {
        setLoadingScenarios(false);
      }
    };
    fetchScenarios();
  }, [scenarioIdFromUrl]);

  // Update URL query parameter when selectedScenarioId changes
  useEffect(() => {
    if (selectedScenarioId) {
      const currentParams = new URLSearchParams(window.location.search);
      if (currentParams.get('scenario_id') !== selectedScenarioId) {
        currentParams.set('scenario_id', selectedScenarioId);
        router.replace(`/optimize?${currentParams.toString()}`);
      }
    }
  }, [selectedScenarioId]);

  const handleSliderChange = (key: 'cost' | 'emissions' | 'comfort' | 'peak', value: number) => {
    setWeights({ [key]: value });
  };

  const weightSum = parseFloat((weights.cost + weights.emissions + weights.comfort + weights.peak).toFixed(2));
  const isWeightSumValid = Math.abs(weightSum - 1.0) < 0.01;

  const handleRun = async (mode: 'baseline' | 'optimization') => {
    if (!selectedScenarioId) {
      setError('Please select a scenario profile first.');
      return;
    }
    if (mode === 'optimization' && !isWeightSumValid) {
      setError('Objective weights must sum to exactly 1.0 to run optimization.');
      return;
    }

    setRunning(true);
    setRunMode(mode);
    setError(null);
    setSuccess(null);

    const body: any = {};
    if (startDate) body.window_start = startDate;
    if (endDate) body.window_end = endDate;

    if (mode === 'optimization') {
      body.weights = weights;
    }

    const endpoint = mode === 'baseline'
      ? `/api/v1/baseline/${selectedScenarioId}`
      : `/api/v1/optimize/${selectedScenarioId}`;

    try {
      const res = await api.post(endpoint, body);
      setLastRunResult(res.data);
      setSuccess(`${mode === 'baseline' ? 'Baseline simulation' : 'Optimization solver'} completed successfully!`);
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.error || 'Execution failed. Please verify the scenario setup and try again.');
    } finally {
      setRunning(false);
      setRunMode(null);
    }
  };

  if (loadingScenarios) {
    return (
      <div className="flex flex-col justify-center items-center h-[60vh] gap-4">
        <LoadingSpinner size={10} />
        <span className="text-white/60">Loading scenario profiles...</span>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-white">Cooling Solver Optimizer</h1>
        <p className="text-white/60 text-sm mt-1">
          Select a building scenario and tune the Linear Programming solver constraints to optimize costs and emissions.
        </p>
      </div>

      {error && (
        <AlertBanner
          type="error"
          message={error}
          onClose={() => setError(null)}
        />
      )}

      {success && (
        <AlertBanner
          type="success"
          message={success}
          onClose={() => setSuccess(null)}
        />
      )}

      {running ? (
        <Card className="p-12 flex flex-col items-center justify-center gap-6 min-h-[300px]">
          <LoadingSpinner size={14} />
          <div className="text-center">
            <h2 className="text-lg font-bold text-white">
              {runMode === 'baseline' ? 'Running Baseline Simulation...' : 'Solving LP Matrix Optimization...'}
            </h2>
            <p className="text-sm text-white/50 mt-1">This process can take 5-15 seconds depending on data size.</p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Form Side */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="p-6 space-y-6">
              <h2 className="text-lg font-bold text-white">Optimization Parameters</h2>

              {/* Scenario Selector */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">Select Scenario</label>
                <select
                  value={selectedScenarioId || ''}
                  onChange={(e) => setSelectedScenario(e.target.value)}
                  className="input-field"
                >
                  {scenarios.map((s) => (
                    <option key={s.scenario_id} value={s.scenario_id} className="bg-[#0a0f1e] text-white">
                      {s.name} ({s.building_type})
                    </option>
                  ))}
                </select>
              </div>

              {/* Custom Date Range */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">Start Date (Optional)</label>
                  <input
                    type="datetime-local"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="input-field"
                    placeholder="YYYY-MM-DD HH:MM"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">End Date (Optional)</label>
                  <input
                    type="datetime-local"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="input-field"
                    placeholder="YYYY-MM-DD HH:MM"
                  />
                </div>
              </div>
            </Card>

            {/* Weights Sliders */}
            <Card className="p-6 space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-bold text-white">Objective Weight Tuning</h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/60">Sum:</span>
                  <span
                    className={`font-mono text-sm px-2 py-0.5 rounded-md ${
                      isWeightSumValid ? 'bg-emerald-500/20 text-[#00d4aa]' : 'bg-red-500/20 text-red-400'
                    }`}
                  >
                    {weightSum.toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="space-y-4">
                {/* Cost Weight */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-white/80 font-medium">PKR Tariff Cost</span>
                    <span className="font-mono text-[#00d4aa]">{weights.cost.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={weights.cost}
                    onChange={(e) => handleSliderChange('cost', parseFloat(e.target.value))}
                    className="w-full accent-[#00d4aa] bg-white/10 rounded-lg h-2 cursor-pointer"
                  />
                </div>

                {/* Emissions Weight */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-white/80 font-medium">Carbon Emissions (CO₂e)</span>
                    <span className="font-mono text-[#00d4aa]">{weights.emissions.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={weights.emissions}
                    onChange={(e) => handleSliderChange('emissions', parseFloat(e.target.value))}
                    className="w-full accent-[#00d4aa] bg-white/10 rounded-lg h-2 cursor-pointer"
                  />
                </div>

                {/* Comfort Compliance Weight */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-white/80 font-medium">Thermal Comfort Boundary</span>
                    <span className="font-mono text-[#00d4aa]">{weights.comfort.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={weights.comfort}
                    onChange={(e) => handleSliderChange('comfort', parseFloat(e.target.value))}
                    className="w-full accent-[#00d4aa] bg-white/10 rounded-lg h-2 cursor-pointer"
                  />
                </div>

                {/* Peak Demand Weight */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-white/80 font-medium">Peak Grid Demand (kW)</span>
                    <span className="font-mono text-[#00d4aa]">{weights.peak.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={weights.peak}
                    onChange={(e) => handleSliderChange('peak', parseFloat(e.target.value))}
                    className="w-full accent-[#00d4aa] bg-white/10 rounded-lg h-2 cursor-pointer"
                  />
                </div>
              </div>

              <div className="flex gap-4 pt-4 border-t border-white/10">
                <Button
                  variant="secondary"
                  onClick={() => handleRun('baseline')}
                  className="flex-1"
                  type="button"
                >
                  Run Baseline
                </Button>
                <Button
                  variant="primary"
                  onClick={() => handleRun('optimization')}
                  disabled={!isWeightSumValid}
                  className="flex-1"
                  type="button"
                >
                  Run Optimization
                </Button>
              </div>
            </Card>
          </div>

          {/* Results Side */}
          <div className="space-y-6">
            <Card className="p-6 h-full flex flex-col justify-between">
              <div>
                <h2 className="text-lg font-bold text-white mb-6">Optimization Results</h2>
                {lastRunResult ? (
                  <div className="space-y-4">
                    <div>
                      <span className="text-xs text-white/50 block">Evaluation Run ID</span>
                      <span className="font-mono text-sm break-all text-white">{lastRunResult.run_id}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 border-t border-white/10 pt-4">
                      <div>
                        <span className="text-xs text-white/50 block">Total PKR Cost</span>
                        <span className="text-xl font-bold text-white">
                          PKR {Math.round(lastRunResult.total_cost_pkr).toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs text-white/50 block">Emissions</span>
                        <span className="text-xl font-bold text-white">
                          {Math.round(lastRunResult.total_emissions_kgco2e)} kg
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 border-t border-white/10 pt-4">
                      <div>
                        <span className="text-xs text-white/50 block">Grid Energy</span>
                        <span className="text-lg font-bold text-white">
                          {Math.round(lastRunResult.total_grid_energy_kwh)} kWh
                        </span>
                      </div>
                      <div>
                        <span className="text-xs text-white/50 block">Solar Energy</span>
                        <span className="text-lg font-bold text-white">
                          {Math.round(lastRunResult.total_solar_energy_kwh)} kWh
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 border-t border-white/10 pt-4">
                      <div>
                        <span className="text-xs text-white/50 block">Peak demand</span>
                        <span className="text-lg font-bold text-white">
                          {lastRunResult.peak_demand_kw.toFixed(1)} kW
                        </span>
                      </div>
                      <div>
                        <span className="text-xs text-white/50 block">Comfort compliance</span>
                        <span className="text-lg font-bold text-white">
                          {lastRunResult.comfort_compliance_pct.toFixed(1)}%
                        </span>
                      </div>
                    </div>

                    <div className="border-t border-white/10 pt-4">
                      <span className="text-xs text-white/50 block">Infeasible count</span>
                      <span
                        className={`text-lg font-bold ${
                          lastRunResult.infeasible_count > 0 ? 'text-[#ef4444]' : 'text-[#00d4aa]'
                        }`}
                      >
                        {lastRunResult.infeasible_count} intervals
                      </span>
                    </div>

                    <div className="border-t border-white/10 pt-4 text-xs text-white/40">
                      Duration: {lastRunResult.run_duration_seconds.toFixed(2)} seconds | Intervals:{' '}
                      {lastRunResult.total_intervals}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12 text-white/40 text-sm">
                    No run results available. Select parameters and run simulation above to populate solver outcomes.
                  </div>
                )}
              </div>

              {lastRunResult && (
                <div className="space-y-3 pt-6 border-t border-white/10 mt-6">
                  <Link href={`/runs/${lastRunResult.run_id}`}>
                    <Button variant="secondary" className="w-full">
                      View Full Schedule
                    </Button>
                  </Link>
                  <Link href={`/runs/${lastRunResult.run_id}/compare`}>
                    <Button variant="primary" className="w-full">
                      Compare vs Baseline
                    </Button>
                  </Link>
                </div>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

export default function OptimizePage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col justify-center items-center h-[60vh] gap-4">
        <LoadingSpinner size={10} />
        <span className="text-white/60">Loading optimize page...</span>
      </div>
    }>
      <OptimizeContent />
    </Suspense>
  );
}
