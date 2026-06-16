"use client";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

export function TemperatureChart() {
  const labels = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`);

  const data = {
    labels,
    datasets: [
      {
        label: "Indoor",
        data: [24.5, 24.2, 24.0, 23.8, 23.5, 23.2, 23.0, 23.5, 24.0, 24.5, 25.0, 25.2, 25.5, 25.3, 25.0, 24.8, 25.2, 25.5, 25.0, 24.5, 24.2, 24.0, 24.2, 24.5],
        borderColor: "#9acbff",
        backgroundColor: "rgba(154, 203, 255, 0.05)",
        fill: false,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 2,
      },
      {
        label: "Outdoor",
        data: [30, 29, 28, 27, 26, 27, 29, 32, 35, 38, 40, 42, 43, 42, 41, 40, 39, 37, 35, 33, 32, 31, 31, 30],
        borderColor: "#ff9800",
        borderDash: [5, 5],
        backgroundColor: "transparent",
        fill: false,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 1.5,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: "index" as const,
      intersect: false,
    },
    scales: {
      x: {
        grid: { color: "rgba(65, 71, 80, 0.1)", drawTicks: false },
        ticks: {
          color: "#8b919b",
          font: { family: "DM Sans", size: 10 },
          maxTicksLimit: 8,
        },
        border: { display: false },
      },
      y: {
        grid: { color: "rgba(65, 71, 80, 0.1)", drawTicks: false },
        ticks: {
          color: "#8b919b",
          font: { family: "DM Sans", size: 10 },
          callback: (v: unknown) => `${v}°C`,
        },
        border: { display: false },
        min: 20,
        max: 45,
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#1b2027",
        titleColor: "#dee2ec",
        bodyColor: "#c0c7d1",
        borderColor: "#414750",
        borderWidth: 1,
        cornerRadius: 8,
        padding: 12,
      },
    },
  };

  return (
    <div className="relative">
      {/* Comfort Zone Band */}
      <div className="absolute top-[35%] left-0 right-0 h-[25%] bg-tertiary/5 border-y border-tertiary/20 rounded z-0 pointer-events-none" />
      <div className="chart-wrapper h-[220px] relative z-10">
        <Line data={data} options={options} />
      </div>
    </div>
  );
}
