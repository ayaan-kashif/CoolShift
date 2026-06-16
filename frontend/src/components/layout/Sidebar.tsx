'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import api from '../../lib/api';
import { useCoolShiftStore } from '../../lib/store';
import {
  LayoutDashboard,
  Upload,
  PlusCircle,
  Zap,
  History,
  FolderOpen,
  Globe,
  Sliders,
  Activity,
  ShieldCheck,
  Play,
  Snowflake,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

export function Sidebar({ showAlert = false }: { showAlert?: boolean }) {
  const pathname = usePathname();
  const [apiOk, setApiOk] = useState<boolean | null>(null);
  const collapsed = useCoolShiftStore((s) => s.sidebarCollapsed);
  const setCollapsed = useCoolShiftStore((s) => s.setSidebarCollapsed);
  const alertCount = useCoolShiftStore((s) => s.alertCount);

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
    { name: 'Dashboard', path: '/', icon: LayoutDashboard, badge: alertCount },
    { name: 'Import Data', path: '/import', icon: Upload },
    { name: 'New Scenario', path: '/scenarios/new', icon: PlusCircle },
    { name: 'Run Optimizer', path: '/optimize', icon: Zap },
    { name: 'Run History', path: '/runs', icon: History },
    { name: 'Custom Scenarios', path: '/custom', icon: FolderOpen },
    { name: 'SDG Impact', path: '/impact', icon: Globe },
    { name: 'What-If Simulator', path: '/whatif', icon: Sliders },
    { name: 'Quick Judge Test', path: '/quicktest', icon: Activity },
    { name: 'Acceptance Checks', path: '/admin/checks', icon: ShieldCheck },
    { name: 'Pitch Presentation', path: '/pitch', icon: Play },
  ];

  return (
    <aside
      className={`fixed left-0 bg-[#0A1628] border-r border-[#1E293B] flex flex-col z-40 transition-all duration-300 ${
        collapsed ? 'w-20' : 'w-[260px]'
      }`}
      style={{
        top: showAlert ? '48px' : '0px',
        height: showAlert ? 'calc(100vh - 48px)' : '100vh',
      }}
    >
      {/* Logo + Collapse Toggle */}
      <div className="px-5 py-5 flex items-center justify-between border-b border-[#1E293B]">
        {!collapsed ? (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#0EA5E9]/20 flex items-center justify-center flex-shrink-0">
              <Snowflake className="w-4 h-4 text-[#0EA5E9]" strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="text-[14px] font-bold text-white leading-none">CoolShift</h2>
              <p className="text-[10px] text-[#64748B] uppercase tracking-[0.12em] font-medium mt-[2px]">
                Climate Optimizer
              </p>
            </div>
          </div>
        ) : (
          <div className="mx-auto w-8 h-8 rounded-lg bg-[#0EA5E9]/20 flex items-center justify-center">
            <Snowflake className="w-4 h-4 text-[#0EA5E9]" strokeWidth={1.5} />
          </div>
        )}
        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            className="w-6 h-6 rounded flex items-center justify-center text-[#64748B] hover:text-white hover:bg-[#1E293B] transition-all"
            title="Collapse sidebar"
          >
            <ChevronLeft size={14} strokeWidth={2} />
          </button>
        )}
        {collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            className="absolute -right-3 top-6 w-6 h-6 rounded-full bg-[#1E293B] border border-[#334155] flex items-center justify-center text-[#64748B] hover:text-white hover:bg-[#1E293B] transition-all z-50 shadow-md"
            title="Expand sidebar"
          >
            <ChevronRight size={14} strokeWidth={2} />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-1">
        <div className="space-y-0.5">
          {links.map((link) => {
            const isActive =
              link.path === '/'
                ? pathname === '/'
                : pathname.startsWith(link.path);
            const Icon = link.icon;

            return (
              <Link
                key={link.path}
                href={link.path}
                className={`flex items-center gap-3 px-3 py-[9px] rounded-lg text-[13px] font-medium transition-all duration-150 relative
                  ${
                    isActive
                      ? 'bg-[#0EA5E914] text-[#0EA5E9] border-l-[3px] border-[#0EA5E9] pl-[9px]'
                      : 'text-[#94A3B8] hover:bg-[#1E293B] hover:text-white border-l-[3px] border-transparent pl-[9px]'
                  }`}
              >
                <Icon size={18} strokeWidth={isActive ? 2 : 1.5} />
                {!collapsed && (
                  <div className="flex justify-between items-center w-full">
                    <span>{link.name}</span>
                    {link.hasOwnProperty('badge') && (link as any).badge > 0 && (
                      <span className="bg-rose-500 text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold ml-auto">
                        {(link as any).badge}
                      </span>
                    )}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* API Status indicator */}
      <div className="px-3 mb-2">
        <div className="bg-[#0F1C2E] border border-[#1E293B] rounded-lg px-3 py-2.5 flex items-center gap-2.5">
          <span
            className={`w-2.5 h-2.5 rounded-full transition-colors duration-500 flex-shrink-0 ${
              apiOk === null
                ? 'bg-yellow-500 animate-pulse'
                : apiOk
                ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]'
                : 'bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.6)]'
            }`}
          />
          {!collapsed && (
            <span className="text-[11px] text-[#94A3B8] font-normal truncate">
              {apiOk === null
                ? 'Checking API...'
                : apiOk
                ? 'All systems operational'
                : 'API Service Offline'}
            </span>
          )}
        </div>
      </div>

      {/* SDG Badge */}
      {!collapsed && (
        <div className="px-3 pb-4">
          <div className="bg-[#0F1C2E] border border-[#1E293B] rounded-lg p-2.5 text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <span className="w-5 h-5 rounded-full bg-[#EAB308]/20 flex items-center justify-center text-[10px] font-bold text-[#EAB308]">
                7
              </span>
              <span className="w-5 h-5 rounded-full bg-[#22C55E]/20 flex items-center justify-center text-[10px] font-bold text-[#22C55E]">
                13
              </span>
            </div>
            <p className="text-[10px] text-[#64748B]">UN SDG 7 &amp; 13 Aligned</p>
          </div>
        </div>
      )}
    </aside>
  );
}

export default Sidebar;
