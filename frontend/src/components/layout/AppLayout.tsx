"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { AlertBanner } from "../ui/AlertBanner";
import { useCoolShiftStore } from "../../lib/store";
import { Menu } from "lucide-react";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [showAlert, setShowAlert] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const collapsed = useCoolShiftStore((s) => s.sidebarCollapsed);

  useEffect(() => {
    // Register Service Worker for PWA
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").then(
        (reg) => console.log("Service Worker registered successfully with scope:", reg.scope),
        (err) => console.error("Service Worker registration failed:", err)
      );
    }

    // Responsive screen check
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="flex flex-col min-h-screen">
      {/* 3. Top Alert Banner */}
      {showAlert && (
        <AlertBanner onClose={() => setShowAlert(false)} />
      )}

      {/* Main Layout Container */}
      <div 
        className="flex flex-1 relative transition-all duration-300"
        style={{
          paddingTop: showAlert ? "48px" : "0px",
        }}
      >
        {/* Backdrop for mobile sidebar */}
        {isMobile && mobileSidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/60 z-30 transition-opacity duration-300"
            onClick={() => setMobileSidebarOpen(false)}
          />
        )}

        {/* 1. Navigation Sidebar */}
        <Sidebar 
          showAlert={showAlert} 
          mobileOpen={mobileSidebarOpen}
          onClose={() => setMobileSidebarOpen(false)}
        />

        {/* 5. Main Content Area */}
        <div 
          className="flex-1 flex flex-col min-h-screen relative transition-all duration-300"
          style={{ marginLeft: isMobile ? "0px" : (collapsed ? "80px" : "260px") }}
        >
          {/* Mobile top bar */}
          {isMobile && (
            <div className="sticky top-0 z-20 bg-[#0A1628]/95 backdrop-blur-md border-b border-[#1E293B] px-4 py-3 flex items-center justify-between">
              <button
                onClick={() => setMobileSidebarOpen(true)}
                className="text-[#94A3B8] hover:text-white p-1"
                aria-label="Open menu"
              >
                <Menu size={24} />
              </button>
              <span className="text-white font-bold text-sm">CoolShift</span>
              <div className="w-8" />
            </div>
          )}

          {/* Top header bar */}
          <TopBar />

          {/* Main Content Body */}
          <main className="flex-1 p-6 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
