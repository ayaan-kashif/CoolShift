# CoolShift: Intelligent Cooling Optimization Platform

CoolShift is an AI-powered thermal optimization platform designed to shave cooling costs, integrate local battery and solar energy assets, and mitigate greenhouse gas emissions under extreme summer temperatures and volatile grid tariffs.

## 👥 Team & Demo Info
*   **Team Name:** Buildathon Competitor Team (Placeholder)
*   **Live Demo URL:** [https://coolshift.placeholder.demo](https://coolshift.placeholder.demo) (Placeholder)

---

## ⚡ Quick Start

Follow these steps to launch the entire containerized application stack:

1.  **Clone the Repository:**
    ```bash
    git clone https://github.com/ayaan-kashif/CoolShift.git
    cd CoolShift
    ```
2.  **Launch via Docker Compose:**
    ```bash
    docker-compose up --build
    ```
3.  **Access the Applications:**
    *   **Frontend Dashboard:** Open [http://localhost:3000](http://localhost:3000)
    *   **Backend API Service:** Access [http://localhost:4000/api/v1/health](http://localhost:4000/api/v1/health)

---

## 🏗️ Architecture Summary

The platform uses a decoupled three-tier architecture:
1.  **Frontend Dashboard (Next.js 14 App Router + Tailwind CSS + Recharts + Zustand):** Provides a responsive glassmorphic dark-theme UI monitoring active warnings, Heat Risk Timelines, and comparative savings analysis.
2.  **API Service (Express.js + TypeScript + SQLite):** Orchestrates building profile configurations, imports raw weather/tariff interval spreadsheets, and logs historical solver executions.
3.  **Optimization Engine (JavaScript LP Solver):** Combines building insulation models with battery state-of-charge limits to solve linear programming matrices, generating optimized cooling schedules.

---

## 🌍 UN SDG Alignment

CoolShift is built specifically to address:
*   **UN SDG-7 (Affordable and Clean Energy):** Reduces utility bills by an average of 30-40% through load shifting and maximizes clean solar self-consumption.
*   **UN SDG-13 (Climate Action):** Avoids carbon emissions by shifting consumption to off-peak slots and solar noon, reducing reliance on carbon-intensive grid electricity.

---

## 🧠 Optimization Algorithm & Physics Model

*   **Greedy Heuristic / LP Solver:** Leverages a Linear Programming solver (`javascript-lp-solver`) to minimize cumulative costs, grid peak draw, and thermal discomfort deviation.
*   **Thermal RC Model:** Models building heat gains based on insulation level, sun exposure, occupancy baseload, and outdoor temperatures.
*   **Battery SoC State-Machine:** Constrains charging and discharging limits based on reserves, max thresholds, and conversion efficiency.
*   *For exact formulations, see* [method.md](file:///docs/method.md).

---

## 🤖 AI Tools Disclosure

This project was built with the assistance of **Antigravity**, Google DeepMind's agentic AI pair programming assistant, supporting frontend components implementation, Jest test suite structures, and database mock setups.

---

## ⚠️ Limitations & Constraints

*   **Offline Mode Solver:** Relies on pre-seeded weather/tariff interval profiles. Real-time changes are simulated using local directional delta models.
*   **Insulation Constants:** Simplified thermal resistances are calculated based on categorical profiles (Low/Medium/High) rather than exact wall material properties.
