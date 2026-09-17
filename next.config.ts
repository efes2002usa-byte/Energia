import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the documented /api/v1 contract as a stable alias while the UI uses
  // the shorter internal paths. Rewrites preserve methods, headers and bodies.
  async rewrites() {
    return [
      { source: "/api/analytics/dashboard", destination: "/api/analytics" },
      { source: "/api/analytics/hourly-reconciliation", destination: "/api/reconciliation" },
      { source: "/api/analytics/daily-trend", destination: "/api/analytics" },
      { source: "/api/analytics/by-devices", destination: "/api/analytics" },
      { source: "/api/analytics/by-categories", destination: "/api/analytics" },
      { source: "/api/analytics/by-zones", destination: "/api/analytics" },
      { source: "/api/analytics/compare-periods", destination: "/api/analytics" },
      { source: "/api/analytics/heatmap", destination: "/api/analytics" },
      { source: "/api/devices/:id/analytics", destination: "/api/dashboard" },
      { source: "/api/devices/:id/audit", destination: "/api/devices/:id" },
    ];
  },
};

export default nextConfig;
