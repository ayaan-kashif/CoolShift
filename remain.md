# CoolShift — Remaining Tasks & Roadmap

This document maps out the remaining features, optimizations, integrations, testing, and production deployment roadmap for the **CoolShift Platform**.

---

## 1. Advanced Math & Optimization Enhancements
- [x] **Linear Programming (LP) Solver Integration**: 
  - Upgrade the greedy heuristic in `optimizer.ts` to a mathematically optimal solver using `javascript-lp-solver`. This will guarantee mathematical global minima for cost, emissions, and peak shaving, compared to current greedy heuristics.
- [x] **Predictive Machine Learning Thermal Model**:
  - Replace the simplified mathematical RC model with a light predictive ML model (implemented via multivariate OLS linear regression in pure TypeScript in `ml-temperature-model.ts`) to predict indoor temperature curves based on historical data.

---

## 2. Advanced Features & UX Polish
- [x] **Battery Charge & Solar Utilization Charts**:
  - Expand Recharts visualizations on the `compare` page to show detailed battery State of Charge (SoC) charge/discharge graphs, solar generation vs. solar utilization curves, and grid draw overlays.
- [ ] **Karachi Load-Shedding Outage Forecaster**:
  - Develop a mock or API-driven load-shedding forecaster that predicts upcoming utility outages based on localized K-Electric schedules.
- [ ] **Multi-Building / Community Dashboard**:
  - Create a management view aggregates energy savings, demand reductions, and carbon offset statistics across multiple office campuses or residential blocks.
- [ ] **Demand-Response (DR) Integration**:
  - Build listener hooks for simulated Utility DR events, forcing AC units to drop setpoints or turn off during community load-shedding warnings.

---

## 3. Testing & Code Quality
- [x] **Automated Backend Test Suite (Jest)**:
  - Create `jest.config.js` and write tests under `backend/src/__tests__` to test:
    - Thermal calculations (`thermal-model.ts`)
    - Battery capacity limits and reserve models (`battery-model.ts`)
    - Excel/CSV validation logic (`validator.ts`)
    - Optimizer constraints and savings logic (`optimizer.ts`)
- [ ] **Frontend End-to-End Tests**:
  - Add basic E2E testing (Playwright or Cypress) verifying scenario creation, file import steps, and optimization slider actions.

---

## 4. Production Deployment & IoT
- [ ] **IoT Thermostat / Smart-Plug Integration**:
  - Implement an MQTT client listener or simulated REST dispatcher to broadcast calculated optimal setpoints and AC/Fan schedules to physical hardware devices (like Tuya or ESP32-based smart plugs).
- [x] **Offline / Progressive Web App (PWA) Support**:
  - Set up service workers and web manifest file to allow the React client to run offline, caching loaded scenarios and schedules.
- [x] **Production Docker Configuration**:
  - Finalize the SQLite volume mounting system inside `docker-compose.yml` to prevent data loss on container rebuilds.
  - Set up a production build configuration for Next.js and Express.js with minification and source mapping disabled.
