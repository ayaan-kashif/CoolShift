// file:///C:/Users/Hp/OneDrive/Desktop%202/CoolShift/CoolShift/frontend/src/app/runs/[id]/page.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import api from '../../../lib/api';
import Card from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import Badge from '../../../components/ui/Badge';
import LoadingSpinner from '../../../components/ui/LoadingSpinner';
import AlertBanner from '../../../components/ui/AlertBanner';
import HeatRiskHeatmap from '../../../components/HeatRiskHeatmap';

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
  comfort_status: 'within_range' | 'warning' | 'unsafe' | 'infeasible';
  interval_cost_pkr: number;
  interval_emissions_kgco2e: number;
  reason_code: string;
  explanation: string;
  constraint_violation_count: number;
}

interface RunSummary {
  run_id: string;
  scenario_id: string;
  scenario_name: string;
  total_intervals: number;
  total_cost_pkr: number;
  total_grid_energy_kwh: number;
  total_solar_energy_kwh: number;
  total_emissions_kgco2e: number;
  peak_demand_kw: number;
  comfort_compliance_pct: number;
}

export default function SchedulePage() {
  const params = useParams();
  const runId = params.id as string;
  const router = useRouter();

  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingSchedule, setLoadingSchedule] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [schedule, setSchedule] = useState<OutputSchedule[]>([]);
  const [fullSchedule, setFullSchedule] = useState<any[]>([]);
  const [intervals, setIntervals] = useState<any[]>([]);

  // Filter States
  const [dateFilter, setDateFilter] = useState('');
  const [comfortFilter, setComfortFilter] = useState('');
  const [reasonFilter, setReasonFilter] = useState('');

  // Pagination States
  const [page, setPage] = useState(1);
  const [limit] = useState(96); // 96 intervals = 24 hours (1 day)
  const [totalRecords, setTotalRecords] = useState(0);

  // Available unique dates/reason codes for dropdowns
  const [uniqueDates, setUniqueDates] = useState<string[]>([]);
  const [uniqueReasons, setUniqueReasons] = useState<string[]>([]);

  // Fetch Run Summary on load
  useEffect(() => {
    const fetchSummary = async () => {
      try {
        setLoadingSummary(true);
        const res = await api.get(`/api/v1/runs/${runId}/summary`);
        setSummary(res.data);

        // Extract dates and reasons from the full schedule to fill filter options
        const [allScheduleRes, intervalsRes] = await Promise.all([
          api.get(`/api/v1/runs/${runId}/schedule?limit=9999`),
          api.get(`/api/v1/scenarios/${res.data.scenario_id}/intervals?limit=9999`),
        ]);
        const allData: OutputSchedule[] = allScheduleRes.data.data;
        setFullSchedule(allData);
        setIntervals(intervalsRes.data.data);

        const dates = Array.from(new Set(allData.map((row) => row.timestamp_local.substring(0, 10)))).sort();
        const reasons = Array.from(new Set(allData.map((row) => row.reason_code))).filter(Boolean).sort();

        setUniqueDates(dates);
        setUniqueReasons(reasons);
      } catch (err: any) {
        console.error(err);
        setError('Failed to fetch output summary.');
      } finally {
        setLoadingSummary(false);
      }
    };

    if (runId) {
      fetchSummary();
    }
  }, [runId]);

  // Fetch paginated & filtered schedule data
  const fetchSchedule = async () => {
    try {
      setLoadingSchedule(true);
      const queryParams = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });

      if (dateFilter) queryParams.append('date', dateFilter);
      if (comfortFilter) queryParams.append('comfort_status', comfortFilter);
      if (reasonFilter) queryParams.append('reason_code', reasonFilter);

      const res = await api.get(`/api/v1/runs/${runId}/schedule?${queryParams.toString()}`);
      setSchedule(res.data.data);
      setTotalRecords(res.data.total);
    } catch (err: any) {
      console.error(err);
      setError('Failed to fetch output schedule intervals.');
    } finally {
      setLoadingSchedule(false);
    }
  };

  useEffect(() => {
    if (runId) {
      fetchSchedule();
    }
  }, [runId, page, dateFilter, comfortFilter, reasonFilter]);

  // Reset pagination on filter change
  const handleFilterChange = (type: 'date' | 'comfort' | 'reason', val: string) => {
    setPage(1);
    if (type === 'date') setDateFilter(val);
    if (type === 'comfort') setComfortFilter(val);
    if (type === 'reason') setReasonFilter(val);
  };

  const totalPages = Math.ceil(totalRecords / limit);

  const getComfortBadgeType = (status: string): 'success' | 'warning' | 'danger' | 'primary' => {
    switch (status) {
      case 'within_range':
        return 'success';
      case 'warning':
        return 'warning';
      case 'unsafe':
        return 'warning'; // Custom styling for warning/unsafe
      case 'infeasible':
        return 'danger';
      default:
        return 'primary';
    }
  };

  const getReasonPillClass = (code: string) => {
    switch (code) {
      case 'PRE_COOL':
        return 'bg-blue-500/20 text-blue-300 border border-blue-500/30';
      case 'SOLAR_AVAILABLE':
        return 'bg-amber-500/20 text-amber-300 border border-amber-500/30';
      case 'OUTAGE':
        return 'bg-red-500/20 text-red-300 border border-red-500/30';
      case 'PEAK_TARIFF':
        return 'bg-purple-500/20 text-purple-300 border border-purple-500/30';
      default:
        return 'bg-white/5 text-white/70 border border-white/10';
    }
  };

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

  if (loadingSummary) {
    return (
      <div className="flex flex-col justify-center items-center h-[80vh] gap-4">
        <LoadingSpinner size={12} />
        <span className="text-white/60">Fetching Solver Output Schedule...</span>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">
            Output Schedule:{' '}
            <span className="text-[#00d4aa]">{summary?.scenario_name || summary?.scenario_id}</span>
          </h1>
          <p className="text-white/60 text-sm mt-1">
            Review detailed 15-minute load decisions and operational reason codes mapped by the optimizer.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href={`/runs/${runId}/compare`}>
            <Button variant="primary">📊 Compare vs Baseline</Button>
          </Link>
          <a href={`${apiBaseUrl}/api/v1/export/${runId}/csv`} download>
            <Button variant="secondary">📥 Export CSV</Button>
          </a>
          <a href={`${apiBaseUrl}/api/v1/export/${runId}/xlsx`} download>
            <Button variant="secondary">📥 Export XLSX</Button>
          </a>
        </div>
      </div>

      {error && <AlertBanner type="error" message={error} onClose={() => setError(null)} />}

      {/* Stats Summary Panel */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white/5 rounded-xl p-4 border border-white/5">
          <p className="text-xs text-white/50">Total Cost</p>
          <p className="text-xl font-bold text-white mt-1">
            PKR {Math.round(summary?.total_cost_pkr || 0).toLocaleString()}
          </p>
        </div>
        <div className="bg-white/5 rounded-xl p-4 border border-white/5">
          <p className="text-xs text-white/50">Grid draw</p>
          <p className="text-xl font-bold text-white mt-1">
            {Math.round(summary?.total_grid_energy_kwh || 0).toLocaleString()} kWh
          </p>
        </div>
        <div className="bg-white/5 rounded-xl p-4 border border-white/5">
          <p className="text-xs text-white/50">Solar Utilized</p>
          <p className="text-xl font-bold text-white mt-1">
            {Math.round(summary?.total_solar_energy_kwh || 0).toLocaleString()} kWh
          </p>
        </div>
        <div className="bg-white/5 rounded-xl p-4 border border-white/5">
          <p className="text-xs text-white/50">Emissions</p>
          <p className="text-xl font-bold text-white mt-1">
            {Math.round(summary?.total_emissions_kgco2e || 0).toLocaleString()} kg
          </p>
        </div>
        <div className="bg-white/5 rounded-xl p-4 border border-white/5 col-span-2 md:col-span-1">
          <p className="text-xs text-white/50">Comfort Compliance</p>
          <p className="text-xl font-bold text-[#00d4aa] mt-1">
            {summary?.comfort_compliance_pct.toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Heat Risk Heatmap */}
      {intervals.length > 0 && (
        <HeatRiskHeatmap schedule={fullSchedule} intervals={intervals} />
      )}

      {/* Filter Bar */}
      <Card className="p-4 flex flex-col md:flex-row gap-4 items-center">
        {/* Date Filter */}
        <div className="w-full md:w-auto flex-1 flex flex-col gap-1.5">
          <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Filter Date</label>
          <select
            value={dateFilter}
            onChange={(e) => handleFilterChange('date', e.target.value)}
            className="input-field py-1.5 text-xs"
          >
            <option value="">All Dates</option>
            {uniqueDates.map((d) => (
              <option key={d} value={d}>
                {new Date(d).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
              </option>
            ))}
          </select>
        </div>

        {/* Comfort Status Filter */}
        <div className="w-full md:w-auto flex-1 flex flex-col gap-1.5">
          <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Comfort Status</label>
          <select
            value={comfortFilter}
            onChange={(e) => handleFilterChange('comfort', e.target.value)}
            className="input-field py-1.5 text-xs"
          >
            <option value="">All Statuses</option>
            <option value="within_range">Within Range</option>
            <option value="warning">Warning</option>
            <option value="unsafe">Unsafe</option>
            <option value="infeasible">Infeasible</option>
          </select>
        </div>

        {/* Reason Code Filter */}
        <div className="w-full md:w-auto flex-1 flex flex-col gap-1.5">
          <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Reason Code</label>
          <select
            value={reasonFilter}
            onChange={(e) => handleFilterChange('reason', e.target.value)}
            className="input-field py-1.5 text-xs"
          >
            <option value="">All Reason Codes</option>
            {uniqueReasons.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {/* Schedule Table */}
      <Card className="p-6">
        {loadingSchedule ? (
          <div className="py-24 flex justify-center">
            <LoadingSpinner size={10} />
          </div>
        ) : schedule.length === 0 ? (
          <div className="text-center py-12 text-white/50">
            No schedule intervals match the selected filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-white/50 font-semibold uppercase tracking-wider">
                  <th className="py-3 px-3">Timestamp</th>
                  <th className="py-3 px-2 text-center">AC Units</th>
                  <th className="py-3 px-2 text-center">Setpoint</th>
                  <th className="py-3 px-2 text-center">Fans</th>
                  <th className="py-3 px-2">Grid</th>
                  <th className="py-3 px-2">Solar Used</th>
                  <th className="py-3 px-2">Battery SoC</th>
                  <th className="py-3 px-2">Indoor Temp</th>
                  <th className="py-3 px-3">Comfort</th>
                  <th className="py-3 px-3">Reason</th>
                  <th className="py-3 px-3">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-white/90">
                {schedule.map((row, idx) => (
                  <tr key={idx} className="hover:bg-white/5 transition-colors">
                    <td className="py-3.5 px-3 font-mono font-medium">
                      {new Date(row.timestamp_local).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-3.5 px-2 text-center font-bold text-white">{row.recommended_ac_units_on}</td>
                    <td className="py-3.5 px-2 text-center">
                      {row.recommended_ac_setpoint_c !== null
                        ? `${row.recommended_ac_setpoint_c}°C`
                        : '—'}
                    </td>
                    <td className="py-3.5 px-2 text-center text-white/70">{row.recommended_fan_units_on}</td>
                    <td className="py-3.5 px-2 font-mono">{row.grid_energy_kwh.toFixed(2)} kWh</td>
                    <td className="py-3.5 px-2 font-mono text-emerald-400">
                      {row.solar_energy_used_kwh > 0 ? `${row.solar_energy_used_kwh.toFixed(2)}` : '—'}
                    </td>
                    <td className="py-3.5 px-2 font-mono text-blue-400">
                      {row.battery_soc_kwh > 0 ? `${row.battery_soc_kwh.toFixed(2)}` : '—'}
                    </td>
                    <td className="py-3.5 px-2 font-mono font-semibold text-white">
                      {row.estimated_indoor_temp_c.toFixed(1)}°C
                    </td>
                    <td className="py-3.5 px-3">
                      <Badge color={getComfortBadgeType(row.comfort_status)} className="capitalize text-[10px]">
                        {row.comfort_status.replace('_', ' ')}
                      </Badge>
                    </td>
                    <td className="py-3.5 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${getReasonPillClass(row.reason_code)}`}>
                        {row.reason_code}
                      </span>
                    </td>
                    <td className="py-3.5 px-3 font-mono font-bold text-[#00d4aa]">
                      PKR {row.interval_cost_pkr.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-between items-center mt-6 pt-4 border-t border-white/10">
            <span className="text-xs text-white/50">
              Showing Page {page} of {totalPages} ({totalRecords} intervals)
            </span>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
                className="py-1 px-3 text-xs"
              >
                ◀ Previous
              </Button>
              <Button
                variant="secondary"
                disabled={page === totalPages}
                onClick={() => setPage(page + 1)}
                className="py-1 px-3 text-xs"
              >
                Next ▶
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
