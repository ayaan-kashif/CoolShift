# Custom Scenario Provenance: Karachi Hospital

This document details the assumptions, data sources, and mathematical formulations used to generate the 7-day custom scenario dataset for `custom_hospital_karachi` in the CoolShift optimization platform.

---

## 1. Scenario Metadata
*   **Scenario ID**: `custom_hospital_karachi`
*   **Target Facility**: Emergency medical hospital / ward in Karachi, Pakistan.
*   **Seeding Timeframe**: 7 consecutive days starting **July 1st, 2026** at 00:00.
*   **Resolution**: 15-minute intervals (96 intervals per day, 672 rows total).

---

## 2. Weather Profiles & Temperature curves
Karachi's summer peaks are typically high dry-bulb temperatures combined with intense coastal relative humidity.
*   **Base (Day 1-2, 4, 6-7)**:
    *   Minimum temperature: 28°C (around 04:00 - 05:00 UTC+5).
    *   Maximum temperature: 38°C to 41°C (around 14:00 - 15:00 UTC+5).
    *   Humidity: Ranges from 75% in the morning/night to 55% during peak sun.
*   **Extreme Heatwave Event (Day 3)**:
    *   Simulates a dry continental heatwave with outdoor temperatures peaking at 43°C and relative humidity of 60%.
    *   The **Heat Index** formulation peaks at exactly **50°C** between 14:00 and 16:00, forcing the cooling optimizer to react to extreme thermal constraints.

---

## 3. Local Grid Load-Shedding & Outages
Hospital cooling must remain uninterrupted despite grid outages. Outage periods are introduced to test battery backups and solar microgrids:
1.  **Day 2 Outage (14:00 - 22:00)**: Simulated afternoon/evening utility load-shedding.
2.  **Day 5 Outage (08:00 - 16:00)**: Simulated morning/afternoon utility grid outage.

During these periods, `grid_available = 0`, meaning all AC units must rely entirely on solar generation and battery bank discharges.

---

## 4. Renewable Microgrid & Generation
*   **Solar Panel Array**: 8 kW peak capacity.
    *   Assumed diurnal sin-curve generation starting at 06:00, peaking at 12:00-14:00, and ending by 19:00.
    *   `solar_available_kw` calculated based on standard solar irradiance curves peaking at 800 W/m² under clear skies.
*   **Base Load**: Non-cooling loads (medical equipment, lighting, ventilator backup) are fixed at a constant **10.0 kW** baseline, which must be supported at all times.

---

## 5. Facility Operations & Tariff Zones
*   **Occupancy Profile**: Constant 50 occupants during night hours (22:00 - 06:00) and 200 occupants during daytime operation (06:00 - 22:00).
*   **Utility Tariffs**: Mirroring standard K-Electric Time-of-Use (ToU) tariffs:
    *   **Peak**: 18:00 - 22:00 (PKR 45.0 / kWh)
    *   **Off-Peak**: 22:00 - 06:00 (PKR 18.0 / kWh)
    *   **Normal / On-Peak**: 06:00 - 18:00 (PKR 32.0 / kWh)
*   **Carbon Footprint**: Fixed carbon index of **0.45 kg CO₂e / kWh**, representing the grid carbon intensity average of WAPDA and K-Electric.
