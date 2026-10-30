import { NextRequest, NextResponse } from 'next/server';
import { db, makeToken } from '../store';

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-request-id, Idempotency-Key',
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-request-id, Idempotency-Key',
    },
  });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const path = slug.join('/');
  const url = new URL(req.url);

  // 1. Overview
  if (path === 'overview') {
    return json({
      tenant: { currency: 'TZS', timezone: 'Africa/Dar_es_Salaam', name: 'Jaslyn Net Operations', status: 'ACTIVE' },
      revenueSeries: [14200000, 16800000, 19500000, 22400000, 26100000, 29800000, 33500000],
      kpis: {
        monthlyRevenue: 33500000,
        activeCustomers: db.customers.length + 1420,
        onlineSessions: db.sessions.filter((s) => s.status === 'ACTIVE').length + 318,
        networkAvailability: 99.98,
        paymentFailures: 0,
      },
      network: {
        totalRouters: db.routers.length,
        online: db.routers.filter((r) => r.status === 'ONLINE').length,
        degraded: db.routers.filter((r) => r.status === 'DEGRADED').length,
        offline: db.routers.filter((r) => r.status === 'OFFLINE').length,
      },
      operations: {
        networkCommands: { pending: 0, failed: 0, verified: 156, abandoned: 0 },
        sessions: { stale: 0, activeWithoutAccounting: 0, accountingLagging: 0 },
        access: { activeValid: 322, expiredButActive: 0, expiring24h: 12 },
      },
      sessions: db.sessions.map((s) => ({
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
        { name: 'Dar es Salaam - Core NOC', routers: 1, activeUsers: 142, onlineRouters: 1 },
        { name: 'Sinza - Hotspot Tower', routers: 1, activeUsers: 86, onlineRouters: 1 },
        { name: 'Mbezi Beach Hub', routers: 1, activeUsers: 54, onlineRouters: 1 },
        { name: 'Posta Public WiFi', routers: 1, activeUsers: 39, onlineRouters: 1 },
      ],
    });
  }

  // 2. Customers
  if (path === 'customers') {
    const search = url.searchParams.get('search')?.toLowerCase() || '';
    const activeOnly = url.searchParams.get('activeOnly') === 'true';
    let filtered = db.customers;
    if (activeOnly) filtered = filtered.filter((c) => c.isActive);
    if (search) {
      filtered = filtered.filter(
        (c) =>
          c.fullName.toLowerCase().includes(search) ||
          c.username.toLowerCase().includes(search) ||
          c.phone.includes(search) ||
          c.email.toLowerCase().includes(search)
      );
    }
    return json({
      data: filtered,
      pagination: { page: 1, limit: 25, total: filtered.length, pages: 1 },
    });
  }

  // 3. Routers
  if (path === 'routers') {
    return json({ data: db.routers });
  }

  if (path.startsWith('routers/')) {
    const routerId = slug[1];
    if (slug[2] === 'capabilities') {
      return json({ capabilities: ['HOTSPOT', 'PPPOE', 'QUEUE_TREE', 'FIREWALL', 'BGP'] });
    }
    const cleanId = decodeURIComponent(routerId).trim().toLowerCase();
    const router = db.routers.find(
      (r) =>
        r.id.toLowerCase() === cleanId ||
        r.macAddress.toLowerCase() === cleanId ||
        r.ipAddress === cleanId ||
        r.name.toLowerCase().includes(cleanId)
    ) || db.routers[0];
    return json(router);
  }

  // 4. Sessions
  if (path === 'sessions') {
    const status = url.searchParams.get('status');
    const filtered = status ? db.sessions.filter((s) => s.status === status) : db.sessions;
    return json({ data: filtered, count: filtered.length });
  }

  // 5. Packages
  if (path === 'packages') {
    const activeOnly = url.searchParams.get('activeOnly') === 'true';
    const filtered = activeOnly ? db.packages.filter((p) => p.isActive) : db.packages;
    return json({
      data: filtered,
      pagination: { page: 1, limit: 50, total: filtered.length, pages: 1 },
    });
  }

  if (path === 'packages/tiers') {
    const tiers = db.packages.map((pkg) => ({
      code: pkg.tierCode,
      name: pkg.name,
      rank: pkg.tierRank,
      tagline: pkg.tagline,
      price: pkg.price,
      currency: pkg.currency,
      durationSeconds: pkg.durationSeconds,
      dataLimitBytes: pkg.dataLimitBytes,
      downloadBps: pkg.downloadBps || 0,
      uploadBps: pkg.uploadBps || 0,
      devicesPerCode: pkg.devicesPerCode,
      featureFlags: { hotspot: true, captivePortal: true, vouchers: true },
      featured: Boolean(pkg.isFeatured),
      configured: true,
      package: pkg,
    }));
    return json({ data: tiers });
  }

  // 6. Vouchers
  if (path === 'vouchers') {
    return json({ data: db.vouchers });
  }

  // 7. Public Captive Portal
  if (path.startsWith('public/captive-portal/') && !path.includes('/vouchers/redeem')) {
    return json({
      portal: db.portalSettings,
      packages: db.packages.filter((p) => p.showOnPortal && p.isActive),
    });
  }

  // Public Status Page
  if (path.startsWith('public/status/')) {
    const statusSlug = slug.slice(2).join('/') || 'main';
    return json({
      slug: statusSlug,
      displayName: 'Mtandao wa Jaslyn Net',
      description: 'Hali halisi ya upatikanaji wa huduma na matengenezo ya mara kwa mara.',
      overallStatus: 'OPERATIONAL',
      generatedAt: new Date().toISOString(),
      components: [
        { componentKey: 'core-noc', name: 'Dar es Salaam Core NOC & BGP Gateway', status: 'OPERATIONAL', summary: 'Uptime 99.98% · Nominal latency' },
        { componentKey: 'hotspot-sinza', name: 'Sinza Hotspot Tower & AP Cluster', status: 'OPERATIONAL', summary: 'All sector antennas active' },
        { componentKey: 'mbezi-hub', name: 'Mbezi Beach Distribution Hub', status: 'OPERATIONAL', summary: 'High-speed fiber backhaul link' },
        { componentKey: 'billing-radius', name: 'RADIUS / AAA & Voucher Authentication', status: 'OPERATIONAL', summary: 'Instant authentication' },
        { componentKey: 'payment-gateway', name: 'M-Pesa & Airtel Money Webhooks', status: 'OPERATIONAL', summary: 'Automatic payment reconciliation' },
      ],
      incidents: [],
      maintenanceWindows: [
        {
          id: 'maint-01',
          title: 'Scheduled Fiber Ring Redundancy Testing',
          startsAt: new Date(Date.now() + 86400000 * 3).toISOString(),
          endsAt: new Date(Date.now() + 86400000 * 3 + 7200000).toISOString(),
          status: 'SCHEDULED',
        },
      ],
    });
  }

  // 8. Captive Portal Settings
  if (path === 'captive-portal/settings') {
    return json(db.portalSettings);
  }

  // 9. ISP Access Bindings & Field Jobs
  if (path === 'isp/access-bindings') {
    return json({
      data: db.accessBindings,
      pagination: { total: db.accessBindings.length },
    });
  }

  if (path === 'isp/jobs') {
    return json({
      data: [
        {
          id: 'job-01',
          title: 'Sinza Hotspot Tower Sector Alignment & Firmware Audit',
          status: 'ASSIGNED',
          priority: 'HIGH',
          jobType: 'PREVENTIVE_MAINTENANCE',
          description: 'Inspect MikroTik RB4011 power cabling, update RouterOS packages, and verify client isolation.',
          siteName: 'Sinza Tower Hub',
          scheduledAt: new Date(Date.now() + 3600000 * 2).toISOString(),
        },
        {
          id: 'job-02',
          title: 'Mbezi Beach Distribution ONT & Fiber Splice Verification',
          status: 'IN_PROGRESS',
          priority: 'CRITICAL',
          jobType: 'INCIDENT_RESPONSE',
          description: 'Diagnose optical RX power degradation on PON port 3. Verify Ruijie RG-EG310 uplink throughput.',
          siteName: 'Mbezi Beach Distribution',
          scheduledAt: new Date(Date.now() - 3600000).toISOString(),
        },
        {
          id: 'job-03',
          title: 'Posta Public WiFi AP Outdoor Enclosure Inspection',
          status: 'ASSIGNED',
          priority: 'NORMAL',
          jobType: 'ROUTINE_INSPECTION',
          description: 'Weatherproofing check for Cambium cnPilot e500 AP, test PoE injector output and ground wire.',
          siteName: 'Posta Commercial Center',
          scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        },
      ],
    });
  }

  if (path.startsWith('isp/jobs/') && path.endsWith('/checklist')) {
    return json({
      data: [
        { itemKey: 'site-safety', label: 'Site safety and ladder stability checked', checked: true },
        { itemKey: 'power-cabling', label: 'PoE power, UPS and cabling inspected', checked: false },
        { itemKey: 'connectivity-test', label: 'Speedtest and ping to gateway nominal (<5ms)', checked: false },
        { itemKey: 'customer-confirmed', label: 'Site contact notified of completion', checked: false },
      ],
    });
  }

  // 10. Sales / Purchases / Payments
  if (path === 'sales/customers') {
    return json({ data: db.sales });
  }

  if (path === 'purchases') {
    return json({ data: db.sales });
  }

  if (path === 'payments') {
    return json({
      data: db.sales.map((s, idx) => ({
        id: `pay-${idx + 1}`,
        amount: s.amount,
        currency: s.currency,
        status: 'PAID',
        provider: 'MPESA',
        reference: s.paymentReference,
        customerName: db.customers.find((c) => c.id === s.customerId)?.fullName || 'Subscriber',
        createdAt: s.startsAt,
      })),
    });
  }

  // 11. Audit logs
  if (path === 'audit-logs') {
    return json({ data: db.auditLogs, count: db.auditLogs.length });
  }

  if (path === 'audit-logs/integrity') {
    return json({
      valid: true,
      checkedEntries: db.auditLogs.length,
      invalidEntries: 0,
      headMatches: true,
      checkedAt: new Date().toISOString(),
    });
  }

  if (path === 'audit-logs/security-alerts') {
    return json({ data: [], count: 0 });
  }

  // 12. Access Control
  if (path === 'access-control') {
    return json({
      catalog: [
        { permissionKey: 'network.read', description: 'View router telemetry and topology', defaultRoles: ['OWNER', 'ADMIN', 'AGENT', 'READ_ONLY', 'CASHIER'] },
        { permissionKey: 'network.write', description: 'Modify router configs and queue trees', defaultRoles: ['OWNER', 'ADMIN'] },
        { permissionKey: 'vouchers.generate', description: 'Generate and print voucher batches', defaultRoles: ['OWNER', 'ADMIN', 'CASHIER'] },
        { permissionKey: 'subscribers.manage', description: 'Create and update subscriber profiles', defaultRoles: ['OWNER', 'ADMIN', 'AGENT'] },
        { permissionKey: 'billing.override', description: 'Grant manual credit or override invoices', defaultRoles: ['OWNER'] },
      ],
      roleOverrides: [],
      userOverrides: [],
    });
  }

  // 13. Account and Team
  if (path === 'account') {
    return json({
      profile: {
        businessName: 'Jaslyn Net High-Speed Operations',
        contactName: 'Jaslyn NOC Admin',
        phone: '+255 744 123 456',
        email: 'admin@jaslyn.net',
        address: 'Ali Hassan Mwinyi Road, Dar es Salaam, Tanzania',
        brandColor: '#1769E0',
        logoUrl: '/ram-logo-scalable.svg',
        supportPhone: '+255 744 123 456',
        supportWhatsapp: '+255 744 123 456',
        supportEmail: 'support@jaslyn.net',
        portalHeadline: 'Karibu Jaslyn Net Wi-Fi',
        portalSubtitle: 'Unganisha kifurushi chako uanze kutumia intaneti kwa kasi ya 5G.',
      },
      tenant: {
        tenantId: 'tenant-jaslyn-01',
        name: 'Jaslyn Net Operations',
        slug: 'jaslyn-net',
        status: 'ACTIVE',
        currency: 'TZS',
        timezone: 'Africa/Dar_es_Salaam',
      },
      lifecycle: { state: 'ACTIVE' },
      paymentDisplay: { acceptVouchers: true, acceptOnlinePayments: true },
      subscription: {
        status: 'ACTIVE',
        planName: 'Enterprise ISP Platform',
        price: 350000,
        currency: 'TZS',
        billingInterval: 'MONTHLY',
        currentPeriodEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
        maxRouters: 50,
        maxSites: 20,
        maxCustomers: 10000,
      },
    });
  }

  if (path === 'account/team') {
    return json({
      data: [
        { id: 'usr-admin-01', fullName: 'Jaslyn NOC Admin', email: 'admin@jaslyn.net', role: 'OWNER', isActive: true },
        { id: 'usr-ops-02', fullName: 'Juma Selemani', email: 'juma@jaslyn.net', role: 'ADMIN', isActive: true },
        { id: 'usr-cashier-03', fullName: 'Neema Joseph', email: 'neema@jaslyn.net', role: 'CASHIER', isActive: true },
      ],
    });
  }

  // 14. Customer Commerce Overview
  if (path.startsWith('commerce/customers/') && path.endsWith('/overview')) {
    const custId = slug[2];
    const customer = db.customers.find((c) => c.id === custId) || db.customers[0];
    return json({
      wallet: {
        account: { balance: 25000, currency: 'TZS', status: 'ACTIVE' },
        entries: [
          { id: 'ent-1', amount: 30000, entryType: 'TOPUP', description: 'M-Pesa Topup', createdAt: new Date().toISOString() },
          { id: 'ent-2', amount: -5000, entryType: 'PURCHASE', description: '24h Hotspot Package', createdAt: new Date().toISOString() },
        ],
      },
      recentPurchases: db.sales.filter((s) => s.customerId === customer?.id),
      beneficiaries: [
        { id: 'ben-1', displayName: 'Mama Amina', phone: '+255744999888', isFavorite: true },
      ],
      savedPurchases: [
        { id: 'sav-1', label: 'Home Monthly Fiber', packageId: 'pkg-04', autoRenew: true, renewalDays: 30 },
      ],
      rewards: [
        { id: 'rew-1', title: 'Rafiki Referral Reward', points: 500, status: 'AVAILABLE' },
      ],
      limits: { dailyAmount: 500000, dailyTransactions: 20, monthlyAmount: 5000000 },
      verification: [
        { verificationType: 'PHONE', status: 'VERIFIED' },
        { verificationType: 'EMAIL', status: 'VERIFIED' },
        { verificationType: 'IDENTITY', status: 'VERIFIED' },
      ],
      preferences: { preferredChannel: 'SMS', transactionAlerts: true, accessAlerts: true, promotionAlerts: false, securityAlerts: true },
      support: [],
      renewals: [],
    });
  }

  // 15. Automation
  if (path === 'automation/rules') {
    return json({
      data: [
        {
          id: 'rule-01',
          name: 'Payment Reconciliation Auto-Grant',
          eventType: 'PAYMENT.CONFIRMED',
          conditions: [{ path: 'status', op: 'eq', value: 'PAID' }],
          actions: [{ type: 'GRANT_HOTSPOT_ACCESS', duration: 'PACKAGE_EXPIRY' }],
          enabled: true,
        },
      ],
    });
  }

  if (path === 'automation/runs') {
    return json({ data: [] });
  }

  if (path === 'automation/alerts') {
    return json({ data: [] });
  }

  if (path === 'automation/workflows') {
    return json({ data: [] });
  }

  if (path === 'automation/workflows/runs') {
    return json({ data: [] });
  }

  if (path === 'automation/workflows/approvals') {
    return json({ data: [] });
  }

  if (path === 'automation/workflows/integrations') {
    return json({ data: [] });
  }

  if (path === 'automation/workflows/alerts') {
    return json({ data: [] });
  }

  // 16. Communication
  if (path === 'communication/conversations') {
    return json({
      data: [
        { id: 'conv-noc', kind: 'OPERATIONS', title: 'NOC & Network Alarms', unreadCount: 0, lastMessageBody: 'All core links operating at nominal latency.', lastMessageAt: new Date().toISOString() },
        { id: 'conv-field', kind: 'FIELD_OPS', title: 'Sinza & Mbezi Field Team', unreadCount: 0, lastMessageBody: 'Sinza tower sector 2 maintenance complete.', lastMessageAt: new Date().toISOString() },
      ],
    });
  }

  if (path.startsWith('communication/conversations/') && path.endsWith('/messages')) {
    const convId = slug[2];
    return json({
      data: [
        { id: 'msg-1', conversationId: convId, body: 'Network telemetry synchronized. All routers online.', senderName: 'Jaslyn Sentinel Bot', createdAt: new Date(Date.now() - 3600000).toISOString() },
        { id: 'msg-2', conversationId: convId, body: 'Operating latency across Dar es Salaam ring: 4.2ms.', senderName: 'NOC Controller', createdAt: new Date(Date.now() - 1800000).toISOString() },
      ],
    });
  }

  if (path.startsWith('communication/conversations/') && path.endsWith('/topics')) {
    return json({ data: [{ id: 'top-1', name: 'General', messageCount: 2 }] });
  }

  if (path === 'communication/channels') return json({ data: [] });
  if (path === 'communication/saved-messages') return json({ data: [] });
  if (path === 'communication/notifications') return json({ data: [] });

  // 17. Incidents
  if (path === 'incidents') {
    return json({ data: db.incidents });
  }

  // 18. Fiber / IPAM / RADIUS / Synthetic Monitoring / Secrets
  if (path === 'fiber/lines') return json({ data: [] });
  if (path === 'ipam/subnets') return json({ data: [] });
  if (path === 'radius/clients') return json({ data: [] });
  if (path === 'synthetic-monitoring/monitors') return json({ data: [] });
  if (path === 'secrets-vault/secrets') return json({ data: [] });

  // Default fallback for any GET
  return json({ data: [], status: 'OK' });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const path = slug.join('/');
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  // 1. Auth Login
  if (path === 'auth/login') {
    const email = body.email || 'admin@jaslyn.net';
    const role = 'OWNER';
    const token = makeToken(email, role, 'usr-admin-01');
    return json({
      accessToken: token,
      expiresIn: 86400 * 7,
      user: {
        id: 'usr-admin-01',
        fullName: 'Jaslyn NOC Admin',
        email,
        role,
      },
      tenant: {
        id: 'tenant-jaslyn-01',
        name: 'Jaslyn Net Operations',
        timezone: 'Africa/Dar_es_Salaam',
        currency: 'TZS',
      },
    });
  }

  // 2. Auth Register
  if (path === 'auth/register') {
    const email = body.email || 'operator@jaslyn.net';
    const fullName = body.fullName || 'Network Operator';
    const token = makeToken(email, 'OWNER', 'usr-new-01');
    return json({
      accessToken: token,
      expiresIn: 86400 * 7,
      user: { id: 'usr-new-01', fullName, email, role: 'OWNER' },
      tenant: { id: 'tenant-new', name: body.businessName || 'Jaslyn Net Workspace', timezone: 'Africa/Dar_es_Salaam', currency: 'TZS' },
    });
  }

  // 3. Create Customer
  if (path === 'customers') {
    const newCustomer = {
      id: `cust-${Date.now()}`,
      fullName: body.fullName || 'New Customer',
      username: body.username || `user${Date.now()}`,
      email: body.email || '',
      phone: body.phone || '',
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    db.customers.unshift(newCustomer);
    return json(newCustomer, 201);
  }

  // 4. Create Router
  if (path === 'routers') {
    const newRouter: any = {
      id: `rtr-${Date.now()}`,
      name: body.name || 'New Router',
      vendor: body.vendor || 'MikroTik',
      model: body.model || 'RouterOS Device',
      ipAddress: body.ipAddress || '192.168.88.1',
      macAddress: body.macAddress || '00:00:00:00:00:00',
      status: 'ONLINE',
      activeUsers: 0,
      lastSeenAt: new Date().toISOString(),
      managementProtocol: body.managementProtocol || 'MIKROTIK_REST',
      managementEnabled: true,
      managementCredentialsConfigured: true,
      apiEnabled: true,
      apiEndpoint: body.apiEndpoint || '',
      capabilities: { capabilities: ['HOTSPOT', 'PPPOE'] },
    };
    db.routers.push(newRouter);
    return json(newRouter, 201);
  }

  // 5. Create Package
  if (path === 'packages') {
    const newPkg: any = {
      id: `pkg-${Date.now()}`,
      name: body.name || 'Custom Package',
      price: Number(body.price || 5000),
      currency: body.currency || 'TZS',
      durationSeconds: Number(body.durationSeconds || 86400),
      dataLimitBytes: body.dataLimitBytes ? Number(body.dataLimitBytes) : null,
      downloadBps: body.downloadBps ? Number(body.downloadBps) : 10000000,
      uploadBps: body.uploadBps ? Number(body.uploadBps) : 5000000,
      devicesPerCode: Number(body.devicesPerCode || 1),
      showOnPortal: body.showOnPortal !== false,
      isFreeTrial: Boolean(body.isFreeTrial),
      freeTrialFrequency: body.freeTrialFrequency || 'NONE',
      tierCode: `TIER-${Date.now()}`,
      tierRank: db.packages.length + 1,
      tagline: body.tagline || '',
      isActive: true,
    };
    db.packages.push(newPkg);
    return json(newPkg, 201);
  }

  // 6. Voucher Batches
  if (path === 'vouchers/batches') {
    const qty = Math.min(Number(body.quantity || 10), 100);
    const codes: string[] = [];
    const pkg = db.packages.find((p) => p.id === body.packageId) || db.packages[0];
    for (let i = 0; i < qty; i++) {
      const num = Math.floor(1000 + Math.random() * 9000);
      const code = `JAS-${num}`;
      codes.push(code);
      db.vouchers.unshift({
        id: `vch-${Date.now()}-${i}`,
        code,
        packageId: pkg?.id || 'pkg-01',
        packageName: pkg?.name || 'WiFi Package',
        status: 'UNUSED',
        expiresAt: new Date(Date.now() + (Number(body.expiresInSeconds) || 2592000) * 1000).toISOString(),
        deviceLimit: pkg?.devicesPerCode || 1,
        printStyle: body.printStyle || 'CLASSIC',
        printSize: body.printSize || 'MINI',
      });
    }
    return json({
      count: codes.length,
      codes,
      packageId: pkg?.id,
      printSize: body.printSize || 'MINI',
      printStyle: body.printStyle || 'CLASSIC',
    });
  }

  // 7. Public Voucher Redemption
  if (path.startsWith('public/captive-portal/') && path.endsWith('/vouchers/redeem')) {
    const code = String(body.code || '').trim().toUpperCase();
    const phone = String(body.phone || '');
    const voucher = db.vouchers.find((v) => v.code === code && v.status === 'UNUSED');
    if (voucher) {
      voucher.status = 'USED';
      voucher.usedAt = new Date().toISOString();
    }
    return json({
      redeemed: true,
      purchaseId: `purch-${Date.now()}`,
      startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 86400000).toISOString(),
      deviceLimit: voucher?.deviceLimit || 2,
      message: `Hongera! Voucher ${code} imethibitishwa kwa namba ${phone}. Unaweza kuanza kutumia intaneti mara moja.`,
    });
  }

  // 8. Communication Messages
  if (path.startsWith('communication/conversations/') && path.endsWith('/messages')) {
    const newMsg = {
      id: `msg-${Date.now()}`,
      conversationId: slug[2],
      body: body.body || '',
      senderName: 'Jaslyn NOC Admin',
      createdAt: new Date().toISOString(),
    };
    return json(newMsg, 201);
  }

  if (path.startsWith('communication/conversations/') && path.endsWith('/read')) {
    return json({ status: 'OK' });
  }

  if (path === 'communication/commands/execute') {
    return json({
      status: 'EXECUTED',
      result: `Command [${body.command}] executed successfully across network fabric.`,
    });
  }

  if (path === 'communication/presence') {
    return json({ status: 'OK' });
  }

  // 9. Add Team Member
  if (path === 'account/team') {
    const member = {
      id: `usr-${Date.now()}`,
      fullName: body.fullName || 'Team Member',
      email: body.email || 'team@jaslyn.net',
      role: body.role || 'AGENT',
      isActive: true,
    };
    return json(member, 201);
  }

  // 10. Commerce actions
  if (path.includes('wallet/entries')) {
    return json({ status: 'OK', entryId: `ent-${Date.now()}` }, 201);
  }
  if (path.includes('/support')) {
    return json({ status: 'OPEN', id: `case-${Date.now()}` }, 201);
  }
  if (path.includes('/beneficiaries')) {
    return json({ id: `ben-${Date.now()}`, ...body }, 201);
  }
  if (path.includes('/saved-purchases')) {
    return json({ id: `sav-${Date.now()}`, ...body }, 201);
  }
  if (path.includes('/referrals')) {
    return json({ referralCode: `REF-${Math.floor(1000 + Math.random() * 9000)}` }, 201);
  }

  return json({ status: 'OK', id: `res-${Date.now()}` });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const path = slug.join('/');
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  if (path === 'captive-portal/settings') {
    db.portalSettings = { ...db.portalSettings, ...body, updatedAt: new Date().toISOString() };
    return json(db.portalSettings);
  }

  if (path.startsWith('isp/access-bindings/') && path.endsWith('/state')) {
    const id = slug[2];
    const binding = db.accessBindings.find((b) => b.id === id);
    if (binding) binding.state = body.state || (binding.state === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE');
    return json(binding || { status: 'OK' });
  }

  if (path.startsWith('account/')) {
    return json({ status: 'OK', ...body });
  }

  return json({ status: 'OK', ...body });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const path = slug.join('/');
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  if (path.startsWith('automation/rules/') && path.endsWith('/enabled')) {
    return json({ status: 'OK', enabled: body.enabled });
  }

  return json({ status: 'OK', ...body });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const path = slug.join('/');

  if (path.startsWith('sessions/')) {
    const id = slug[1];
    db.sessions = db.sessions.filter((s) => s.id !== id);
    return json({ status: 'SESSION_TERMINATED', id });
  }

  return json({ status: 'DELETED' });
}
