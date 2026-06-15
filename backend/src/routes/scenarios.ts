import { Router, Request, Response } from 'express';
import { getDb } from '../db/connection';

const router = Router();

// GET /api/v1/scenarios - List all scenarios
router.get('/', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const scenarios = db.prepare(`
      SELECT sp.*, 
        (SELECT COUNT(*) FROM interval_inputs ii WHERE ii.scenario_id = sp.scenario_id) as interval_count,
        (SELECT COUNT(*) FROM optimization_runs orr WHERE orr.scenario_id = sp.scenario_id AND orr.status = 'complete') as run_count
      FROM scenario_profiles sp ORDER BY sp.created_at DESC
    `).all();
    res.json(scenarios);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/scenarios/:id - Get single scenario with details
router.get('/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const profile = db.prepare('SELECT * FROM scenario_profiles WHERE scenario_id = ?').get(req.params.id);
    if (!profile) return res.status(404).json({ error: 'Scenario not found' });

    const appliances = db.prepare('SELECT * FROM appliances WHERE scenario_id = ?').all(req.params.id);
    const energy_assets = db.prepare('SELECT * FROM energy_assets WHERE scenario_id = ?').get(req.params.id) || null;

    res.json({ profile, appliances, energy_assets });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/scenarios - Create new scenario
router.post('/', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { profile, appliances, energy_assets } = req.body;

    if (!profile || !profile.scenario_id) {
      return res.status(400).json({ error: 'Missing scenario profile with scenario_id' });
    }

    // Insert profile
    db.prepare(`
      INSERT OR REPLACE INTO scenario_profiles (scenario_id, name, timezone, building_type, area_m2, room_count, max_occupancy, insulation_level, sun_exposure, comfort_min_c, comfort_max_c, vulnerable_occupants, budget_pkr_per_day, maximum_grid_demand_kw, evaluation_focus)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      profile.scenario_id, profile.name || profile.scenario_id,
      profile.timezone || 'Asia/Karachi', profile.building_type || 'Household',
      profile.area_m2 || 100, profile.room_count || 1, profile.max_occupancy || 4,
      profile.insulation_level || 'Medium', profile.sun_exposure || 'Medium',
      profile.comfort_min_c || 22, profile.comfort_max_c || 28,
      profile.vulnerable_occupants ? 1 : 0,
      profile.budget_pkr_per_day || 500, profile.maximum_grid_demand_kw || 10,
      profile.evaluation_focus || ''
    );

    // Insert appliances
    if (appliances && Array.isArray(appliances)) {
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO appliances (appliance_id, scenario_id, zone_id, appliance_type, quantity, rated_power_kw, cooling_capacity_kw, efficiency_label, min_runtime_minutes, min_setpoint_c, max_setpoint_c)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const a of appliances) {
        stmt.run(
          a.appliance_id || `${profile.scenario_id}-APP-${Math.random().toString(36).slice(2, 8)}`,
          profile.scenario_id, a.zone_id || 'ALL', a.appliance_type || 'Inverter AC',
          a.quantity || 1, a.rated_power_kw || 1.5, a.cooling_capacity_kw || 3.5,
          a.efficiency_label || 'N/A', a.min_runtime_minutes || 0,
          a.min_setpoint_c || 16, a.max_setpoint_c || 30
        );
      }
    }

    // Insert energy assets
    if (energy_assets) {
      db.prepare(`
        INSERT OR REPLACE INTO energy_assets (scenario_id, solar_capacity_kw, solar_conversion_efficiency, battery_capacity_kwh, initial_soc_kwh, minimum_reserve_kwh, max_charge_kw, max_discharge_kw, charge_efficiency, discharge_efficiency)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        profile.scenario_id,
        energy_assets.solar_capacity_kw || 0, energy_assets.solar_conversion_efficiency || 0.18,
        energy_assets.battery_capacity_kwh || 0, energy_assets.initial_soc_kwh || 0,
        energy_assets.minimum_reserve_kwh || 0, energy_assets.max_charge_kw || 0,
        energy_assets.max_discharge_kw || 0, energy_assets.charge_efficiency || 0.95,
        energy_assets.discharge_efficiency || 0.95
      );
    }

    const result = db.prepare('SELECT * FROM scenario_profiles WHERE scenario_id = ?').get(profile.scenario_id);
    res.status(201).json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/v1/scenarios/:id - Update scenario
router.put('/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const profile = req.body;
    const existing = db.prepare('SELECT * FROM scenario_profiles WHERE scenario_id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Scenario not found' });

    db.prepare(`
      UPDATE scenario_profiles SET name=?, timezone=?, building_type=?, area_m2=?, room_count=?, max_occupancy=?, insulation_level=?, sun_exposure=?, comfort_min_c=?, comfort_max_c=?, vulnerable_occupants=?, budget_pkr_per_day=?, maximum_grid_demand_kw=?, evaluation_focus=?
      WHERE scenario_id=?
    `).run(
      profile.name, profile.timezone, profile.building_type, profile.area_m2,
      profile.room_count, profile.max_occupancy, profile.insulation_level,
      profile.sun_exposure, profile.comfort_min_c, profile.comfort_max_c,
      profile.vulnerable_occupants ? 1 : 0, profile.budget_pkr_per_day,
      profile.maximum_grid_demand_kw, profile.evaluation_focus, req.params.id
    );

    const result = db.prepare('SELECT * FROM scenario_profiles WHERE scenario_id = ?').get(req.params.id);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/v1/scenarios/:id
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM scenario_profiles WHERE scenario_id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/scenarios/:id/intervals - Get interval inputs
router.get('/:id/intervals', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 96;
    const offset = (page - 1) * limit;

    const total = db.prepare('SELECT COUNT(*) as count FROM interval_inputs WHERE scenario_id = ?').get(req.params.id) as any;
    const intervals = db.prepare(
      'SELECT * FROM interval_inputs WHERE scenario_id = ? ORDER BY timestamp_local LIMIT ? OFFSET ?'
    ).all(req.params.id, limit, offset);

    res.json({ data: intervals, total: total.count, page, limit });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
