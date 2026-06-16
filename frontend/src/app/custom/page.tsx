// file:///C:/Users/Hp/OneDrive/Desktop%202/CoolShift/CoolShift/frontend/src/app/custom/page.tsx
'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import api from '../../lib/api';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import AlertBanner from '../../components/ui/AlertBanner';
import FileUpload from '../../components/ui/FileUpload';

interface ValidationIssue {
  row: number;
  column: string;
  message: string;
}

interface ImportSummary {
  scenarios_loaded: number;
  appliances_loaded: number;
  energy_assets_loaded: number;
  intervals_loaded: number;
  validation: {
    rows_parsed: number;
    rows_valid: number;
    errors: ValidationIssue[];
    warnings: ValidationIssue[];
  };
}

export default function CustomPage() {
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

  const handleFileUpload = async (file: File) => {
    setLoading(true);
    setError(null);
    setSummary(null);
    setUploadStatus('Uploading custom scenario and running schema validation...');

    const filename = file.name.toLowerCase();
    let endpoint = '/api/v1/import/xlsx';
    if (filename.endsWith('.csv')) {
      endpoint = '/api/v1/import/csv';
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await api.post(endpoint, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      setSummary(res.data);
    } catch (err: any) {
      console.error(err);
      setError(
        err.response?.data?.error || 'Failed to import custom scenario. Please verify the CSV header structure.'
      );
    } finally {
      setLoading(false);
      setUploadStatus(null);
    }
  };

  const downloadCSVTemplate = () => {
    const columns = [
      'scenario_id',
      'timestamp_local',
      'interval_minutes',
      'temperature_c',
      'relative_humidity_pct',
      'heat_index_c',
      'solar_irradiance_w_m2',
      'solar_available_kw',
      'occupancy_count',
      'grid_available',
      'tariff_type',
      'tariff_pkr_per_kwh',
      'grid_carbon_kgco2_per_kwh',
      'non_cooling_load_kw',
      'source_missing_flag',
    ];

    const rows = [
      [
        'custom_hospital_karachi',
        '2026-07-01T00:00:00',
        '15',
        '30.5',
        '75',
        '33.2',
        '0',
        '0',
        '50',
        '1',
        'OFF_PEAK',
        '18.0',
        '0.45',
        '5.0',
        '0',
      ],
      [
        'custom_hospital_karachi',
        '2026-07-01T00:15:00',
        '15',
        '30.3',
        '76',
        '33.0',
        '0',
        '0',
        '50',
        '1',
        'OFF_PEAK',
        '18.0',
        '0.45',
        '5.0',
        '0',
      ],
      [
        'custom_hospital_karachi',
        '2026-07-01T12:00:00',
        '15',
        '39.5',
        '65',
        '42.3',
        '850',
        '8.0',
        '200',
        '1',
        'ON_PEAK',
        '32.0',
        '0.45',
        '8.5',
        '0',
      ],
      [
        'custom_hospital_karachi',
        '2026-07-01T19:00:00',
        '15',
        '36.2',
        '70',
        '38.5',
        '0',
        '0',
        '200',
        '0',
        'PEAK',
        '45.0',
        '0.45',
        '6.2',
        '0',
      ],
    ];

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [columns.join(','), ...rows.map((e) => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'custom_scenario_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-white">Custom Scenario Import</h1>
        <p className="text-white/60 text-sm mt-1">
          Upload specialized weather events or critical facility grid models to evaluate complex cooling optimization constraints.
        </p>
      </div>

      {error && (
        <AlertBanner
          type="error"
          message={error}
          onClose={() => setError(null)}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Drag & Drop Upload Zone */}
        <div className="lg:col-span-2 space-y-6">
          {!summary ? (
            <Card className="p-6">
              <FileUpload onFileSelect={handleFileUpload} disabled={loading} />
              {loading && (
                <div className="mt-6 flex flex-col items-center gap-3">
                  <LoadingSpinner size={10} />
                  <p className="text-xs text-white/50 animate-pulse">{uploadStatus}</p>
                </div>
              )}
            </Card>
          ) : (
            <div className="space-y-6">
              <Card className="p-6 border-[#00d4aa]/30 shadow-[0_0_15px_rgba(0,212,170,0.1)]">
                <div className="flex items-center gap-3 mb-6">
                  <span className="text-3xl">✅</span>
                  <div>
                    <h2 className="text-xl font-bold text-white">Custom Scenario Loaded</h2>
                    <p className="text-xs text-white/50">Custom dataset registered in database</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                    <p className="text-xs text-white/50">Scenarios Loaded</p>
                    <p className="text-2xl font-bold text-white mt-1">{summary.scenarios_loaded}</p>
                  </div>
                  <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                    <p className="text-xs text-white/50">Appliances Loaded</p>
                    <p className="text-2xl font-bold text-white mt-1">{summary.appliances_loaded}</p>
                  </div>
                  <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                    <p className="text-xs text-white/50">Energy Assets Loaded</p>
                    <p className="text-2xl font-bold text-white mt-1">{summary.energy_assets_loaded}</p>
                  </div>
                  <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                    <p className="text-xs text-white/50">Intervals Loaded</p>
                    <p className="text-2xl font-bold text-white mt-1">{summary.intervals_loaded.toLocaleString()}</p>
                  </div>
                </div>

                <div className="border-t border-white/10 pt-4 flex justify-between items-center">
                  <div className="text-xs text-white/60">
                    <span className="font-semibold text-white">Parsed:</span> {summary.validation.rows_parsed} |{' '}
                    <span className="font-semibold text-white">Valid Rows:</span> {summary.validation.rows_valid}
                  </div>
                  <div className="flex gap-3">
                    <Button variant="secondary" onClick={() => setSummary(null)}>
                      Upload Another
                    </Button>
                    <Link href="/">
                      <Button variant="primary">Go to Dashboard</Button>
                    </Link>
                  </div>
                </div>
              </Card>

              {/* Seeding Diagnostics */}
              {(summary.validation.errors.length > 0 || summary.validation.warnings.length > 0) && (
                <Card className="p-6">
                  <h3 className="text-lg font-bold text-white mb-4">Diagnostics & Warnings</h3>

                  {/* Errors List */}
                  {summary.validation.errors.length > 0 && (
                    <div className="mb-6">
                      <h4 className="text-xs font-semibold text-[#ef4444] uppercase tracking-wider mb-2">
                        Critical Errors ({summary.validation.errors.length})
                      </h4>
                      <div className="bg-red-500/10 border border-red-500/20 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                        <table className="w-full text-xs text-left border-collapse">
                          <thead>
                            <tr className="bg-red-950/20 text-red-200 border-b border-red-500/20">
                              <th className="py-2 px-3">Row</th>
                              <th className="py-2 px-3">Column</th>
                              <th className="py-2 px-3">Diagnostic Message</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-red-500/10 text-red-100/80">
                            {summary.validation.errors.map((err, idx) => (
                              <tr key={idx} className="hover:bg-red-500/5">
                                <td className="py-2 px-3 font-semibold">{err.row}</td>
                                <td className="py-2 px-3 font-mono text-red-300">{err.column}</td>
                                <td className="py-2 px-3">{err.message}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Warnings List */}
                  {summary.validation.warnings.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-[#f59e0b] uppercase tracking-wider mb-2">
                        Non-Critical Warnings ({summary.validation.warnings.length})
                      </h4>
                      <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                        <table className="w-full text-xs text-left border-collapse">
                          <thead>
                            <tr className="bg-yellow-950/20 text-yellow-200 border-b border-yellow-500/20">
                              <th className="py-2 px-3">Row</th>
                              <th className="py-2 px-3">Column</th>
                              <th className="py-2 px-3">Diagnostic Message</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-yellow-500/10 text-yellow-100/80">
                            {summary.validation.warnings.map((wrn, idx) => (
                              <tr key={idx} className="hover:bg-yellow-500/5">
                                <td className="py-2 px-3 font-semibold">{wrn.row}</td>
                                <td className="py-2 px-3 font-mono text-yellow-300">{wrn.column}</td>
                                <td className="py-2 px-3">{wrn.message}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </Card>
              )}
            </div>
          )}
        </div>

        {/* Instructions Side */}
        <div className="space-y-6">
          <Card className="p-6 space-y-4">
            <h3 className="text-lg font-bold text-white">Specifications</h3>
            <p className="text-xs text-white/70 leading-relaxed">
              Custom scenarios evaluate optimization runs against complex facility demands, like healthcare or emergency buildings.
            </p>
            <div className="bg-white/5 rounded-xl p-3 border border-white/5 space-y-2">
              <h4 className="text-xs font-semibold text-[#00d4aa]">Custom Karachi Hospital Format:</h4>
              <ul className="list-disc list-inside text-[10px] text-white/60 space-y-1">
                <li>Scenario ID: <code className="text-white">custom_hospital_karachi</code></li>
                <li>Length: 7 days starting 2026-07-01</li>
                <li>Resolution: 15-minute intervals (672 rows)</li>
                <li>Weather: Karachi peak (38°C - 43°C)</li>
                <li>Outage events: Load-shedding on Day 2 & Day 5</li>
                <li>Solar panel system: 8kW peak at noon</li>
                <li>Occupancy: 200 (daytime) / 50 (nighttime)</li>
              </ul>
            </div>
            <Button variant="secondary" onClick={downloadCSVTemplate} className="w-full text-xs">
              📥 Download CSV Template
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
