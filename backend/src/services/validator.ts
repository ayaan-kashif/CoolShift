import type { IntervalInput, ValidationReport, ValidationIssue } from '../models/types';

/**
 * Data validation module — validates all imported data per PRD §4.2.
 */

export function validateIntervalInputs(rows: Partial<IntervalInput>[]): ValidationReport {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  let validCount = 0;
  let flaggedCount = 0;

  const timestamps = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // +2 for header + 1-index
    let rowValid = true;

    // Required fields check
    if (!row.scenario_id) {
      errors.push({ row: rowNum, column: 'scenario_id', message: 'Missing required field scenario_id' });
      rowValid = false;
    }
    if (!row.timestamp_local) {
      errors.push({ row: rowNum, column: 'timestamp_local', message: 'Missing required field timestamp_local' });
      rowValid = false;
      continue;
    }

    // Timestamp validation: ISO 8601
    const ts = row.timestamp_local;
    if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(ts)) {
      errors.push({ row: rowNum, column: 'timestamp_local', message: `Invalid timestamp format: ${ts}`, value: ts });
      rowValid = false;
    }

    // Unique timestamp per scenario
    const tsKey = `${row.scenario_id}__${ts}`;
    if (timestamps.has(tsKey)) {
      errors.push({ row: rowNum, column: 'timestamp_local', message: `Duplicate timestamp for scenario: ${ts}`, value: ts });
      rowValid = false;
    }
    timestamps.add(tsKey);

    // Interval minutes must be 15
    if (row.interval_minutes !== undefined && row.interval_minutes !== 15) {
      warnings.push({ row: rowNum, column: 'interval_minutes', message: `Expected 15-minute interval, got ${row.interval_minutes}`, value: row.interval_minutes });
    }

    // Temperature: -20 to 60°C
    if (row.temperature_c !== undefined) {
      if (row.temperature_c < -20 || row.temperature_c > 60) {
        errors.push({ row: rowNum, column: 'temperature_c', message: `Temperature out of range [-20, 60]: ${row.temperature_c}°C`, value: row.temperature_c });
        rowValid = false;
      }
      if (row.temperature_c > 50) {
        warnings.push({ row: rowNum, column: 'temperature_c', message: `Extreme temperature: ${row.temperature_c}°C`, value: row.temperature_c });
        flaggedCount++;
      }
    } else {
      errors.push({ row: rowNum, column: 'temperature_c', message: 'Missing temperature_c' });
      rowValid = false;
    }

    // Relative humidity: 0-100%
    if (row.relative_humidity_pct !== undefined) {
      if (row.relative_humidity_pct < 0 || row.relative_humidity_pct > 100) {
        errors.push({ row: rowNum, column: 'relative_humidity_pct', message: `Humidity out of range [0, 100]: ${row.relative_humidity_pct}%`, value: row.relative_humidity_pct });
        rowValid = false;
      }
    }

    // Solar irradiance: non-negative
    if (row.solar_irradiance_w_m2 !== undefined && row.solar_irradiance_w_m2 < 0) {
      errors.push({ row: rowNum, column: 'solar_irradiance_w_m2', message: `Solar irradiance cannot be negative: ${row.solar_irradiance_w_m2}`, value: row.solar_irradiance_w_m2 });
      rowValid = false;
    }

    // Solar should be zero at night (approximate check: if between 8pm-5am local)
    if (row.solar_irradiance_w_m2 !== undefined && row.solar_irradiance_w_m2 > 0 && ts) {
      const hourMatch = ts.match(/T(\d{2}):/);
      if (hourMatch) {
        const hour = parseInt(hourMatch[1]);
        if (hour >= 20 || hour < 5) {
          warnings.push({ row: rowNum, column: 'solar_irradiance_w_m2', message: `Solar irradiance ${row.solar_irradiance_w_m2} W/m² at nighttime hour ${hour}`, value: row.solar_irradiance_w_m2 });
          flaggedCount++;
        }
      }
    }

    // Grid available: boolean / 0|1
    if (row.grid_available !== undefined && row.grid_available !== 0 && row.grid_available !== 1) {
      errors.push({ row: rowNum, column: 'grid_available', message: `grid_available must be 0 or 1, got: ${row.grid_available}`, value: row.grid_available });
      rowValid = false;
    }

    // Tariff type
    if (row.tariff_type && !['OFF_PEAK', 'ON_PEAK', 'PEAK'].includes(row.tariff_type)) {
      errors.push({ row: rowNum, column: 'tariff_type', message: `Invalid tariff type: ${row.tariff_type}`, value: row.tariff_type });
      rowValid = false;
    }

    // Tariff rate: positive
    if (row.tariff_pkr_per_kwh !== undefined && row.tariff_pkr_per_kwh < 0) {
      errors.push({ row: rowNum, column: 'tariff_pkr_per_kwh', message: `Tariff rate cannot be negative: ${row.tariff_pkr_per_kwh}`, value: row.tariff_pkr_per_kwh });
      rowValid = false;
    }

    // Occupancy: non-negative integer
    if (row.occupancy_count !== undefined && (row.occupancy_count < 0 || !Number.isInteger(row.occupancy_count))) {
      warnings.push({ row: rowNum, column: 'occupancy_count', message: `Invalid occupancy count: ${row.occupancy_count}`, value: row.occupancy_count });
    }

    // Source missing flag
    if (row.source_missing_flag === 1) {
      flaggedCount++;
    }

    if (rowValid) validCount++;
  }

  return {
    rows_parsed: rows.length,
    rows_valid: validCount,
    rows_flagged: flaggedCount,
    errors,
    warnings,
  };
}

/**
 * Validate timestamp continuity — ensure exactly 15-minute gaps.
 */
export function validateTimestampContinuity(
  timestamps: string[],
  scenarioId: string
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (timestamps.length < 2) return issues;

  const sorted = [...timestamps].sort();
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1]).getTime();
    const curr = new Date(sorted[i]).getTime();
    const diffMinutes = (curr - prev) / (1000 * 60);

    if (Math.abs(diffMinutes - 15) > 1) {
      issues.push({
        row: i + 1,
        column: 'timestamp_local',
        message: `Gap of ${diffMinutes} minutes between ${sorted[i - 1]} and ${sorted[i]} (expected 15)`,
        value: diffMinutes,
      });
    }
  }

  return issues;
}

/**
 * Validate scenario profile fields.
 */
export function validateScenarioProfile(profile: Record<string, any>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!profile.scenario_id) {
    issues.push({ row: 0, column: 'scenario_id', message: 'Missing scenario_id' });
  }
  if (!profile.name) {
    issues.push({ row: 0, column: 'name', message: 'Missing scenario name' });
  }
  if (profile.area_m2 !== undefined && profile.area_m2 <= 0) {
    issues.push({ row: 0, column: 'area_m2', message: `Invalid area: ${profile.area_m2}` });
  }
  if (profile.comfort_min_c >= profile.comfort_max_c) {
    issues.push({ row: 0, column: 'comfort_range', message: `comfort_min (${profile.comfort_min_c}) must be less than comfort_max (${profile.comfort_max_c})` });
  }
  if (profile.building_type && !['Household', 'School', 'Office', 'Clinic', 'Retail'].includes(profile.building_type)) {
    issues.push({ row: 0, column: 'building_type', message: `Invalid building type: ${profile.building_type}` });
  }

  return issues;
}

/**
 * Validate energy assets.
 */
export function validateEnergyAssets(assets: Record<string, any>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (assets.battery_capacity_kwh > 0) {
    if (assets.initial_soc_kwh > assets.battery_capacity_kwh) {
      issues.push({ row: 0, column: 'initial_soc_kwh', message: `Initial SoC (${assets.initial_soc_kwh}) exceeds battery capacity (${assets.battery_capacity_kwh})` });
    }
    if (assets.minimum_reserve_kwh > assets.battery_capacity_kwh) {
      issues.push({ row: 0, column: 'minimum_reserve_kwh', message: `Minimum reserve (${assets.minimum_reserve_kwh}) exceeds battery capacity (${assets.battery_capacity_kwh})` });
    }
    if (assets.charge_efficiency <= 0 || assets.charge_efficiency > 1) {
      issues.push({ row: 0, column: 'charge_efficiency', message: `Invalid charge efficiency: ${assets.charge_efficiency}` });
    }
    if (assets.discharge_efficiency <= 0 || assets.discharge_efficiency > 1) {
      issues.push({ row: 0, column: 'discharge_efficiency', message: `Invalid discharge efficiency: ${assets.discharge_efficiency}` });
    }
  }

  return issues;
}
