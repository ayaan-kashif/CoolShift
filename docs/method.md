# CoolShift Methodology & Mathematical Formulations

This document describes the engineering models, equations, constraints, and optimization rules implemented in the CoolShift cooling optimizer.

---

## 1. Thermal RC Model
The building envelope temperature dynamics are modeled using a simplified lumped Resistance-Capacitance (RC) formulation representing thermal heat flows:

$$T_{\text{indoor}}(t) = T_{\text{indoor}}(t-1) + \Delta t \cdot \left[ \frac{T_{\text{outdoor, eff}} - T_{\text{indoor}}(t-1)}{R_{\text{thermal}}} - \frac{Q_{\text{cooling}}(t) - Q_{\text{occupants}}(t) - Q_{\text{solar}}(t)}{C_{\text{thermal}}} \right]$$

### Variables:
*   $T_{\text{indoor}}(t)$ : Indoor temperature at interval $t$ (°C)
*   $T_{\text{outdoor, eff}}$ : Effective outdoor temperature, calculated as:
    $$T_{\text{outdoor, eff}} = 0.7 \cdot T_{\text{outdoor}} + 0.3 \cdot \text{HeatIndex}$$
*   $\Delta t$ : Interval length in hours = 0.25 (15 minutes)
*   $R_{\text{thermal}}$ : Thermal resistance of building envelope (°C·h/kW)
*   $C_{\text{thermal}}$ : Thermal capacitance of building structure (kWh/°C)
*   $Q_{\text{cooling}}$ : Active heat extraction power of cooling units (kW)
*   $Q_{\text{occupants}}$ : Internal heat gains from occupants (kW), calculated as:
    $$Q_{\text{occupants}} = \text{occupants} \cdot 0.1\text{ kW/person}$$
*   $Q_{\text{solar}}$ : External solar heat gain (kW), calculated as:
    $$Q_{\text{solar}} = \frac{\text{SolarIrradiance}}{1000} \cdot \text{Area} \cdot \text{SunExposureCoefficient}$$

---

## 2. Battery Storage State Machine
The State of Charge (SoC) of local battery systems is governed by a state machine that tracks charging and discharging events:

### Charging Mode:
$$\text{SoC}(t) = \text{SoC}(t-1) + E_{\text{charge}}(t) \cdot \eta_{\text{charge}}$$

### Discharging Mode:
$$\text{SoC}(t) = \text{SoC}(t-1) - \frac{E_{\text{discharge}}(t)}{\eta_{\text{discharge}}}$$

### Variables:
*   $\text{SoC}(t)$ : Battery State of Charge at the end of interval $t$ (kWh)
*   $E_{\text{charge}}(t)$ : Energy charged into battery from solar/grid (kWh)
*   $E_{\text{discharge}}(t)$ : Energy discharged from battery to meet building loads (kWh)
*   $\eta_{\text{charge}}$ : Battery charging efficiency coefficient (default 0.95)
*   $\eta_{\text{discharge}}$ : Battery discharging efficiency coefficient (default 0.95)

---

## 3. Greedy Heuristic Decision Tree
Prior to the LP Solver implementation, the greedy optimizer shifts load using the following tree:

| Operational Case | Condition | Cooling Strategy | Battery Strategy |
| :--- | :--- | :--- | :--- |
| **Grid Outage** | $\text{grid\_available} = 0$ | Turn AC setpoint up, fans active | Discharge battery to cover demand |
| **Solar Surplus** | $E_{\text{solar}} > E_{\text{load}}$ | Lower setpoint to pre-cool room | Charge battery with excess solar |
| **Peak Tariff** | $\text{tariff\_type} = \text{PEAK}$ | Raise setpoint, reduce units | Discharge battery to avoid peak cost |
| **Off-Peak** | $\text{tariff\_type} = \text{OFF\_PEAK}$ | Lower setpoint to pre-cool | Charge battery if SOC is low |
| **Normal** | Default condition | Maintain comfort band midpoint | Battery idle |

---

## 4. Hard Constraints
The Linear Programming (LP) solver ensures the global optimization adheres to 9 hard constraints:

1.  **Grid Outage Limitation**:
    $$E_{\text{grid}}(t) = 0 \quad \text{if} \quad \text{grid\_available}(t) = 0$$
2.  **Battery SoC Capacity boundaries**:
    $$\text{SoC}_{\text{reserve}} \le \text{SoC}(t) \le \text{SoC}_{\text{capacity}}$$
3.  **Maximum Battery Charge Rate**:
    $$E_{\text{charge}}(t) \le P_{\text{charge, max}} \cdot \Delta t$$
4.  **Maximum Battery Discharge Rate**:
    $$E_{\text{discharge}}(t) \le P_{\text{discharge, max}} \cdot \Delta t$$
5.  **Exclusive Charge/Discharge**:
    $$E_{\text{charge}}(t) \cdot E_{\text{discharge}}(t) = 0$$
6.  **Cooling Unit Operational Boundaries**:
    $$0 \le N_{\text{ac\_on}}(t) \le N_{\text{ac, max}}$$
7.  **AC Set-Point Range Limits**:
    $$T_{\text{ac, min}} \le T_{\text{setpoint}}(t) \le T_{\text{ac, max}}$$
8.  **Energy Balance Conservation**:
    $$E_{\text{grid}}(t) + E_{\text{solar}}(t) + E_{\text{discharge}}(t) = E_{\text{cooling}}(t) + E_{\text{non\_cooling}}(t) + E_{\text{charge}}(t)$$
9.  **Maximum Grid Demand Peak**:
    $$\frac{E_{\text{grid}}(t)}{\Delta t} \le P_{\text{grid, peak\_limit}}$$

---

## 5. Decision Reason Codes
Each interval decision is labeled with a reason code indicating the primary operational driver:

| Reason Code | Priority | Description |
| :--- | :---: | :--- |
| `OUTAGE` | 1 | Operating during utility grid outage; battery/solar active. |
| `PEAK_TARIFF` | 2 | Peak electricity rates; reducing AC load and discharging battery. |
| `SOLAR_SURPLUS` | 3 | Excess solar energy available; charging battery and pre-cooling. |
| `PRE_COOL` | 4 | Pre-cooling building during cheaper rate zones before occupancy. |
| `NORMAL` | 5 | Default steady-state thermostat operation within comfort bounds. |
