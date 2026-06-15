/**
 * Synthetic data generator for CoolShift public scenarios.
 * Generates 3 scenarios × 30 days × 96 intervals = 8,640 rows.
 * Based on Karachi, Pakistan (Asia/Karachi) summer weather patterns.
 *
 * Run: npx ts-node src/seed/generate-data.ts
 */

import { getDb } from '../db/connection';

function generateData() {
  const db = getDb();
  console.log('🌱 Generating synthetic data for CoolShift...');

  // ─── Scenario Profiles ───
  const scenarios = [
    {
      scenario_id: 'PUB-A',
      name: 'Urban Household (No Solar)',
      building_type: 'Household',
      area_m2: 120,
      room_count: 3,
      max_occupancy: 5,
      insulation_level: 'Medium',
      sun_exposure: 'High',
      comfort_min_c: 23,
      comfort_max_c: 28,
      vulnerable_occupants: 1,
      budget_pkr_per_day: 450,
      maximum_grid_demand_kw: 5,
      evaluation_focus: 'Cost reduction for household without solar/battery; manage comfort during outages',
    },
    {
      scenario_id: 'PUB-B',
      name: 'Solar-Equipped Household',
      building_type: 'Household',
      area_m2: 150,
      room_count: 4,
      max_occupancy: 6,
      insulation_level: 'High',
      sun_exposure: 'Medium',
      comfort_min_c: 22,
      comfort_max_c: 27,
      vulnerable_occupants: 1,
      budget_pkr_per_day: 600,
      maximum_grid_demand_kw: 7,
      evaluation_focus: 'Maximize solar/battery utilization; minimize grid dependence and emissions',
    },
    {
      scenario_id: 'PUB-C',
      name: 'Small Office / Classroom',
      building_type: 'Office',
      area_m2: 200,
      room_count: 5,
      max_occupancy: 25,
      insulation_level: 'Low',
      sun_exposure: 'High',
      comfort_min_c: 22,
      comfort_max_c: 27,
      vulnerable_occupants: 0,
      budget_pkr_per_day: 1200,
      maximum_grid_demand_kw: 15,
      evaluation_focus: 'Manage large occupancy cooling; peak demand reduction; budget-aware optimization',
    },
  ];

  // Insert scenarios
  const insertProfile = db.prepare(`
    INSERT OR REPLACE INTO scenario_profiles (scenario_id, name, timezone, building_type, area_m2, room_count, max_occupancy, insulation_level, sun_exposure, comfort_min_c, comfort_max_c, vulnerable_occupants, budget_pkr_per_day, maximum_grid_demand_kw, evaluation_focus)
    VALUES (?, ?, 'Asia/Karachi', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const s of scenarios) {
    insertProfile.run(s.scenario_id, s.name, s.building_type, s.area_m2, s.room_count, s.max_occupancy, s.insulation_level, s.sun_exposure, s.comfort_min_c, s.comfort_max_c, s.vulnerable_occupants, s.budget_pkr_per_day, s.maximum_grid_demand_kw, s.evaluation_focus);
  }
  console.log(`  ✅ ${scenarios.length} scenario profiles created`);

  // ─── Appliances ───
  const appliances = [
    // PUB-A: 2 window ACs, 3 ceiling fans
    { appliance_id: 'PUB-A-AC1', scenario_id: 'PUB-A', zone_id: 'ZONE-1', appliance_type: 'Window AC', quantity: 1, rated_power_kw: 1.8, cooling_capacity_kw: 3.0, efficiency_label: 'B', min_runtime_minutes: 30, min_setpoint_c: 18, max_setpoint_c: 30 },
    { appliance_id: 'PUB-A-AC2', scenario_id: 'PUB-A', zone_id: 'ZONE-2', appliance_type: 'Window AC', quantity: 1, rated_power_kw: 1.5, cooling_capacity_kw: 2.5, efficiency_label: 'B', min_runtime_minutes: 30, min_setpoint_c: 18, max_setpoint_c: 30 },
    { appliance_id: 'PUB-A-FAN1', scenario_id: 'PUB-A', zone_id: 'ALL', appliance_type: 'Ceiling fan', quantity: 3, rated_power_kw: 0.075, cooling_capacity_kw: 0, efficiency_label: 'N/A', min_runtime_minutes: 0, min_setpoint_c: 16, max_setpoint_c: 30 },
    // PUB-B: 2 inverter ACs, 4 ceiling fans
    { appliance_id: 'PUB-B-AC1', scenario_id: 'PUB-B', zone_id: 'ZONE-1', appliance_type: 'Inverter AC', quantity: 1, rated_power_kw: 1.2, cooling_capacity_kw: 3.5, efficiency_label: 'A+', min_runtime_minutes: 15, min_setpoint_c: 16, max_setpoint_c: 30 },
    { appliance_id: 'PUB-B-AC2', scenario_id: 'PUB-B', zone_id: 'ZONE-2', appliance_type: 'Inverter AC', quantity: 1, rated_power_kw: 1.2, cooling_capacity_kw: 3.5, efficiency_label: 'A+', min_runtime_minutes: 15, min_setpoint_c: 16, max_setpoint_c: 30 },
    { appliance_id: 'PUB-B-FAN1', scenario_id: 'PUB-B', zone_id: 'ALL', appliance_type: 'Ceiling fan', quantity: 4, rated_power_kw: 0.075, cooling_capacity_kw: 0, efficiency_label: 'N/A', min_runtime_minutes: 0, min_setpoint_c: 16, max_setpoint_c: 30 },
    // PUB-C: 4 inverter ACs, 6 ceiling fans
    { appliance_id: 'PUB-C-AC1', scenario_id: 'PUB-C', zone_id: 'ZONE-1', appliance_type: 'Inverter AC', quantity: 2, rated_power_kw: 2.0, cooling_capacity_kw: 5.0, efficiency_label: 'A', min_runtime_minutes: 20, min_setpoint_c: 18, max_setpoint_c: 28 },
    { appliance_id: 'PUB-C-AC2', scenario_id: 'PUB-C', zone_id: 'ZONE-2', appliance_type: 'Inverter AC', quantity: 2, rated_power_kw: 2.0, cooling_capacity_kw: 5.0, efficiency_label: 'A', min_runtime_minutes: 20, min_setpoint_c: 18, max_setpoint_c: 28 },
    { appliance_id: 'PUB-C-FAN1', scenario_id: 'PUB-C', zone_id: 'ALL', appliance_type: 'Ceiling fan', quantity: 6, rated_power_kw: 0.075, cooling_capacity_kw: 0, efficiency_label: 'N/A', min_runtime_minutes: 0, min_setpoint_c: 16, max_setpoint_c: 30 },
  ];

  const insertAppliance = db.prepare(`
    INSERT OR REPLACE INTO appliances (appliance_id, scenario_id, zone_id, appliance_type, quantity, rated_power_kw, cooling_capacity_kw, efficiency_label, min_runtime_minutes, min_setpoint_c, max_setpoint_c)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const a of appliances) {
    insertAppliance.run(a.appliance_id, a.scenario_id, a.zone_id, a.appliance_type, a.quantity, a.rated_power_kw, a.cooling_capacity_kw, a.efficiency_label, a.min_runtime_minutes, a.min_setpoint_c, a.max_setpoint_c);
  }
  console.log(`  ✅ ${appliances.length} appliances created`);

  // ─── Energy Assets ───
  const assets = [
    { scenario_id: 'PUB-A', solar_capacity_kw: 0, solar_conversion_efficiency: 0, battery_capacity_kwh: 0, initial_soc_kwh: 0, minimum_reserve_kwh: 0, max_charge_kw: 0, max_discharge_kw: 0, charge_efficiency: 0.95, discharge_efficiency: 0.95 },
    { scenario_id: 'PUB-B', solar_capacity_kw: 3.0, solar_conversion_efficiency: 0.18, battery_capacity_kwh: 5.0, initial_soc_kwh: 2.5, minimum_reserve_kwh: 1.0, max_charge_kw: 1.5, max_discharge_kw: 2.0, charge_efficiency: 0.92, discharge_efficiency: 0.93 },
    { scenario_id: 'PUB-C', solar_capacity_kw: 5.0, solar_conversion_efficiency: 0.17, battery_capacity_kwh: 10.0, initial_soc_kwh: 5.0, minimum_reserve_kwh: 2.0, max_charge_kw: 3.0, max_discharge_kw: 4.0, charge_efficiency: 0.90, discharge_efficiency: 0.92 },
  ];

  const insertAsset = db.prepare(`
    INSERT OR REPLACE INTO energy_assets VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const a of assets) {
    insertAsset.run(a.scenario_id, a.solar_capacity_kw, a.solar_conversion_efficiency, a.battery_capacity_kwh, a.initial_soc_kwh, a.minimum_reserve_kwh, a.max_charge_kw, a.max_discharge_kw, a.charge_efficiency, a.discharge_efficiency);
  }
  console.log(`  ✅ ${assets.length} energy assets created`);

  // ─── Interval Inputs (30 days × 96 intervals per scenario) ───
  const startDate = new Date('2026-06-01T00:00:00');
  const days = 30;
  const intervalsPerDay = 96;

  // Seeded pseudo-random number generator for reproducibility
  let seed = 42;
  function random() {
    seed = (seed * 1664525 + 1013904223) & 0x7fffffff;
    return seed / 0x7fffffff;
  }

  // Karachi summer weather patterns (June)
  function getTemperature(hour: number, dayOfMonth: number): number {
    // Base: 30-42°C with diurnal cycle
    const base = 33 + dayOfMonth * 0.1; // slight warming trend
    const diurnal = -6 * Math.cos((hour - 14) * Math.PI / 12); // peak at 2pm
    const noise = (random() - 0.5) * 3;
    return Math.round((base + diurnal + noise) * 10) / 10;
  }

  function getHumidity(hour: number): number {
    // Higher at night, lower during day
    const base = 55 + 15 * Math.cos((hour - 4) * Math.PI / 12);
    const noise = (random() - 0.5) * 10;
    return Math.round(Math.max(20, Math.min(95, base + noise)) * 10) / 10;
  }

  function getHeatIndex(temp: number, humidity: number): number {
    // Simplified heat index calculation
    if (temp < 27) return temp;
    const hi = -8.785 + 1.611 * temp + 2.339 * humidity - 0.146 * temp * humidity
      - 0.01231 * temp * temp - 0.01642 * humidity * humidity
      + 0.002212 * temp * temp * humidity + 0.000725 * temp * humidity * humidity
      - 0.000003582 * temp * temp * humidity * humidity;
    return Math.round(Math.max(temp, hi) * 10) / 10;
  }

  function getSolarIrradiance(hour: number): number {
    // Zero at night, peak at noon ~900 W/m²
    if (hour < 6 || hour >= 19) return 0;
    const peak = 850 + (random() - 0.5) * 200;
    const angle = Math.sin((hour - 6) * Math.PI / 13);
    return Math.round(Math.max(0, peak * angle) * 10) / 10;
  }

  function getTariffType(hour: number): string {
    if (hour >= 18 && hour < 22) return 'PEAK';
    if ((hour >= 7 && hour < 18) || (hour >= 22 && hour < 24)) return 'ON_PEAK';
    return 'OFF_PEAK';
  }

  function getTariffRate(tariffType: string): number {
    switch (tariffType) {
      case 'PEAK': return 35 + random() * 5;
      case 'ON_PEAK': return 22 + random() * 3;
      case 'OFF_PEAK': return 12 + random() * 2;
      default: return 20;
    }
  }

  // Occupancy patterns per scenario
  function getOccupancy(scenarioId: string, hour: number, dayOfWeek: number): number {
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    switch (scenarioId) {
      case 'PUB-A': // Household
        if (hour >= 0 && hour < 6) return 5; // all sleeping
        if (hour >= 6 && hour < 8) return 4;
        if (hour >= 8 && hour < 14) return isWeekend ? 3 : 1; // most at work/school
        if (hour >= 14 && hour < 17) return isWeekend ? 4 : 2;
        if (hour >= 17 && hour < 23) return 5; // everyone home
        return 4;

      case 'PUB-B': // Solar household
        if (hour >= 0 && hour < 6) return 6;
        if (hour >= 6 && hour < 8) return 5;
        if (hour >= 8 && hour < 15) return isWeekend ? 4 : 2;
        if (hour >= 15 && hour < 22) return 6;
        return 5;

      case 'PUB-C': // Office
        if (isWeekend) return 0;
        if (hour >= 9 && hour < 13) return 20 + Math.floor(random() * 5);
        if (hour >= 13 && hour < 14) return 10; // lunch
        if (hour >= 14 && hour < 17) return 18 + Math.floor(random() * 7);
        if (hour >= 17 && hour < 19) return 5; // overtime
        return 0;

      default: return 0;
    }
  }

  // Grid outage schedule (Karachi load shedding)
  function isGridAvailable(scenarioId: string, hour: number, dayOfMonth: number): boolean {
    // PUB-A: More frequent outages (no solar)
    if (scenarioId === 'PUB-A') {
      // 2-3 hours of outage per day during peak
      if (dayOfMonth % 3 === 0 && hour >= 13 && hour < 15) return false;
      if (dayOfMonth % 5 === 0 && hour >= 19 && hour < 21) return false;
    }
    // PUB-B: Moderate outages
    if (scenarioId === 'PUB-B') {
      if (dayOfMonth % 4 === 0 && hour >= 14 && hour < 16) return false;
    }
    // PUB-C: Less outages (commercial area)
    if (scenarioId === 'PUB-C') {
      if (dayOfMonth % 7 === 0 && hour >= 12 && hour < 14) return false;
    }
    return true;
  }

  const insertInterval = db.prepare(`
    INSERT OR REPLACE INTO interval_inputs (scenario_id, timestamp_local, interval_minutes, temperature_c, relative_humidity_pct, heat_index_c, solar_irradiance_w_m2, solar_available_kw, occupancy_count, grid_available, tariff_type, tariff_pkr_per_kwh, grid_carbon_kgco2_per_kwh, non_cooling_load_kw, source_missing_flag)
    VALUES (?, ?, 15, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `);

  const insertBaselineSchedule = db.prepare(`
    INSERT OR REPLACE INTO baseline_schedule (scenario_id, timestamp_local, baseline_ac_units_on, baseline_ac_setpoint_c, baseline_fan_units_on)
    VALUES (?, ?, ?, ?, ?)
  `);

  let totalIntervals = 0;

  const insertAllIntervals = db.transaction(() => {
    for (const scenario of scenarios) {
      const asset = assets.find(a => a.scenario_id === scenario.scenario_id)!;
      const scenarioAppliances = appliances.filter(a => a.scenario_id === scenario.scenario_id);
      const totalAcUnits = scenarioAppliances.filter(a => a.appliance_type !== 'Ceiling fan').reduce((s, a) => s + a.quantity, 0);
      const totalFanUnits = scenarioAppliances.filter(a => a.appliance_type === 'Ceiling fan').reduce((s, a) => s + a.quantity, 0);

      for (let day = 0; day < days; day++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(currentDate.getDate() + day);
        const dayOfWeek = currentDate.getDay();
        const dayOfMonth = currentDate.getDate();

        for (let interval = 0; interval < intervalsPerDay; interval++) {
          const hour = Math.floor(interval / 4);
          const minute = (interval % 4) * 15;

          const year = currentDate.getFullYear();
          const month = String(currentDate.getMonth() + 1).padStart(2, '0');
          const dayStr = String(currentDate.getDate()).padStart(2, '0');
          const hourStr = String(hour).padStart(2, '0');
          const minStr = String(minute).padStart(2, '0');
          const timestamp = `${year}-${month}-${dayStr}T${hourStr}:${minStr}:00`;

          const temp = getTemperature(hour + minute / 60, dayOfMonth);
          const humidity = getHumidity(hour + minute / 60);
          const heatIndex = getHeatIndex(temp, humidity);
          const solarIrradiance = getSolarIrradiance(hour + minute / 60);
          const solarAvailable = asset.solar_capacity_kw > 0
            ? Math.round(asset.solar_capacity_kw * asset.solar_conversion_efficiency * (solarIrradiance / 1000) * 100) / 100
            : 0;
          const occupancy = getOccupancy(scenario.scenario_id, hour, dayOfWeek);
          const gridAvailable = isGridAvailable(scenario.scenario_id, hour, dayOfMonth) ? 1 : 0;
          const tariffType = getTariffType(hour);
          const tariffRate = Math.round(getTariffRate(tariffType) * 100) / 100;
          const carbonFactor = tariffType === 'PEAK' ? 0.65 : tariffType === 'ON_PEAK' ? 0.50 : 0.40;
          const nonCoolingLoad = scenario.building_type === 'Office' ? 0.8 + random() * 0.4 : 0.2 + random() * 0.3;

          insertInterval.run(
            scenario.scenario_id, timestamp, temp, humidity, heatIndex,
            solarIrradiance, solarAvailable, occupancy, gridAvailable,
            tariffType, tariffRate, carbonFactor,
            Math.round(nonCoolingLoad * 100) / 100
          );

          // Generate baseline schedule (naive approach: AC on when occupied)
          let baselineAcOn = 0;
          let baselineSetpoint: number | null = null;
          let baselineFanOn = 0;

          if (occupancy > 0 && temp > 28) {
            baselineAcOn = totalAcUnits; // All ACs on
            baselineSetpoint = 24; // Fixed setpoint
            baselineFanOn = totalFanUnits;
          } else if (occupancy > 0 && temp > 25) {
            baselineAcOn = Math.ceil(totalAcUnits * 0.5);
            baselineSetpoint = 25;
            baselineFanOn = totalFanUnits;
          } else if (occupancy > 0) {
            baselineFanOn = Math.ceil(totalFanUnits * 0.5);
          }

          insertBaselineSchedule.run(
            scenario.scenario_id, timestamp,
            baselineAcOn, baselineSetpoint, baselineFanOn
          );

          totalIntervals++;
        }
      }
    }
  });

  insertAllIntervals();
  console.log(`  ✅ ${totalIntervals} interval records generated (${scenarios.length} × ${days} days × ${intervalsPerDay} intervals)`);
  console.log('🎉 Synthetic data generation complete!');
}

generateData();
