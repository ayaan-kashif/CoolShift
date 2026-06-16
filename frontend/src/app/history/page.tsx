'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { runsApi, exportApi } from '@/lib/api';

export default function HistoryPage() {
  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRuns = () => {
    setLoading(true);
    runsApi.list().then(r => { setRuns(r.data); setLoading(false); }).catch(() => setLoading(false));
  };

  useEffect(loadRuns, []);

  const handleDelete = async (runId: string) => {
    if (!confirm('Delete this run and all its results?')) return;
    await runsApi.delete(runId);
    loadRuns();
  };

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: '800', letterSpacing: '-1px', marginBottom: '8px' }}>
          <span className="gradient-text">History & Export</span>
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>
          All past optimization runs with export options
        </p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>⏳ Loading history...</div>
      ) : runs.length === 0 ? (
        <div className="glass-card" style={{ padding: '60px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📜</div>
          <h3 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '8px' }}>No runs yet</h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>Run an optimization to see results here</p>
          <Link href="/optimize"><button className="btn-primary">⚡ Run Optimization</button></Link>
        </div>
      ) : (
        <div className="glass-card" style={{ overflow: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Run ID</th>
                <th>Scenario</th>
                <th>Algorithm</th>
                <th>Status</th>
                <th>Intervals</th>
                <th>Duration</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run: any) => (
                <tr key={run.run_id}>
                  <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{run.run_id?.slice(0, 8)}...</td>
                  <td>
                    <div style={{ fontWeight: '600' }}>{run.scenario_name || run.scenario_id}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{run.scenario_id}</div>
                  </td>
                  <td><span className="badge badge-info" style={{ fontSize: '9px' }}>{run.algorithm_version}</span></td>
                  <td>
                    <span className={`badge ${run.status === 'complete' ? 'badge-success' : run.status === 'failed' ? 'badge-danger' : 'badge-warning'}`}>
                      {run.status}
                    </span>
                  </td>
                  <td>{run.interval_count?.toLocaleString() || '—'}</td>
                  <td>{run.run_duration_seconds ? `${run.run_duration_seconds.toFixed(1)}s` : '—'}</td>
                  <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {run.created_at ? new Date(run.created_at).toLocaleDateString() : '—'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {run.status === 'complete' && (
                        <>
                          <Link href={`/runs/${run.run_id}`}>
                            <button className="btn-secondary" style={{ padding: '4px 8px', fontSize: '11px' }}>📋</button>
                          </Link>
                          <Link href={`/runs/${run.run_id}/compare`}>
                            <button className="btn-secondary" style={{ padding: '4px 8px', fontSize: '11px' }}>📊</button>
                          </Link>
                          <button className="btn-secondary" onClick={() => window.open(exportApi.csv(run.run_id), '_blank')} style={{ padding: '4px 8px', fontSize: '11px' }}>CSV</button>
                          <button className="btn-secondary" onClick={() => window.open(exportApi.xlsx(run.run_id), '_blank')} style={{ padding: '4px 8px', fontSize: '11px' }}>XLSX</button>
                        </>
                      )}
                      <button className="btn-danger" onClick={() => handleDelete(run.run_id)} style={{ padding: '4px 8px', fontSize: '11px' }}>🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
