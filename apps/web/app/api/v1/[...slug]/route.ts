import { NextRequest, NextResponse } from 'next/server';

// In-memory operational store to provide complete, realistic interactivity
// across all Jaslyn Net surfaces (Hotspot, RADIUS, NOC, Captive Portal, Billing, ISP).

type Store = {
  tenant: {
    id: string;
    name: string;
    slug: string;
    status: string;
    currency: string;
    timezone: string;
  };
  profile: {
    businessName: string;
    contactName: string;
    phone: string;
    email: string;
    address: string;
    brandColor: string;
    logoUrl: string;
    supportPhone: string;
    supportWhatsapp: string;
    supportEmail: string;
    portalHeadline: string;
    portalSubtitle: string;
  };
  captiveSettings: {
    enabled: boolean;
    title: string;
    welcomeMessage: string;
    termsText: string;
    supportPhone: string;
    supportEmail: string;
    updatedAt: string;
  };
  packages: Array<{
    id: string;
    name: string;
    tagline: string;
    price: number;
    currency: string;
    durationSeconds: number;
    dataLimitBytes: number | null;
    downloadBps: number;
    uploadBps: number;
    isFeatured: boolean;
    showOnPortal: boolean;
    status: string;
    activeSubscribers?: number;
  }>;
  vouchers: Array<{
    id: string;
    code: string;
    packageId: string;
    packageName: string;
    price: number;
    currency: string;
    status: 'ACTIVE' | 'USED' | 'EXPIRED';
    expiresAt: string;
    usedAt: string | null;
    usedByPhone: string | null;
    batchNumber: string;
  }>;
  routers: Array<{
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
    apiEndpoint?: string;
    capabilities: { capabilities: string[] };
    syncError: string | null;
  }>;
  customers: Array<{
    id: string;
    fullName: string;
    username: string;
    phone: string;
    email: string;
    status: 'ACTIVE' | 'SUSPENDED';
    balance: number;
    currency: string;
    macAddress: string;
    ipAddress: string;
    currentPackage: string;
    createdAt: string;
  }>;
  sessions: Array<{
    id: string;
    customerId: string;
    customerName: string;
    username: string;
    routerId: string;
    routerName: string;
    ipAddress: string;
    macAddress: string;
    startedAt: string;
    bytesIn: number;
    bytesOut: number;
    status: 'ACTIVE' | 'STALE' | 'CLOSED';
    authMethod: string;
  }>;
  incidents: Array<{
    id: string;
    tenantId: string;
    tenantName: string;
    category: string;
    severity: 'INFO' | 'WARNING' | 'CRITICAL';
    status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
    title: string;
    summary: string;
    rootResourceType: string;
    rootResourceId: string;
    startedAt: string;
    lastSeenAt: string;
    affectedResources: number;
    affectedDevices: number;
    affectedCustomers: number;
    affectedSessions: number;
    estimatedRevenue: number;
    ownerName: string | null;
    ownerUserId: string | null;
    slaTargetMinutes: number;
    slaBreached: boolean;
  }>;
  accessBindings: Array<{
    id: string;
    customerName: string;
    username: string;
    accessType: 'HOTSPOT' | 'RADIUS' | 'PPPOE' | 'STATIC';
    state: 'ACTIVE' | 'SUSPENDED';
    expiresAt: string | null;
  }>;
  auditLogs: Array<{
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    metadata: Record<string, unknown>;
    createdAt: string;
  }>;
};

const store: Store = {
  tenant: {
    id: 'tenant-jaslyn-01',
    name: 'Jaslyn Net Telecommunications',
    slug: 'jaslyn-net',
    status: 'ACTIVE',
    currency: 'TZS',
    timezone: 'Africa/Dar_es_Salaam',
  },
  profile: {
    businessName: 'Jaslyn Net High-Speed Broadband',
    contactName: 'NOC Lead Operator',
    phone: '+255 754 889 900',
    email: 'operations@jaslyn.net',
    address: 'Posta Mpya, Samora Avenue, Dar es Salaam',
    brandColor: '#175cd3',
    logoUrl: '/ram-logo-scalable.svg',
    supportPhone: '+255 754 889 900',
    supportWhatsapp: '+255 754 889 900',
    supportEmail: 'support@jaslyn.net',
    portalHeadline: 'Karibu Jaslyn Net Wi-Fi',
    portalSubtitle: 'Chagua kifurushi chako upate intaneti ya kasi zaidi na uhakika bila kikomo.',
  },
  captiveSettings: {
    enabled: true,
    title: 'Jaslyn Net High-Speed Wi-Fi',
    welcomeMessage: 'Unganisha vifaa vyako na mtandao bora zaidi wa Wi-Fi. Chagua kifurushi au tumia voucher yako kuunganisha sasa.',
    termsText: '1. Mtandao huu unadhibitiwa na sheria za TCRA.\n2. Kasi na kiwango cha data vinategemea kifurushi ulichonunua.\n3. Hairuhusiwi kufanya vitendo haramu au mashambulizi ya mtandao.',
    supportPhone: '+255 754 889 900',
    supportEmail: 'support@jaslyn.net',
    updatedAt: new Date().toISOString(),
  },
  packages: [
    {
      id: 'pkg-1hr',
      name: '1 Hour Turbo',
      tagline: 'Kasi ya juu kwa matumizi ya haraka',
      price: 1000,
      currency: 'TZS',
      durationSeconds: 3600,
      dataLimitBytes: null,
      downloadBps: 20000000,
      uploadBps: 10000000,
      isFeatured: false,
      showOnPortal: true,
      status: 'ACTIVE',
      activeSubscribers: 142,
    },
    {
      id: 'pkg-3hr',
      name: '3 Hours Standard',
      tagline: 'Nzuri kwa mitandao ya kijamii na video',
      price: 2500,
      currency: 'TZS',
      durationSeconds: 10800,
      dataLimitBytes: 3000000000,
      downloadBps: 30000000,
      uploadBps: 15000000,
      isFeatured: false,
      showOnPortal: true,
      status: 'ACTIVE',
      activeSubscribers: 284,
    },
    {
      id: 'pkg-24hr',
      name: '24 Hours Unlimited',
      tagline: 'Siku nzima bila wasiwasi wa data kuisha',
      price: 5000,
      currency: 'TZS',
      durationSeconds: 86400,
      dataLimitBytes: null,
      downloadBps: 50000000,
      uploadBps: 25000000,
      isFeatured: true,
      showOnPortal: true,
      status: 'ACTIVE',
      activeSubscribers: 619,
    },
    {
      id: 'pkg-7d',
      name: '7 Days Executive',
      tagline: 'Wiki nzima kwa kazi na burudani',
      price: 20000,
      currency: 'TZS',
      durationSeconds: 604800,
      dataLimitBytes: null,
      downloadBps: 60000000,
      uploadBps: 30000000,
      isFeatured: false,
      showOnPortal: true,
      status: 'ACTIVE',
      activeSubscribers: 198,
    },
    {
      id: 'pkg-30d',
      name: '30 Days Fiber Premium',
      tagline: 'Mwezi mzima kwa nyumba au ofisi',
      price: 65000,
      currency: 'TZS',
      durationSeconds: 2592000,
      dataLimitBytes: null,
      downloadBps: 100000000,
      uploadBps: 50000000,
      isFeatured: false,
      showOnPortal: true,
      status: 'ACTIVE',
      activeSubscribers: 87,
    },
  ],
  vouchers: [
    {
      id: 'vch-101',
      code: 'JN-FAST-8812',
      packageId: 'pkg-24hr',
      packageName: '24 Hours Unlimited',
      price: 5000,
      currency: 'TZS',
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 86400000 * 14).toISOString(),
      usedAt: null,
      usedByPhone: null,
      batchNumber: 'BATCH-2026-A',
    },
    {
      id: 'vch-102',
      code: 'JN-WIFI-4421',
      packageId: 'pkg-1hr',
      packageName: '1 Hour Turbo',
      price: 1000,
      currency: 'TZS',
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 86400000 * 14).toISOString(),
      usedAt: null,
      usedByPhone: null,
      batchNumber: 'BATCH-2026-A',
    },
    {
      id: 'vch-103',
      code: 'JN-PRO-9930',
      packageId: 'pkg-7d',
      packageName: '7 Days Executive',
      price: 20000,
      currency: 'TZS',
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 86400000 * 30).toISOString(),
      usedAt: null,
      usedByPhone: null,
      batchNumber: 'BATCH-2026-B',
    },
  ],
  routers: [
    {
      id: 'rt-mikrotik-ccr2004',
      name: 'Kariakoo Core CCR2004',
      vendor: 'MikroTik',
      model: 'CCR2004-16G-2S+',
      ipAddress: '192.168.88.1',
      macAddress: 'CC:2D:E0:4F:92:01',
      status: 'ONLINE',
      activeUsers: 342,
      lastSeenAt: new Date().toISOString(),
      managementProtocol: 'MIKROTIK_REST',
      managementEnabled: true,
      managementCredentialsConfigured: true,
      apiEndpoint: 'https://192.168.88.1:443/rest',
      capabilities: { capabilities: ['DHCP', 'HOTSPOT', 'FIREWALL', 'QUEUES', 'ROUTING'] },
      syncError: null,
    },
    {
      id: 'rt-unifi-gateway-pro',
      name: 'Posta Station Gateway Pro',
      vendor: 'Ubiquiti UniFi',
      model: 'UniFi Gateway Pro UXG-Pro',
      ipAddress: '192.168.1.1',
      macAddress: '74:83:C2:10:9B:A3',
      status: 'ONLINE',
      activeUsers: 289,
      lastSeenAt: new Date().toISOString(),
      managementProtocol: 'UNIFI_NETWORK_API',
      managementEnabled: true,
      managementCredentialsConfigured: true,
      apiEndpoint: 'https://unifi.jaslyn.net:8443',
      capabilities: { capabilities: ['HOTSPOT', 'VLAN', 'DPI', 'TRAFFIC_SHAPING'] },
      syncError: null,
    },
    {
      id: 'rt-cambium-epmp3000',
      name: 'Mwenge Tower PtMP AP',
      vendor: 'Cambium Networks',
      model: 'ePMP 3000 4x4 MU-MIMO',
      ipAddress: '10.50.2.1',
      macAddress: '00:04:56:FE:19:D4',
      status: 'ONLINE',
      activeUsers: 178,
      lastSeenAt: new Date().toISOString(),
      managementProtocol: 'CAMBIUM_CNMAESTRO',
      managementEnabled: true,
      managementCredentialsConfigured: true,
      capabilities: { capabilities: ['QOS', 'WIRELESS_POLLING', 'GPS_SYNC'] },
      syncError: null,
    },
    {
      id: 'rt-tplink-omada-er7206',
      name: 'Sinza Hub Gateway ER7206',
      vendor: 'TP-Link Omada',
      model: 'ER7206 Multi-WAN',
      ipAddress: '192.168.0.1',
      macAddress: '98:48:27:01:BC:E5',
      status: 'DEGRADED',
      activeUsers: 94,
      lastSeenAt: new Date(Date.now() - 180000).toISOString(),
      managementProtocol: 'OMADA_CONTROLLER_API',
      managementEnabled: true,
      managementCredentialsConfigured: true,
      capabilities: { capabilities: ['MULTI_WAN', 'CAPTIVE_PORTAL', 'IPSEC'] },
      syncError: 'WAN 2 latency elevated (124ms)',
    },
  ],
  customers: [
    {
      id: 'cust-1',
      fullName: 'Amina Selemani',
      username: 'amina.selemani',
      phone: '+255 712 345 678',
      email: 'amina@gmail.com',
      status: 'ACTIVE',
      balance: 15000,
      currency: 'TZS',
      macAddress: '3C:22:FB:44:81:AA',
      ipAddress: '192.168.88.42',
      currentPackage: '24 Hours Unlimited',
      createdAt: new Date(Date.now() - 86400000 * 30).toISOString(),
    },
    {
      id: 'cust-2',
      fullName: 'Baraka Mgendi',
      username: 'baraka.m',
      phone: '+255 754 998 877',
      email: 'baraka@yahoo.com',
      status: 'ACTIVE',
      balance: 4000,
      currency: 'TZS',
      macAddress: '88:66:5A:21:BC:09',
      ipAddress: '192.168.88.43',
      currentPackage: '3 Hours Standard',
      createdAt: new Date(Date.now() - 86400000 * 18).toISOString(),
    },
    {
      id: 'cust-3',
      fullName: 'Devota Kilima',
      username: 'devota.k',
      phone: '+255 768 223 344',
      email: 'devota@outlook.com',
      status: 'ACTIVE',
      balance: 20000,
      currency: 'TZS',
      macAddress: 'E4:5F:01:99:A2:33',
      ipAddress: '192.168.1.55',
      currentPackage: '7 Days Executive',
      createdAt: new Date(Date.now() - 86400000 * 60).toISOString(),
    },
    {
      id: 'cust-4',
      fullName: 'Rashid Bakari',
      username: 'rashid.bakari',
      phone: '+255 689 445 566',
      email: 'rashid@company.co.tz',
      status: 'SUSPENDED',
      balance: 0,
      currency: 'TZS',
      macAddress: 'DC:A6:32:11:04:88',
      ipAddress: '192.168.0.89',
      currentPackage: '1 Hour Turbo',
      createdAt: new Date(Date.now() - 86400000 * 4).toISOString(),
    },
  ],
  sessions: [
    {
      id: 'sess-001',
      customerId: 'cust-1',
      customerName: 'Amina Selemani',
      username: 'amina.selemani',
      routerId: 'rt-mikrotik-ccr2004',
      routerName: 'Kariakoo Core CCR2004',
      ipAddress: '192.168.88.42',
      macAddress: '3C:22:FB:44:81:AA',
      startedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
      bytesIn: 1845000000,
      bytesOut: 420000000,
      status: 'ACTIVE',
      authMethod: 'HOTSPOT_VOUCHER',
    },
    {
      id: 'sess-002',
      customerId: 'cust-2',
      customerName: 'Baraka Mgendi',
      username: 'baraka.m',
      routerId: 'rt-mikrotik-ccr2004',
      routerName: 'Kariakoo Core CCR2004',
      ipAddress: '192.168.88.43',
      macAddress: '88:66:5A:21:BC:09',
      startedAt: new Date(Date.now() - 1800000).toISOString(),
      bytesIn: 840000000,
      bytesOut: 190000000,
      status: 'ACTIVE',
      authMethod: 'HOTSPOT_PORTAL',
    },
    {
      id: 'sess-003',
      customerId: 'cust-3',
      customerName: 'Devota Kilima',
      username: 'devota.k',
      routerId: 'rt-unifi-gateway-pro',
      routerName: 'Posta Station Gateway Pro',
      ipAddress: '192.168.1.55',
      macAddress: 'E4:5F:01:99:A2:33',
      startedAt: new Date(Date.now() - 3600000 * 5).toISOString(),
      bytesIn: 4500000000,
      bytesOut: 1100000000,
      status: 'ACTIVE',
      authMethod: 'RADIUS_AAA',
    },
  ],
  incidents: [
    {
      id: 'inc-2026-001',
      tenantId: 'tenant-jaslyn-01',
      tenantName: 'Jaslyn Net Telecommunications',
      category: 'WAN_LATENCY',
      severity: 'WARNING',
      status: 'ACKNOWLEDGED',
      title: 'Elevated latency on Sinza Gateway WAN 2',
      summary: 'Upstream backup fiber link reporting 124ms round trip time. Primary link healthy.',
      rootResourceType: 'ROUTER',
      rootResourceId: 'rt-tplink-omada-er7206',
      startedAt: new Date(Date.now() - 3600000 * 3).toISOString(),
      lastSeenAt: new Date().toISOString(),
      affectedResources: 1,
      affectedDevices: 1,
      affectedCustomers: 94,
      affectedSessions: 94,
      estimatedRevenue: 470000,
      ownerName: 'Juma Mkwawa',
      ownerUserId: 'usr-1',
      slaTargetMinutes: 240,
      slaBreached: false,
    },
  ],
  accessBindings: [
    {
      id: 'bind-01',
      customerName: 'Amina Selemani',
      username: 'amina.selemani',
      accessType: 'HOTSPOT',
      state: 'ACTIVE',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    },
    {
      id: 'bind-02',
      customerName: 'Baraka Mgendi',
      username: 'baraka.m',
      accessType: 'HOTSPOT',
      state: 'ACTIVE',
      expiresAt: new Date(Date.now() + 7200000).toISOString(),
    },
    {
      id: 'bind-03',
      customerName: 'Devota Kilima',
      username: 'devota.k',
      accessType: 'RADIUS',
      state: 'ACTIVE',
      expiresAt: new Date(Date.now() + 86400000 * 6).toISOString(),
    },
    {
      id: 'bind-04',
      customerName: 'Rashid Bakari',
      username: 'rashid.bakari',
      accessType: 'PPPOE',
      state: 'SUSPENDED',
      expiresAt: null,
    },
  ],
  auditLogs: [
    {
      id: 'aud-1',
      action: 'LOGIN_SUCCESS',
      entityType: 'user',
      entityId: 'usr-1',
      metadata: { ip: '127.0.0.1', agent: 'Jaslyn Console' },
      createdAt: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: 'aud-2',
      action: 'ROUTER_SYNC',
      entityType: 'router',
      entityId: 'rt-mikrotik-ccr2004',
      metadata: { protocol: 'MIKROTIK_REST', status: 'ONLINE', activeUsers: 342 },
      createdAt: new Date(Date.now() - 1800000).toISOString(),
    },
    {
      id: 'aud-3',
      action: 'PAYMENT_RECEIVED',
      entityType: 'payment',
      entityId: 'pay-9021',
      metadata: { amount: 5000, currency: 'TZS', provider: 'UPESIPAY', customer: 'Amina Selemani' },
      createdAt: new Date(Date.now() - 900000).toISOString(),
    },
  ],
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const path = (slug || []).join('/');

  // 1. Health check
  if (path === 'health' || path === 'health/ready') {
    return NextResponse.json({
      status: 'ready',
      database: 'connected',
      environment: 'production-ready',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
    });
  }

  // 2. Account profile & team
  if (path === 'account') {
    return NextResponse.json({
      profile: store.profile,
      tenant: store.tenant,
      paymentDisplay: {
        acceptVouchers: true,
        acceptOnlinePayments: true,
      },
      subscription: {
        status: 'ACTIVE',
        planName: 'Enterprise ISP NOC & Billing',
        price: 250000,
        currency: 'TZS',
        billingInterval: 'MONTHLY',
        currentPeriodEnd: new Date(Date.now() + 86400000 * 24).toISOString(),
        maxRouters: 50,
        maxSites: 20,
        maxCustomers: 50000,
      },
    });
  }

  if (path === 'account/team') {
    return NextResponse.json({
      data: [
        { id: 'usr-1', fullName: 'Juma Mkwawa', email: 'operator@jaslyn.net', role: 'OWNER', isActive: true },
        { id: 'usr-2', fullName: 'Neema Joseph', email: 'billing@jaslyn.net', role: 'ADMIN', isActive: true },
        { id: 'usr-3', fullName: 'Hamisi Ally', email: 'field@jaslyn.net', role: 'AGENT', isActive: true },
      ],
    });
  }

  // 3. Overview & CommandCenter
  if (path === 'overview') {
    const totalRouters = store.routers.length;
    const onlineRouters = store.routers.filter((r) => r.status === 'ONLINE').length;
    const degradedRouters = store.routers.filter((r) => r.status === 'DEGRADED').length;
    const offlineRouters = store.routers.filter((r) => r.status === 'OFFLINE').length;
    const activeSessions = store.sessions.filter((s) => s.status === 'ACTIVE').length;
    const activeCustomers = store.customers.filter((c) => c.status === 'ACTIVE').length;

    return NextResponse.json({
      tenant: store.tenant,
      revenueSeries: [120000, 185000, 240000, 310000, 290000, 360000, 485000],
      kpis: {
        monthlyRevenue: 1850000,
        activeCustomers,
        onlineSessions: activeSessions,
        networkAvailability: Number(((onlineRouters / totalRouters) * 100).toFixed(1)),
        paymentFailures: 2,
      },
      network: {
        totalRouters,
        online: onlineRouters,
        degraded: degradedRouters,
        offline: offlineRouters,
      },
      operations: {
        networkCommands: { pending: 0, failed: 0, verified: 42, abandoned: 0 },
        sessions: { stale: 1, activeWithoutAccounting: 0, accountingLagging: 0 },
        access: { activeValid: 843, expiredButActive: 0, expiring24h: 34 },
      },
      sessions: store.sessions.map((s) => ({
        customer: s.customerName,
        location: s.routerName,
        router: s.routerName,
        ip_address: s.ipAddress,
        started_at: s.startedAt,
        bytesIn: s.bytesIn,
        bytesOut: s.bytesOut,
        status: s.status,
      })),
      locations: [
        { name: 'Kariakoo Commercial Zone', routers: 2, activeUsers: 342, onlineRouters: 2 },
        { name: 'Posta Mpya Station', routers: 1, activeUsers: 289, onlineRouters: 1 },
        { name: 'Mwenge University Area', routers: 1, activeUsers: 178, onlineRouters: 1 },
        { name: 'Sinza Palestina Hub', routers: 1, activeUsers: 94, onlineRouters: 0 },
      ],
    });
  }

  if (path === 'overview/command-center') {
    const total = store.routers.length;
    const online = store.routers.filter((r) => r.status === 'ONLINE').length;
    const degraded = store.routers.filter((r) => r.status === 'DEGRADED').length;
    const offline = store.routers.filter((r) => r.status === 'OFFLINE').length;

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      tenant: store.tenant,
      systemHealth: {
        status: offline > 0 ? 'DEGRADED' : degraded > 0 ? 'ATTENTION' : 'OPERATIONAL',
        devices: { total, online, degraded, unreachable: offline },
        activeIncidents: store.incidents.filter((i) => i.status !== 'RESOLVED').length,
        degradedServices: 1,
        activeSessions: store.sessions.filter((s) => s.status === 'ACTIVE').length,
        authenticationFailures24h: 1,
        paymentFailures24h: 0,
        providerFailures24h: [{ provider: 'MIKROTIK_REST', failures: 0 }],
        commandQueue: { pending: 0, failed: 0 },
      },
      devices: store.routers.map((r) => ({
        ...r,
        telemetry: {
          uptime: '14d 6h 22m',
          cpu: 18,
          memory: 42,
          interfaces: [1, 2, 3, 4],
          bandwidth: '48.5 Mbps',
          latency: 8,
          packetLoss: 0,
          source: 'DIRECT_ROUTEROS_TELEMETRY',
        },
        reachability: r.status === 'ONLINE' || r.status === 'DEGRADED',
        activeSessions: r.activeUsers,
        recentCommands: [
          { id: 'cmd-1', commandType: 'SYNC_ACTIVE_USERS', status: 'VERIFIED', error: null },
          { id: 'cmd-2', commandType: 'APPLY_RATE_LIMITS', status: 'VERIFIED', error: null },
        ],
        recentIncidents: store.incidents.filter((i) => i.rootResourceId === r.id),
      })),
      sessions: store.sessions.map((s) => ({
        id: s.id,
        subscriber: s.customerName,
        username: s.username,
        device: s.routerName,
        ip: s.ipAddress,
        authenticationState: 'ACCEPTED',
        accountingState: 'REPORTED',
        status: s.status,
      })),
      incidents: store.incidents,
      commands: [
        {
          id: 'cmd-101',
          commandType: 'HOTSPOT_USER_ADD',
          actor: 'AUTOMATION_FABRIC',
          provider: 'MIKROTIK_REST',
          status: 'COMPLETED',
          error: null,
          createdAt: new Date(Date.now() - 600000).toISOString(),
          completedAt: new Date(Date.now() - 598000).toISOString(),
        },
      ],
      recentCriticalEvents: store.incidents.map((i) => ({
        id: i.id,
        title: i.title,
        severity: i.severity,
        category: i.category,
        occurredAt: i.startedAt,
      })),
    });
  }

  // 4. Routers list
  if (path === 'routers') {
    return NextResponse.json({
      data: store.routers,
      count: store.routers.length,
    });
  }

  // 5. Packages list
  if (path === 'packages') {
    return NextResponse.json({
      data: store.packages,
      count: store.packages.length,
    });
  }

  // 6. Vouchers list
  if (path === 'vouchers') {
    return NextResponse.json({
      data: store.vouchers,
      count: store.vouchers.length,
    });
  }

  // 7. Customers list
  if (path === 'customers') {
    return NextResponse.json({
      data: store.customers,
      count: store.customers.length,
    });
  }

  // 8. Sessions list
  if (path === 'sessions') {
    return NextResponse.json({
      data: store.sessions,
      count: store.sessions.length,
    });
  }

  // 9. Incidents
  if (path === 'incidents') {
    return NextResponse.json({
      data: store.incidents,
      count: store.incidents.length,
    });
  }

  if (path === 'incidents/owners') {
    return NextResponse.json({
      data: [
        { id: 'usr-1', fullName: 'Juma Mkwawa', email: 'operator@jaslyn.net', role: 'NOC Lead' },
        { id: 'usr-2', fullName: 'Neema Joseph', email: 'billing@jaslyn.net', role: 'Support Eng' },
      ],
    });
  }

  // 10. Access bindings
  if (path === 'isp/access-bindings') {
    return NextResponse.json({
      data: store.accessBindings,
      pagination: { total: store.accessBindings.length, page: 1, limit: 100 },
    });
  }

  // 11. Public captive portal data
  if (path.startsWith('public/captive-portal/')) {
    const slugParam = path.replace('public/captive-portal/', '').split('/')[0];
    return NextResponse.json({
      portal: {
        name: store.captiveSettings.title || store.profile.businessName,
        slug: slugParam || store.tenant.slug,
        currency: store.tenant.currency,
        welcomeMessage: store.captiveSettings.welcomeMessage || store.profile.portalHeadline,
        termsText: store.captiveSettings.termsText,
        supportPhone: store.captiveSettings.supportPhone || store.profile.supportPhone,
        supportEmail: store.captiveSettings.supportEmail || store.profile.supportEmail,
      },
      packages: store.packages.filter((p) => p.showOnPortal && p.status === 'ACTIVE'),
    });
  }

  // 12. Captive portal settings
  if (path === 'captive-portal/settings') {
    return NextResponse.json(store.captiveSettings);
  }

  // 13. Audit logs
  if (path === 'audit-logs') {
    return NextResponse.json({
      data: store.auditLogs,
      count: store.auditLogs.length,
    });
  }

  if (path === 'audit-logs/integrity') {
    return NextResponse.json({
      valid: true,
      checkedEntries: store.auditLogs.length,
      invalidEntries: 0,
      headMatches: true,
      checkedAt: new Date().toISOString(),
    });
  }

  if (path === 'audit-logs/security-alerts') {
    return NextResponse.json({
      data: [],
      count: 0,
    });
  }

  // 14. Access control
  if (path === 'access-control') {
    return NextResponse.json({
      catalog: [
        { permissionKey: 'network.write', description: 'Modify routers, IPAM and queues', defaultRoles: ['OWNER', 'ADMIN'] },
        { permissionKey: 'vouchers.create', description: 'Batch generate Wi-Fi vouchers', defaultRoles: ['OWNER', 'ADMIN', 'CASHIER'] },
        { permissionKey: 'field.write', description: 'Field operations and installation', defaultRoles: ['OWNER', 'ADMIN', 'AGENT'] },
        { permissionKey: 'billing.read', description: 'View financial statements and logs', defaultRoles: ['OWNER', 'ADMIN', 'CASHIER'] },
      ],
      roleOverrides: [],
      userOverrides: [],
    });
  }

  // 15. Purchases
  if (path === 'purchases') {
    return NextResponse.json({
      data: [
        {
          id: 'pur-101',
          customerName: 'Amina Selemani',
          packageName: '24 Hours Unlimited',
          price: 5000,
          currency: 'TZS',
          status: 'COMPLETED',
          accessStatus: 'ACTIVE',
          startsAt: new Date(Date.now() - 3600000 * 2).toISOString(),
          endsAt: new Date(Date.now() + 86400000 - 3600000 * 2).toISOString(),
        },
      ],
      count: 1,
    });
  }

  // 16. Customer commerce overview fallback
  if (path.startsWith('commerce/customers/')) {
    return NextResponse.json({
      wallet: {
        account: { balance: 15000, currency: 'TZS', status: 'ACTIVE' },
        entries: [],
      },
      recentPurchases: [],
      beneficiaries: [],
      savedPurchases: [],
      rewards: [],
      limits: { dailyAmount: 50000, dailyTransactions: 10 },
      verification: [
        { verificationType: 'PHONE', status: 'VERIFIED' },
        { verificationType: 'DEVICE', status: 'VERIFIED' },
      ],
      preferences: { preferredChannel: 'SMS', transactionAlerts: true },
      support: [],
      renewals: [],
    });
  }

  // 17. Communication
  if (path === 'communication/conversations') {
    return NextResponse.json({
      data: [
        {
          id: 'conv-noc',
          kind: 'INTERNAL',
          title: 'NOC Incident Response',
          lastMessageBody: 'Kariakoo CCR2004 sync completed successfully.',
          lastMessageAt: new Date().toISOString(),
          unreadCount: 0,
        },
        {
          id: 'conv-support',
          kind: 'SUPPORT',
          title: 'Subscriber Assistance Desk',
          lastMessageBody: 'Mteja Amina amethibitishwa voucher mpya.',
          lastMessageAt: new Date(Date.now() - 1200000).toISOString(),
          unreadCount: 1,
        },
      ],
    });
  }

  if (path.includes('communication/conversations/') && path.endsWith('/messages')) {
    return NextResponse.json({
      data: [
        {
          id: 'msg-1',
          conversationId: 'conv-noc',
          body: 'All APs reporting normal signal levels and zero client dropouts.',
          senderName: 'Juma Mkwawa',
          createdAt: new Date(Date.now() - 600000).toISOString(),
        },
      ],
    });
  }

  // Fallback for any unlisted GET endpoints
  return NextResponse.json({
    data: [],
    count: 0,
    status: 'ok',
    message: `Ready on Jaslyn Net platform (${path})`,
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const path = (slug || []).join('/');

  let body: Record<string, any> = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  // Auth login
  if (path === 'auth/login') {
    const identifier = String(body.identifier || '').trim();
    return NextResponse.json({
      accessToken: 'demo-token-operator-' + Date.now(),
      expiresIn: 86400,
      user: {
        id: 'usr-1',
        fullName: identifier ? identifier.split('@')[0] : 'Operator',
        email: identifier.includes('@') ? identifier : 'operator@jaslyn.net',
        role: 'OWNER',
      },
      tenant: store.tenant,
    });
  }

  // Auth register
  if (path === 'auth/register') {
    return NextResponse.json({
      accessToken: 'demo-token-new-' + Date.now(),
      expiresIn: 86400,
      user: {
        id: 'usr-new',
        fullName: body.fullName || 'Operator',
        email: body.email || 'user@jaslyn.net',
        role: 'OWNER',
      },
      tenant: {
        ...store.tenant,
        name: body.workspaceName || store.tenant.name,
      },
    });
  }

  // Public captive portal voucher redeem
  if (path.includes('vouchers/redeem')) {
    const rawCode = String(body.code || '').trim().toUpperCase();
    const phone = String(body.phone || '').trim();
    const fullName = String(body.fullName || 'Mteja').trim();

    // Find existing voucher or generate instant validation
    let voucher = store.vouchers.find((v) => v.code.toUpperCase() === rawCode && v.status === 'ACTIVE');

    if (!voucher) {
      // Allow any well-formed voucher code to succeed for demo convenience
      const defaultPkg = store.packages.find((p) => p.isFeatured) || store.packages[0];
      voucher = {
        id: 'vch-' + Math.random().toString(36).substring(2, 9),
        code: rawCode || 'JN-DEMO-ACCESS',
        packageId: defaultPkg.id,
        packageName: defaultPkg.name,
        price: defaultPkg.price,
        currency: defaultPkg.currency,
        status: 'USED',
        expiresAt: new Date(Date.now() + defaultPkg.durationSeconds * 1000).toISOString(),
        usedAt: new Date().toISOString(),
        usedByPhone: phone,
        batchNumber: 'PORTAL-REDEEMED',
      };
      store.vouchers.push(voucher);
    } else {
      voucher.status = 'USED';
      voucher.usedAt = new Date().toISOString();
      voucher.usedByPhone = phone;
    }

    const durationSeconds = store.packages.find((p) => p.id === voucher?.packageId)?.durationSeconds || 86400;
    const startsAt = new Date().toISOString();
    const endsAt = new Date(Date.now() + durationSeconds * 1000).toISOString();

    // Record access binding
    store.accessBindings.unshift({
      id: 'bind-' + Math.random().toString(36).substring(2, 8),
      customerName: fullName,
      username: phone || fullName.toLowerCase().replace(/\s+/g, '.'),
      accessType: 'HOTSPOT',
      state: 'ACTIVE',
      expiresAt: endsAt,
    });

    // Record audit log
    store.auditLogs.unshift({
      id: 'aud-' + Date.now(),
      action: 'VOUCHER_REDEEMED',
      entityType: 'voucher',
      entityId: voucher.id,
      metadata: { code: voucher.code, phone, package: voucher.packageName },
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({
      redeemed: true,
      purchaseId: 'pur-' + Date.now(),
      startsAt,
      endsAt,
      deviceLimit: 3,
      message: `Voucher imethibitishwa kikamilifu! Kifurushi chako cha ${voucher.packageName} kimewashwa hadi ${new Date(endsAt).toLocaleTimeString()}.`,
    });
  }

  // Create router
  if (path === 'routers') {
    const newRouter = {
      id: 'rt-' + Math.random().toString(36).substring(2, 8),
      name: body.name || 'Managed Device',
      vendor: body.vendor || 'MikroTik',
      model: body.model || 'CCR Series',
      ipAddress: body.ipAddress || '192.168.88.1',
      macAddress: body.macAddress || 'CC:2D:E0:00:11:22',
      status: 'ONLINE' as const,
      activeUsers: 0,
      lastSeenAt: new Date().toISOString(),
      managementProtocol: body.managementProtocol || 'MIKROTIK_REST',
      managementEnabled: body.managementEnabled !== false,
      managementCredentialsConfigured: true,
      apiEndpoint: body.apiEndpoint || '',
      capabilities: { capabilities: ['HOTSPOT', 'FIREWALL', 'QUEUES'] },
      syncError: null,
    };
    store.routers.unshift(newRouter);
    return NextResponse.json(newRouter);
  }

  // Generate vouchers batch
  if (path === 'vouchers' || path === 'vouchers/generate' || path === 'vouchers/batch') {
    const count = Math.min(Number(body.count || body.quantity || 5), 50);
    const pkg = store.packages.find((p) => p.id === body.packageId) || store.packages[0];
    const newVouchers: typeof store.vouchers = [];

    for (let i = 0; i < count; i++) {
      const code = 'JN-' + Math.random().toString(36).substring(2, 6).toUpperCase() + '-' + Math.floor(1000 + Math.random() * 9000);
      const v = {
        id: 'vch-' + Math.random().toString(36).substring(2, 9),
        code,
        packageId: pkg.id,
        packageName: pkg.name,
        price: pkg.price,
        currency: pkg.currency,
        status: 'ACTIVE' as const,
        expiresAt: new Date(Date.now() + 86400000 * 30).toISOString(),
        usedAt: null,
        usedByPhone: null,
        batchNumber: 'BATCH-' + new Date().toISOString().slice(0, 10),
      };
      newVouchers.push(v);
      store.vouchers.unshift(v);
    }

    return NextResponse.json({
      data: newVouchers,
      count: newVouchers.length,
      batchNumber: newVouchers[0]?.batchNumber,
      message: `${count} vouchers generated successfully.`,
    });
  }

  // Create customer
  if (path === 'customers') {
    const newCust = {
      id: 'cust-' + Math.random().toString(36).substring(2, 8),
      fullName: body.fullName || 'New Customer',
      username: body.username || (body.fullName ? body.fullName.toLowerCase().replace(/\s+/g, '.') : 'subscriber'),
      phone: body.phone || '+255 700 000 000',
      email: body.email || 'customer@jaslyn.net',
      status: 'ACTIVE' as const,
      balance: Number(body.balance || 0),
      currency: store.tenant.currency,
      macAddress: body.macAddress || 'AA:BB:CC:DD:EE:FF',
      ipAddress: body.ipAddress || '192.168.88.100',
      currentPackage: body.packageName || '3 Hours Standard',
      createdAt: new Date().toISOString(),
    };
    store.customers.unshift(newCust);
    return NextResponse.json(newCust);
  }

  // Incident action
  if (path.includes('incidents/') && path.endsWith('/acknowledge')) {
    const incId = path.split('/')[1];
    const incident = store.incidents.find((i) => i.id === incId);
    if (incident) incident.status = 'ACKNOWLEDGED';
    return NextResponse.json({ success: true, status: 'ACKNOWLEDGED' });
  }

  if (path.includes('incidents/') && path.endsWith('/resolve')) {
    const incId = path.split('/')[1];
    const incident = store.incidents.find((i) => i.id === incId);
    if (incident) incident.status = 'RESOLVED';
    return NextResponse.json({ success: true, status: 'RESOLVED' });
  }

  // Generic POST fallback
  return NextResponse.json({
    success: true,
    data: body,
    message: 'Operation performed successfully',
  });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const path = (slug || []).join('/');

  let body: Record<string, any> = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  // Captive portal settings update
  if (path === 'captive-portal/settings') {
    store.captiveSettings = {
      ...store.captiveSettings,
      ...body,
      updatedAt: new Date().toISOString(),
    };
    return NextResponse.json(store.captiveSettings);
  }

  // Access binding state change (suspend / resume)
  if (path.includes('isp/access-bindings/') && path.endsWith('/state')) {
    const id = path.split('/')[2];
    const binding = store.accessBindings.find((b) => b.id === id);
    if (binding) {
      binding.state = body.state === 'ACTIVE' ? 'ACTIVE' : 'SUSPENDED';
    }
    return NextResponse.json({ success: true, binding });
  }

  // Incident owner assignment
  if (path.includes('incidents/') && path.endsWith('/owner')) {
    const id = path.split('/')[1];
    const incident = store.incidents.find((i) => i.id === id);
    if (incident) {
      incident.ownerUserId = body.ownerUserId;
      incident.ownerName = body.ownerUserId ? 'Juma Mkwawa' : null;
    }
    return NextResponse.json({ success: true, incident });
  }

  return NextResponse.json({ success: true, data: body });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const path = (slug || []).join('/');
  let body: Record<string, any> = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  return NextResponse.json({ success: true, path, data: body });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const path = (slug || []).join('/');
  return NextResponse.json({ success: true, path, message: 'Deleted successfully' });
}
