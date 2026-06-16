'use client';

import React, { useState } from 'react';
import Card from './ui/Card';

interface HeatRiskHeatmapProps {
  schedule?: any[];
  intervals?: any[];
}

export default function HeatRiskHeatmap({ schedule = [], intervals = [] }: HeatRiskHeatmapProps) {
  const [hoveredCell, setHoveredCell] = useState<any | null>(null);

  if (!intervals || intervals.length === 0) {
    return (
      <Card className="p-6 text-center text-white/50 text-sm">
        No intervals data available to render the Heat Risk Timeline.
      </Card>
    );
  }

  // Extract unique days
  const uniqueDays = Array.from(new Set(intervals.map((intv) => intv.timestamp_local.substring(0, 10)))).sort();
  const hours = Array.from({ length: 24 }, (_, i) => i);

  // Group intervals by Day and Hour
  const cellData: { [key: string]: any } = {};

  intervals.forEach((intv) => {
    const day = intv.timestamp_local.substring(0, 10);
    const hour = parseInt(intv.timestamp_local.substring(11, 13), 10);
    const key = `${day}_${hour}`;

    if (!cellData[key]) {
      cellData[key] = {
        day,
        hour,
        intervals: [],
        maxHeatIndex: 0,
        avgTemp: 0,
        totalOccupants: 0,
        gridOutage: false,
      };
    }

    cellData[key].intervals.push(intv);
    cellData[key].maxHeatIndex = Math.max(cellData[key].maxHeatIndex, intv.heat_index_c || intv.temperature_c);
    cellData[key].avgTemp += intv.temperature_c;
    cellData[key].totalOccupants = Math.max(cellData[key].totalOccupants, intv.occupancy_count || 0);
    if (intv.grid_available === 0) {
      cellData[key].gridOutage = true;
    }
  });

  // Complete averages
  Object.keys(cellData).forEach((key) => {
    const cell = cellData[key];
    cell.avgTemp = cell.avgTemp / cell.intervals.length;
  });

  const getCellColorClass = (cell: any) => {
    if (!cell || cell.totalOccupants === 0) {
      return 'bg-white/5 border border-white/5 hover:border-white/30';
    }

    const hi = cell.maxHeatIndex;
    if (hi >= 42) {
      return 'bg-[#ef4444] border border-[#ef4444]/40 hover:scale-105 transition-all shadow-[0_0_10px_rgba(239,68,68,0.4)]'; // Danger
    } else if (hi >= 35) {
      return 'bg-amber-500 border border-amber-500/40 hover:scale-105 transition-all shadow-[0_0_10px_rgba(245,158,11,0.4)]'; // Unsafe
    } else if (hi >= 30) {
      return 'bg-yellow-400 text-black border border-yellow-400/40 hover:scale-105 transition-all'; // Warning
    } else {
      return 'bg-emerald-500 border border-emerald-500/40 hover:scale-105 transition-all'; // Healthy
    }
  };

  const getDayLabel = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  };

  return (
    <Card className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            Karachi Heat Risk Timeline <span className="text-xs bg-[#00d4aa]/20 text-[#00d4aa] border border-[#00d4aa]/30 px-2 py-0.5 rounded-full">Live Monitor</span>
          </h2>
          <p className="text-xs text-white/50 mt-1">
            Visual hourly thermal safety heatmap cross-referenced against occupant presence.
          </p>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 text-[10px] uppercase font-bold text-white/60">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-[#ef4444] inline-block" />
            <span>Danger (≥42°C)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-amber-500 inline-block" />
            <span>Unsafe (35-42°C)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-yellow-400 inline-block" />
            <span>Warning (30-35°C)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-emerald-500 inline-block" />
            <span>Safe (&lt;30°C)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-white/5 border border-white/10 inline-block" />
            <span>Empty / Unoccupied</span>
          </div>
        </div>
      </div>

      <div className="relative overflow-x-auto pt-4">
        <div className="min-w-[700px] flex">
          {/* Hour Labels Column */}
          <div className="w-16 shrink-0 flex flex-col justify-between text-[10px] text-white/40 pr-2 pt-6 font-mono text-right">
            {hours.map((h) => (
              <div key={h} className="h-6 flex items-center justify-end">
                {String(h).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {/* Days Columns */}
          <div className="flex-1 grid grid-cols-7 gap-3">
            {uniqueDays.map((day) => (
              <div key={day} className="flex flex-col gap-1 text-center">
                {/* Day Header */}
                <div className="text-[10px] font-bold text-white/60 truncate pb-2 border-b border-white/5">
                  {getDayLabel(day)}
                </div>

                {/* Hours Blocks */}
                <div className="flex flex-col gap-1 mt-1">
                  {hours.map((hour) => {
                    const cell = cellData[`${day}_${hour}`];
                    return (
                      <div
                        key={hour}
                        className={`h-6 rounded-md cursor-pointer transition-all duration-200 ${getCellColorClass(cell)}`}
                        onMouseEnter={() => cell && setHoveredCell(cell)}
                        onMouseLeave={() => setHoveredCell(null)}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Hover Tooltip Info */}
        {hoveredCell && (
          <div className="absolute top-0 right-0 bg-[#0a0f1e]/95 border border-white/10 p-4 rounded-xl text-xs space-y-2 shadow-2xl z-20 backdrop-blur-md w-60">
            <div className="font-bold text-white border-b border-white/10 pb-1.5 mb-1.5 flex justify-between">
              <span>{new Date(hoveredCell.day).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
              <span className="font-mono text-[#00d4aa]">{String(hoveredCell.hour).padStart(2, '0')}:00</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/50">Avg Outdoor Temp:</span>
              <span className="font-bold text-white">{hoveredCell.avgTemp.toFixed(1)}°C</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/50">Max Heat Index:</span>
              <span className="font-bold text-[#f59e0b]">{hoveredCell.maxHeatIndex.toFixed(1)}°C</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/50">Occupancy Peak:</span>
              <span className="font-bold text-white">{hoveredCell.totalOccupants} persons</span>
            </div>
            {hoveredCell.gridOutage && (
              <div className="text-red-400 font-bold flex items-center gap-1 pt-1">
                <span>🔌</span> Load Shedding Active
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
