'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import api from '../../../../lib/api';
import Card from '../../../../components/ui/Card';
import Button from '../../../../components/ui/Button';
import LoadingSpinner from '../../../../components/ui/LoadingSpinner';
import AlertBanner from '../../../../components/ui/AlertBanner';
import Badge from '../../../../components/ui/Badge';
import HeatRiskHeatmap from '../../../../components/HeatRiskHeatmap';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  AreaChart,
  Area,
  BarChart,
  Bar,
  ReferenceLine,
  Cell,
} from 'recharts';

interface RunSummary {
  run_id: string;
  scenario_id: string;
  scenario_name: string;
  total_cost_pkr: number;
  total_grid_energy_kwh: number;
  total_solar_energy_kwh: number;
  total_emissions_kgco2e: number;
  peak_demand_kw: number;
  comfort_compliance_pct: number;
  total_intervals: number;
  infeasible_intervals: number;
  solar_utilization_pct: number;
  daily_summaries: {
    date: string;
    cost_pkr: number;
    grid_energy_kwh: number;
    solar_energy_kwh: number;
    emissions_kgco2e: number;
    peak_demand_kw: number;
    comfort_compliance_pct: number;
    avg_indoor_temp_c: number;
  }[];
}

interface ComparisonResult {
  baseline: RunSummary;
  optimized: RunSummary;
  savings: {
    cost_pkr: number;
    cost_pct: number;
    grid_energy_kwh: number;
    grid_energy_pct: number;
    emissions_kgco2e: number;
    emissions_pct: number;
    peak_demand_kw: number;
    peak_demand_pct: number;
  };
  infeasible_intervals: {
    timestamp_local: string;
    estimated_indoor_temp_c: number;
    comfort_max_c: number;
    reason: string;
  }[];
}

interface OutputSchedule {
  timestamp_local: string;
  recommended_ac_units_on: number;
  recommended_ac_setpoint_c: number | null;
  recommended_fan_units_on: number;
  grid_energy_kwh: number;
  solar_energy_used_kwh: number;
  battery_charge_kwh: number;
  battery_discharge_kwh: number;
  battery_soc_kwh: number;
  cooling_energy_kwh: number;
  estimated_indoor_temp_c: number;
  comfort_status: string;
  interval_cost_pkr: number;
  interval_emissions_kgco2e: number;
  reason_code: string;
}

interface IntervalInput {
  timestamp_local: string;
  solar_available_kw: number;
  tariff_type: 'OFF_PEAK' | 'ON_PEAK' | 'PEAK';
  grid_available: number;
  temperature_c: number;
}

interface ScenarioProfile {
  comfort_min_c: number;
  comfort_max_c: number;
}

export default function ComparePage() {
  const params = useParams();
  const runId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [compareResult, setCompareResult] = useState<ComparisonResult | null>(null);
  const [optSummary, setOptSummary] = useState<RunSummary | null>(null);
  const [baseSummary, setBaseSummary] = useState<RunSummary | null>(null);
  const [chartData, setChartData] = useState<any[]>([]);
  const [rawIntervals, setRawIntervals] = useState<any[]>([]);
  const [optSchedule, setOptSchedule] = useState<any[]>([]);
  const [scenarioProfile, setScenarioProfile] = useState<ScenarioProfile | null>(null);
  const [activeTab, setActiveTab] = useState<'charts' | '7day' | 'heatmap'>('charts');

  useEffect(() => {
    const loadComparisonData = async () => {
      try {
        setLoading(true);
        setError(null);

        // 1. Fetch Comparison Metadata
        const compareRes = await api.get(`/api/v1/runs/${runId}/compare`);
        const compData: ComparisonResult = compareRes.data;
        setCompareResult(compData);

        const scenarioId = compData.optimized.scenario_id;
        const baselineRunId = compData.baseline.run_id;

        // 2. Fetch Scenario details, Schedules, Inputs and Summaries
        const [scenarioRes, optScheduleRes, baseScheduleRes, intervalsRes, optSumRes, baseSumRes] = await Promise.all([
          api.get(`/api/v1/scenarios/${scenarioId}`),
          api.get(`/api/v1/runs/${runId}/schedule?limit=9999`),
          api.get(`/api/v1/runs/${baselineRunId}/schedule?limit=9999`),
          api.get(`/api/v1/scenarios/${scenarioId}/intervals?limit=9999`),
          api.get(`/api/v1/runs/${runId}/summary`),
          api.get(`/api/v1/runs/${baselineRunId}/summary`),
        ]);

        setScenarioProfile(scenarioRes.data.profile);
        setOptSummary(optSumRes.data);
        setBaseSummary(baseSumRes.data);
        setRawIntervals(intervalsRes.data.data);
        setOptSchedule(optScheduleRes.data.data);

        const optData: OutputSchedule[] = optScheduleRes.data.data;
        const baseData: OutputSchedule[] = baseScheduleRes.data.data;
        const inputData: IntervalInput[] = intervalsRes.data.data;

        // 3. Merge by timestamp
        const merged: any[] = [];
        const optMap = new Map(optData.map((d) => [d.timestamp_local, d]));
        const baseMap = new Map(baseData.map((d) => [d.timestamp_local, d]));
        const inputMap = new Map(inputData.map((d) => [d.timestamp_local, d]));

        // Sort by timestamp
        const allTimestamps = Array.from(
          new Set([...optData.map((d) => d.timestamp_local), ...baseData.map((d) => d.timestamp_local)])
        ).sort();

        allTimestamps.forEach((ts) => {
          const opt = optMap.get(ts);
          const base = baseMap.get(ts);
          const inp = inputMap.get(ts);

          if (opt && base) {
            const timeStr = new Date(ts).toLocaleTimeString([], {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            });

            merged.push({
              timestamp: timeStr,
              timestamp_raw: ts,
              opt_cost: opt.interval_cost_pkr,
              base_cost: base.interval_cost_pkr,
              opt_temp: opt.estimated_indoor_temp_c,
              base_temp: base.estimated_indoor_temp_c,
              opt_soc: opt.battery_soc_kwh,
              solar_available: (inp?.solar_available_kw || 0) * 0.25, // Convert kW power to kWh energy over 15 mins
              solar_used: opt.solar_energy_used_kwh,
              grid_energy: opt.grid_energy_kwh,
              tariff_type: inp?.tariff_type || 'ON_PEAK',
            });
          }
        });

        setChartData(merged);
      } catch (err: any) {
        console.error(err);
        setError(err.response?.data?.error || 'Failed to load comparison chart datasets.');
      } finally {
        setLoading(false);
      }
    };

    if (runId) {
      loadComparisonData();
    }
  }, [runId]);

  // Generate Natural Language Summary
  const generateNlSummary = () => {
    if (!compareResult || !optSchedule || optSchedule.length === 0) return '';
    const { savings, optimized } = compareResult;

    const daysCount = Math.ceil(optSchedule.length / 96);
    const dateRange = `July 1st – July ${daysCount}th, 2026`;
    const costSaved = Math.round(savings.cost_pkr).toLocaleString();
    const pct = savings.cost_pct.toFixed(0);
    const emissionsSaved = Math.round(savings.emissions_kgco2e).toLocaleString();
    const trees = Math.round(savings.emissions_kgco2e / 21);
    const comfortPct = optimized.comfort_compliance_pct.toFixed(0);

    // Identify primary savings channel
    let primaryStrategy = 'pre-cooling buildings during off-peak tariff periods';
    if (optimized.total_solar_energy_kwh > optimized.total_grid_energy_kwh) {
      primaryStrategy = 'maximizing clean solar self-consumption and storage buffer charging';
    } else if (savings.peak_demand_kw > 2.0) {
      primaryStrategy = 'reducing peak grid demand thresholds through battery storage load-shaving';
    }

    let infeasibleAlertText = 'All occupied hours successfully remained within comfort range.';
    if (optimized.infeasible_intervals > 0) {
      infeasibleAlertText = `Due to extreme temperature indices or grid outage deficits, comfort limits were exceeded in ${optimized.infeasible_intervals} intervals.`;
    }

    return `Across ${optSchedule.length} intervals (${dateRange}), CoolShift optimized the building cooling schedule, saving a total of PKR ${costSaved} (${pct}%) compared to baseline operations. The optimizer achieved this primarily by ${primaryStrategy}. Indoor comfort compliance was maintained at ${comfortPct}% of occupied hours. ${infeasibleAlertText} Total carbon emissions were reduced by ${emissionsSaved} kgCO₂e, equivalent to planting ${trees} trees.`;
  };

  // 7-day daily summaries preparation
  const get7DayData = () => {
    if (!optSummary?.daily_summaries || !baseSummary?.daily_summaries) {
      return {
        list: [],
        worstDate: '',
        bestSavingsDate: '',
        maxSavings: 0,
        outageDates: [],
      };
    }

    const baseMap = new Map(baseSummary.daily_summaries.map((d) => [d.date, d]));

    // Check outages in raw intervals
    const outageMap = new Map<string, boolean>();
    rawIntervals.forEach((intv) => {
      const date = intv.timestamp_local.substring(0, 10);
      if (intv.grid_available === 0) {
        outageMap.set(date, true);
      }
    });

    let worstDate = '';
    let maxAvgTemp = 0;
    let bestSavingsDate = '';
    let maxSavings = 0;

    const data = optSummary.daily_summaries.map((optDay) => {
      const baseDay = baseMap.get(optDay.date);
      const savedPkr = baseDay ? baseDay.cost_pkr - optDay.cost_pkr : 0;
      const savedPct = baseDay && baseDay.cost_pkr > 0 ? (savedPkr / baseDay.cost_pkr) * 100 : 0;
      const hasOutage = outageMap.has(optDay.date);

      if (optDay.avg_indoor_temp_c > maxAvgTemp) {
        maxAvgTemp = optDay.avg_indoor_temp_c;
        worstDate = optDay.date;
      }
      if (savedPkr > maxSavings) {
        maxSavings = savedPkr;
        bestSavingsDate = optDay.date;
      }

      return {
        date: optDay.date,
        baseCost: baseDay ? Math.round(baseDay.cost_pkr) : 0,
        optCost: Math.round(optDay.cost_pkr),
        savedPkr: Math.round(savedPkr),
        savedPct: parseFloat(savedPct.toFixed(1)),
        comfortPct: parseFloat(optDay.comfort_compliance_pct.toFixed(1)),
        peakDemand: parseFloat(optDay.peak_demand_kw.toFixed(1)),
        solarKwh: Math.round(optDay.solar_energy_kwh),
        emissions: Math.round(optDay.emissions_kgco2e),
        hasOutage,
      };
    });

    return {
      list: data,
      worstDate,
      bestSavingsDate,
      maxSavings,
      outageDates: Array.from(outageMap.keys()),
    };
  };

  const summaries7Day = get7DayData();

  if (error || !compareResult) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto">
        <h1 className="text-3xl font-extrabold text-white">Comparison Charts</h1>
        <AlertBanner type="error" message={error || 'Comparison data missing.'} />
        <Link href="/runs">
          <Button variant="secondary">Back to Run History</Button>
        </Link>
      </div>
    );
  }

  const { baseline, optimized, savings } = compareResult;

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
            Baseline vs Optimized Analysis
          </h1>
          <p className="text-white/60 text-sm mt-1">
            Comparing optimized scenario outcomes against default unoptimized building schedules.
          </p>
        </div>
        <div className="flex gap-3 no-print">
          <Button
            onClick={() => window.print()}
            variant="primary"
            className="bg-[#00d4aa] text-black border-none hover:bg-[#00c49e]"
          >
            🖨️ Print PDF Report
          </Button>
          <Link href={`/runs/${runId}`}>
            <Button variant="secondary">👁️ View Output Schedule</Button>
          </Link>
          <Link href="/runs">
            <Button variant="secondary">📊 Run History</Button>
          </Link>
        </div>
      </div>

      {/* Savings summary row (4 cards) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="border-emerald-500/30 bg-emerald-950/10 hover-glow transition-all duration-300">
          <p className="text-xs text-emerald-400 font-medium uppercase tracking-wider">Cost Savings</p>
          <p className="text-3xl font-bold mt-2 text-[#00d4aa]">
            PKR {Math.round(savings.cost_pkr).toLocaleString()}
          </p>
          <span className="text-xs text-[#00d4aa]/80 block mt-1 font-semibold">
            {savings.cost_pct.toFixed(1)}% reduction
          </span>
        </Card>

        <Card className="border-blue-500/30 bg-blue-950/10 hover-glow transition-all duration-300">
          <p className="text-xs text-blue-400 font-medium uppercase tracking-wider">Grid Energy Saved</p>
          <p className="text-3xl font-bold mt-2 text-blue-400">
            {Math.round(savings.grid_energy_kwh).toLocaleString()} kWh
          </p>
          <span className="text-xs text-blue-400/80 block mt-1 font-semibold">
            {savings.grid_energy_pct.toFixed(1)}% reduction
          </span>
        </Card>

        <Card className="border-teal-500/30 bg-teal-950/10 hover-glow transition-all duration-300">
          <p className="text-xs text-teal-400 font-medium uppercase tracking-wider">Emissions Saved</p>
          <p className="text-3xl font-bold mt-2 text-teal-400">
            {Math.round(savings.emissions_kgco2e).toLocaleString()} kg
          </p>
          <span className="text-xs text-teal-400/80 block mt-1 font-semibold">
            {savings.emissions_pct.toFixed(1)}% reduction
          </span>
        </Card>

        <Card className="border-purple-500/30 bg-purple-950/10 hover-glow transition-all duration-300">
          <p className="text-xs text-purple-400 font-medium uppercase tracking-wider">Peak Demand Reduced</p>
          <p className="text-3xl font-bold mt-2 text-purple-400">
            {savings.peak_demand_kw.toFixed(1)} kW
          </p>
          <span className="text-xs text-purple-400/80 block mt-1 font-semibold">
            {savings.peak_demand_pct.toFixed(1)}% reduction
          </span>
        </Card>
      </div>

      {/* Natural Language Explanation summary Card */}
      <Card className="p-6 border-[#00d4aa]/20 bg-[#00d4aa]/5">
        <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-1.5">
          <span>📋</span> Optimization Executive Summary
        </h3>
        <p className="text-xs text-white/80 leading-relaxed font-normal">
          {generateNlSummary()}
        </p>
      </Card>

      {/* Side-by-Side Metric Comparison Table */}
      <Card className="p-6">
        <h2 className="text-xl font-bold text-white mb-6">Key Metrics Comparison</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-white/50 text-xs font-semibold uppercase tracking-wider">
                <th className="py-3 px-4">Metric</th>
                <th className="py-3 px-4">Baseline Schedule</th>
                <th className="py-3 px-4">Optimized Schedule</th>
                <th className="py-3 px-4 text-right">Savings / Change</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-sm text-white/90">
              <tr className="hover:bg-white/5 transition-colors">
                <td className="py-4 px-4 font-medium">Total Utility Cost</td>
                <td className="py-4 px-4 font-mono">PKR {Math.round(baseline.total_cost_pkr).toLocaleString()}</td>
                <td className="py-4 px-4 font-mono text-[#00d4aa]">
                  PKR {Math.round(optimized.total_cost_pkr).toLocaleString()}
                </td>
                <td className="py-4 px-4 text-right text-[#00d4aa] font-semibold">
                  -{savings.cost_pct.toFixed(1)}%
                </td>
              </tr>
              <tr className="hover:bg-white/5 transition-colors">
                <td className="py-4 px-4 font-medium">Grid Draw Energy</td>
                <td className="py-4 px-4 font-mono">{Math.round(baseline.total_grid_energy_kwh).toLocaleString()} kWh</td>
                <td className="py-4 px-4 font-mono text-blue-400">
                  {Math.round(optimized.total_grid_energy_kwh).toLocaleString()} kWh
                </td>
                <td className="py-4 px-4 text-right text-[#00d4aa] font-semibold">
                  -{savings.grid_energy_pct.toFixed(1)}%
                </td>
              </tr>
              <tr className="hover:bg-white/5 transition-colors">
                <td className="py-4 px-4 font-medium">Solar Utilization</td>
                <td className="py-4 px-4 font-mono">{Math.round(baseline.total_solar_energy_kwh).toLocaleString()} kWh</td>
                <td className="py-4 px-4 font-mono text-emerald-400">
                  {Math.round(optimized.total_solar_energy_kwh).toLocaleString()} kWh
                </td>
                <td className="py-4 px-4 text-right text-emerald-400 font-semibold">
                  +{((optimized.solar_utilization_pct || 0) - (baseline.solar_utilization_pct || 0)).toFixed(1)}%
                </td>
              </tr>
              <tr className="hover:bg-white/5 transition-colors">
                <td className="py-4 px-4 font-medium">Total CO₂ Emissions</td>
                <td className="py-4 px-4 font-mono">{Math.round(baseline.total_emissions_kgco2e).toLocaleString()} kg</td>
                <td className="py-4 px-4 font-mono text-teal-400">
                  {Math.round(optimized.total_emissions_kgco2e).toLocaleString()} kg
                </td>
                <td className="py-4 px-4 text-right text-[#00d4aa] font-semibold">
                  -{savings.emissions_pct.toFixed(1)}%
                </td>
              </tr>
              <tr className="hover:bg-white/5 transition-colors">
                <td className="py-4 px-4 font-medium">Peak Power Demand</td>
                <td className="py-4 px-4 font-mono">{baseline.peak_demand_kw.toFixed(1)} kW</td>
                <td className="py-4 px-4 font-mono text-purple-400">{optimized.peak_demand_kw.toFixed(1)} kW</td>
                <td className="py-4 px-4 text-right text-[#00d4aa] font-semibold">
                  -{savings.peak_demand_pct.toFixed(1)}%
                </td>
              </tr>
              <tr className="hover:bg-white/5 transition-colors">
                <td className="py-4 px-4 font-medium">Comfort Range Compliance</td>
                <td className="py-4 px-4">{baseline.comfort_compliance_pct.toFixed(1)}%</td>
                <td className="py-4 px-4 font-semibold text-[#00d4aa]">
                  {optimized.comfort_compliance_pct.toFixed(1)}%
                </td>
                <td className="py-4 px-4 text-right font-medium">
                  {(optimized.comfort_compliance_pct - baseline.comfort_compliance_pct).toFixed(1)}% shift
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* Tabs area */}
      <div className="flex border-b border-white/10 gap-4 no-print">
        <button
          onClick={() => setActiveTab('charts')}
          className={`pb-3 text-sm font-semibold transition-colors ${
            activeTab === 'charts' ? 'border-b-2 border-[#00d4aa] text-white' : 'text-white/60 hover:text-white'
          }`}
        >
          📊 Charts Comparison
        </button>
        <button
          onClick={() => setActiveTab('7day')}
          className={`pb-3 text-sm font-semibold transition-colors ${
            activeTab === '7day' ? 'border-b-2 border-[#00d4aa] text-white' : 'text-white/60 hover:text-white'
          }`}
        >
          📅 7-Day Summary View
        </button>
        <button
          onClick={() => setActiveTab('heatmap')}
          className={`pb-3 text-sm font-semibold transition-colors ${
            activeTab === 'heatmap' ? 'border-b-2 border-[#00d4aa] text-white' : 'text-white/60 hover:text-white'
          }`}
        >
          🌡️ Heat Risk Timeline
        </button>
      </div>

      {/* TAB CONTENT: Charts */}
      {activeTab === 'charts' && (
        <div className="grid grid-cols-1 gap-8 animate-fadeIn">
          {/* Chart 1: Interval Cost Comparison */}
          <Card className="p-6">
            <h3 className="text-lg font-bold text-white mb-4">Interval Cost Comparison</h3>
            <div className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="timestamp" stroke="rgba(255,255,255,0.4)" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} />
                  <YAxis stroke="rgba(255,255,255,0.4)" tick={{ fill: 'rgba(255,255,255,0.4)' }} label={{ value: 'PKR', angle: -90, position: 'insideLeft', fill: 'rgba(255,255,255,0.4)' }} />
                  <Tooltip contentStyle={{ backgroundColor: '#0a0f1e', borderColor: 'rgba(255,255,255,0.1)', color: 'white' }} />
                  <Legend />
                  <Line type="monotone" dataKey="base_cost" stroke="#888888" strokeWidth={1.5} dot={false} name="Baseline Cost" />
                  <Line type="monotone" dataKey="opt_cost" stroke="#00d4aa" strokeWidth={2.5} dot={false} name="Optimized Cost" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Chart 2: Indoor Temperature Over Time */}
          <Card className="p-6">
            <h3 className="text-lg font-bold text-white mb-4">Indoor Temperature Over Time</h3>
            <div className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="timestamp" stroke="rgba(255,255,255,0.4)" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} />
                  <YAxis stroke="rgba(255,255,255,0.4)" tick={{ fill: 'rgba(255,255,255,0.4)' }} domain={['auto', 'auto']} label={{ value: '°C', angle: -90, position: 'insideLeft', fill: 'rgba(255,255,255,0.4)' }} />
                  <Tooltip contentStyle={{ backgroundColor: '#0a0f1e', borderColor: 'rgba(255,255,255,0.1)', color: 'white' }} />
                  <Legend />
                  <Line type="monotone" dataKey="base_temp" stroke="#888888" strokeWidth={1.5} dot={false} name="Baseline Temp" />
                  <Line type="monotone" dataKey="opt_temp" stroke="#00d4aa" strokeWidth={2.5} dot={false} name="Optimized Temp" />
                  {scenarioProfile && (
                    <>
                      <ReferenceLine y={scenarioProfile.comfort_max_c} stroke="#ef4444" strokeDasharray="5 5" label={{ value: `Max Comfort (${scenarioProfile.comfort_max_c}°C)`, position: 'insideBottomRight', fill: '#ef4444', fontSize: 10 }} />
                      <ReferenceLine y={scenarioProfile.comfort_min_c} stroke="#3b82f6" strokeDasharray="5 5" label={{ value: `Min Comfort (${scenarioProfile.comfort_min_c}°C)`, position: 'insideTopRight', fill: '#3b82f6', fontSize: 10 }} />
                    </>
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Chart 3: Battery SoC Over Time */}
            <Card className="p-6">
              <h3 className="text-lg font-bold text-white mb-4">Battery State‑of‑Charge (SoC)</h3>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="timestamp" stroke="rgba(255,255,255,0.4)" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} />
                    <YAxis stroke="rgba(255,255,255,0.4)" tick={{ fill: 'rgba(255,255,255,0.4)' }} label={{ value: 'SoC (kWh)', angle: -90, position: 'insideLeft', fill: 'rgba(255,255,255,0.4)' }} />
                    <Tooltip contentStyle={{ backgroundColor: '#0a0f1e', borderColor: 'rgba(255,255,255,0.1)', color: 'white' }} />
                    <Legend />
                    <Area type="monotone" dataKey="opt_soc" fill="rgba(0, 212, 170, 0.2)" stroke="#00d4aa" name="Battery Charge SoC" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Chart 4: Solar Generation vs Utilisation */}
            <Card className="p-6">
              <h3 className="text-lg font-bold text-white mb-4">Solar Utilisation</h3>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="timestamp" stroke="rgba(255,255,255,0.4)" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} />
                    <YAxis stroke="rgba(255,255,255,0.4)" tick={{ fill: 'rgba(255,255,255,0.4)' }} label={{ value: 'Energy (kWh)', angle: -90, position: 'insideLeft', fill: 'rgba(255,255,255,0.4)' }} />
                    <Tooltip contentStyle={{ backgroundColor: '#0a0f1e', borderColor: 'rgba(255,255,255,0.1)', color: 'white' }} />
                    <Legend />
                    <Area type="monotone" dataKey="solar_available" stackId="solar" fill="rgba(253, 230, 138, 0.2)" stroke="#fde68a" name="Solar Available" />
                    <Area type="monotone" dataKey="solar_used" stackId="solar" fill="rgba(16, 185, 129, 0.4)" stroke="#10b981" name="Solar Used" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          {/* Chart 5: Grid Draw Over Time */}
          <Card className="p-6">
            <h3 className="text-lg font-bold text-white mb-4">Grid Power Draw by Tariff Zone</h3>
            <div className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="timestamp" stroke="rgba(255,255,255,0.4)" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} />
                  <YAxis stroke="rgba(255,255,255,0.4)" tick={{ fill: 'rgba(255,255,255,0.4)' }} label={{ value: 'Energy (kWh)', angle: -90, position: 'insideLeft', fill: 'rgba(255,255,255,0.4)' }} />
                  <Tooltip contentStyle={{ backgroundColor: '#0a0f1e', borderColor: 'rgba(255,255,255,0.1)', color: 'white' }} />
                  <Legend />
                  <Bar dataKey="grid_energy" name="Grid Draw">
                    {chartData.map((entry, index) => {
                      let fill = '#00d4aa'; // ON_PEAK
                      if (entry.tariff_type === 'PEAK') fill = '#ef4444'; // Red
                      if (entry.tariff_type === 'OFF_PEAK') fill = '#10b981'; // Green
                      return <Cell key={`cell-${index}`} fill={fill} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex gap-6 justify-center mt-3 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 bg-[#ef4444] rounded-sm" />
                <span className="text-white/60">Peak Tariff</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 bg-[#00d4aa] rounded-sm" />
                <span className="text-white/60">Normal Tariff</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 bg-[#10b981] rounded-sm" />
                <span className="text-white/60">Off-Peak Tariff</span>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* TAB CONTENT: 7-Day Summary */}
      {activeTab === '7day' && summaries7Day.list && (
        <div className="space-y-6 animate-fadeIn">
          {/* Quick analysis callouts */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="p-4 border-l-4 border-yellow-500/50 bg-white/5">
              <span className="text-[10px] text-white/50 block font-bold uppercase">Worst Heat Day</span>
              <p className="text-lg font-bold text-white mt-1">
                {summaries7Day.worstDate
                  ? new Date(summaries7Day.worstDate).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })
                  : '—'}
              </p>
            </Card>
            <Card className="p-4 border-l-4 border-emerald-500/50 bg-white/5">
              <span className="text-[10px] text-white/50 block font-bold uppercase">Best Savings Day</span>
              <p className="text-lg font-bold text-white mt-1">
                {summaries7Day.bestSavingsDate
                  ? new Date(summaries7Day.bestSavingsDate).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })
                  : '—'}{' '}
                <span className="text-xs text-[#00d4aa] font-mono">({Math.round(summaries7Day.maxSavings)} PKR)</span>
              </p>
            </Card>
            <Card className="p-4 border-l-4 border-red-500/50 bg-white/5">
              <span className="text-[10px] text-white/50 block font-bold uppercase">Load-Shedding Outages</span>
              <p className="text-lg font-bold text-red-400 mt-1">
                {summaries7Day.outageDates.length > 0
                  ? `${summaries7Day.outageDates.length} Days Mapped`
                  : 'No Outages Recorded'}
              </p>
            </Card>
          </div>

          {/* 7-day grid */}
          <Card className="p-6">
            <h3 className="text-base font-bold text-white mb-4">Daily Performance Ledger</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-white/50 uppercase tracking-wider font-bold">
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Baseline Cost</th>
                    <th className="py-3 px-4">Optimized Cost</th>
                    <th className="py-3 px-4">PKR Saved</th>
                    <th className="py-3 px-4">Saved %</th>
                    <th className="py-3 px-4">Comfort %</th>
                    <th className="py-3 px-4">Peak Demand</th>
                    <th className="py-3 px-4">Solar Kwh</th>
                    <th className="py-3 px-4">Carbon (kg)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-white/90">
                  {summaries7Day.list.map((day: any) => {
                    const isWorstHeat = day.date === summaries7Day.worstDate;
                    const isBestSavings = day.date === summaries7Day.bestSavingsDate;
                    return (
                      <tr
                        key={day.date}
                        className={`hover:bg-white/5 transition-colors ${
                          isWorstHeat
                            ? 'bg-yellow-500/5 text-yellow-100'
                            : isBestSavings
                            ? 'bg-emerald-500/5 text-emerald-100'
                            : ''
                        } ${day.hasOutage ? 'border-l-4 border-red-500/40' : ''}`}
                      >
                        <td className="py-3.5 px-4 font-bold">
                          {new Date(day.date).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                        </td>
                        <td className="py-3.5 px-4 font-mono">PKR {day.baseCost.toLocaleString()}</td>
                        <td className="py-3.5 px-4 font-mono font-bold text-[#00d4aa]">PKR {day.optCost.toLocaleString()}</td>
                        <td className="py-3.5 px-4 font-mono font-bold text-[#00d4aa]">PKR {day.savedPkr.toLocaleString()}</td>
                        <td className="py-3.5 px-4 font-mono font-bold text-[#00d4aa]">{day.savedPct}%</td>
                        <td className="py-3.5 px-4">{day.comfortPct}%</td>
                        <td className="py-3.5 px-4 font-mono">{day.peakDemand} kW</td>
                        <td className="py-3.5 px-4 font-mono text-emerald-400">{day.solarKwh} kWh</td>
                        <td className="py-3.5 px-4 font-mono">{day.emissions} kg</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* TAB CONTENT: Heat Risk Heatmap */}
      {activeTab === 'heatmap' && (
        <div className="animate-fadeIn">
          <HeatRiskHeatmap schedule={optSchedule} intervals={rawIntervals} />
        </div>
      )}
    </div>
  );
}
