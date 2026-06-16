"use client";

import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { AlertBanner } from "../ui/AlertBanner";
import { useCoolShiftStore } from "../../lib/store";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [showAlert, setShowAlert] = useState(true);
  const collapsed = useCoolShiftStore((s) => s.sidebarCollapsed);

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
        {/* 1. Navigation Sidebar */}
        <Sidebar showAlert={showAlert} />

        {/* 5. Main Content Area */}
        <div 
          className="flex-1 flex flex-col min-h-screen relative transition-all duration-300"
          style={{ marginLeft: collapsed ? "80px" : "260px" }}
        >
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
