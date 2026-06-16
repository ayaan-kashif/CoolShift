"use client";

import { LucideIcon } from "lucide-react";
import { ReactNode } from "react";

interface KPICardProps {
  label: string;
  value: string;
  unit?: string;
  sublabel?: string;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon?: LucideIcon;
  iconColor?: string;
  accentColor?: string;
  children?: ReactNode;
}

export function KPICard({
  label,
  value,
  unit,
  sublabel,
  change,
  changeType = "positive",
  icon: Icon,
  iconColor,
  accentColor,
  children,
}: KPICardProps) {
  const changeColors = {
    positive: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
    negative: "bg-rose-500/10 text-rose-400 border border-rose-500/20",
    neutral: "bg-slate-500/10 text-slate-400 border border-slate-500/20",
  };

  const displayValue = unit === "PKR" ? `PKR ${value}` : `${value}${unit || ""}`;

  return (
    <div
      className="bg-[#1E293B] border border-[#334155] rounded-[12px] px-[20px] pt-[16px] pb-[14px] flex flex-col justify-between h-[110px] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg animate-fade-in min-w-0"
      style={
        accentColor
          ? { borderTop: `4px solid ${accentColor}` }
          : undefined
      }
    >
      {/* Row 1: small icon (16px) + metric label in uppercase 11px gray text (#94A3B8), right-aligned trend badge */}
      <div className="flex justify-between items-center w-full mb-[6px]">
        <div className="flex items-center gap-1.5 text-[#94A3B8] min-w-0">
          {Icon && (
            <Icon
              size={16}
              className={iconColor || "text-slate-400"}
              strokeWidth={2}
            />
          )}
          <span className="text-[11px] font-medium tracking-[0.05em] uppercase text-[#94A3B8] truncate">
            {label}
          </span>
        </div>
        {change && (
          <span
            className={`${changeColors[changeType] || changeColors.neutral} text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0`}
          >
            {change}
          </span>
        )}
      </div>

      {/* Row 2: large bold value — 32px font, white */}
      <div className="text-[32px] font-bold text-white tracking-tight leading-none truncate mb-[6px]">
        {displayValue}
      </div>

      {/* Row 3: small subtitle 12px gray */}
      <div className="text-[12px] font-normal text-[#64748B] truncate leading-none">
        {sublabel || "\u00A0"}
      </div>

      {children}
    </div>
  );
}

