"use client";

import { CircularGauge } from "./CircularGauge";
import { Sun, Battery, Zap } from "lucide-react";

interface ScenarioCardProps {
  title: string;
  status: "optimized" | "pending" | "error" | "running";
  score?: number;
  savings: string;
  savingsPeriod?: string;
  tags: string[];
}

const statusConfig = {
  optimized: {
    label: "OPTIMIZED",
    className: "status-optimized",
    gaugeColor: "#61de8a",
  },
  pending: {
    label: "PENDING",
    className: "status-pending",
    gaugeColor: "#f59e0b",
  },
  error: {
    label: "ERROR",
    className: "status-error",
    gaugeColor: "#ffb4ab",
  },
  running: {
    label: "RUNNING",
    className: "status-running",
    gaugeColor: "#9acbff",
  },
};

const tagIcons: Record<string, typeof Sun> = {
  SOLAR: Sun,
  BATTERY: Battery,
  GRID: Zap,
  "GRID ONLY": Zap,
};

export function ScenarioCard({
  title,
  status,
  score,
  savings,
  savingsPeriod = "7-day savings",
  tags,
}: ScenarioCardProps) {
  const config = statusConfig[status];

  // Format properly: "PKR 12,450" (add space after PKR if not present)
  const formattedSavings = `PKR ${savings}`;

  return (
    <div className="bg-[#1E293B] rounded-[8px] p-[12px] border border-slate-700/30 flex flex-col justify-between animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <span className={`badge ${config.className} mb-1.5 inline-block text-[11px] font-semibold`}>
            {config.label}
          </span>
          <h3 className="text-[13px] font-semibold text-white mt-1 leading-normal">{title}</h3>
        </div>
        {score !== undefined && (
          <CircularGauge
            value={score}
            size={40}
            strokeWidth={3}
            color={config.gaugeColor}
            label={`${score}%`}
          />
        )}
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {tags.map((tag) => {
          const Icon = tagIcons[tag.toUpperCase()] || Zap;
          return (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800 text-[11px] text-slate-300 border border-slate-700/30"
            >
              <Icon size={10} strokeWidth={1.5} />
              {tag}
            </span>
          );
        })}
      </div>

      {/* Savings */}
      <div className="flex flex-col gap-[4px] mt-1">
        <span className="text-[14px] font-bold text-white leading-none">
          {formattedSavings}
        </span>
        <span className="text-[11px] text-[#94A3B8] font-normal leading-none">
          {savingsPeriod}
        </span>
      </div>
    </div>
  );
}

