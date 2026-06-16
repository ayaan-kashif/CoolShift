// file:///C:/Users/Hp/OneDrive/Desktop%202/CoolShift/CoolShift/frontend/src/app/page.tsx
'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import api from '../lib/api';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import AlertBanner from '../components/ui/AlertBanner';
import { generateAlerts } from '../lib/alerts';

interface Scenario {
  scenario_id: string;
  name: string;
  building_type: string;
  area_m2: number;
  comfort_min_c: number;
  comfort_max_c: number;
  interval_count: number;
  run_count: number;
}

interface HealthData {
  status: string;
  database: {
    scenarios: number;
    intervals: number;
    runs: number;
  };
}

export default function Dashboard() {
  const router = useRouter();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null); // scenario_id
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [activeAlerts, setActiveAlerts] = useState<any[]>([]);
  const [demoLoading, setDemoLoading] = useState(false);

  const fetchData = async () => {
    try {
      const [scenariosRes, healthRes, runsRes] = await Promise.all([
        api.get('/api/v1/scenarios'),
        api.get('/api/v1/health'),
        api.get('/api/v1/runs'),
      ]);
      setScenarios(scenariosRes.data);
      setHealth(healthRes.data);

      const completeRuns = runsRes.data.filter((r: any) => r.status === 'complete');
      if (completeRuns.length > 0) {
        const latestRun = completeRuns[0];
        try {
          const scheduleRes = await api.get(`/api/v1/runs/${latestRun.run_id}/schedule?limit=96`);
          const alertsList = generateAlerts(scheduleRes.data.data, null, []);
          setActiveAlerts(alertsList.slice(0, 4));
        } catch (err) {
          console.error('Failed to load alerts for dashboard:', err);
        }
      }
    } catch (err: any) {
      console.error(err);
      setAlert({
        type: 'error',
        message: err.response?.data?.error || 'Failed to fetch dashboard data.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleRunBaseline = async (scenarioId: string) => {
    setActionLoading(scenarioId);
    setAlert(null);
    try {
      const res = await api.post(`/api/v1/baseline/${scenarioId}`, {});
      setAlert({
        type: 'success',
        message: `Baseline run executed successfully! Run ID: ${res.data.run_id}`,
      });
      fetchData();
    } catch (err: any) {
      setAlert({
        type: 'error',
        message: err.response?.data?.error || 'Failed to run baseline simulation.',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteScenario = async (scenarioId: string) => {
    if (!confirm('Are you sure you want to delete this scenario and all associated data?')) return;
    setAlert(null);
    try {
      await api.delete(`/api/v1/scenarios/${scenarioId}`);
      setAlert({
        type: 'success',
        message: 'Scenario deleted successfully.',
      });
      fetchData();
    } catch (err: any) {
      setAlert({
        type: 'error',
        message: err.response?.data?.error || 'Failed to delete scenario.',
      });
    }
  };

  const handleDuplicateScenario = async (scenarioId: string) => {
    setActionLoading(scenarioId);
    setAlert(null);
    try {
      // 1. Fetch scenario details
      const detailRes = await api.get(`/api/v1/scenarios/${scenarioId}`);
      const { profile, appliances, energy_assets } = detailRes.data;

      // 2. Clone scenario details
      const newName = `${profile.name} (Copy)`;
      const newScenarioId = `scen_${newName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${Math.random()
        .toString(36)
        .slice(2, 7)}`;

      const payload = {
        profile: {
          ...profile,
          name: newName,
          scenario_id: newScenarioId,
          vulnerable_occupants: profile.vulnerable_occupants ? 1 : 0,
        },
        appliances: appliances.map((app: any) => ({
          appliance_type: app.appliance_type,
          quantity: app.quantity,
          rated_power_kw: app.rated_power_kw,
          cooling_capacity_kw: app.cooling_capacity_kw,
          efficiency_label: app.efficiency_label,
          min_runtime_minutes: app.min_runtime_minutes,
          min_setpoint_c: app.min_setpoint_c,
          max_setpoint_c: app.max_setpoint_c,
        })),
        energy_assets: energy_assets ? {
          solar_capacity_kw: energy_assets.solar_capacity_kw,
          solar_conversion_efficiency: energy_assets.solar_conversion_efficiency,
          battery_capacity_kwh: energy_assets.battery_capacity_kwh,
          initial_soc_kwh: energy_assets.initial_soc_kwh,
          minimum_reserve_kwh: energy_assets.minimum_reserve_kwh,
          max_charge_kw: energy_assets.max_charge_kw,
          max_discharge_kw: energy_assets.max_discharge_kw,
          charge_efficiency: energy_assets.charge_efficiency,
          discharge_efficiency: energy_assets.discharge_efficiency,
        } : null,
      };

      // 3. Post to create cloned scenario
      await api.post('/api/v1/scenarios', payload);
      setAlert({
        type: 'success',
        message: `✅ Scenario duplicated successfully as "${newName}"!`,
      });
      fetchData();
    } catch (err: any) {
      console.error(err);
      setAlert({
        type: 'error',
        message: err.response?.data?.error || 'Failed to duplicate scenario.',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleTriggerDemoMode = async () => {
    setDemoLoading(true);
    setAlert(null);
    try {
      const res = await api.get('/api/v1/scenarios');
      const activeScenarios = res.data;
      if (activeScenarios.length === 0) {
        setAlert({
          type: 'error',
          message: 'No scenario profiles available. Please create or import scenarios first.',
        });
        return;
      }

      // Run baseline and optimization for all scenarios
      for (const s of activeScenarios) {
        if (s.interval_count > 0) {
          await api.post(`/api/v1/baseline/${s.scenario_id}`, {});
          await api.post(`/api/v1/optimize/${s.scenario_id}`, {
            weights: { cost: 0.4, emissions: 0.3, comfort: 0.2, peak: 0.1 }
          });
        }
      }

      setAlert({
        type: 'success',
        message: '🚀 Live Demo Mode activated! Baseline and optimization runs generated successfully for all scenario profiles.',
      });
      fetchData();
    } catch (err: any) {
      console.error(err);
      setAlert({
        type: 'error',
        message: err.response?.data?.error || 'Failed to trigger demo mode.',
      });
    } finally {
      setDemoLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center h-[80vh] gap-4">
        <LoadingSpinner size={12} />
        <span className="text-white/60">Loading CoolShift Dashboard...</span>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
            CoolShift <span className="text-xs bg-emerald-500/20 text-[#00d4aa] border border-emerald-500/30 px-2 py-0.5 rounded-full">v1.2 LP</span>
          </h1>
          <p className="text-white/60 text-sm mt-1">Intelligent Cooling & Load-Shedding Optimization Platform</p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="primary"
            onClick={handleTriggerDemoMode}
            loading={demoLoading}
            className="bg-purple-600 hover:bg-purple-700 text-white shadow-[0_0_15px_rgba(147,51,234,0.4)]"
            type="button"
          >
            ⚡ Live Demo Mode
          </Button>
          <Link href="/import">
            <Button variant="secondary">📁 Import Weather & Tariff</Button>
          </Link>
          <Link href="/scenarios/new">
            <Button variant="primary">⚙️ Create Scenario</Button>
          </Link>
        </div>
      </div>

      {alert && (
        <AlertBanner
          type={alert.type}
          message={alert.message}
          onClose={() => setAlert(null)}
        />
      )}

      {/* Active Alerts Banners */}
      {activeAlerts.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-bold text-red-400 flex items-center gap-1.5 uppercase tracking-wider">
            <span>🚨</span> Active Operational Warnings
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeAlerts.map((alt) => (
              <div
                key={alt.id}
                className={`p-4 rounded-xl border flex gap-3 items-start backdrop-blur-md transition-all ${
                  alt.type === 'danger'
                    ? 'bg-red-500/10 border-red-500/20 text-red-200 shadow-[0_0_15px_rgba(239,68,68,0.1)]'
                    : alt.type === 'warning'
                    ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-200'
                    : 'bg-blue-500/10 border-blue-500/20 text-blue-200'
                }`}
              >
                <div className="text-base">{alt.type === 'danger' ? '🚨' : alt.type === 'warning' ? '⚠️' : '🔌'}</div>
                <div className="space-y-1">
                  <h4 className="font-bold text-xs uppercase tracking-wide">{alt.title}</h4>
                  <p className="text-xs text-white/70">{alt.message}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="hover-glow transition-all duration-300">
          <p className="text-xs text-white/50 font-medium uppercase tracking-wider">Total Scenarios</p>
          <p className="text-3xl font-bold mt-2 text-white">{health?.database?.scenarios || 0}</p>
        </Card>
        <Card className="hover-glow transition-all duration-300">
          <p className="text-xs text-white/50 font-medium uppercase tracking-wider">Total Runs</p>
          <p className="text-3xl font-bold mt-2 text-white">{health?.database?.runs || 0}</p>
        </Card>
        <Card className="hover-glow transition-all duration-300">
          <p className="text-xs text-white/50 font-medium uppercase tracking-wider">Intervals Seeded</p>
          <p className="text-3xl font-bold mt-2 text-white">{health?.database?.intervals?.toLocaleString() || 0}</p>
        </Card>
        <Card className="hover-glow transition-all duration-300">
          <p className="text-xs text-white/50 font-medium uppercase tracking-wider">System Status</p>
          <div className="flex items-center gap-2 mt-3">
            <span className="w-2.5 h-2.5 rounded-full bg-[#00d4aa] animate-ping" />
            <span className="text-xl font-semibold capitalize text-[#00d4aa]">
              {health?.status === 'ok' ? 'Healthy' : 'Degraded'}
            </span>
          </div>
        </Card>
      </div>

      {/* Scenarios Section */}
      <Card className="p-6">
        <h2 className="text-xl font-bold text-white mb-6">Building & Scenario Profiles</h2>
        {scenarios.length === 0 ? (
          <div className="text-center py-12 space-y-4">
            <div className="text-4xl">🏢</div>
            <p className="text-white/60">No scenarios found in the system database.</p>
            <div className="flex justify-center gap-4">
              <Link href="/import">
                <Button variant="primary">Import CSV/XLSX Template</Button>
              </Link>
              <Link href="/scenarios/new">
                <Button variant="secondary">Configure Manually</Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-white/50 text-xs font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">Name</th>
                  <th className="py-3 px-4">Building Type</th>
                  <th className="py-3 px-4">Area (m²)</th>
                  <th className="py-3 px-4">Comfort Range</th>
                  <th className="py-3 px-4">Intervals</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-sm text-white/90">
                {scenarios.map((s) => (
                  <tr key={s.scenario_id} className="hover:bg-white/5 transition-colors">
                    <td className="py-4 px-4 font-medium">{s.name}</td>
                    <td className="py-4 px-4">
                      <Badge color="warning">{s.building_type}</Badge>
                    </td>
                    <td className="py-4 px-4">{s.area_m2} m²</td>
                    <td className="py-4 px-4">
                      {s.comfort_min_c}°C – {s.comfort_max_c}°C
                    </td>
                    <td className="py-4 px-4">
                      {s.interval_count > 0 ? (
                        <span className="text-[#00d4aa]">{s.interval_count}</span>
                      ) : (
                        <span className="text-[#ef4444] font-medium flex items-center gap-1">
                          ⚠️ Need Import
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-4 text-right space-x-2">
                      {s.interval_count > 0 ? (
                        <>
                          <Button
                            variant="secondary"
                            onClick={() => handleRunBaseline(s.scenario_id)}
                            disabled={actionLoading !== null}
                            loading={actionLoading === s.scenario_id}
                            className="text-xs"
                          >
                            Run Baseline
                          </Button>
                          <Link href={`/optimize?scenario_id=${s.scenario_id}`}>
                            <Button variant="primary" className="text-xs">
                              Run Optimizer
                            </Button>
                          </Link>
                        </>
                      ) : (
                        <Link href={`/import?scenario_id=${s.scenario_id}`}>
                          <Button variant="secondary" className="text-xs">
                            Import Data
                          </Button>
                        </Link>
                      )}
                      <Link href={`/runs?scenario_id=${s.scenario_id}`}>
                        <Button variant="secondary" className="text-xs px-2.5">
                          👁️ View Runs
                        </Button>
                      </Link>
                      <button
                        onClick={() => handleDuplicateScenario(s.scenario_id)}
                        disabled={actionLoading !== null}
                        className="text-teal-400 hover:text-teal-300 font-semibold text-xs ml-2 hover:underline"
                      >
                        Duplicate
                      </button>
                      <button
                        onClick={() => handleDeleteScenario(s.scenario_id)}
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
