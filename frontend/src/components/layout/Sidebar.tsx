// file:///C:/Users/Hp/OneDrive/Desktop%202/CoolShift/CoolShift/frontend/src/components/layout/Sidebar.tsx
'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import api from '../../lib/api';

export default function Sidebar() {
  const pathname = usePathname();
  const [apiOk, setApiOk] = useState<boolean | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await api.get('/api/v1/health');
        if (res.status === 200 && res.data.status === 'ok') {
          setApiOk(true);
        } else {
          setApiOk(false);
        }
      } catch (err) {
        setApiOk(false);
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  const links = [
    { name: 'Dashboard', path: '/', icon: '🏠', badge: 3 },
    { name: 'Import Data', path: '/import', icon: '📁' },
    { name: 'New Scenario', path: '/scenarios/new', icon: '⚙️' },
    { name: 'Run Optimizer', path: '/optimize', icon: '🚀' },
    { name: 'Run History', path: '/runs', icon: '📊' },
    { name: 'Custom Scenarios', path: '/custom', icon: '🗂️' },
    { name: 'SDG Impact', path: '/impact', icon: '🌍' },
    { name: 'What-If Simulator', path: '/whatif', icon: '🔬' },
    { name: 'Quick Judge Test', path: '/quicktest', icon: '⚡' },
    { name: 'Acceptance Checks', path: '/admin/checks', icon: '🧪' },
    { name: 'Pitch Presentation', path: '/pitch', icon: '📈' },
  ];

  return (
    <aside
      className={`bg-white/5 border-r border-white/10 backdrop-blur-md flex flex-col justify-between transition-all duration-300 ${
        collapsed ? 'w-20' : 'w-72'
      } shrink-0`}
    >
      <div className="flex flex-col">
        {/* Header */}
        <div className="p-6 flex items-center justify-between border-b border-white/10">
          {!collapsed && (
            <div>
              <h1 className="text-xl font-bold text-white tracking-wide">
                Cool<span className="text-[#00d4aa]">Shift</span>
              </h1>
              <p className="text-xs text-white/50">Cooling Optimization Engine</p>
            </div>
          )}
          {collapsed && (
            <span className="text-xl font-bold text-[#00d4aa] mx-auto">CS</span>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-white/60 hover:text-white p-1 rounded hover:bg-white/10 transition-colors"
            aria-label="Toggle Sidebar"
          >
            {collapsed ? '▶' : '◀'}
          </button>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-2">
          {links.map((link) => {
            const isActive = pathname === link.path;
            return (
              <Link
                key={link.path}
                href={link.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                  isActive
                    ? 'bg-[#00d4aa] text-black font-semibold shadow-[0_0_15px_rgba(0,212,170,0.4)]'
                    : 'text-white/70 hover:text-white hover:bg-white/5'
                }`}
              >
                <span className="text-lg">{link.icon}</span>
                {!collapsed && (
                  <div className="flex justify-between items-center w-full">
                    <span>{link.name}</span>
                    {link.hasOwnProperty('badge') && (link as any).badge > 0 && (
                      <span className="bg-[#ef4444] text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold ml-auto">
                        {(link as any).badge}
                      </span>
                    )}
                  </div>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer Info */}
      <div className="p-6 border-t border-white/10 space-y-4">
        {!collapsed && (
          <div className="bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 rounded-xl p-3 text-xs flex flex-col gap-1 shadow-sm">
            <span className="font-semibold flex items-center gap-1">
              <span>☘️</span> UN SDG-7 ✓ UN SDG-13 ✓
            </span>
            <span className="text-[10px] text-emerald-400/80">
              Clean Energy & Climate Action
            </span>
          </div>
        )}

        <div className="flex items-center gap-3">
          <span
            className={`w-3.5 h-3.5 rounded-full ring-4 ring-black/40 transition-colors duration-500 ${
              apiOk === null
                ? 'bg-yellow-500 animate-pulse'
                : apiOk
                ? 'bg-[#00d4aa] shadow-[0_0_10px_rgba(0,212,170,0.6)]'
                : 'bg-[#ef4444] shadow-[0_0_10px_rgba(239,68,68,0.6)]'
            }`}
          />
          {!collapsed && (
            <span className="text-xs text-white/50">
              API Status:{' '}
              {apiOk === null ? 'Checking...' : apiOk ? 'Connected' : 'Offline'}
            </span>
          )}
        </div>
      </div>
    </aside>
  );
}
