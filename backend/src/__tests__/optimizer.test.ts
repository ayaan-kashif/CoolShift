// file:///C:/Users/Hp/OneDrive/Desktop%202/CoolShift/CoolShift/backend/src/__tests__/optimizer.test.ts

jest.mock('../db/connection', () => {
  const mockInsertedRows: any[] = [];
  const mockRunSpy = jest.fn();

  // Attach to global so tests can access them
  (global as any).mockInsertedRows = mockInsertedRows;
  (global as any).mockRunSpy = mockRunSpy;

  const mockDbInstance = {
    prepare(query: string) {
      return {
        get() {
          return {
            scenario_id: 'test_scen',
            name: 'Test Hospital',
            comfort_min_c: 20,
            comfort_max_c: 26,
            insulation_level: 'Medium',
            sun_exposure: 'Medium',
            area_m2: 120,
            maximum_grid_demand_kw: 10,
            battery_capacity_kwh: 10,
            initial_soc_kwh: 5,
            minimum_reserve_kwh: 2,
            solar_capacity_kw: 5,
            solar_conversion_efficiency: 0.18,
            max_charge_kw: 4,
            max_discharge_kw: 4,
            charge_efficiency: 0.90,
            discharge_efficiency: 0.95,
          };
        },
        all() {
          if (query.includes('appliances')) {
            return [
              {
                appliance_id: 'app_1',
                appliance_type: 'Inverter AC',
                quantity: 2,
                rated_power_kw: 1.5,
                cooling_capacity_kw: 3.5,
                min_setpoint_c: 16,
                max_setpoint_c: 30,
              },
            ];
          }
          if (query.includes('interval_inputs')) {
            return Array.from({ length: 10 }, (_, i) => ({
              id: i + 1,
              scenario_id: 'test_scen',
              timestamp_local: `2026-07-01T${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}:00`,
              interval_minutes: 15,
              temperature_c: 32 + i * 0.5,
              relative_humidity_pct: 60,
              heat_index_c: 34 + i * 0.5,
              solar_irradiance_w_m2: i > 4 ? 400 : 0,
              solar_available_kw: i > 4 ? 4.0 : 0,
              occupancy_count: 10,
              grid_available: i === 3 ? 0 : 1, // Interval 3 has grid outage
              tariff_type: i > 7 ? 'PEAK' : 'ON_PEAK',
              tariff_pkr_per_kwh: i > 7 ? 45.0 : 32.0,
              grid_carbon_kgco2_per_kwh: 0.45,
              non_cooling_load_kw: 2.0,
              source_missing_flag: 0,
            }));
          }
          return [];
        },
        run(...args: any[]) {
          mockRunSpy(...args);
          if (query.includes('INSERT INTO output_schedule')) {
            mockInsertedRows.push(args);
          }
          return { changes: 1 };
        },
      };
    },
    transaction(cb: any) {
      return (...args: any[]) => cb(...args);
    },
    pragma() {},
    close() {},
  };

  return {
    __esModule: true,
    getDb: () => mockDbInstance,
    closeDb: jest.fn(),
  };
});

// Import runOptimization after the mock has been established
import { runOptimization } from '../core/optimizer';

describe('LP Optimizer Engine Tests', () => {
  beforeEach(() => {
    (global as any).mockInsertedRows.length = 0;
    (global as any).mockRunSpy.mockClear();
  });

  test('runOptimization should execute successfully and return correct summary metrics', () => {
    const result = runOptimization('test_scen', '2026-07-01T00:00:00', '2026-07-01T02:30:00', {
      cost: 0.4,
      emissions: 0.3,
      comfort: 0.2,
      peak: 0.1,
    });

    expect(result.run_id).toBeDefined();
    expect(result.scenario_id).toBe('test_scen');
    expect(result.total_intervals).toBe(10);
    expect(result.comfort_compliance_pct).toBeGreaterThanOrEqual(0);
    expect(result.comfort_compliance_pct).toBeLessThanOrEqual(100);
  });

  test('Test that all grid_energy_kwh = 0 when grid_available = 0 for every interval', () => {
    runOptimization('test_scen', '2026-07-01T00:00:00', '2026-07-01T02:30:00', {
      cost: 0.4,
      emissions: 0.3,
      comfort: 0.2,
      peak: 0.1,
    });

    // Verify row for interval index 3 (grid_available = 0)
    // parameters order in INSERT stmt:
    // run_id, scenario_id, timestamp_local, recommended_ac_units_on, recommended_ac_setpoint_c,
    // recommended_fan_units_on, grid_energy_kwh, ...
    const rows = (global as any).mockInsertedRows;
    const interval3Row = rows[3];
    expect(interval3Row).toBeDefined();
    
    // index 6 of values matches grid_energy_kwh
    const gridEnergyKwh = interval3Row[6];
    expect(gridEnergyKwh).toBe(0);
  });

  test('Test energy balance: supply (grid + solar + discharge) ≈ demand (cooling + charge + non_cooling) ± 0.01', () => {
    runOptimization('test_scen', '2026-07-01T00:00:00', '2026-07-01T02:30:00', {
      cost: 0.4,
      emissions: 0.3,
      comfort: 0.2,
      peak: 0.1,
    });

    const rows = (global as any).mockInsertedRows;
    rows.forEach((row: any, i: number) => {
      const grid = row[6];
      const solarUsed = row[7];
      const charge = row[8];
      const discharge = row[9];
      const cooling = row[11];
      const nonCooling = 2.0 * 0.25; // 2.0 kW * 15 mins

      const supply = grid + solarUsed + discharge;
      const demand = cooling + charge + nonCooling;

      expect(Math.abs(supply - demand)).toBeLessThanOrEqual(0.01);
    });
  });
});
