"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function TopBar() {
  const pathname = usePathname();
  const isDashboard = pathname === "/";

  // Hide TopBar completely on the dashboard as the page header is consolidated in page.tsx
  if (isDashboard) {
    return null;
  }

  // Compute breadcrumb label dynamically
  const getBreadcrumb = () => {
    if (pathname === "/") return "Dashboard";
    if (pathname.startsWith("/import")) return "Import Data";
    if (pathname.startsWith("/scenarios/new")) return "New Scenario Profile";
    if (pathname.startsWith("/scenarios")) return "Scenario Profiles";
    if (pathname.startsWith("/optimize")) return "Cooling Solver Optimizer";
    if (pathname.startsWith("/runs") && pathname.endsWith("/compare")) return "Baseline vs Optimized Comparison";
    if (pathname.startsWith("/runs")) return "Run Execution Timeline";
    if (pathname.startsWith("/custom")) return "Custom Scenarios";
    if (pathname.startsWith("/impact")) return "SDG Affordability & Climate Impact";
    if (pathname.startsWith("/whatif")) return "What-If Simulation Sandbox";
    if (pathname.startsWith("/quicktest")) return "Quick Judge Test Pad";
    if (pathname.startsWith("/admin/checks")) return "Automated Compliance Auditing";
    if (pathname.startsWith("/pitch")) return "Project Presentation Deck";
    return "Dashboard";
  };

  return (
    <header className="sticky top-0 z-30 bg-[#0f141b]/80 backdrop-blur-md border-b border-[#1E293B] w-full">
      {/* Breadcrumb Bar */}
      <div className="px-6 py-3 flex items-center justify-between w-full">
        {/* Left Side: Page Title or Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-[#94A3B8]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#0EA5E9]" />
          <span>{getBreadcrumb()}</span>
        </div>
      </div>
    </header>
  );
}
