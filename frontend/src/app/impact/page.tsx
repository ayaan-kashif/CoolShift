// file:///C:/Users/Hp/OneDrive/Desktop%202/CoolShift/CoolShift/frontend/src/app/impact/page.tsx
'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '../../lib/api';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import AlertBanner from '../../components/ui/AlertBanner';
import Badge from '../../components/ui/Badge';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from 'recharts';

interface AggregatedImpact {
  totalCostSavedPkr: number;
  avgCostSavedPct: number;
  totalEmissionsSavedKg: number;
  totalSolarUsedKwh: number;
  totalGridReducedKwh: number;
  totalRunsCount: number;
  treesPlantedEquivalent: number;
  carKmEquivalent: number;
  scenarioImpactData: any[];
  pieData: any[];
  cumulativeData: any[];
}

export default function SDGImpactPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [impact, setImpact] = useState<AggregatedImpact | null>(null);

  const fetchAllImpactData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch all runs
      const runsRes = await api.get('/api/v1/runs');
      const completeRuns = runsRes.data.filter((r: any) => r.status === 'complete');

      if (completeRuns.length === 0) {
        setImpact({
          totalCostSavedPkr: 0,
          avgCostSavedPct: 0,
          totalEmissionsSavedKg: 0,
          totalSolarUsedKwh: 0,
          totalGridReducedKwh: 0,
          totalRunsCount: 0,
          treesPlantedEquivalent: 0,
          carKmEquivalent: 0,
          scenarioImpactData: [],
          pieData: [],
          cumulativeData: [],
        });
        return;
      }

      // Fetch compare stats for all complete runs in parallel
      const comparisons = await Promise.all(
        completeRuns.map(async (run: any) => {
          try {
            const compareRes = await api.get(`/api/v1/runs/${run.run_id}/compare`);
            return {
              run_id: run.run_id,
              scenario_name: run.scenario_name || run.scenario_id,
              savings: compareRes.data.savings,
              optimized: compareRes.data.optimized,
              baseline: compareRes.data.baseline,
              created_at: run.created_at,
            };
          } catch (e) {
            console.error(`Failed to fetch comparison for ${run.run_id}`, e);
            return null;
          }
        })
      );

      const validComparisons = comparisons.filter(Boolean);

      let totalCostSavedPkr = 0;
      let totalCostPctSum = 0;
      let totalEmissionsSavedKg = 0;
      let totalSolarUsedKwh = 0;
      let totalGridReducedKwh = 0;

      // Grouped metrics by Scenario
      const scenarioMap = new Map<string, { name: string; grid: number; solar: number; pkrSaved: number }>();

      // Cumulative data prep sorted by creation date
      const sortedRuns = [...validComparisons].sort(
        (a, b) => new Date(a!.created_at).getTime() - new Date(b!.created_at).getTime()
      );

      let cumulativePkr = 0;
      const cumulativeData = sortedRuns.map((r, idx) => {
        cumulativePkr += r!.savings.cost_pkr;
        return {
          name: `Run ${idx + 1}`,
          pkr: Math.round(cumulativePkr),
        };
      });

      validComparisons.forEach((item: any) => {
        totalCostSavedPkr += item.savings.cost_pkr;
        totalCostPctSum += item.savings.cost_pct;
        totalEmissionsSavedKg += item.savings.emissions_kgco2e;
        totalSolarUsedKwh += item.optimized.total_solar_energy_kwh;
        totalGridReducedKwh += item.savings.grid_energy_kwh;

        const scenKey = item.scenario_name;
        if (!scenarioMap.has(scenKey)) {
          scenarioMap.set(scenKey, { name: scenKey, grid: 0, solar: 0, pkrSaved: 0 });
        }
        const data = scenarioMap.get(scenKey)!;
        data.grid += item.optimized.total_grid_energy_kwh;
        data.solar += item.optimized.total_solar_energy_kwh;
        data.pkrSaved += item.savings.cost_pkr;
      });

      const scenarioImpactData = Array.from(scenarioMap.values()).map((s) => ({
        name: s.name.substring(0, 15),
        "Grid Energy (kWh)": Math.round(s.grid),
        "Solar Energy (kWh)": Math.round(s.solar),
        pkrSaved: Math.round(s.pkrSaved),
      }));

      const avgCostSavedPct = totalCostPctSum / validComparisons.length;
      const treesPlantedEquivalent = totalEmissionsSavedKg / 21; // 1 tree absorbs ~21kg CO2/year
      const carKmEquivalent = totalEmissionsSavedKg / 0.21; // ~0.21kg CO2 per km

      // Donut Pie chart data: solar vs grid Draw
      const totalEnergy = totalSolarUsedKwh + (totalGridReducedKwh > 0 ? totalGridReducedKwh : 100); // placeholder
      const cleanPct = totalEnergy > 0 ? (totalSolarUsedKwh / (totalSolarUsedKwh + totalGridReducedKwh + 1)) * 100 : 0;
      const pieData = [
        { name: 'Clean Solar Energy', value: Math.round(totalSolarUsedKwh), color: '#00d4aa' },
        { name: 'Grid Draw', value: Math.max(0, Math.round(totalGridReducedKwh)), color: '#3b82f6' },
      ];

      setImpact({
        totalCostSavedPkr,
        avgCostSavedPct,
        totalEmissionsSavedKg,
        totalSolarUsedKwh,
        totalGridReducedKwh,
        totalRunsCount: validComparisons.length,
        treesPlantedEquivalent,
        carKmEquivalent,
        scenarioImpactData,
        pieData,
        cumulativeData,
      });
    } catch (err: any) {
      console.error(err);
      setError('Failed to aggregate SDG impact parameters.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllImpactData();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center h-[80vh] gap-4">
        <LoadingSpinner size={12} />
        <span className="text-white/60">Aggregating SDG climate outcomes...</span>
      </div>
    );
  }

  const COLORS = ['#00d4aa', '#3b82f6'];
  const totalEnergy = impact ? impact.totalSolarUsedKwh + impact.totalGridReducedKwh : 0;
  const cleanPct = (totalEnergy > 0 && impact) ? (impact.totalSolarUsedKwh / totalEnergy) * 100 : 0;

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
          🌍 SDG Climate & Affordability Impact
        </h1>
        <p className="text-white/60 text-sm mt-1">
          Real-time tracking of UN SDG-7 (Affordable & Clean Energy) and SDG-13 (Climate Action) outcomes.
        </p>
      </div>

      {error && <AlertBanner type="error" message={error} onClose={() => setError(null)} />}

      {impact && impact.totalRunsCount === 0 ? (
        <Card className="p-12 text-center space-y-4">
          <div className="text-5xl">🌿</div>
          <h2 className="text-xl font-bold text-white">No SDG Impact Data Available</h2>
          <p className="text-white/60 max-w-md mx-auto text-sm">
            Run baseline and optimization simulations first to track financial and environmental metrics.
          </p>
          <Link href="/optimize">
            <Button variant="primary">Go to Optimizer</Button>
          </Link>
        </Card>
      ) : (
        impact && (
          <>
            {/* SDG Badges & Statements */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-emerald-950/20 border border-emerald-500/30 p-6 rounded-2xl space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">⚡</span>
                  <h3 className="text-base font-bold text-[#00d4aa]">SDG-7: Affordable & Clean Energy</h3>
                </div>
                <p className="text-xs text-white/70 leading-relaxed">
                  Platform reduces utility costs by an average of <strong>{impact.avgCostSavedPct.toFixed(1)}%</strong> through intelligent load shifting, pre-cooling schedules, and localized battery dispatch. This directly supports small clinics, schools, and low-income households in Pakistan facing extreme grid tariffs.
                </p>
                <div className="text-xs text-[#00d4aa] font-bold">
                  ✓ Cost Reduction Achieved | ✓ Clean Local Solar Utilized
                </div>
              </div>

              <div className="bg-teal-950/20 border border-teal-500/30 p-6 rounded-2xl space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">🌱</span>
                  <h3 className="text-base font-bold text-teal-300">SDG-13: Climate Action</h3>
                </div>
                <p className="text-xs text-white/70 leading-relaxed">
                  By maximizing clean solar usage during peak solar noon and pre-cooling buildings during off-peak hours, CoolShift has successfully avoided <strong>{Math.round(impact.totalEmissionsSavedKg).toLocaleString()} kgCO₂e</strong> of carbon emissions across all runs.
                </p>
                <div className="text-xs text-teal-300 font-bold">
                  ✓ Greenhouse Gas Reductions | ✓ Local Microclimate Mitigation
                </div>
              </div>
            </div>

            {/* Impact Big Number Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card className="hover-glow">
                <p className="text-xs text-white/50 font-bold uppercase">Total Money Kept in Pockets</p>
                <p className="text-3xl font-bold text-[#00d4aa] mt-2">
                  PKR {Math.round(impact.totalCostSavedPkr).toLocaleString()}
                </p>
                <p className="text-[10px] text-white/40 mt-1">
                  Saved across {impact.totalRunsCount} optimization runs.
                </p>
              </Card>

              <Card className="hover-glow">
                <p className="text-xs text-white/50 font-bold uppercase">Carbon Emissions Avoided</p>
                <p className="text-3xl font-bold text-[#00d4aa] mt-2">
                  {Math.round(impact.totalEmissionsSavedKg).toLocaleString()} kg
                </p>
                <p className="text-[10px] text-white/40 mt-1">
                  CO₂e greenhouse gases kept out of the atmosphere.
                </p>
              </Card>

              <Card className="hover-glow">
                <p className="text-xs text-white/50 font-bold uppercase">Equiv. Trees Planted</p>
                <p className="text-3xl font-bold text-[#00d4aa] mt-2">
                  {Math.round(impact.treesPlantedEquivalent).toLocaleString()}
                </p>
                <p className="text-[10px] text-white/40 mt-1">
                  Annual absorption capacity equivalent (21kg/tree).
                </p>
              </Card>

              <Card className="hover-glow">
                <p className="text-xs text-white/50 font-bold uppercase">Clean Solar Utilized</p>
                <p className="text-3xl font-bold text-[#00d4aa] mt-2">
                  {Math.round(impact.totalSolarUsedKwh).toLocaleString()} kWh
                </p>
                <p className="text-[10px] text-white/40 mt-1">
                  Clean energy generated and consumed locally.
                </p>
              </Card>
            </div>

            {/* Equivalents Panel */}
            <Card className="p-6 border-emerald-500/20 bg-emerald-950/5">
              <h3 className="text-base font-bold text-white mb-4">🌍 What Does This Impact Mean?</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm text-white/80">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">🏠</span>
                  <div>
                    <p className="font-semibold text-white">Household Affordability</p>
                    <p className="text-xs text-white/60 mt-0.5">
                      The saved funds could run a typical school's cooling systems for <strong>{Math.round(impact.totalCostSavedPkr / 1500)}</strong> days.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-3xl">🚗</span>
                  <div>
                    <p className="font-semibold text-white">Car Miles Avoided</p>
                    <p className="text-xs text-white/60 mt-0.5">
                      Avoided emissions are equivalent to not driving a gasoline vehicle for <strong>{Math.round(impact.carKmEquivalent).toLocaleString()}</strong> kilometers.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-3xl">🔋</span>
                  <div>
                    <p className="font-semibold text-white">Grid Draw Reduction</p>
                    <p className="text-xs text-white/60 mt-0.5">
                      Reduced grid demand by <strong>{Math.round(impact.totalGridReducedKwh).toLocaleString()}</strong> kWh, mitigating local blackouts.
                    </p>
                  </div>
                </div>
              </div>
            </Card>

            {/* Visual Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Chart 1: Cumulative Saved */}
              <Card className="p-6 lg:col-span-2">
                <h3 className="text-sm font-bold text-white mb-4">Cumulative PKR Saved Over Time</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={impact.cumulativeData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="name" stroke="rgba(255,255,255,0.4)" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} />
                      <YAxis stroke="rgba(255,255,255,0.4)" tick={{ fill: 'rgba(255,255,255,0.4)' }} />
                      <Tooltip contentStyle={{ backgroundColor: '#0a0f1e', borderColor: 'rgba(255,255,255,0.1)', color: 'white' }} />
                      <Line type="monotone" dataKey="pkr" stroke="#00d4aa" name="Total Saved (PKR)" strokeWidth={3} dot={{ fill: '#00d4aa', r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              {/* Chart 2: Clean energy ratio */}
              <Card className="p-6 flex flex-col justify-between">
                <h3 className="text-sm font-bold text-white mb-2">Clean Energy Utilization Ratio</h3>
                <div className="h-48 flex justify-center items-center relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={impact.pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {impact.pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: '#0a0f1e', borderColor: 'rgba(255,255,255,0.1)', color: 'white' }} />
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Center percentage label */}
                  <div className="absolute flex flex-col items-center justify-center">
                    <span className="text-2xl font-bold text-white">
                      {totalEnergy > 0 ? Math.round(cleanPct) : 0}%
                    </span>
                    <span className="text-[10px] text-white/40 uppercase font-semibold">Clean Solar</span>
                  </div>
                </div>
                <div className="flex justify-around text-xs border-t border-white/5 pt-4">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-[#00d4aa]" />
                    <div>
                      <p className="text-white/50">Clean Solar</p>
                      <p className="font-bold text-white">{Math.round(impact.totalSolarUsedKwh).toLocaleString()} kWh</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-[#3b82f6]" />
                    <div>
                      <p className="text-white/50">Grid Power</p>
                      <p className="font-bold text-white">{Math.round(impact.totalGridReducedKwh).toLocaleString()} kWh</p>
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            {/* Chart 3: Grid vs Solar per Scenario */}
            <Card className="p-6">
              <h3 className="text-sm font-bold text-white mb-4">Grid Draw vs Solar Generation per Scenario Profile</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={impact.scenarioImpactData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="name" stroke="rgba(255,255,255,0.4)" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} />
                    <YAxis stroke="rgba(255,255,255,0.4)" tick={{ fill: 'rgba(255,255,255,0.4)' }} />
                    <Tooltip contentStyle={{ backgroundColor: '#0a0f1e', borderColor: 'rgba(255,255,255,0.1)', color: 'white' }} />
                    <Legend />
                    <Bar dataKey="Solar Energy (kWh)" fill="#00d4aa" stackId="a" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="Grid Energy (kWh)" fill="#3b82f6" stackId="a" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </>
        )
      )}
    </div>
  );
}
