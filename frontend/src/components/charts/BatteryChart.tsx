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

export function BatteryChart() {
  const labels = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`);

  const data = {
    labels,
    datasets: [
      {
        label: "State of Charge",
        data: [85, 80, 75, 70, 65, 60, 55, 50, 55, 65, 75, 85, 90, 95, 100, 95, 85, 70, 55, 45, 40, 45, 55, 70],
        borderColor: "#7dd7be",
        backgroundColor: "rgba(125, 215, 190, 0.12)",
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 2,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
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
          callback: (v: unknown) => `${v}%`,
        },
        border: { display: false },
        min: 0,
        max: 100,
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
    <div className="chart-wrapper h-[200px]">
      <Line data={data} options={options} />
    </div>
  );
}
