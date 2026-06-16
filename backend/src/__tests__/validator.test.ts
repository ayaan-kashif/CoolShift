import { validateIntervalInputs } from '../services/validator';
import type { IntervalInput } from '../models/types';

describe('Spreadsheet CSV/XLSX Validator Tests', () => {
  test('missing timestamp_local -> error', () => {
    const rows: Partial<IntervalInput>[] = [
      {
        scenario_id: 'scen_test',
        // missing timestamp_local
        interval_minutes: 15,
        temperature_c: 30,
        relative_humidity_pct: 60,
        solar_irradiance_w_m2: 0,
        grid_available: 1,
        tariff_type: 'ON_PEAK',
        tariff_pkr_per_kwh: 32,
      },
    ];

    const report = validateIntervalInputs(rows);
    expect(report.errors.length).toBeGreaterThan(0);
    expect(report.errors[0].column).toBe('timestamp_local');
    expect(report.errors[0].message).toContain('Missing required field timestamp_local');
  });

  test('temperature_c = 65 (out of range) -> error', () => {
    const rows: Partial<IntervalInput>[] = [
      {
        scenario_id: 'scen_test',
        timestamp_local: '2026-07-01T12:00:00',
        interval_minutes: 15,
        temperature_c: 65, // out of range [-20, 60]
        relative_humidity_pct: 60,
        solar_irradiance_w_m2: 500,
        grid_available: 1,
        tariff_type: 'ON_PEAK',
        tariff_pkr_per_kwh: 32,
      },
    ];

    const report = validateIntervalInputs(rows);
    expect(report.errors.length).toBeGreaterThan(0);
    expect(report.errors[0].column).toBe('temperature_c');
    expect(report.errors[0].message).toContain('Temperature out of range');
  });

  test('duplicate timestamps -> error', () => {
    const rows: Partial<IntervalInput>[] = [
      {
        scenario_id: 'scen_test',
        timestamp_local: '2026-07-01T12:00:00',
        interval_minutes: 15,
        temperature_c: 32,
        relative_humidity_pct: 60,
        solar_irradiance_w_m2: 500,
        grid_available: 1,
        tariff_type: 'ON_PEAK',
        tariff_pkr_per_kwh: 32,
      },
      {
        scenario_id: 'scen_test',
        timestamp_local: '2026-07-01T12:00:00', // duplicate timestamp
        interval_minutes: 15,
        temperature_c: 33,
        relative_humidity_pct: 60,
        solar_irradiance_w_m2: 500,
        grid_available: 1,
        tariff_type: 'ON_PEAK',
        tariff_pkr_per_kwh: 32,
      },
    ];

    const report = validateIntervalInputs(rows);
    expect(report.errors.length).toBeGreaterThan(0);
    expect(report.errors[0].column).toBe('timestamp_local');
    expect(report.errors[0].message).toContain('Duplicate timestamp');
  });

  test('solar irradiance > 0 at hour 23 -> warning (not error)', () => {
    const rows: Partial<IntervalInput>[] = [
      {
        scenario_id: 'scen_test',
        timestamp_local: '2026-07-01T23:00:00', // 11:00 PM local
        interval_minutes: 15,
        temperature_c: 28,
        relative_humidity_pct: 80,
        solar_irradiance_w_m2: 150, // Positive irradiance at night
        grid_available: 1,
        tariff_type: 'OFF_PEAK',
        tariff_pkr_per_kwh: 18,
      },
    ];

    const report = validateIntervalInputs(rows);
    expect(report.errors.length).toBe(0); // No error
    expect(report.warnings.length).toBeGreaterThan(0);
    expect(report.warnings[0].column).toBe('solar_irradiance_w_m2');
    expect(report.warnings[0].message).toContain('nighttime hour');
  });

  test('valid row -> no errors, no warnings', () => {
    const rows: Partial<IntervalInput>[] = [
      {
        scenario_id: 'scen_test',
        timestamp_local: '2026-07-01T12:00:00',
        interval_minutes: 15,
        temperature_c: 35,
        relative_humidity_pct: 55,
        solar_irradiance_w_m2: 800,
        grid_available: 1,
        tariff_type: 'ON_PEAK',
        tariff_pkr_per_kwh: 32,
      },
    ];

    const report = validateIntervalInputs(rows);
    expect(report.errors.length).toBe(0);
    expect(report.warnings.length).toBe(0);
    expect(report.rows_valid).toBe(1);
  });
});
