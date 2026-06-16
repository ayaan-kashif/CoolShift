'use client';

import React, { useEffect, useState } from 'react';
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
  Cell,
} from 'recharts';

interface Scenario {
  scenario_id: string;
  name: string;
  building_type: string;
  area_m2: number;
}

export default function WhatIfSimulator() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sliders State
  const [peakTariff, setPeakTariff] = useState(45);
  const [offPeakTariff, setOffPeakTariff] = useState(18);
  const [peakTemp, setPeakTemp] = useState(43);
  const [occupancy, setOccupancy] = useState(10);
  const [solarCapacity, setSolarCapacity] = useState(5);
  const [batteryCapacity, setBatteryCapacity] = useState(20);
  const [outageHours, setOutageHours] = useState(4);

  // Simulation Results
  const [results, setResults] = useState<any | null>(null);
  const [sensitivityData, setSensitivityData] = useState<any[]>([]);

  useEffect(() => {
    const fetchScenarios = async () => {
      try {
        setLoading(true);
        const res = await api.get('/api/v1/scenarios');
        setScenarios(res.data);
        if (res.data.length > 0) {
          setSelectedScenarioId(res.data[0].scenario_id);
        }
      } catch (err) {
        setError('Failed to fetch scenarios.');
      } finally {
        setLoading(false);
      }
    };
    fetchScenarios();
  }, []);

  const handleRunSimulation = async () => {
    if (!selectedScenarioId) {
      setError('Please select a scenario profile first.');
      return;
    }

    setSimulating(true);
    setError(null);

    try {
      const res = await api.post(`/api/v1/optimize/whatif/${selectedScenarioId}`, {
        peakTariff,
        offPeakTariff,
        peakTemp,
        occupancy,
        solarCapacity,
        batteryCapacity,
        outageHours,
      });

      setResults(res.data.results);
      setSensitivityData(res.data.sensitivityData);
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.error || 'Failed to execute real-time What-If optimization solver.');
    } finally {
      setSimulating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center h-[80vh] gap-4">
        <LoadingSpinner size={12} />
        <span className="text-white/60">Loading What-If Simulator...</span>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
          🔬 Interactive What-If Simulator
        </h1>
        <p className="text-white/60 text-sm mt-1">
          Tune operational parameters in real time to evaluate load shifts, tariff sensitivities, and thermal resilience.
        </p>
      </div>

      {error && <AlertBanner type="error" message={error} onClose={() => setError(null)} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Side: Parameters Sliders */}
        <div className="lg:col-span-1 space-y-6">
          <Card className="p-6 space-y-6">
            <h2 className="text-lg font-bold text-white border-b border-white/10 pb-3">Simulation Inputs</h2>

            {/* Scenario */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Select Scenario</label>
              <select
                value={selectedScenarioId}
                onChange={(e) => setSelectedScenarioId(e.target.value)}
                className="input-field"
              >
                {scenarios.map((s) => (
                  <option key={s.scenario_id} value={s.scenario_id} className="bg-[#0a0f1e] text-white">
                    {s.name} ({s.building_type})
                  </option>
                ))}
              </select>
            </div>

            {/* Peak Tariff */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-white/70">Peak Tariff (PKR/kWh)</span>
                <span className="font-mono text-[#00d4aa] font-bold">{peakTariff} PKR</span>
              </div>
              <input
                type="range"
                min="20"
                max="80"
                step="1"
                value={peakTariff}
                onChange={(e) => setPeakTariff(parseInt(e.target.value))}
                className="w-full accent-[#00d4aa] bg-white/10 rounded-lg h-2 cursor-pointer"
              />
            </div>

            {/* Off-Peak Tariff */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-white/770">Off-Peak Tariff (PKR/kWh)</span>
                <span className="font-mono text-[#00d4aa] font-bold">{offPeakTariff} PKR</span>
              </div>
              <input
                type="range"
                min="10"
                max="40"
                step="1"
                value={offPeakTariff}
                onChange={(e) => setOffPeakTariff(parseInt(e.target.value))}
                className="w-full accent-[#00d4aa] bg-white/10 rounded-lg h-2 cursor-pointer"
              />
            </div>

            {/* Peak Temp */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-white/70">Peak Summer Temperature</span>
                <span className="font-mono text-[#ef4444] font-bold">{peakTemp}°C</span>
              </div>
              <input
                type="range"
                min="30"
                max="55"
                step="1"
                value={peakTemp}
                onChange={(e) => setPeakTemp(parseInt(e.target.value))}
                className="w-full accent-[#ef4444] bg-white/10 rounded-lg h-2 cursor-pointer"
              />
            </div>

            {/* Occupancy */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-white/70">Building Occupancy Peak</span>
                <span className="font-mono text-white font-bold">{occupancy} persons</span>
              </div>
              <input
                type="range"
                min="0"
                max="50"
                step="1"
                value={occupancy}
                onChange={(e) => setOccupancy(parseInt(e.target.value))}
                className="w-full accent-[#00d4aa] bg-white/10 rounded-lg h-2 cursor-pointer"
              />
            </div>

            {/* Solar capacity */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-white/70">Solar Capacity</span>
                <span className="font-mono text-[#00d4aa] font-bold">{solarCapacity} kW</span>
              </div>
              <input
                type="range"
                min="0"
                max="20"
                step="1"
                value={solarCapacity}
                onChange={(e) => setSolarCapacity(parseInt(e.target.value))}
                className="w-full accent-[#00d4aa] bg-white/10 rounded-lg h-2 cursor-pointer"
              />
            </div>

            {/* Battery capacity */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-white/70">Battery Capacity</span>
                <span className="font-mono text-[#3b82f6] font-bold">{batteryCapacity} kWh</span>
              </div>
              <input
                type="range"
                min="0"
                max="50"
                step="1"
                value={batteryCapacity}
                onChange={(e) => setBatteryCapacity(parseInt(e.target.value))}
                className="w-full accent-[#3b82f6] bg-white/10 rounded-lg h-2 cursor-pointer"
              />
            </div>

            {/* Outage hours */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-white/70">Load Shedding Hours / Day</span>
                <span className="font-mono text-red-400 font-bold">{outageHours} hours</span>
              </div>
              <input
                type="range"
                min="0"
                max="12"
                step="1"
                value={outageHours}
                onChange={(e) => setOutageHours(parseInt(e.target.value))}
                className="w-full accent-red-400 bg-white/10 rounded-lg h-2 cursor-pointer"
              />
            </div>

            <Button
              variant="primary"
              onClick={handleRunSimulation}
              disabled={simulating}
              className="w-full pt-3"
            >
              {simulating ? 'Simulating Offsets...' : '🚀 Run What-If Analysis'}
            </Button>
          </Card>
        </div>

        {/* Right Side: Simulation Results */}
        <div className="lg:col-span-2 space-y-6">
          {simulating ? (
            <Card className="p-12 flex flex-col items-center justify-center min-h-[400px] gap-4">
              <LoadingSpinner size={12} />
              <span className="text-white/60">Recalculating linear programming matrices under modified variables...</span>
            </Card>
          ) : results ? (
            <>
              {/* Comparative Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Cost card */}
                <Card className="p-6 hover-glow">
                  <span className="text-xs text-white/50 block font-bold uppercase">PKR Cost Offset</span>
                  <div className="flex justify-between items-baseline mt-4">
                    <span className="text-2xl font-bold text-white">
                      PKR {results.simulated.cost.toLocaleString()}
                    </span>
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        results.delta.cost >= 0 ? 'bg-emerald-500/20 text-[#00d4aa]' : 'bg-red-500/20 text-[#ef4444]'
                      }`}
                    >
                      {results.delta.cost >= 0 ? `-${results.delta.costPct}% Saved` : `+${Math.abs(results.delta.costPct)}% Increase`}
                    </span>
                  </div>
                  <div className="text-[10px] text-white/40 mt-1">
                    Baseline Cost: PKR {results.baseline.cost.toLocaleString()}
                  </div>
                </Card>

                {/* Emissions Card */}
                <Card className="p-6 hover-glow">
                  <span className="text-xs text-white/50 block font-bold uppercase">CO₂e Emissions</span>
                  <div className="flex justify-between items-baseline mt-4">
                    <span className="text-2xl font-bold text-white">
                      {results.simulated.emissions} kg
                    </span>
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        results.delta.emissions >= 0 ? 'bg-emerald-500/20 text-[#00d4aa]' : 'bg-red-500/20 text-[#ef4444]'
                      }`}
                    >
                      {results.delta.emissions >= 0 ? `-${results.delta.emissionsPct}% Avoided` : `+${Math.abs(results.delta.emissionsPct)}% Carbon`}
                    </span>
                  </div>
                  <div className="text-[10px] text-white/40 mt-1">
                    Baseline Carbon: {results.baseline.emissions} kg
                  </div>
                </Card>

                {/* Comfort Card */}
                <Card className="p-6 hover-glow">
                  <span className="text-xs text-white/50 block font-bold uppercase">Comfort Compliance</span>
                  <div className="flex justify-between items-baseline mt-4">
                    <span className="text-2xl font-bold text-white">
                      {results.simulated.comfort}%
                    </span>
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        results.delta.comfort >= 0 ? 'bg-emerald-500/20 text-[#00d4aa]' : 'bg-red-500/20 text-[#ef4444]'
                      }`}
                    >
                      {results.delta.comfort >= 0 ? `+${results.delta.comfort}% Comfort` : `${results.delta.comfort}% Degradation`}
                    </span>
                  </div>
                  <div className="text-[10px] text-white/40 mt-1">
                    Baseline Comfort: {results.baseline.comfort}%
                  </div>
                </Card>
              </div>

              {/* Side-by-side Table */}
              <Card className="p-6">
                <h3 className="text-base font-bold text-white mb-4">Baseline vs Simulated Operational Comparison</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-white/10 text-white/50 uppercase tracking-wider font-bold">
                        <th className="py-2.5 px-4">Metric</th>
                        <th className="py-2.5 px-4">Baseline Run</th>
                        <th className="py-2.5 px-4">Simulated Run</th>
                        <th className="py-2.5 px-4 text-right">Net Change</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-white/90">
                      <tr>
                        <td className="py-3 px-4 font-semibold">Total Cost (PKR)</td>
                        <td className="py-3 px-4">PKR {results.baseline.cost.toLocaleString()}</td>
                        <td className="py-3 px-4">PKR {results.simulated.cost.toLocaleString()}</td>
                        <td className={`py-3 px-4 text-right font-bold ${results.delta.cost >= 0 ? 'text-[#00d4aa]' : 'text-red-400'}`}>
                          {results.delta.cost >= 0 ? `Saved PKR ${results.delta.cost.toLocaleString()}` : `Added PKR ${Math.abs(results.delta.cost).toLocaleString()}`}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-3 px-4 font-semibold">Carbon Emissions</td>
                        <td className="py-3 px-4">{results.baseline.emissions} kgCO₂e</td>
                        <td className="py-3 px-4">{results.simulated.emissions} kgCO₂e</td>
                        <td className={`py-3 px-4 text-right font-bold ${results.delta.emissions >= 0 ? 'text-[#00d4aa]' : 'text-red-400'}`}>
                          {results.delta.emissions >= 0 ? `Reduced ${results.delta.emissions} kg` : `Added ${Math.abs(results.delta.emissions)} kg`}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-3 px-4 font-semibold">Comfort Compliance</td>
                        <td className="py-3 px-4">{results.baseline.comfort}%</td>
                        <td className="py-3 px-4">{results.simulated.comfort}%</td>
                        <td className={`py-3 px-4 text-right font-bold ${results.delta.comfort >= 0 ? 'text-[#00d4aa]' : 'text-red-400'}`}>
                          {results.delta.comfort >= 0 ? `+${results.delta.comfort}%` : `${results.delta.comfort}%`}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Sensitivity Chart */}
              <Card className="p-6">
                <h3 className="text-sm font-bold text-white mb-2">Sensitivity Analysis Index</h3>
                <p className="text-xs text-white/50 mb-4">
                  Shows which parameter adjustments had the most significant impact on overall cost and comfort changes.
                </p>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={sensitivityData} layout="vertical" margin={{ left: 10, right: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                      <XAxis type="number" stroke="rgba(255,255,255,0.4)" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} label={{ value: 'Impact Factor (%)', position: 'bottom', fill: 'rgba(255,255,255,0.4)' }} />
                      <YAxis dataKey="name" type="category" stroke="rgba(255,255,255,0.4)" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} width={80} />
                      <Tooltip contentStyle={{ backgroundColor: '#0a0f1e', borderColor: 'rgba(255,255,255,0.1)', color: 'white' }} />
                      <Bar dataKey="impact" radius={[0, 4, 4, 0]} name="Relative Impact Sensitivity">
                        {sensitivityData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </>
          ) : (
            <Card className="p-12 text-center text-white/40 min-h-[400px] flex items-center justify-center">
              Configure parameters on the left panel and click "Run What-If Analysis" to view comparison matrices.
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
