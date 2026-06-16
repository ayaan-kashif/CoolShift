'use client';

import React, { useState } from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';

interface Slide {
  title: string;
  subtitle?: string;
  icon: string;
  content: React.ReactNode;
}

export default function PitchDeckPage() {
  const [activeSlide, setActiveSlide] = useState(0);

  const slides: Slide[] = [
    // Slide 1: Cover
    {
      title: 'CoolShift',
      subtitle: 'Intelligent Cooling Optimization Platform',
      icon: '❄️',
      content: (
        <div className="text-center space-y-6 max-w-2xl mx-auto py-8">
          <p className="text-lg text-[#00d4aa] font-bold tracking-wider uppercase">48-Hour Buildathon Pitch</p>
          <h2 className="text-4xl font-extrabold text-white leading-tight">
            Shaving Cooling Costs, Maximizing Clean Solar, and Outsmarting Load Shedding
          </h2>
          <p className="text-white/60 text-sm leading-relaxed">
            CoolShift is a mathematically optimal energy management platform that combines building thermal physics models, local solar arrays, and battery storage to combat volatile grid tariffs and outages in Pakistan.
          </p>
          <div className="flex justify-center gap-3 pt-4 text-xs font-semibold text-white/50">
            <span className="px-3 py-1 bg-white/5 rounded-full border border-white/10">Next.js 14</span>
            <span className="px-3 py-1 bg-white/5 rounded-full border border-white/10">Express.js</span>
            <span className="px-3 py-1 bg-white/5 rounded-full border border-white/10">SQLite</span>
            <span className="px-3 py-1 bg-white/5 rounded-full border border-white/10">LP Solver</span>
          </div>
        </div>
      ),
    },
    // Slide 2: Problem
    {
      title: 'The Challenge in Karachi',
      subtitle: 'Extreme Heat & Volatile Grid Economics',
      icon: '🌡️',
      content: (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-4">
          <div className="space-y-4">
            <h3 className="text-[#ef4444] font-bold text-base flex items-center gap-1.5">
              <span>🚨</span> The Trilemma Facing Karachi Buildings:
            </h3>
            <ul className="space-y-3 text-xs text-white/80 list-disc list-inside">
              <li><strong>Severe Heatwave Index:</strong> Peak summer temperatures of 43°C+ with high humidity pushing the heat index above 50°C.</li>
              <li><strong>Grid Outages (Load Shedding):</strong> Regular 4-to-8 hour blackouts forcing reliance on expensive diesel generators or batteries.</li>
              <li><strong>Skyrocketing Utility Tariffs:</strong> Volatile peak rates of up to PKR 45/kWh, placing a massive burden on schools, clinics, and low-income households.</li>
            </ul>
          </div>
          <div className="bg-red-500/5 border border-red-500/10 rounded-2xl p-6 flex flex-col justify-center text-center space-y-2">
            <p className="text-5xl font-extrabold text-[#ef4444]">PKR 45+</p>
            <p className="text-xs font-semibold text-white/70 uppercase tracking-wider">Peak Hour Electricity Tariff</p>
            <p className="text-[10px] text-white/40 leading-relaxed mt-2">
              Forces commercial and residential facilities to shut down cooling or accumulate unsustainable debts.
            </p>
          </div>
        </div>
      ),
    },
    // Slide 3: Solution
    {
      title: 'The CoolShift Solution',
      subtitle: 'Optimal Multi-Variable Cooling Schedules',
      icon: '🚀',
      content: (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 py-4 text-center">
          <Card className="p-4 bg-white/5 space-y-3">
            <div className="text-3xl">🎛️</div>
            <h4 className="font-bold text-white text-sm">Pre-Cooling Logic</h4>
            <p className="text-xs text-white/60 leading-relaxed">
              Dynamically turns on AC units during cheap off-peak hours (PKR 18/kWh) to sub-cool the building structure, using its thermal mass as a battery.
            </p>
          </Card>
          <Card className="p-4 bg-white/5 space-y-3">
            <div className="text-3xl">☀️</div>
            <h4 className="font-bold text-white text-sm">Solar Injection</h4>
            <p className="text-xs text-white/60 leading-relaxed">
              Identifies solar noon peaks and channels surplus local generation directly into cooling loops or storage assets.
            </p>
          </Card>
          <Card className="p-4 bg-white/5 space-y-3">
            <div className="text-3xl">🔋</div>
            <h4 className="font-bold text-white text-sm">Smart Battery Buffer</h4>
            <p className="text-xs text-white/60 leading-relaxed">
              Charges the battery on cheap power or excess solar, and discharges it to power AC units during outages or peak tariff slots.
            </p>
          </Card>
        </div>
      ),
    },
    // Slide 4: Math & Physics
    {
      title: 'Physics & Optimization Core',
      subtitle: 'The Mathematical Engine',
      icon: '🧠',
      content: (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-4 text-xs leading-relaxed text-white/80">
          <div className="space-y-4">
            <h3 className="text-[#00d4aa] font-bold text-sm">1. Thermal Physics (RC Model)</h3>
            <div className="bg-white/5 border border-white/10 p-4 rounded-xl font-mono text-[10px] text-[#00d4aa]">
              T_in(t+1) = T_in(t) + dt/C_th * [ (T_out(t) - T_in(t))/R_th + Q_solar + Q_occ - Q_cool ]
            </div>
            <p className="text-[10px] text-white/50">
              Models building insulation resistances (R_th) and heat capacities (C_th) to accurately simulate indoor temperature decay.
            </p>
          </div>
          <div className="space-y-4">
            <h3 className="text-[#00d4aa] font-bold text-sm">2. Linear Programming (LP) Solver</h3>
            <div className="bg-white/5 border border-white/10 p-4 rounded-xl font-mono text-[10px] text-[#00d4aa]">
              Minimize sum(t) [ w_cost * Cost_t + w_emissions * Carbon_t + w_comfort * ComfortDev_t + w_peak * Peak_t ]
            </div>
            <p className="text-[10px] text-white/50">
              Guarantees mathematically optimal hourly cooling setpoints, battery charging rates, and AC duty cycles.
            </p>
          </div>
        </div>
      ),
    },
    // Slide 5: SDG Impact
    {
      title: 'Global UN SDG Alignment',
      subtitle: 'Measurable Clean Energy & Climate Action',
      icon: '🌍',
      content: (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-4">
          <div className="space-y-4">
            <div className="flex gap-3 items-start">
              <span className="text-2xl">⚡</span>
              <div>
                <h4 className="font-bold text-[#00d4aa] text-sm">SDG-7: Affordable & Clean Energy</h4>
                <p className="text-xs text-white/60 mt-1 leading-relaxed">
                  Reduces electricity expenses by 30-40%. Enables essential health clinics, schools, and low-income families to run cooling equipment affordably.
                </p>
              </div>
            </div>
            <div className="flex gap-3 items-start">
              <span className="text-2xl">🌱</span>
              <div>
                <h4 className="font-bold text-[#00d4aa] text-sm">SDG-13: Climate Action</h4>
                <p className="text-xs text-white/60 mt-1 leading-relaxed">
                  Shaves carbon emissions by automatically shifting loads away from heavy grid carbon slots towards localized solar array peaks.
                </p>
              </div>
            </div>
          </div>
          <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-6 flex flex-col justify-center text-center space-y-2">
            <p className="text-5xl font-extrabold text-[#00d4aa]">30% - 40%</p>
            <p className="text-xs font-semibold text-white/70 uppercase tracking-wider">Average Utility Cost Shaved</p>
            <p className="text-[10px] text-white/40 leading-relaxed mt-2">
              Proven results verified under extreme Karachi humidity and tariff profiles.
            </p>
          </div>
        </div>
      ),
    },
  ];

  const nextSlide = () => {
    setActiveSlide((prev) => (prev === slides.length - 1 ? 0 : prev + 1));
  };

  const prevSlide = () => {
    setActiveSlide((prev) => (prev === 0 ? slides.length - 1 : prev - 1));
  };

  const current = slides[activeSlide];

  return (
    <div className="space-y-8 max-w-4xl mx-auto h-[80vh] flex flex-col justify-between">
      {/* Top Header */}
      <div className="flex justify-between items-center border-b border-white/10 pb-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
            📈 Built-in Pitch Presentation
          </h1>
          <p className="text-white/60 text-sm mt-1">
            Dogfooding: presenting CoolShift values and architectural metrics inside the application itself.
          </p>
        </div>
        <div className="text-xs font-mono text-white/50 bg-white/5 px-3 py-1 rounded-full border border-white/10">
          Slide {activeSlide + 1} of {slides.length}
        </div>
      </div>

      {/* Slide Content Card */}
      <Card className="flex-1 flex flex-col justify-center p-8 bg-white/5 backdrop-blur-lg border border-white/10 rounded-3xl my-6 min-h-[350px]">
        <div className="space-y-6">
          <div className="flex items-center gap-4 border-b border-white/5 pb-4">
            <span className="text-4xl">{current.icon}</span>
            <div>
              <h2 className="text-2xl font-extrabold text-white">{current.title}</h2>
              {current.subtitle && <p className="text-xs text-[#00d4aa] font-semibold mt-0.5">{current.subtitle}</p>}
            </div>
          </div>
          <div className="animate-fadeIn">{current.content}</div>
        </div>
      </Card>

      {/* Navigation Controls */}
      <div className="flex justify-between items-center border-t border-white/10 pt-4">
        <Button variant="secondary" onClick={prevSlide}>
          ◀ Previous Slide
        </Button>
        <div className="flex gap-1.5">
          {slides.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setActiveSlide(idx)}
              className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                activeSlide === idx ? 'bg-[#00d4aa] w-6' : 'bg-white/20 hover:bg-white/40'
              }`}
              aria-label={`Go to slide ${idx + 1}`}
            />
          ))}
        </div>
        <Button variant="primary" onClick={nextSlide}>
          Next Slide ▶
        </Button>
      </div>
    </div>
  );
}
