// file:///C:/Users/Hp/OneDrive/Desktop%202/CoolShift/CoolShift/frontend/src/app/scenarios/new/page.tsx
'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '../../../lib/api';
import Card from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import AlertBanner from '../../../components/ui/AlertBanner';

interface ApplianceInput {
  appliance_type: 'Inverter AC' | 'Window AC' | 'Ceiling fan' | 'Portable AC';
  quantity: number;
  rated_power_kw: number;
  cooling_capacity_kw: number;
  efficiency_label: string;
  min_runtime_minutes: number;
  min_setpoint_c: number;
  max_setpoint_c: number;
}

export default function NewScenarioPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Step 1: Building Profile
  const [profile, setProfile] = useState({
    name: '',
    building_type: 'Household' as 'Household' | 'School' | 'Office' | 'Clinic' | 'Retail',
    area_m2: 120,
    room_count: 3,
    max_occupancy: 5,
    insulation_level: 'Medium' as 'Low' | 'Medium' | 'High',
    sun_exposure: 'Medium' as 'Low' | 'Medium' | 'High',
    comfort_min_c: 20,
    comfort_max_c: 26,
    vulnerable_occupants: false,
    budget_pkr_per_day: 500,
    maximum_grid_demand_kw: 10,
  });

  // Step 2: Appliances
  const [appliances, setAppliances] = useState<ApplianceInput[]>([
    {
      appliance_type: 'Inverter AC',
      quantity: 1,
      rated_power_kw: 1.5,
      cooling_capacity_kw: 3.5,
      efficiency_label: '5 Star',
      min_runtime_minutes: 15,
      min_setpoint_c: 16,
      max_setpoint_c: 30,
    },
  ]);

  // Step 3: Energy Assets
  const [hasEnergyAssets, setHasEnergyAssets] = useState(false);
  const [assets, setAssets] = useState({
    solar_capacity_kw: 5,
    solar_conversion_efficiency: 0.18,
    battery_capacity_kwh: 10,
    initial_soc_kwh: 5,
    minimum_reserve_kwh: 2,
    max_charge_kw: 3,
    max_discharge_kw: 3,
    charge_efficiency: 0.95,
    discharge_efficiency: 0.95,
  });

  const handleAddAppliance = () => {
    setAppliances([
      ...appliances,
      {
        appliance_type: 'Inverter AC',
        quantity: 1,
        rated_power_kw: 1.5,
        cooling_capacity_kw: 3.5,
        efficiency_label: 'N/A',
        min_runtime_minutes: 15,
        min_setpoint_c: 16,
        max_setpoint_c: 30,
      },
    ]);
  };

  const handleRemoveAppliance = (index: number) => {
    if (appliances.length === 1) return;
    setAppliances(appliances.filter((_, idx) => idx !== index));
  };

  const handleApplianceChange = (index: number, field: keyof ApplianceInput, value: any) => {
    const updated = [...appliances];
    updated[index] = { ...updated[index], [field]: value };
    setAppliances(updated);
  };

  const handleSubmit = async () => {
    if (!profile.name.trim()) {
      setError('Please provide a name for the scenario profile.');
      setStep(1);
      return;
    }

    setSubmitting(true);
    setError(null);

    const scenarioId = `scen_${profile.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${Math.random()
      .toString(36)
      .slice(2, 7)}`;

    const payload = {
      profile: {
        ...profile,
        scenario_id: scenarioId,
      },
      appliances,
      energy_assets: hasEnergyAssets ? assets : null,
    };

    try {
      await api.post('/api/v1/scenarios', payload);
      router.push(`/optimize?scenario_id=${scenarioId}`);
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.error || 'Failed to create scenario profile. Please verify all fields.');
      setSubmitting(false);
    }
  };

  const nextStep = () => {
    if (step === 1 && !profile.name.trim()) {
      setError('Please provide a name for this scenario profile.');
      return;
    }
    setError(null);
    setStep(step + 1);
  };

  const prevStep = () => {
    setError(null);
    setStep(step - 1);
  };

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-white">Create Optimization Scenario</h1>
        <p className="text-white/60 text-sm mt-1">
          Configure a building scenario model by specifying the structure, appliances, and energy parameters.
        </p>
      </div>

      {error && <AlertBanner type="error" message={error} onClose={() => setError(null)} />}

      {/* Progress Bar */}
      <div className="relative">
        <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#00d4aa] transition-all duration-300"
            style={{ width: `${(step / 3) * 100}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-white/50 mt-2">
          <span className={step >= 1 ? 'text-[#00d4aa] font-semibold' : ''}>1. Building Profile</span>
          <span className={step >= 2 ? 'text-[#00d4aa] font-semibold' : ''}>2. Cooling Appliances</span>
          <span className={step >= 3 ? 'text-[#00d4aa] font-semibold' : ''}>3. Energy Assets</span>
        </div>
      </div>

      {/* STEP 1: BUILDING PROFILE */}
      {step === 1 && (
        <Card className="p-6 space-y-6">
          <h2 className="text-lg font-bold text-white">Step 1: Building & Envelope Profile</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-white/60 uppercase">Scenario Name *</label>
              <input
                type="text"
                value={profile.name}
                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                className="input-field"
                placeholder="e.g. Karachi Office Block A"
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-white/60 uppercase">Building Type</label>
              <select
                value={profile.building_type}
                onChange={(e: any) => setProfile({ ...profile, building_type: e.target.value })}
                className="input-field"
              >
                <option value="Household">Household</option>
                <option value="School">School</option>
                <option value="Office">Office</option>
                <option value="Clinic">Clinic</option>
                <option value="Retail">Retail</option>
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-white/60 uppercase">Floor Area (m²)</label>
              <input
                type="number"
                value={profile.area_m2}
                onChange={(e) => setProfile({ ...profile, area_m2: Math.max(1, parseFloat(e.target.value) || 0) })}
                className="input-field"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-white/60 uppercase">Room Count</label>
              <input
                type="number"
                value={profile.room_count}
                onChange={(e) => setProfile({ ...profile, room_count: Math.max(1, parseInt(e.target.value) || 0) })}
                className="input-field"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-white/60 uppercase">Max Occupancy</label>
              <input
                type="number"
                value={profile.max_occupancy}
                onChange={(e) => setProfile({ ...profile, max_occupancy: Math.max(1, parseInt(e.target.value) || 0) })}
                className="input-field"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-white/60 uppercase">Envelope Insulation</label>
              <select
                value={profile.insulation_level}
                onChange={(e: any) => setProfile({ ...profile, insulation_level: e.target.value })}
                className="input-field"
              >
                <option value="Low">Low (Uninsulated brick/tin roof)</option>
                <option value="Medium">Medium (Standard concrete)</option>
                <option value="High">High (Double-glazed/insulated roof)</option>
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-white/60 uppercase">Sun Exposure</label>
              <select
                value={profile.sun_exposure}
                onChange={(e: any) => setProfile({ ...profile, sun_exposure: e.target.value })}
                className="input-field"
              >
                <option value="Low">Low (shaded)</option>
                <option value="Medium">Medium</option>
                <option value="High">High (roof/west-facing windows)</option>
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-white/60 uppercase">Maximum Grid Demand limit (kW)</label>
              <input
                type="number"
                value={profile.maximum_grid_demand_kw}
                onChange={(e) => setProfile({ ...profile, maximum_grid_demand_kw: Math.max(1, parseFloat(e.target.value) || 0) })}
                className="input-field"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-white/60 uppercase">Target Comfort Min (°C)</label>
              <input
                type="number"
                value={profile.comfort_min_c}
                onChange={(e) => setProfile({ ...profile, comfort_min_c: parseFloat(e.target.value) || 0 })}
                className="input-field"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-white/60 uppercase">Target Comfort Max (°C)</label>
              <input
                type="number"
                value={profile.comfort_max_c}
                onChange={(e) => setProfile({ ...profile, comfort_max_c: parseFloat(e.target.value) || 0 })}
                className="input-field"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-white/60 uppercase">Daily Budget Limit (PKR)</label>
              <input
                type="number"
                value={profile.budget_pkr_per_day}
                onChange={(e) => setProfile({ ...profile, budget_pkr_per_day: Math.max(0, parseFloat(e.target.value) || 0) })}
                className="input-field"
              />
            </div>

            <div className="flex items-center gap-3 pt-6">
              <input
                id="vuln"
                type="checkbox"
                checked={profile.vulnerable_occupants}
                onChange={(e) => setProfile({ ...profile, vulnerable_occupants: e.target.checked })}
                className="w-4 h-4 rounded accent-[#00d4aa] cursor-pointer"
              />
              <label htmlFor="vuln" className="text-xs text-white/80 cursor-pointer font-medium select-none">
                Vulnerable occupants (forces stricter comfort constraints)
              </label>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-white/10">
            <Button variant="primary" onClick={nextStep} type="button">
              Next Step: Appliances ▶
            </Button>
          </div>
        </Card>
      )}

      {/* STEP 2: COOLING APPLIANCES */}
      {step === 2 && (
        <Card className="p-6 space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-white">Step 2: Cooling Appliances Config</h2>
            <Button variant="secondary" onClick={handleAddAppliance} type="button" className="text-xs">
              ➕ Add Appliance
            </Button>
          </div>

          <div className="space-y-6">
            {appliances.map((app, idx) => (
              <div key={idx} className="p-4 bg-white/5 border border-white/10 rounded-xl relative space-y-4">
                {appliances.length > 1 && (
                  <button
                    onClick={() => handleRemoveAppliance(idx)}
                    className="absolute top-3 right-3 text-red-400 hover:text-red-300 text-xs font-bold"
                    type="button"
                  >
                    Delete Row
                  </button>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold text-white/50 uppercase">Appliance Type</label>
                    <select
                      value={app.appliance_type}
                      onChange={(e: any) => handleApplianceChange(idx, 'appliance_type', e.target.value)}
                      className="input-field text-xs py-2"
                    >
                      <option value="Inverter AC">Inverter AC</option>
                      <option value="Window AC">Window AC</option>
                      <option value="Ceiling fan">Ceiling fan</option>
                      <option value="Portable AC">Portable AC</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold text-white/50 uppercase">Quantity</label>
                    <input
                      type="number"
                      value={app.quantity}
                      onChange={(e) => handleApplianceChange(idx, 'quantity', Math.max(1, parseInt(e.target.value) || 0))}
                      className="input-field text-xs py-2"
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold text-white/50 uppercase">Rated Power (kW)</label>
                    <input
                      type="number"
                      value={app.rated_power_kw}
                      step="0.1"
                      onChange={(e) => handleApplianceChange(idx, 'rated_power_kw', Math.max(0.01, parseFloat(e.target.value) || 0))}
                      className="input-field text-xs py-2"
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold text-white/50 uppercase">Cooling Capacity (kW)</label>
                    <input
                      type="number"
                      value={app.cooling_capacity_kw}
                      step="0.1"
                      onChange={(e) => handleApplianceChange(idx, 'cooling_capacity_kw', Math.max(0, parseFloat(e.target.value) || 0))}
                      className="input-field text-xs py-2"
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold text-white/50 uppercase">Efficiency Label / COP</label>
                    <input
                      type="text"
                      value={app.efficiency_label}
                      onChange={(e) => handleApplianceChange(idx, 'efficiency_label', e.target.value)}
                      className="input-field text-xs py-2"
                      placeholder="e.g. EER 3.2"
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold text-white/50 uppercase">Min Runtime (mins)</label>
                    <input
                      type="number"
                      value={app.min_runtime_minutes}
                      onChange={(e) => handleApplianceChange(idx, 'min_runtime_minutes', Math.max(0, parseInt(e.target.value) || 0))}
                      className="input-field text-xs py-2"
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold text-white/50 uppercase">Min Setpoint (°C)</label>
                    <input
                      type="number"
                      value={app.min_setpoint_c}
                      onChange={(e) => handleApplianceChange(idx, 'min_setpoint_c', parseInt(e.target.value) || 16)}
                      className="input-field text-xs py-2"
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold text-white/50 uppercase">Max Setpoint (°C)</label>
                    <input
                      type="number"
                      value={app.max_setpoint_c}
                      onChange={(e) => handleApplianceChange(idx, 'max_setpoint_c', parseInt(e.target.value) || 30)}
                      className="input-field text-xs py-2"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-between pt-4 border-t border-white/10">
            <Button variant="secondary" onClick={prevStep} type="button">
              ◀ Back: Envelope
            </Button>
            <Button variant="primary" onClick={nextStep} type="button">
              Next Step: Energy Assets ▶
            </Button>
          </div>
        </Card>
      )}

      {/* STEP 3: ENERGY ASSETS */}
      {step === 3 && (
        <Card className="p-6 space-y-6">
          <div className="flex items-center gap-3">
            <input
              id="hasAssets"
              type="checkbox"
              checked={hasEnergyAssets}
              onChange={(e) => setHasEnergyAssets(e.target.checked)}
              className="w-4 h-4 rounded accent-[#00d4aa] cursor-pointer"
            />
            <label htmlFor="hasAssets" className="text-sm font-bold text-white cursor-pointer select-none">
              This building has local generation or energy storage assets (Solar/Battery)
            </label>
          </div>

          {hasEnergyAssets && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-white/5">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-white/60 uppercase">Solar Array Peak Capacity (kW)</label>
                <input
                  type="number"
                  value={assets.solar_capacity_kw}
                  onChange={(e) => setAssets({ ...assets, solar_capacity_kw: Math.max(0, parseFloat(e.target.value) || 0) })}
                  className="input-field"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-white/60 uppercase">Solar Conversion Efficiency (0-1)</label>
                <input
                  type="number"
                  step="0.01"
                  value={assets.solar_conversion_efficiency}
                  onChange={(e) => setAssets({ ...assets, solar_conversion_efficiency: Math.min(1, Math.max(0, parseFloat(e.target.value) || 0)) })}
                  className="input-field"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-white/60 uppercase">Battery Pack Capacity (kWh)</label>
                <input
                  type="number"
                  value={assets.battery_capacity_kwh}
                  onChange={(e) => setAssets({ ...assets, battery_capacity_kwh: Math.max(0, parseFloat(e.target.value) || 0) })}
                  className="input-field"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-white/60 uppercase">Initial SoC (kWh)</label>
                <input
                  type="number"
                  value={assets.initial_soc_kwh}
                  onChange={(e) => setAssets({ ...assets, initial_soc_kwh: Math.max(0, parseFloat(e.target.value) || 0) })}
                  className="input-field"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-white/60 uppercase">Minimum Reserve (kWh)</label>
                <input
                  type="number"
                  value={assets.minimum_reserve_kwh}
                  onChange={(e) => setAssets({ ...assets, minimum_reserve_kwh: Math.max(0, parseFloat(e.target.value) || 0) })}
                  className="input-field"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-white/60 uppercase">Max Charging Rate (kW)</label>
                <input
                  type="number"
                  value={assets.max_charge_kw}
                  onChange={(e) => setAssets({ ...assets, max_charge_kw: Math.max(0, parseFloat(e.target.value) || 0) })}
                  className="input-field"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-white/60 uppercase">Max Discharging Rate (kW)</label>
                <input
                  type="number"
                  value={assets.max_discharge_kw}
                  onChange={(e) => setAssets({ ...assets, max_discharge_kw: Math.max(0, parseFloat(e.target.value) || 0) })}
                  className="input-field"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-white/60 uppercase">Round-Trip Charging Efficiency</label>
                <input
                  type="number"
                  step="0.01"
                  value={assets.charge_efficiency}
                  onChange={(e) => setAssets({ ...assets, charge_efficiency: Math.min(1, Math.max(0.1, parseFloat(e.target.value) || 0)) })}
                  className="input-field"
                />
              </div>
            </div>
          )}

          <div className="flex justify-between pt-4 border-t border-white/10">
            <Button variant="secondary" onClick={prevStep} type="button" disabled={submitting}>
              ◀ Back: Appliances
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmit}
              loading={submitting}
              type="button"
            >
              🚀 Finalize & Create Scenario
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
