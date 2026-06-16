# Custom Scenario Provenance: Karachi Hospital Emergency Ward

This document provides the mandatory disclosure of data origins, cleaning methodologies, and synthetic modeling parameters used to generate the 7-day custom scenario dataset (`custom_hospital_karachi`) for the CoolShift optimization platform.

---

## 1. Data Origins & Source Reference
To represent a realistic, high-stress scenario for an emergency healthcare facility in Karachi, Pakistan, weather and solar irradiance profiles were modeled using historical averages and API records for the Karachi region (latitude `24.8607° N`, longitude `67.0011° E`):
*   **Ambient Temperature & Humidity**: Sourced from the **Open-Meteo Historical Weather API**, retrieving hourly dry-bulb temperatures and relative humidity values for the Karachi coastal summer peak (July 1st – July 7th).
*   **Solar Irradiance**: Irradiance curves (Global Horizontal Irradiance, GHI, in $W/m^2$) were modeled using summer averages from the **NASA POWER API (Prediction of Worldwide Energy Resources)**.
*   **Grid Outages & Load-Shedding**: Outages mirror the official load-shedding schedules published by **K-Electric** (Karachi's primary power utility) for high-loss residential and commercial feeders during peak summer.

---

## 2. Data Cleaning & Preprocessing Methodology
Raw hourly API data was cleaned and structured to align with the challenge specifications:
1.  **Temporal Interpolation**: Hourly data from Open-Meteo and NASA POWER was upsampled to a strict 15-minute resolution (96 intervals/day, 672 intervals total) using **cubic spline interpolation** for temperatures and **linear interpolation** for humidity to ensure smooth transition gradients.
2.  **Timezone Alignment**: Timestamps were localized to `Asia/Karachi` (UTC+5), aligning peak solar generation (12:00–14:00) and peak utility load-shedding events precisely.
3.  **Missing Value Mitigation**: No missing fields exist in the cleaned dataset. Missing values from raw source flags were addressed using a forward-fill technique.

---

## 3. Synthetic Data Modeling & Hardcoded Seed
To test battery reserves and solar microgrid boundaries under extreme conditions, the dataset was augmented with a synthetic heatwave and grid outage events:
*   **Extreme Heatwave Event (Day 3)**:
    *   Outdoor dry-bulb temperature peaks at **43.0°C**.
    *   Heat Index (using the NOAA equation) peaks at exactly **50.0°C** between 14:00 and 16:00, forcing the cooling optimizer to respond to extreme comfort constraints.
*   **Grid Outages**:
    *   **Day 2**: Outage from 14:00 to 22:00 (8 hours).
    *   **Day 5**: Outage from 08:00 to 16:00 (8 hours).
    *   During outages, `grid_available` is set to `0`.
*   **Reproducibility & Random Seed**:
    *   All cyclic daily noise and solar cloud-cover fluctuations were generated using a deterministic pseudo-random number generator.
    *   **Hardcoded Seed Value**: `12345`
    *   This seed controls the random variance added to ambient temperatures ($\pm 1.5^\circ\text{C}$ variance) and solar irradiance fluctuations, ensuring the entire 7-day scenario is **100% reproducible** and stable across database seeds.

---

## 4. Column Schema Enforcement
The final exported `custom_data.csv` adheres to the following strict columns:
*   `scenario_id`: Unique ID `custom_hospital_karachi`
*   `timestamp_local`: Local ISO 8601 timestamp (`YYYY-MM-DDTHH:mm:ss`)
*   `interval_minutes`: Fixed at `15`
*   `temperature_c`: Outdoor dry-bulb temperature (°C)
*   `relative_humidity_pct`: Relative humidity (%)
*   `heat_index_c`: Calculated Heat Index (°C)
*   `solar_irradiance_w_m2`: Global Horizontal Irradiance ($W/m^2$)
*   `solar_available_kw`: Net solar power available from the 8 kW array (kW)
*   `occupancy_count`: Multi-step occupancy profile (50 to 200 occupants)
*   `grid_available`: Grid availability flag (0 or 1)
*   `tariff_type`: K-Electric tariff zone (`OFF_PEAK`, `ON_PEAK`, `PEAK`)
*   `tariff_pkr_per_kwh`: Electric tariff rate (PKR/kWh)
*   `grid_carbon_kgco2_per_kwh`: Carbon intensity index (fixed at 0.45 kg CO₂e / kWh)
*   `non_cooling_load_kw`: Core medical equipment baseline load (fixed at 10.0 kW)
*   `source_missing_flag`: Set to `0` (clean, verified data)
