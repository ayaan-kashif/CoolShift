# Nabeel's Contribution — AI/ML Innovation Layer

## What I Built

Added a complete **AI/ML Intelligence Layer** to CoolShift — 3 core ML engines + REST API + full interactive frontend page. Everything runs in **pure TypeScript** with zero additional npm packages.

---

## 🧠 1. ML Temperature Prediction Model

**File:** `backend/src/core/ml-temperature-model.ts`

- **Technique:** Multivariate Ordinary Least Squares (OLS) Linear Regression
- **Implementation:** Full matrix algebra in TypeScript — `β = (XᵀX)⁻¹Xᵀy`
- **7 Features used:**
  - `outdoor_temp_c` — dry-bulb outdoor temperature
  - `heat_index_c` — humidity-adjusted temperature
  - `solar_irradiance_w_m2` — normalised solar radiation
  - `occupancy_count` — number of people in building
  - `sin(2π × hour/24)` — cyclic time encoding (captures daily patterns)
  - `cos(2π × hour/24)` — cyclic time encoding
  - `bias` — intercept term
- **Training:** Learns from the scenario's own interval data + historic run outputs
- **Metrics:** Computes R² (fit quality) and MAE (mean absolute error)
- **Storage:** Saves trained coefficients in `ai_model_params` SQLite table
- **Inference:** Generates 96-interval (24h) temperature forecasts
- **Comparison:** ML prediction vs existing RC physics model vs outdoor temp

---

## 🔍 2. Anomaly Detection Engine

**File:** `backend/src/core/anomaly-detector.ts`

- **Technique:** Rolling Z-score statistical analysis (2-hour window)
- **5 Detection Types:**
  1. **ENERGY_SPIKE** — Grid energy > 2.5σ above rolling mean (Z-score)
  2. **AC_SUDDEN_JUMP** — AC units change by ≥2 in a single 15-min interval
  3. **COMFORT_CLIFF** — Indoor temperature jumps >2°C in one interval
  4. **OUTAGE_HEAT_RISK** — Grid outage + indoor temp >33°C (health risk)
  5. **SOLAR_CURTAILMENT** — Solar available but AC off during occupied hours
- **Severity Levels:** Critical, High, Medium, Low — with deduplication
- **Output:** Ranked anomaly list with explanations and baseline comparisons

---

## 💡 3. AI Recommendations Engine

**File:** `backend/src/core/ai-recommendations.ts`

- **Technique:** Pattern analysis across completed optimization run data
- **7 Recommendation Types:**
  1. **Off-Peak Shift** — Shift cooling to cheaper tariff hours (P1)
  2. **Pre-Cooling** — Cool building before evening peak (P1)
  3. **Solar Utilisation** — Capture wasted solar energy (P2)
  4. **Setpoint Relaxation** — Raise setpoint during over-cooled periods (P2)
  5. **Resilience** — Address outage + high temp periods (P1)
  6. **Comfort Violations** — Reduce unsafe temperature intervals (P1)
  7. **Insulation Upgrade** — Long-term building improvement (P3)
- **Each recommendation includes:**
  - Priority ranking (P1/P2/P3)
  - Estimated PKR savings
  - Confidence score (0-100%)
  - Supporting statistics from the actual run data

---

## 🛣️ 4. REST API Endpoints

**File:** `backend/src/routes/ai.ts`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/ai/train/:scenario_id` | Train ML model on scenario data |
| `GET` | `/api/v1/ai/model/:scenario_id` | Get trained model params |
| `GET` | `/api/v1/ai/forecast/:scenario_id` | 24h ML vs RC forecast |
| `GET` | `/api/v1/ai/anomalies/:run_id` | Detect anomalies in a run |
| `GET` | `/api/v1/ai/recommendations/:run_id` | Generate ranked recommendations |

---

## 🎨 5. AI Insights Frontend Page

**File:** `frontend/src/app/ai/page.tsx` — Route: `/ai`

**4 Interactive Sections:**

### Section 1: Model Training Panel
- Select scenario → click "Train Model"
- Shows R², MAE, sample count, training timestamp
- **Feature importance horizontal bar chart** — coefficient magnitude visualization

### Section 2: 24-Hour Temperature Forecast
- Custom SVG line chart (no extra charting library)
- **Purple line:** ML predicted temperature
- **Teal dashed:** RC physics baseline
- **Orange dashed:** Outdoor temperature
- **Green shaded band:** Comfort zone
- Peak temperature comparison cards below

### Section 3: Anomaly Detection Panel
- Auto-scans selected run
- Summary badges: 🔴 Critical | 🟠 High | 🟡 Medium | 🔵 Low
- Expandable anomaly cards with type icons and explanations

### Section 4: AI Recommendations Panel
- Priority-ranked cards (P1 = red, P2 = yellow, P3 = blue)
- PKR savings estimates with confidence progress bars
- Category icons: 💰 Cost | 🌡️ Comfort | ⚡ Peak | 🌿 Emissions | 🛡️ Resilience

---

## 📁 Files Modified

| File | Change |
|------|--------|
| `backend/src/db/connection.ts` | Added `ai_model_params` table to schema |
| `backend/src/index.ts` | Registered `aiRouter` at `/api/v1/ai` |
| `frontend/src/components/layout/Sidebar.tsx` | Added 🤖 AI Insights nav link with BrainCircuit icon |
| `backend/.env` | Created with PORT/DB/CORS configuration |
| `frontend/.env.local` | Created with NEXT_PUBLIC_API_URL |

## 📁 Files Created

| File | Type |
|------|------|
| `backend/src/core/ml-temperature-model.ts` | ML Engine (~320 lines) |
| `backend/src/core/anomaly-detector.ts` | Anomaly Engine (~160 lines) |
| `backend/src/core/ai-recommendations.ts` | Recommendations Engine (~220 lines) |
| `backend/src/routes/ai.ts` | REST API Routes (~170 lines) |
| `frontend/src/app/ai/page.tsx` | AI Insights Page (~450 lines) |

---

## 🏆 Key Innovation Points for Judges

1. **Real ML model** trained on building-specific data — not hardcoded rules
2. **Pure TypeScript implementation** — OLS matrix algebra, no Python/TF/sklearn needed
3. **Statistical anomaly detection** — Z-score with rolling window, a real explainable ML technique
4. **Actionable recommendations** with PKR savings estimates and confidence scores
5. **Visual comparison** of ML predicted vs physics model — judges can see the model learns
6. **Zero new dependencies** — everything works with existing npm packages
7. **Live training** — model trains on button click from the scenario's own data
