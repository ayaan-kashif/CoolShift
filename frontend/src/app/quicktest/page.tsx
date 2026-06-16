'use client';

import React, { useState } from 'react';
import api from '../../lib/api';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import AlertBanner from '../../components/ui/AlertBanner';
import Badge from '../../components/ui/Badge';
import Link from 'next/link';

export default function QuickJudgeTest() {
  const [file, setFile] = useState<File | null>(null);
  const [csvText, setCsvText] = useState('');
  const [importMode, setImportMode] = useState<'upload' | 'paste'>('upload');

  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Configured states from import response
  const [importedScenarioId, setImportedScenarioId] = useState<string | null>(null);
  const [intervalsCount, setIntervalsCount] = useState<number>(0);

  // Results State
  const [results, setResults] = useState<any | null>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const handleImport = async () => {
    setError(null);
    setSuccess(null);
    setResults(null);

    let fileToUpload: File | null = file;

    if (importMode === 'paste') {
      if (!csvText.trim()) {
        setError('Please paste CSV text data first.');
        return;
      }
      const blob = new Blob([csvText], { type: 'text/csv' });
      fileToUpload = new File([blob], 'judge_input.csv', { type: 'text/csv' });
    } else {
      if (!fileToUpload) {
        setError('Please select or drag a CSV/XLSX file first.');
        return;
      }
    }

    setLoading(true);
    setStatusText('Uploading and parsing dataset...');

    const formData = new FormData();
    formData.append('file', fileToUpload);

    try {
      const importRes = await api.post('/api/v1/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const { intervals_loaded, validation } = importRes.data;

      if (intervals_loaded === 0) {
        throw new Error('No intervals could be parsed from the uploaded file.');
      }

      // Find the scenario_id from import rows (we can query get scenarios)
      setStatusText('Fetching imported scenario ID...');
      const scenariosRes = await api.get('/api/v1/scenarios');
      if (scenariosRes.data.length === 0) {
        throw new Error('Imported data could not map to any active scenario.');
      }

      // Sort by creation or pick the latest scenario_id containing intervals
      const latestScen = scenariosRes.data.reduce((latest: any, current: any) => {
        if (!latest) return current;
        return current.interval_count > 0 ? current : latest;
      }, null);

      if (!latestScen) {
        throw new Error('Could not identify imported scenario profile.');
      }

      setImportedScenarioId(latestScen.scenario_id);
      setIntervalsCount(intervals_loaded);
      setSuccess(`✅ Successfully imported ${intervals_loaded} intervals for Scenario: "${latestScen.name}"!`);
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.error || err.message || 'File import failed. Verify column names.');
    } finally {
      setLoading(false);
    }
  };

  const handleRunFullAnalysis = async () => {
    if (!importedScenarioId) return;

    setLoading(true);
    setError(null);

    try {
      // 1. Run Baseline
      setStatusText('Executing baseline simulation (Standard Cooling)...');
      await api.post(`/api/v1/baseline/${importedScenarioId}`, {});

      // 2. Run LP Optimization
      setStatusText('Executing LP Optimization Solver matrix...');
      const optRes = await api.post(`/api/v1/optimize/${importedScenarioId}`, {
        weights: { cost: 0.4, emissions: 0.3, comfort: 0.2, peak: 0.1 },
      });

      const optData = optRes.data;

      // 3. Fetch Compare details
      setStatusText('Extracting comparative metrics...');
      const compareRes = await api.get(`/api/v1/runs/${optData.run_id}/compare`);

      setResults({
        runId: optData.run_id,
        cost: optData.total_cost_pkr,
        comfort: optData.comfort_compliance_pct,
        emissions: optData.total_emissions_kgco2e,
        savings: compareRes.data.savings,
      });

      setSuccess('🚀 Full LP Optimization analysis generated successfully! Download your judge report below.');
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.error || 'Full optimization pipeline execution failed.');
    } finally {
      setLoading(false);
    }
  };

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
          ⚡ Quick Judge Test Pad
        </h1>
        <p className="text-white/60 text-sm mt-1">
          Designed specifically for live judge evaluation: import data, run optimization, and export templates in under 60 seconds.
        </p>
      </div>

      {error && <AlertBanner type="error" message={error} onClose={() => setError(null)} />}
      {success && <AlertBanner type="success" message={success} onClose={() => setSuccess(null)} />}

      {loading ? (
        <Card className="p-12 flex flex-col items-center justify-center min-h-[300px] gap-6">
          <LoadingSpinner size={14} />
          <div className="text-center">
            <h2 className="text-lg font-bold text-white">Pipeline executing...</h2>
            <p className="text-sm text-[#00d4aa] font-mono mt-2 animate-pulse">{statusText}</p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Left panel: Data input */}
          <Card className="p-6 space-y-6">
            <h2 className="text-lg font-bold text-white border-b border-white/10 pb-3">Step 1: Paste or Upload Dataset</h2>

            {/* Toggle import mode */}
            <div className="flex gap-2 p-1 bg-white/5 rounded-xl border border-white/5">
              <button
                type="button"
                onClick={() => setImportMode('upload')}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors ${
                  importMode === 'upload' ? 'bg-[#00d4aa] text-black' : 'text-white/60 hover:text-white'
                }`}
              >
                File Uploader
              </button>
              <button
                type="button"
                onClick={() => setImportMode('paste')}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors ${
                  importMode === 'paste' ? 'bg-[#00d4aa] text-black' : 'text-white/60 hover:text-white'
                }`}
              >
                Paste CSV Data
              </button>
            </div>

            {importMode === 'upload' ? (
              <div
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className="border-2 border-dashed border-white/15 rounded-xl p-8 text-center hover:border-[#00d4aa]/50 transition-colors cursor-pointer relative"
              >
                <input
                  type="file"
                  onChange={handleFileChange}
                  accept=".csv,.xlsx"
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
                <div className="text-3xl">📁</div>
                <p className="text-sm font-semibold text-white mt-2">
                  {file ? file.name : 'Select or drag your CSV/XLSX file here'}
                </p>
                <p className="text-xs text-white/40 mt-1">Accepts standard weather and outage formats</p>
              </div>
            ) : (
              <textarea
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder="scenario_id,timestamp_local,interval_minutes,temperature_c,relative_humidity_pct,solar_available_kw,occupancy_count,grid_available,tariff_type,tariff_pkr_per_kwh,grid_carbon_kgco2_per_kwh,non_cooling_load_kw"
                className="input-field h-40 font-mono text-xs p-3"
              />
            )}

            <Button variant="primary" onClick={handleImport} className="w-full">
              📥 Import Dataset
            </Button>
          </Card>

          {/* Right panel: Optimization Pipeline */}
          <Card className="p-6 flex flex-col justify-between">
            <div>
              <h2 className="text-lg font-bold text-white border-b border-white/10 pb-3">Step 2: Solve & Export</h2>

              {importedScenarioId ? (
                <div className="space-y-6 mt-6">
                  <div className="space-y-2">
                    <span className="text-[10px] text-white/40 font-bold uppercase block">Dataset Identified</span>
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-white/50">Scenario ID:</span>
                        <span className="font-mono font-bold text-white">{importedScenarioId}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/50">Intervals Parsed:</span>
                        <span className="font-mono font-bold text-[#00d4aa]">{intervalsCount} rows</span>
                      </div>
                    </div>
                  </div>

                  {!results && (
                    <Button variant="primary" onClick={handleRunFullAnalysis} className="w-full py-3">
                      🚀 Run Full LP Analysis
                    </Button>
                  )}
                </div>
              ) : (
                <div className="text-center py-16 text-white/40 text-xs">
                  Upload or paste the evaluation dataset on the left to activate solver options.
                </div>
              )}

              {/* Step 3: Fast Results */}
              {results && (
                <div className="space-y-6 mt-6 pt-6 border-t border-white/10">
                  <h3 className="text-sm font-bold text-white">Simulation Metrics</h3>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="bg-white/5 border border-white/5 rounded-xl p-3">
                      <span className="text-[10px] text-white/50 uppercase block">Cost PKR</span>
                      <span className="text-sm font-bold text-white">PKR {Math.round(results.cost).toLocaleString()}</span>
                    </div>
                    <div className="bg-white/5 border border-white/5 rounded-xl p-3">
                      <span className="text-[10px] text-white/50 uppercase block">Comfort</span>
                      <span className="text-sm font-bold text-white">{results.comfort.toFixed(1)}%</span>
                    </div>
                    <div className="bg-white/5 border border-white/5 rounded-xl p-3">
                      <span className="text-[10px] text-white/50 uppercase block">CO₂ avoided</span>
                      <span className="text-sm font-bold text-[#00d4aa]">{Math.round(results.savings.emissions_kgco2e)} kg</span>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <a href={`${apiBaseUrl}/api/v1/export/${results.runId}/csv`} className="flex-1">
                      <Button variant="primary" className="w-full">
                        📥 Download Judge CSV
                      </Button>
                    </a>
                    <Link href={`/runs/${results.runId}/compare`} className="flex-1">
                      <Button variant="secondary" className="w-full">
                        📊 Compare Detail
                      </Button>
                    </Link>
                  </div>
                </div>
              )}
            </div>

            <div className="text-[10px] text-white/40 text-center mt-6">
              Complies with automated submission checkers. Output template fields match organizer specifications exactly.
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
