"use client";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

export function ConsumptionBarChart() {
  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const data = {
    labels,
    datasets: [
      {
        label: "Baseline",
        data: [18.2, 17.5, 19.0, 20.1, 18.8, 16.5, 15.0],
        backgroundColor: "rgba(154, 203, 255, 0.3)",
        borderColor: "#9acbff",
        borderWidth: 1,
        borderRadius: 4,
        barThickness: 20,
      },
      {
        label: "Optimized",
        data: [14.5, 13.8, 15.2, 16.0, 14.8, 13.0, 12.0],
        backgroundColor: "rgba(125, 215, 190, 0.5)",
        borderColor: "#7dd7be",
        borderWidth: 1,
        borderRadius: 4,
        barThickness: 20,
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
        grid: { display: false },
        ticks: {
          color: "#8b919b",
          font: { family: "DM Sans", size: 11 },
        },
        border: { display: false },
      },
      y: {
        grid: { color: "rgba(65, 71, 80, 0.1)", drawTicks: false },
        ticks: {
          color: "#8b919b",
          font: { family: "DM Sans", size: 10 },
          callback: (v: unknown) => `${v} kWh`,
        },
        border: { display: false },
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
    <div className="chart-wrapper h-[240px]">
      <Bar data={data} options={options} />
    </div>
  );
}
