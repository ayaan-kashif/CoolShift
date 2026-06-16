'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { scenariosApi } from '@/lib/api';

export default function ScenarioDetail() {
  const params = useParams();
  const id = params.id as string;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    scenariosApi.get(id).then(r => { setData(r.data); setLoading(false); }).catch(() => setLoading(false));
  }, [id]);

  if (loading) return <div style={{ textAlign: 'center', padding: '80px', color: 'var(--text-muted)' }}>⏳ Loading scenario...</div>;
  if (!data) return <div className="glass-card" style={{ padding: '40px', textAlign: 'center', color: 'var(--danger)' }}>Scenario not found</div>;

  const { profile, appliances, energy_assets } = data;

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: '800', marginBottom: '4px' }}>
            <span className="gradient-text">{profile.name}</span>
          </h1>
          <div style={{ display: 'flex', gap: '8px' }}>
            <span className="badge badge-info">{profile.scenario_id}</span>
            <span className="badge badge-neutral">{profile.building_type}</span>
          </div>
        </div>
        <Link href={`/optimize?scenario=${profile.scenario_id}`}>
          <button className="btn-primary">⚡ Optimize</button>
        </Link>
      </div>

      {/* Profile Details */}
      <div className="glass-card" style={{ padding: '24px', marginBottom: '16px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '16px' }}>🏗️ Building Profile</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
          {[
            ['Area', `${profile.area_m2} m²`], ['Rooms', profile.room_count], ['Max Occupancy', profile.max_occupancy],
            ['Insulation', profile.insulation_level], ['Sun Exposure', profile.sun_exposure],
            ['Comfort Range', `${profile.comfort_min_c}–${profile.comfort_max_c}°C`],
            ['Budget', `PKR ${profile.budget_pkr_per_day}/day`], ['Max Demand', `${profile.maximum_grid_demand_kw} kW`],
            ['Vulnerable', profile.vulnerable_occupants ? 'Yes' : 'No'],
          ].map(([label, value]) => (
            <div key={label as string}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
              <div style={{ fontSize: '15px', fontWeight: '600', marginTop: '4px' }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Appliances */}
      <div className="glass-card" style={{ padding: '24px', marginBottom: '16px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '16px' }}>❄️ Appliances ({appliances?.length || 0})</h3>
        {appliances?.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
            {appliances.map((a: any) => (
              <div key={a.appliance_id} style={{ padding: '16px', background: 'var(--background-secondary)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                <div style={{ fontWeight: '700', marginBottom: '8px' }}>{a.appliance_type} × {a.quantity}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                  <span>Power: {a.rated_power_kw} kW</span>
                  <span>Cooling: {a.cooling_capacity_kw} kW</span>
                  <span>Setpoint: {a.min_setpoint_c}–{a.max_setpoint_c}°C</span>
                  <span>Min Run: {a.min_runtime_minutes} min</span>
                </div>
              </div>
            ))}
          </div>
        ) : <div style={{ color: 'var(--text-muted)' }}>No appliances configured</div>}
      </div>

      {/* Energy Assets */}
      {energy_assets && (
        <div className="glass-card" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '16px' }}>🔋 Energy Assets</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
            {[
              ['Solar Capacity', `${energy_assets.solar_capacity_kw} kW`],
              ['Solar Efficiency', `${(energy_assets.solar_conversion_efficiency * 100).toFixed(0)}%`],
              ['Battery Capacity', `${energy_assets.battery_capacity_kwh} kWh`],
              ['Initial SoC', `${energy_assets.initial_soc_kwh} kWh`],
              ['Min Reserve', `${energy_assets.minimum_reserve_kwh} kWh`],
              ['Max Charge', `${energy_assets.max_charge_kw} kW`],
              ['Max Discharge', `${energy_assets.max_discharge_kw} kW`],
              ['Charge Eff.', `${(energy_assets.charge_efficiency * 100).toFixed(0)}%`],
              ['Discharge Eff.', `${(energy_assets.discharge_efficiency * 100).toFixed(0)}%`],
            ].map(([label, value]) => (
              <div key={label as string}>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</div>
                <div style={{ fontSize: '15px', fontWeight: '600', marginTop: '4px' }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
