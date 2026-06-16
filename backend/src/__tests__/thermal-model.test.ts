import { stepThermalModel, ThermalParams, ThermalInputs, ThermalState } from '../core/thermal-model';

describe('Thermal RC Model Tests', () => {
  const params: ThermalParams = {
    insulation_level: 'Medium',
    sun_exposure: 'Medium',
    area_m2: 200,
  };

  test('stepThermalModel: outdoor=42°C, indoor=30°C, insulation=Medium, area=200m2, no cooling -> output should be > 30°C', () => {
    const prevState: ThermalState = { indoor_temp_c: 30 };
    const inputs: ThermalInputs = {
      outdoor_temp_c: 42,
      heat_index_c: 45,
      solar_irradiance_w_m2: 500,
      occupancy_count: 5,
      cooling_power_kw: 0, // no cooling
      interval_minutes: 15,
    };

    const nextTemp = stepThermalModel(params, prevState, inputs);
    expect(nextTemp).toBeGreaterThan(30);
  });

  test('stepThermalModel with full cooling: outdoor=42°C, indoor=32°C, 4 AC units active -> output should be < 32°C', () => {
    const prevState: ThermalState = { indoor_temp_c: 32 };
    // Simulated active cooling power (e.g. 4 AC units at 3.5kW capacity = 14kW)
    const inputs: ThermalInputs = {
      outdoor_temp_c: 42,
      heat_index_c: 42,
      solar_irradiance_w_m2: 0,
      occupancy_count: 0,
      cooling_power_kw: 14.0, // High cooling power
      interval_minutes: 15,
    };

    const nextTemp = stepThermalModel(params, prevState, inputs);
    expect(nextTemp).toBeLessThan(32);
  });

  test('stepThermalModel should clamp output between 10°C and 60°C under extreme conditions', () => {
    const prevStateExtremeHot: ThermalState = { indoor_temp_c: 59 };
    const inputsExtremeHot: ThermalInputs = {
      outdoor_temp_c: 100, // unrealistically hot
      heat_index_c: 100,
      solar_irradiance_w_m2: 2000,
      occupancy_count: 100,
      cooling_power_kw: 0,
      interval_minutes: 60, // 1 hour step to force high temperature change
    };

    const nextTempHot = stepThermalModel(params, prevStateExtremeHot, inputsExtremeHot);
    expect(nextTempHot).toBeLessThanOrEqual(60);

    const prevStateExtremeCold: ThermalState = { indoor_temp_c: 11 };
    const inputsExtremeCold: ThermalInputs = {
      outdoor_temp_c: -50, // unrealistically cold
      heat_index_c: -50,
      solar_irradiance_w_m2: 0,
      occupancy_count: 0,
      cooling_power_kw: 50, // high cooling
      interval_minutes: 60,
    };

    const nextTempCold = stepThermalModel(params, prevStateExtremeCold, inputsExtremeCold);
    expect(nextTempCold).toBeGreaterThanOrEqual(10);
  });
});
