"use client";

import { useEffect, useRef } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend
);

export function EnergyProfileChart() {
  const labels = [
    "00:00", "01:00", "02:00", "03:00", "04:00", "05:00",
    "06:00", "07:00", "08:00", "09:00", "10:00", "11:00",
    "12:00", "13:00", "14:00", "15:00", "16:00", "17:00",
    "18:00", "19:00", "20:00", "21:00", "22:00", "23:00",
  ];

  const data = {
    labels,
    datasets: [
      {
        label: "Grid",
        data: [2.1, 1.8, 1.5, 1.2, 1.0, 0.8, 1.5, 2.8, 3.5, 3.2, 2.8, 2.2, 1.8, 1.5, 2.0, 3.0, 4.2, 4.8, 4.5, 3.8, 3.2, 2.8, 2.5, 2.2],
        borderColor: "#1b6ca8",
        backgroundColor: "rgba(27, 108, 168, 0.15)",
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 2,
      },
      {
        label: "Solar",
        data: [0, 0, 0, 0, 0, 0.2, 1.0, 2.5, 4.0, 5.2, 5.8, 6.0, 5.5, 5.0, 4.2, 3.0, 1.8, 0.5, 0, 0, 0, 0, 0, 0],
        borderColor: "#61de8a",
        backgroundColor: "rgba(97, 222, 138, 0.1)",
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 2,
      },
      {
        label: "Battery",
        data: [0, 0, 0, 0, 0, 0, 0, 0, 0.5, 1.0, 1.2, 0.8, 0.3, 0, 0, 0.5, 1.5, 2.0, 1.8, 1.2, 0.5, 0, 0, 0],
        borderColor: "#7dd7be",
        backgroundColor: "rgba(125, 215, 190, 0.1)",
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
    interaction: {
      mode: "index" as const,
      intersect: false,
    },
    scales: {
      x: {
        grid: {
          color: "rgba(65, 71, 80, 0.15)",
          drawTicks: false,
        },
        ticks: {
          color: "#8b919b",
          font: { family: "DM Sans", size: 10 },
          maxTicksLimit: 8,
        },
        border: { display: false },
      },
      y: {
        grid: {
          color: "rgba(65, 71, 80, 0.1)",
          drawTicks: false,
        },
        ticks: {
          color: "#8b919b",
          font: { family: "DM Sans", size: 10 },
          callback: (v: unknown) => `${v} kW`,
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
        titleFont: { family: "DM Sans", weight: 600 as const },
        bodyFont: { family: "DM Sans" },
        padding: 12,
      },
    },
  };

  return (
    <div className="chart-wrapper h-[280px]">
      <Line data={data} options={options} />
    </div>
  );
}
