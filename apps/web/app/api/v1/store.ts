// In-memory data store for Jaslyn Net core operations platform

export type RouterRecord = {
  id: string;
  name: string;
  vendor: string;
  model: string;
  ipAddress: string;
  macAddress: string;
  status: 'ONLINE' | 'DEGRADED' | 'OFFLINE';
  activeUsers: number;
  lastSeenAt: string;
  managementProtocol: string;
  managementEnabled: boolean;
  managementCredentialsConfigured: boolean;
  apiEnabled: boolean;
  apiEndpoint: string;
  capabilities: { capabilities: string[] };
};

export type PackageRecord = {
  id: string;
  name: string;
  price: number;
  currency: string;
  durationSeconds: number;
  dataLimitBytes: number | null;
  downloadBps: number | null;
  uploadBps: number | null;
  devicesPerCode: number;
  showOnPortal: boolean;
  isFreeTrial: boolean;
  freeTrialFrequency: string;
  tierCode: string;
  tierRank: number;
  tagline: string;
  isFeatured?: boolean;
  isActive: boolean;
};

export type VoucherRecord = {
  id: string;
  code: string;
  packageId: string;
  packageName: string;
  status: 'UNUSED' | 'USED' | 'EXPIRED';
  expiresAt: string;
  usedAt?: string | null;
  deviceLimit: number;
  batchId?: string;
  printSize?: string;
  printStyle?: string;
};

export type CustomerRecord = {
  id: string;
  fullName: string;
  username: string;
  email: string;
  phone: string;
  isActive: boolean;
  createdAt: string;
};

export type SessionRecord = {
  id: string;
  customerId: string;
  customerName: string;
  routerId: string;
  routerName: string;
  username: string;
  ipAddress: string;
  macAddress: string;
  startedAt: string;
  bytesIn: number;
  bytesOut: number;
  status: 'ACTIVE' | 'STALE' | 'ENDED';
};

export type SaleRecord = {
  orderId: string;
  customerId: string;
  phone: string;
  paymentReference: string;
  packageName: string;
  startsAt: string;
  endsAt: string;
  amount: number;
  currency: string;
};

export type AccessBindingRecord = {
  id: string;
  customerId: string;
  customerName: string;
  username: string;
  accessType: 'HOTSPOT' | 'RADIUS' | 'PPPOE' | 'STATIC';
  state: 'ACTIVE' | 'SUSPENDED';
  expiresAt: string | null;
};

export type IncidentRecord = {
  id: string;
  title: string;
  severity: 'CRITICAL' | 'MAJOR' | 'MINOR';
  status: 'INVESTIGATING' | 'IDENTIFIED' | 'MONITORING' | 'RESOLVED';
  impact: string;
  createdAt: string;
  updatedAt: string;
};

export type PortalSettings = {
  enabled: boolean;
  title: string;
  welcomeMessage: string;
  termsText: string;
  supportPhone: string;
  supportEmail: string;
  updatedAt: string;
};

class Store {
  portalSettings: PortalSettings = {
    enabled: true,
    title: 'Jaslyn Net High-Speed Wi-Fi',
    welcomeMessage: 'Karibu Jaslyn Net Wi-Fi. Chagua kifurushi chako uanze kutumia intaneti kwa kasi ya juu sasa hivi.',
    termsText: 'Kwa kuunganisha mtandao huu, unakubali sheria za matumizi sahihi na kulinda faragha ya watumiaji wengine.',
    supportPhone: '+255 744 123 456',
    supportEmail: 'support@jaslyn.net',
    updatedAt: new Date().toISOString(),
  };

  routers: RouterRecord[] = [
    {
      id: 'rtr-01',
      name: 'MikroTik CCR2004 - Core NOC',
      vendor: 'MikroTik',
      model: 'CCR2004-1G-12S+2XS',
      ipAddress: '10.10.0.1',
      macAddress: '48:8F:5A:11:22:33',
      status: 'ONLINE',
      activeUsers: 142,
      lastSeenAt: new Date().toISOString(),
      managementProtocol: 'MIKROTIK_REST',
      managementEnabled: true,
      managementCredentialsConfigured: true,
      apiEnabled: true,
      apiEndpoint: 'https://10.10.0.1:443/rest',
      capabilities: { capabilities: ['HOTSPOT', 'PPPOE', 'QUEUE_TREE', 'FIREWALL', 'BGP'] },
    },
    {
      id: 'rtr-02',
      name: 'MikroTik RB4011 - Sinza Hotspot Tower',
      vendor: 'MikroTik',
      model: 'RB4011iGS+5HacQ2HnD',
      ipAddress: '10.20.1.1',
      macAddress: 'DC:2C:6E:44:55:66',
      status: 'ONLINE',
      activeUsers: 86,
      lastSeenAt: new Date().toISOString(),
      managementProtocol: 'MIKROTIK_REST',
      managementEnabled: true,
      managementCredentialsConfigured: true,
      apiEnabled: true,
      apiEndpoint: 'https://10.20.1.1:443/rest',
      capabilities: { capabilities: ['HOTSPOT', 'DHCP_SNOOPING', 'WIRELESS'] },
    },
    {
      id: 'rtr-03',
      name: 'Ruijie Reyee RG-EG310 - Mbezi Hub',
      vendor: 'Ruijie',
      model: 'RG-EG310GH-P-E',
      ipAddress: '10.30.0.1',
      macAddress: '70:A7:41:77:88:99',
      status: 'ONLINE',
      activeUsers: 54,
      lastSeenAt: new Date().toISOString(),
      managementProtocol: 'RUIJIE_REYEE_CLOUD_API',
      managementEnabled: true,
      managementCredentialsConfigured: true,
      apiEnabled: true,
      apiEndpoint: 'https://cloud-as.ruijienetworks.com',
      capabilities: { capabilities: ['HOTSPOT', 'MULTI_WAN', 'FLOW_CONTROL'] },
    },
    {
      id: 'rtr-04',
      name: 'Cambium cnPilot e500 - Posta Public WiFi',
      vendor: 'Cambium',
      model: 'cnPilot e500 Outdoor AP',
      ipAddress: '10.40.0.1',
      macAddress: '00:04:56:AA:BB:CC',
      status: 'ONLINE',
      activeUsers: 39,
      lastSeenAt: new Date().toISOString(),
      managementProtocol: 'CAMBIUM_CNMAESTRO',
      managementEnabled: true,
      managementCredentialsConfigured: true,
      apiEnabled: true,
      apiEndpoint: 'https://cloud.cambiumnetworks.com',
      capabilities: { capabilities: ['HOTSPOT', 'GUEST_PORTAL', 'CLIENT_ISOLATION'] },
    },
  ];

  packages: PackageRecord[] = [
    {
      id: 'pkg-01',
      name: '1 Hour Fast WiFi',
      price: 1500,
      currency: 'TZS',
      durationSeconds: 3600,
      dataLimitBytes: 2000000000,
      downloadBps: 10000000,
      uploadBps: 5000000,
      devicesPerCode: 1,
      showOnPortal: true,
      isFreeTrial: false,
      freeTrialFrequency: 'NONE',
      tierCode: '1H',
      tierRank: 1,
      tagline: 'Kasi ya 10 Mbps kwa saa moja · Data 2GB',
      isFeatured: false,
      isActive: true,
    },
    {
      id: 'pkg-02',
      name: '24 Hours Unlimited Daily',
      price: 3500,
      currency: 'TZS',
      durationSeconds: 86400,
      dataLimitBytes: null,
      downloadBps: 15000000,
      uploadBps: 8000000,
      devicesPerCode: 2,
      showOnPortal: true,
      isFreeTrial: false,
      freeTrialFrequency: 'NONE',
      tierCode: '24H',
      tierRank: 2,
      tagline: 'Bila kikomo cha data kwa siku nzima · Vifaa 2',
      isFeatured: true,
      isActive: true,
    },
    {
      id: 'pkg-03',
      name: '7 Days Mega Bundle',
      price: 18000,
      currency: 'TZS',
      durationSeconds: 604800,
      dataLimitBytes: 50000000000,
      downloadBps: 25000000,
      uploadBps: 12000000,
      devicesPerCode: 3,
      showOnPortal: true,
      isFreeTrial: false,
      freeTrialFrequency: 'NONE',
      tierCode: '7D',
      tierRank: 3,
      tagline: 'Wiki nzima ya intaneti yenye nguvu · Data 50GB',
      isFeatured: false,
      isActive: true,
    },
    {
      id: 'pkg-04',
      name: '30 Days Home Fiber 30M',
      price: 65000,
      currency: 'TZS',
      durationSeconds: 2592000,
      dataLimitBytes: null,
      downloadBps: 30000000,
      uploadBps: 30000000,
      devicesPerCode: 6,
      showOnPortal: true,
      isFreeTrial: false,
      freeTrialFrequency: 'NONE',
      tierCode: '30D-HOME',
      tierRank: 4,
      tagline: 'Fiber ya nyumbani 30 Mbps bila kikomo · Mwezi mzima',
      isFeatured: false,
      isActive: true,
    },
    {
      id: 'pkg-05',
      name: '30 Days Business Fiber 50M',
      price: 120000,
      currency: 'TZS',
      durationSeconds: 2592000,
      dataLimitBytes: null,
      downloadBps: 50000000,
      uploadBps: 50000000,
      devicesPerCode: 12,
      showOnPortal: true,
      isFreeTrial: false,
      freeTrialFrequency: 'NONE',
      tierCode: '30D-BIZ',
      tierRank: 5,
      tagline: 'Kasi ya ofisi 50 Mbps na Dedicated Bandwidth',
      isFeatured: false,
      isActive: true,
    },
    {
      id: 'pkg-trial',
      name: '15 Minutes Free Trial',
      price: 0,
      currency: 'TZS',
      durationSeconds: 900,
      dataLimitBytes: 500000000,
      downloadBps: 5000000,
      uploadBps: 2000000,
      devicesPerCode: 1,
      showOnPortal: true,
      isFreeTrial: true,
      freeTrialFrequency: 'ONCE_PER_DAY',
      tierCode: 'TRIAL',
      tierRank: 0,
      tagline: 'Jaribu mtandao bure kwa dakika 15',
      isFeatured: false,
      isActive: true,
    },
  ];

  vouchers: VoucherRecord[] = [
    {
      id: 'vch-01',
      code: 'JAS-8812',
      packageId: 'pkg-02',
      packageName: '24 Hours Unlimited Daily',
      status: 'UNUSED',
      expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
      deviceLimit: 2,
      printStyle: 'CLASSIC',
    },
    {
      id: 'vch-02',
      code: 'JAS-9421',
      packageId: 'pkg-02',
      packageName: '24 Hours Unlimited Daily',
      status: 'UNUSED',
      expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
      deviceLimit: 2,
      printStyle: 'CLASSIC',
    },
    {
      id: 'vch-03',
      code: 'JAS-1149',
      packageId: 'pkg-01',
      packageName: '1 Hour Fast WiFi',
      status: 'UNUSED',
      expiresAt: new Date(Date.now() + 14 * 86400000).toISOString(),
      deviceLimit: 1,
      printStyle: 'MINI',
    },
    {
      id: 'vch-04',
      code: 'JAS-3320',
      packageId: 'pkg-03',
      packageName: '7 Days Mega Bundle',
      status: 'USED',
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      usedAt: new Date(Date.now() - 3600000).toISOString(),
      deviceLimit: 3,
      printStyle: 'BRANDED',
    },
    {
      id: 'vch-05',
      code: 'WIFI-5512',
      packageId: 'pkg-01',
      packageName: '1 Hour Fast WiFi',
      status: 'UNUSED',
      expiresAt: new Date(Date.now() + 14 * 86400000).toISOString(),
      deviceLimit: 1,
      printStyle: 'CLASSIC',
    },
  ];

  customers: CustomerRecord[] = [
    {
      id: 'cust-01',
      fullName: 'Amina Juma',
      username: 'amina.juma',
      email: 'amina.juma@gmail.com',
      phone: '+255744111222',
      isActive: true,
      createdAt: new Date(Date.now() - 90 * 86400000).toISOString(),
    },
    {
      id: 'cust-02',
      fullName: 'Rashid Bakari',
      username: 'rashid.bakari',
      email: 'rashid.b@yahoo.com',
      phone: '+255755222333',
      isActive: true,
      createdAt: new Date(Date.now() - 60 * 86400000).toISOString(),
    },
    {
      id: 'cust-03',
      fullName: 'Fatma Hassan',
      username: 'fatma.hassan',
      email: 'fatma.h@hotmail.com',
      phone: '+255766333444',
      isActive: true,
      createdAt: new Date(Date.now() - 45 * 86400000).toISOString(),
    },
    {
      id: 'cust-04',
      fullName: 'John Mwangi',
      username: 'j.mwangi',
      email: 'john.mwangi@tech.co.tz',
      phone: '+255777444555',
      isActive: true,
      createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
    },
    {
      id: 'cust-05',
      fullName: 'Baraka Eliud',
      username: 'baraka.eliud',
      email: 'baraka@consult.tz',
      phone: '+255788555666',
      isActive: true,
      createdAt: new Date(Date.now() - 15 * 86400000).toISOString(),
    },
  ];

  sessions: SessionRecord[] = [
    {
      id: 'sess-01',
      customerId: 'cust-01',
      customerName: 'Amina Juma',
      routerId: 'rtr-02',
      routerName: 'MikroTik RB4011 - Sinza Hotspot',
      username: 'amina.juma',
      ipAddress: '10.20.1.45',
      macAddress: 'B4:2E:99:A1:C2:E4',
      startedAt: new Date(Date.now() - 2 * 3600000).toISOString(),
      bytesIn: 1850000000,
      bytesOut: 420000000,
      status: 'ACTIVE',
    },
    {
      id: 'sess-02',
      customerId: 'cust-02',
      customerName: 'Rashid Bakari',
      routerId: 'rtr-04',
      routerName: 'Cambium cnPilot e500 - Posta',
      username: 'rashid.bakari',
      ipAddress: '10.40.0.12',
      macAddress: '3C:06:30:4E:91:2A',
      startedAt: new Date(Date.now() - 45 * 60000).toISOString(),
      bytesIn: 3450000000,
      bytesOut: 980000000,
      status: 'ACTIVE',
    },
    {
      id: 'sess-03',
      customerId: 'cust-03',
      customerName: 'Fatma Hassan',
      routerId: 'rtr-03',
      routerName: 'Ruijie Reyee RG-EG310 - Mbezi',
      username: 'fatma.hassan',
      ipAddress: '10.30.0.78',
      macAddress: 'F8:FF:C2:5D:8A:1E',
      startedAt: new Date(Date.now() - 75 * 60000).toISOString(),
      bytesIn: 920000000,
      bytesOut: 240000000,
      status: 'ACTIVE',
    },
    {
      id: 'sess-04',
      customerId: 'cust-04',
      customerName: 'John Mwangi',
      routerId: 'rtr-01',
      routerName: 'MikroTik CCR2004 - Core NOC',
      username: 'j.mwangi',
      ipAddress: '10.10.0.99',
      macAddress: '00:E0:4C:68:01:FE',
      startedAt: new Date(Date.now() - 25 * 60000).toISOString(),
      bytesIn: 610000000,
      bytesOut: 140000000,
      status: 'ACTIVE',
    },
  ];

  sales: SaleRecord[] = [
    {
      orderId: 'ord-88192',
      customerId: 'cust-01',
      phone: '+255744111222',
      paymentReference: 'MPESA-Q781992',
      packageName: '24 Hours Unlimited Daily',
      startsAt: new Date(Date.now() - 2 * 3600000).toISOString(),
      endsAt: new Date(Date.now() + 22 * 3600000).toISOString(),
      amount: 3500,
      currency: 'TZS',
    },
    {
      orderId: 'ord-88193',
      customerId: 'cust-02',
      phone: '+255755222333',
      paymentReference: 'AIRTEL-B441209',
      packageName: '7 Days Mega Bundle',
      startsAt: new Date(Date.now() - 86400000).toISOString(),
      endsAt: new Date(Date.now() + 6 * 86400000).toISOString(),
      amount: 18000,
      currency: 'TZS',
    },
    {
      orderId: 'ord-88194',
      customerId: 'cust-03',
      phone: '+255766333444',
      paymentReference: 'TIGO-M993012',
      packageName: '1 Hour Fast WiFi',
      startsAt: new Date(Date.now() - 3600000).toISOString(),
      endsAt: new Date().toISOString(),
      amount: 1500,
      currency: 'TZS',
    },
    {
      orderId: 'ord-88195',
      customerId: 'cust-04',
      phone: '+255777444555',
      paymentReference: 'CRDB-TX-00912',
      packageName: '30 Days Home Fiber 30M',
      startsAt: new Date(Date.now() - 5 * 86400000).toISOString(),
      endsAt: new Date(Date.now() + 25 * 86400000).toISOString(),
      amount: 65000,
      currency: 'TZS',
    },
  ];

  accessBindings: AccessBindingRecord[] = [
    {
      id: 'bind-01',
      customerId: 'cust-01',
      customerName: 'Amina Juma',
      username: 'amina.juma',
      accessType: 'HOTSPOT',
      state: 'ACTIVE',
      expiresAt: new Date(Date.now() + 22 * 3600000).toISOString(),
    },
    {
      id: 'bind-02',
      customerId: 'cust-02',
      customerName: 'Rashid Bakari',
      username: 'rashid.bakari',
      accessType: 'RADIUS',
      state: 'ACTIVE',
      expiresAt: new Date(Date.now() + 6 * 86400000).toISOString(),
    },
    {
      id: 'bind-03',
      customerId: 'cust-03',
      customerName: 'Fatma Hassan',
      username: 'fatma.hassan',
      accessType: 'HOTSPOT',
      state: 'ACTIVE',
      expiresAt: new Date(Date.now() + 30 * 60000).toISOString(),
    },
    {
      id: 'bind-04',
      customerId: 'cust-04',
      customerName: 'John Mwangi',
      username: 'j.mwangi',
      accessType: 'PPPOE',
      state: 'ACTIVE',
      expiresAt: new Date(Date.now() + 25 * 86400000).toISOString(),
    },
    {
      id: 'bind-05',
      customerId: 'cust-05',
      customerName: 'Baraka Eliud',
      username: 'baraka.eliud',
      accessType: 'STATIC',
      state: 'SUSPENDED',
      expiresAt: null,
    },
  ];

  auditLogs = [
    {
      id: 'aud-01',
      action: 'TENANT_INITIALIZED',
      entityType: 'tenant',
      entityId: 'tenant-jaslyn-01',
      metadata: { region: 'TZ', currency: 'TZS', platform: 'JASLYN NET' },
      createdAt: new Date(Date.now() - 86400000 * 7).toISOString(),
    },
    {
      id: 'aud-02',
      action: 'ROUTER_REGISTERED',
      entityType: 'router',
      entityId: 'rtr-01',
      metadata: { model: 'CCR2004', ip: '10.10.0.1' },
      createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    },
    {
      id: 'aud-03',
      action: 'PACKAGE_PUBLISHED',
      entityType: 'package',
      entityId: 'pkg-02',
      metadata: { name: '24 Hours Unlimited Daily', price: 3500 },
      createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    },
    {
      id: 'aud-04',
      action: 'PAYMENT_VERIFIED',
      entityType: 'payment',
      entityId: 'pay-01',
      metadata: { provider: 'MPESA', amount: 3500, customer: 'Amina Juma' },
      createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    },
    {
      id: 'aud-05',
      action: 'SESSION_AUTHORIZED',
      entityType: 'session',
      entityId: 'sess-01',
      metadata: { ip: '10.20.1.45', mac: 'B4:2E:99:A1:C2:E4' },
      createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    },
  ];

  incidents: IncidentRecord[] = [
    {
      id: 'inc-01',
      title: 'Scheduled Core Fibre Maintenance - Dar es Salaam Loop',
      severity: 'MINOR',
      status: 'RESOLVED',
      impact: 'Redundant ring activated. Zero subscriber downtime.',
      createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      updatedAt: new Date(Date.now() - 86400000).toISOString(),
    },
  ];
}

export const db = new Store();

export function makeToken(email = 'admin@jaslyn.net', role = 'OWNER', sub = 'usr-admin-01') {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub,
      email,
      role,
      tenantId: 'tenant-jaslyn-01',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 86400 * 7,
    })
  ).toString('base64url');
  const signature = 'sig_jaslyn_verified';
  return `${header}.${payload}.${signature}`;
}
