// file:///C:/Users/Hp/OneDrive/Desktop%202/CoolShift/CoolShift/frontend/src/app/runs/page.tsx
'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import api from '../../lib/api';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import AlertBanner from '../../components/ui/AlertBanner';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

interface Run {
  run_id: string;
  scenario_id: string;
  scenario_name: string;
  algorithm_version: string;
  objective_weights: string;
  evaluation_window_start: string;
  evaluation_window_end: string;
  run_duration_seconds: number;
  status: 'pending' | 'running' | 'complete' | 'failed';
  created_at: string;
  interval_count: number;
  // Dynamic fields loaded from summaries
  total_cost_pkr?: number;
  total_grid_energy_kwh?: number;
}

function RunsListContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const scenarioIdFromUrl = searchParams.get('scenario_id');

  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>(scenarioIdFromUrl || '');
  const [uniqueScenarios, setUniqueScenarios] = useState<{ id: string; name: string }[]>([]);

  const fetchRuns = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch all runs
      const res = await api.get('/api/v1/runs');
      const runsData: Run[] = res.data;

      // Extract unique scenarios for filter dropdown
      const scenarioMap = new Map<string, string>();
      runsData.forEach((run) => {
        if (run.scenario_id) {
          scenarioMap.set(run.scenario_id, run.scenario_name || run.scenario_id);
        }
      });
      setUniqueScenarios(
        Array.from(scenarioMap.entries()).map(([id, name]) => ({ id, name }))
      );

      // Fetch summaries for complete runs in parallel to populate chart metrics
      const completedRuns = runsData.filter((r) => r.status === 'complete');
      const summaries = await Promise.all(
        completedRuns.map(async (run) => {
          try {
            const summaryRes = await api.get(`/api/v1/runs/${run.run_id}/summary`);
            return {
              run_id: run.run_id,
              total_cost_pkr: summaryRes.data.total_cost_pkr,
              total_grid_energy_kwh: summaryRes.data.total_grid_energy_kwh,
            };
          } catch (e) {
            console.error(`Failed to fetch summary for run ${run.run_id}`, e);
            return null;
          }
        })
      );

      const summaryMap = new Map(
        summaries.filter(Boolean).map((s) => [s!.run_id, s!])
      );

      const runsWithSummary = runsData.map((run) => {
        const summ = summaryMap.get(run.run_id);
        return {
          ...run,
          total_cost_pkr: summ?.total_cost_pkr,
          total_grid_energy_kwh: summ?.total_grid_energy_kwh,
        };
      });

      setRuns(runsWithSummary);
    } catch (err: any) {
      console.error(err);
      setError('Failed to load runs history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRuns();
  }, []);

  const handleDeleteRun = async (runId: string) => {
    if (!confirm('Are you sure you want to delete this optimization run? This action is permanent.')) return;
    try {
      await api.delete(`/api/v1/runs/${runId}`);
      fetchRuns();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete optimization run.');
    }
  };

  // Filter runs by selected scenario
  const filteredRuns = selectedScenarioId
    ? runs.filter((r) => r.scenario_id === selectedScenarioId)
    : runs;

  // Prepare chart data for completed runs
  const chartData = filteredRuns
    .filter((r) => r.status === 'complete' && r.total_cost_pkr !== undefined)
    .slice(0, 10) // Show last 10 completed runs
    .reverse() // Chronological order
    .map((r) => ({
      name: `${r.scenario_name.substring(0, 12)} (${r.run_id.substring(0, 4)})`,
      cost: r.total_cost_pkr || 0,
      gridEnergy: r.total_grid_energy_kwh || 0,
    }));

  const handleScenarioFilterChange = (id: string) => {
    setSelectedScenarioId(id);
    const params = new URLSearchParams(window.location.search);
    if (id) {
      params.set('scenario_id', id);
    } else {
      params.delete('scenario_id');
    }
    router.replace(`/runs?${params.toString()}`);
  };

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center h-[80vh] gap-4">
        <LoadingSpinner size={12} />
        <span className="text-white/60">Loading Runs History Database...</span>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">Runs History & Logs</h1>
          <p className="text-white/60 text-sm mt-1">
            Browse solver execution runs, review performance comparisons, and manage output schedule datasets.
          </p>
        </div>
        <div className="flex gap-3 w-full md:w-auto">
          <select
            value={selectedScenarioId}
            onChange={(e) => handleScenarioFilterChange(e.target.value)}
            className="input-field py-2 text-xs w-full md:w-56"
          >
            <option value="">All Scenarios</option>
            {uniqueScenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <AlertBanner type="error" message={error} onClose={() => setError(null)} />}

      {/* Bar Chart comparing cost and energy */}
      {chartData.length > 0 && (
        <Card className="p-6">
          <h2 className="text-lg font-bold text-white mb-4">Solver Runs Performance Metrics</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" stroke="rgba(255,255,255,0.4)" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} />
                <YAxis yAxisId="left" stroke="rgba(255,255,255,0.4)" tick={{ fill: 'rgba(255,255,255,0.4)' }} label={{ value: 'Cost (PKR)', angle: -90, position: 'insideLeft', fill: 'rgba(255,255,255,0.4)' }} />
                <YAxis yAxisId="right" orientation="right" stroke="rgba(255,255,255,0.4)" tick={{ fill: 'rgba(255,255,255,0.4)' }} label={{ value: 'Grid (kWh)', angle: 90, position: 'insideRight', fill: 'rgba(255,255,255,0.4)' }} />
                <Tooltip contentStyle={{ backgroundColor: '#0a0f1e', borderColor: 'rgba(255,255,255,0.1)', color: 'white' }} />
                <Legend />
                <Bar yAxisId="left" dataKey="cost" fill="#00d4aa" name="Total Cost (PKR)" radius={[4, 4, 0, 0]} />
                <Bar yAxisId="right" dataKey="gridEnergy" fill="#3b82f6" name="Grid Draw (kWh)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Runs History Table */}
      <Card className="p-6">
        <h2 className="text-xl font-bold text-white mb-6">Execution Logs</h2>
        {filteredRuns.length === 0 ? (
          <div className="text-center py-12 text-white/50">
            No optimization runs found for the selected criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-white/50 text-xs font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">Run ID</th>
                  <th className="py-3 px-4">Scenario Profile</th>
                  <th className="py-3 px-4">Engine / Solver</th>
                  <th className="py-3 px-4">Time Window</th>
                  <th className="py-3 px-4">Duration</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-sm text-white/90">
                {filteredRuns.map((r) => (
                  <tr key={r.run_id} className="hover:bg-white/5 transition-colors">
                    <td className="py-4 px-4 font-mono text-xs">{r.run_id.substring(0, 8)}...</td>
                    <td className="py-4 px-4 font-medium">{r.scenario_name || r.scenario_id}</td>
                    <td className="py-4 px-4">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white/10 text-white">
                        {r.algorithm_version}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-xs text-white/70">
                      {new Date(r.evaluation_window_start).toLocaleDateString()} –{' '}
                      {new Date(r.evaluation_window_end).toLocaleDateString()}
                    </td>
                    <td className="py-4 px-4 font-mono text-xs">
                      {r.run_duration_seconds ? `${r.run_duration_seconds.toFixed(2)}s` : '—'}
                    </td>
                    <td className="py-4 px-4">
                      <Badge
                        color={
                          r.status === 'complete'
                            ? 'success'
                            : r.status === 'failed'
                            ? 'danger'
                            : 'primary'
                        }
                        className="capitalize text-xs"
                      >
                        {r.status}
                      </Badge>
                    </td>
                    <td className="py-4 px-4 text-right space-x-2">
                      {r.status === 'complete' && (
                        <>
                          <Link href={`/runs/${r.run_id}`}>
                            <Button variant="secondary" className="text-xs">
                              Schedule
                            </Button>
                          </Link>
                          <Link href={`/runs/${r.run_id}/compare`}>
                            <Button variant="primary" className="text-xs">
                              Compare
                            </Button>
                          </Link>
                        </>
                      )}
                      <button
                        onClick={() => handleDeleteRun(r.run_id)}
                        className="text-red-400 hover:text-red-300 font-semibold text-xs ml-2 hover:underline"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

export default function RunsListPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col justify-center items-center h-[80vh] gap-4">
        <LoadingSpinner size={12} />
        <span className="text-white/60">Loading runs history...</span>
      </div>
    }>
      <RunsListContent />
    </Suspense>
  );
}
