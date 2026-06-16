import { applyCharge, applyDischarge, validateBatteryConstraints } from '../core/battery-model';
import type { EnergyAsset } from '../models/types';

describe('Battery Storage Model Tests', () => {
  const assets: EnergyAsset = {
    scenario_id: 'test_scen',
    solar_capacity_kw: 5,
    solar_conversion_efficiency: 0.18,
    battery_capacity_kwh: 10,
    initial_soc_kwh: 5,
    minimum_reserve_kwh: 2,
    max_charge_kw: 4,
    max_discharge_kw: 4,
    charge_efficiency: 0.90, // 90% charge efficiency
    discharge_efficiency: 0.95, // 95% discharge efficiency
  };

  test('Test charge efficiency reduces actual stored energy', () => {
    const currentSoc = 5;
    const chargeEnergyInput = 2; // Input charging energy of 2 kWh
    const result = applyCharge(assets, currentSoc, chargeEnergyInput);

    // Charge efficiency is 90%, so 2 kWh input should add 2 * 0.9 = 1.8 kWh to the SoC
    expect(result.newSoc).toBe(currentSoc + chargeEnergyInput * assets.charge_efficiency);
    expect(result.actualCharged).toBe(chargeEnergyInput);
  });

  test('Test SoC never exceeds battery_capacity_kwh', () => {
    const currentSoc = 9;
    const chargeEnergyInput = 5; // Attempt to charge 5 kWh (efficiency 90% -> 4.5 kWh added)
    const result = applyCharge(assets, currentSoc, chargeEnergyInput);

    // SoC should cap exactly at 10 kWh
    expect(result.newSoc).toBe(10);
  });

  test('Test SoC never goes below 0', () => {
    const currentSoc = 1;
    const dischargeEnergyInput = 5; // Attempt to discharge 5 kWh
    const result = applyDischarge(assets, currentSoc, dischargeEnergyInput, true); // force emergency

    // SoC should drop to 0, not negative
    expect(result.newSoc).toBe(0);
  });

  test('Test simultaneous charge and discharge constraint validation', () => {
    const charge = 1.0;
    const discharge = 1.0;
    const soc = 5.0;

    const violations = validateBatteryConstraints(assets, soc, charge, discharge, 15);
    expect(violations).toContain('Simultaneous charge (1.0000) and discharge (1.0000)');
  });
});
