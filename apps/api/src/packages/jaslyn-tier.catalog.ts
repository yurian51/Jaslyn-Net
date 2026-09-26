export type JaslynTierCode =
  | 'SPARK'
  | 'PULSE'
  | 'FLOW'
  | 'NEXUS'
  | 'ORBIT'
  | 'APEX'
  | 'TITAN'
  | 'INFINITY';

export interface JaslynTierTemplate {
  code: JaslynTierCode;
  name: string;
  rank: number;
  tagline: string;
  price: number;
  currency: 'TZS';
  durationSeconds: number;
  dataLimitBytes: number | null;
  downloadBps: number;
  uploadBps: number;
  devicesPerCode: number;
  featureFlags: Record<string, boolean>;
  featured: boolean;
}

const DAY = 86_400;
const GB = 1_000_000_000;
const MBPS = 1_000_000;

export const JASLYN_TIER_CATALOG: readonly JaslynTierTemplate[] = [
  {
    code: 'SPARK', name: 'Jaslyn Spark', rank: 1,
    tagline: 'Simple connectivity for light users',
    price: 5_000, currency: 'TZS', durationSeconds: 7 * DAY,
    dataLimitBytes: 5 * GB, downloadBps: 5 * MBPS, uploadBps: 2 * MBPS,
    devicesPerCode: 1,
    featureFlags: { hotspot: true, captivePortal: true, vouchers: true, usageTracking: true },
    featured: false,
  },
  {
    code: 'PULSE', name: 'Jaslyn Pulse', rank: 2,
    tagline: 'Reliable everyday connectivity',
    price: 10_000, currency: 'TZS', durationSeconds: 30 * DAY,
    dataLimitBytes: 15 * GB, downloadBps: 10 * MBPS, uploadBps: 5 * MBPS,
    devicesPerCode: 2,
    featureFlags: { hotspot: true, captivePortal: true, vouchers: true, usageTracking: true, multiDevice: true },
    featured: false,
  },
  {
    code: 'FLOW', name: 'Jaslyn Flow', rank: 3,
    tagline: 'More speed for power users',
    price: 20_000, currency: 'TZS', durationSeconds: 30 * DAY,
    dataLimitBytes: 40 * GB, downloadBps: 20 * MBPS, uploadBps: 10 * MBPS,
    devicesPerCode: 3,
    featureFlags: { hotspot: true, captivePortal: true, vouchers: true, usageTracking: true, multiDevice: true, qos: true },
    featured: false,
  },
  {
    code: 'NEXUS', name: 'Jaslyn Nexus', rank: 4,
    tagline: 'Smart connectivity for growing teams',
    price: 50_000, currency: 'TZS', durationSeconds: 30 * DAY,
    dataLimitBytes: 120 * GB, downloadBps: 50 * MBPS, uploadBps: 25 * MBPS,
    devicesPerCode: 5,
    featureFlags: { hotspot: true, captivePortal: true, vouchers: true, usageTracking: true, multiDevice: true, qos: true, radius: true, analytics: true },
    featured: true,
  },
  {
    code: 'ORBIT', name: 'Jaslyn Orbit', rank: 5,
    tagline: 'Professional connectivity with operational control',
    price: 100_000, currency: 'TZS', durationSeconds: 30 * DAY,
    dataLimitBytes: 300 * GB, downloadBps: 100 * MBPS, uploadBps: 50 * MBPS,
    devicesPerCode: 10,
    featureFlags: { hotspot: true, captivePortal: true, vouchers: true, usageTracking: true, multiDevice: true, qos: true, radius: true, analytics: true, ipam: true, automation: true },
    featured: false,
  },
  {
    code: 'APEX', name: 'Jaslyn Apex', rank: 6,
    tagline: 'High-performance access for demanding deployments',
    price: 250_000, currency: 'TZS', durationSeconds: 30 * DAY,
    dataLimitBytes: 800 * GB, downloadBps: 250 * MBPS, uploadBps: 125 * MBPS,
    devicesPerCode: 20,
    featureFlags: { hotspot: true, captivePortal: true, vouchers: true, usageTracking: true, multiDevice: true, qos: true, radius: true, analytics: true, ipam: true, automation: true, loadBalancing: true, apiAccess: true },
    featured: false,
  },
  {
    code: 'TITAN', name: 'Jaslyn Titan', rank: 7,
    tagline: 'Enterprise-grade network operations',
    price: 500_000, currency: 'TZS', durationSeconds: 30 * DAY,
    dataLimitBytes: 2_000 * GB, downloadBps: 500 * MBPS, uploadBps: 250 * MBPS,
    devicesPerCode: 50,
    featureFlags: { hotspot: true, captivePortal: true, vouchers: true, usageTracking: true, multiDevice: true, qos: true, radius: true, analytics: true, ipam: true, automation: true, loadBalancing: true, apiAccess: true, multiLocation: true, audit: true, prioritySupport: true },
    featured: false,
  },
  {
    code: 'INFINITY', name: 'Jaslyn Infinity', rank: 8,
    tagline: 'Maximum capacity for advanced operators',
    price: 1_000_000, currency: 'TZS', durationSeconds: 30 * DAY,
    dataLimitBytes: null, downloadBps: 1_000 * MBPS, uploadBps: 500 * MBPS,
    devicesPerCode: 100,
    featureFlags: { hotspot: true, captivePortal: true, vouchers: true, usageTracking: true, multiDevice: true, qos: true, radius: true, analytics: true, ipam: true, automation: true, loadBalancing: true, apiAccess: true, multiLocation: true, audit: true, prioritySupport: true, unlimitedData: true, advancedNetworkControl: true },
    featured: false,
  },
];

export function getJaslynTier(code: string): JaslynTierTemplate | undefined {
  return JASLYN_TIER_CATALOG.find((tier) => tier.code === code.toUpperCase());
}
