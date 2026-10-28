export type Lang = 'en' | 'sw';

export interface Copy {
  htmlLang: string;
  meta: { title: string; description: string };
  nav: { how: string; features: string; hardware: string; payments: string; pricing: string; faq: string; login: string; start: string; menu: string; close: string; switchTo: string; skip: string };
  hero: { h1: string; lead: string; primary: string; secondary: string; rails: string };
  demo: {
    caption: string; badge: string; business: string; pickTitle: string; continue: string; methodTitle: string; phoneLabel: string; phoneHint: string;
    pay: string; waitTitle: string; waitBody: string; onlineTitle: string; onlineBody: string; again: string; back: string;
    operator: string; operatorHint: string; empty: string; pending: string; received: string; done: string; granted: string; requested: string; receivedLine: string;
    session: string; packages: Array<{ name: string; time: string; price: number }>; methods: string[]; stepLabel: string;
  };
  problem: { h2: string; before: string; after: string; rows: Array<[string, string]> };
  how: { h2: string; lead: string; steps: Array<[string, string]> };
  features: { h2: string; lead: string; items: Array<[string, string]> };
  hardware: { h2: string; lead: string; vendorsLabel: string; radiusLabel: string; radiusBody: string; caveat: string; link: string };
  payments: { h2: string; lead: string; methodsLabel: string; flow: Array<[string, string]>; note: string };
  pricing: { h2: string; empty: string; emptyBody: string; cta: string; per: string };
  faq: { h2: string; items: Array<[string, string]>; more: string };
  cta: { h2: string; body: string; primary: string; secondary: string };
  footer: { tagline: string; links: Array<[string, string]>; legal: string };
}

const vendors = ['MikroTik', 'UniFi', 'TP-Link Omada', 'Cambium', 'Cisco Meraki', 'Aruba', 'Grandstream', 'Ruckus', 'Teltonika', 'Peplink', 'pfSense / OPNsense', 'OpenWrt', 'Ruijie', 'FreeRADIUS'];
export const VENDORS = vendors;
export const MOBILE_MONEY = ['M-Pesa', 'Mixx by Yas', 'Airtel Money', 'HaloPesa', 'AzamPesa'];

export const COPY: Record<Lang, Copy> = {
  en: {
    htmlLang: 'en',
    meta: {
      title: 'Jaslyn Net — Sell Wi-Fi by the hour and see every payment',
      description: 'Jaslyn Net connects Wi-Fi packages, mobile-money payments, vouchers and routers for hotspot operators and ISPs. See how a customer purchase flows from the portal to your ledger.',
    },
    nav: { how: 'How it works', features: 'What you get', hardware: 'Routers', payments: 'Payments', pricing: 'Pricing', faq: 'FAQ', login: 'Log in', start: 'Create workspace', menu: 'Open menu', close: 'Close menu', switchTo: 'Kiswahili', skip: 'Skip to content' },
    hero: {
      h1: 'Sell Wi-Fi by the hour. See every shilling.',
      lead: 'Jaslyn Net ties your packages, mobile-money payments and routers into one system. A customer buys time, and you can see exactly what happened.',
      primary: 'Create your workspace', secondary: 'Log in',
      rails: 'Tanzanian mobile-money methods supported in the platform:',
    },
    demo: {
      caption: 'Try the customer journey. This is a demo with sample data; nothing is charged.',
      badge: 'Demo', business: 'Lakeview Hostel Wi-Fi', pickTitle: 'Choose a package', continue: 'Continue', methodTitle: 'Pay with', phoneLabel: 'Mobile number', phoneHint: 'Sample number',
      pay: 'Pay {amount}', waitTitle: 'Approve on your phone', waitBody: 'Enter your PIN when the prompt appears.',
      onlineTitle: 'You are online', onlineBody: '{pkg} is active. Enjoy your connection.', again: 'Start over', back: 'Back',
      operator: 'Operator view', operatorHint: 'What you would see', empty: 'Nothing yet. Complete a purchase on the phone.', pending: 'Waiting', received: 'Received', done: 'Done',
      granted: 'Access granted: {pkg}', requested: 'Payment requested: {amount} via {via}', receivedLine: 'Payment received: {amount} via {via}',
      session: 'Session', stepLabel: 'Step {n} of {of}',
      packages: [{ name: 'One hour', time: '1 hour', price: 1000 }, { name: 'Day pass', time: '24 hours', price: 3000 }, { name: 'Week', time: '7 days', price: 15000 }],
      methods: ['M-Pesa', 'Mixx by Yas', 'Airtel Money', 'HaloPesa'],
    },
    problem: {
      h2: 'Running hotspots by hand stops working at your second site.',
      before: 'By hand', after: 'With Jaslyn Net',
      rows: [
        ['Every router is configured from scratch, one at a time.', 'Routers connect through RADIUS or a vendor adapter, and you manage them from one workspace.'],
        ['Paper vouchers leave no record of what was sold or used.', 'Vouchers and packages are issued, redeemed and expired in the system, with a history.'],
        ['Payments are checked against a phone screen.', 'Each payment is matched to a purchase before access is granted.'],
        ['You learn about an outage from a customer.', 'Router status and incidents are tracked, so you see problems first.'],
      ],
    },
    how: {
      h2: 'From a new workspace to a paying customer',
      lead: 'The order matters, so here it is.',
      steps: [
        ['Create your workspace', 'Register your business. Your data is kept separate from every other operator.'],
        ['Connect your routers', 'Use a supported vendor adapter, or any device that can talk RADIUS.'],
        ['Set packages and payment methods', 'Choose prices and durations, and the payment methods your customers use.'],
        ['Customers buy or redeem', 'They pick a package or enter a voucher. You follow payments, sessions and incidents.'],
      ],
    },
    features: {
      h2: 'What you get',
      lead: 'Everything below exists in the product today. Ask us about anything not listed.',
      items: [
        ['Packages and vouchers', 'Set prices and durations, issue prepaid codes, and let customers redeem them on the portal.'],
        ['A captive portal with your name on it', 'Customers see your business, your welcome text and your support contact.'],
        ['Payments you can check', 'Payments are verified and matched to purchases. Refunds and reconciliation leave a trail.'],
        ['Sessions and access control', 'See who is online, apply access policy, and disconnect a session when you need to.'],
        ['Many router brands', 'Adapters for common vendors, plus standard RADIUS for the rest.'],
        ['Router health and incidents', 'Offline routers and service problems are recorded so you can act on them.'],
        ['Several sites, one account', 'Manage locations, routers and staff from a single workspace.'],
        ['Roles and an audit trail', 'Give staff the access they need. Changes are written to a tamper-evident audit log.'],
      ],
    },
    hardware: {
      h2: 'Use the routers you already have.',
      lead: 'Adapters are available for these brands. How much each one can do differs by vendor and model.',
      vendorsLabel: 'Vendor adapters', radiusLabel: 'Anything else', radiusBody: 'Any device that supports RADIUS can authenticate customers against your packages.',
      caveat: 'Support varies by vendor and model. Confirm compatibility before planning a production cutover.', link: 'Read the integration details',
    },
    payments: {
      h2: 'Payments you can check.',
      lead: 'Jaslyn Net does not take customers’ word for it. A payment has to match a purchase before access changes.',
      methodsLabel: 'Tanzanian mobile-money methods',
      flow: [
        ['A purchase is created', 'The customer picks a package and a payment method.'],
        ['The payment arrives', 'A signed notification from your payment provider, or a confirmation by your staff.'],
        ['It is matched and recorded', 'The amount, method and purchase are checked together.'],
        ['Access is granted', 'Only after the payment is confirmed. Failed payments grant nothing.'],
      ],
      note: 'Which payment provider you connect is configured per workspace.',
    },
    pricing: {
      h2: 'Pricing',
      empty: 'Plan prices are not listed on this page.',
      emptyBody: 'Current plans are shown inside your workspace, under Platform subscription.',
      cta: 'Create a workspace to see plans', per: 'per',
    },
    faq: {
      h2: 'Questions operators ask',
      items: [
        ['What do I need to get started?', 'A router that works with one of the adapters or supports RADIUS, and the payment methods you want to offer. You can start with vouchers and add online payments later.'],
        ['Which routers are supported?', 'Adapters exist for the brands listed above, and any RADIUS-capable device can authenticate customers. Capability differs by vendor and model, so check before you buy hardware.'],
        ['Can I sell vouchers without online payments?', 'Yes. Issue prepaid codes and let customers redeem them on your portal.'],
        ['How are payments confirmed?', 'A signed notification from your payment provider, or a confirmation by your staff. Either way the payment is matched to a purchase before access is granted.'],
        ['What happens when a payment fails?', 'The failure is recorded and no access is granted. Refunds are recorded too.'],
        ['Is my data separate from other operators?', 'Yes. Each workspace is its own tenant, and important actions are recorded in an audit log.'],
      ],
      more: 'More questions',
    },
    cta: { h2: 'Set up your first site.', body: 'Create a workspace, connect a router and publish a package.', primary: 'Create your workspace', secondary: 'Read the FAQ' },
    footer: {
      tagline: 'Wi-Fi billing and network operations.',
      links: [['/platform', 'Platform'], ['/architecture', 'How it works'], ['/integrations', 'Integrations'], ['/faq', 'FAQ'], ['/legal', 'Legal']],
      legal: 'Illustrations on this page use sample data.',
    },
  },

  sw: {
    htmlLang: 'sw',
    meta: {
      title: 'Jaslyn Net — Uza Wi-Fi kwa saa na uone kila malipo',
      description: 'Jaslyn Net inaunganisha vifurushi vya Wi-Fi, malipo ya pesa za simu, vocha na router kwa waendeshaji wa hotspot na ISP. Ona jinsi manunuzi ya mteja yanavyofika kwenye daftari lako.',
    },
    nav: { how: 'Jinsi inavyofanya kazi', features: 'Unachopata', hardware: 'Router', payments: 'Malipo', pricing: 'Bei', faq: 'Maswali', login: 'Ingia', start: 'Fungua akaunti', menu: 'Fungua menyu', close: 'Funga menyu', switchTo: 'English', skip: 'Ruka hadi maudhui' },
    hero: {
      h1: 'Uza Wi-Fi kwa saa. Ona kila shilingi.',
      lead: 'Jaslyn Net inaunganisha vifurushi, malipo ya pesa za simu na router zako kuwa mfumo mmoja. Mteja ananunua muda, nawe unaona kila kilichotokea.',
      primary: 'Fungua akaunti yako', secondary: 'Ingia',
      rails: 'Njia za malipo ya pesa za simu za Tanzania zinazotumika kwenye jukwaa:',
    },
    demo: {
      caption: 'Jaribu safari ya mteja. Huu ni mfano wenye data ya majaribio; hakuna kinachokatwa.',
      badge: 'Mfano', business: 'Lakeview Hostel Wi-Fi', pickTitle: 'Chagua kifurushi', continue: 'Endelea', methodTitle: 'Lipa kwa', phoneLabel: 'Namba ya simu', phoneHint: 'Namba ya mfano',
      pay: 'Lipa {amount}', waitTitle: 'Idhinisha kwenye simu yako', waitBody: 'Weka PIN yako ombi likitokea.',
      onlineTitle: 'Umeunganishwa', onlineBody: '{pkg} imewashwa. Furahia mtandao.', again: 'Anza upya', back: 'Rudi',
      operator: 'Mtazamo wa mwendeshaji', operatorHint: 'Utakachoona wewe', empty: 'Bado hakuna kitu. Kamilisha manunuzi kwenye simu.', pending: 'Inasubiri', received: 'Imepokelewa', done: 'Imekamilika',
      granted: 'Ufikiaji umetolewa: {pkg}', requested: 'Ombi la malipo: {amount} kupitia {via}', receivedLine: 'Malipo yamepokelewa: {amount} kupitia {via}',
      session: 'Kipindi', stepLabel: 'Hatua {n} kati ya {of}',
      packages: [{ name: 'Saa moja', time: 'saa 1', price: 1000 }, { name: 'Siku nzima', time: 'saa 24', price: 3000 }, { name: 'Wiki', time: 'siku 7', price: 15000 }],
      methods: ['M-Pesa', 'Mixx by Yas', 'Airtel Money', 'HaloPesa'],
    },
    problem: {
      h2: 'Kuendesha hotspot kwa mkono hakufai ukifika eneo la pili.',
      before: 'Kwa mkono', after: 'Na Jaslyn Net',
      rows: [
        ['Kila router inawekwa mipangilio kuanzia mwanzo, moja baada ya nyingine.', 'Router zinaunganishwa kwa RADIUS au adapta ya mtengenezaji, na unazisimamia kutoka sehemu moja.'],
        ['Vocha za karatasi hazibaki na kumbukumbu ya kilichouzwa au kutumika.', 'Vocha na vifurushi vinatolewa, vinakombolewa na kuisha ndani ya mfumo, vikiwa na historia.'],
        ['Malipo yanakaguliwa kwa kuangalia skrini ya simu.', 'Kila malipo yanalinganishwa na manunuzi kabla ufikiaji haujatolewa.'],
        ['Unapata habari ya hitilafu kutoka kwa mteja.', 'Hali ya router na matukio ya hitilafu yanafuatiliwa, kwa hiyo unaona tatizo kwanza.'],
      ],
    },
    how: {
      h2: 'Kutoka akaunti mpya hadi mteja anayelipa',
      lead: 'Mpangilio ni muhimu, kwa hiyo huu hapa.',
      steps: [
        ['Fungua akaunti yako', 'Sajili biashara yako. Data yako inatenganishwa na ya waendeshaji wengine wote.'],
        ['Unganisha router zako', 'Tumia adapta ya mtengenezaji inayoungwa mkono, au kifaa chochote kinachoweza kutumia RADIUS.'],
        ['Weka vifurushi na njia za malipo', 'Chagua bei na muda, na njia za malipo wanazotumia wateja wako.'],
        ['Wateja wananunua au wanakomboa', 'Wanachagua kifurushi au wanaingiza vocha. Wewe unafuatilia malipo, vipindi na hitilafu.'],
      ],
    },
    features: {
      h2: 'Unachopata',
      lead: 'Kila kitu hapa chini kipo kwenye bidhaa leo. Tuulize kuhusu chochote kisichoorodheshwa.',
      items: [
        ['Vifurushi na vocha', 'Weka bei na muda, toa misimbo ya malipo ya awali, na wateja wakomboe kwenye portal.'],
        ['Captive portal yenye jina lako', 'Wateja wanaona biashara yako, ujumbe wako wa kukaribisha na mawasiliano ya msaada.'],
        ['Malipo unayoweza kuyakagua', 'Malipo yanathibitishwa na kulinganishwa na manunuzi. Marejesho na ulinganisho vinaacha kumbukumbu.'],
        ['Vipindi na udhibiti wa ufikiaji', 'Ona nani yupo mtandaoni, weka sera za ufikiaji, na ukate kipindi unapohitaji.'],
        ['Chapa nyingi za router', 'Adapta za watengenezaji wa kawaida, pamoja na RADIUS ya kawaida kwa wengine.'],
        ['Afya ya router na hitilafu', 'Router zisizo mtandaoni na matatizo ya huduma yanarekodiwa ili uchukue hatua.'],
        ['Maeneo mengi, akaunti moja', 'Simamia maeneo, router na wafanyakazi kutoka sehemu moja.'],
        ['Majukumu na kumbukumbu ya ukaguzi', 'Wape wafanyakazi ufikiaji wanaohitaji. Mabadiliko yanaandikwa kwenye kumbukumbu isiyoweza kuchezewa.'],
      ],
    },
    hardware: {
      h2: 'Tumia router ulizonazo tayari.',
      lead: 'Adapta zipo kwa chapa hizi. Kiwango cha uwezo kinatofautiana kwa mtengenezaji na modeli.',
      vendorsLabel: 'Adapta za watengenezaji', radiusLabel: 'Nyingine yoyote', radiusBody: 'Kifaa chochote kinachounga mkono RADIUS kinaweza kuthibitisha wateja dhidi ya vifurushi vyako.',
      caveat: 'Uungaji mkono unatofautiana kwa mtengenezaji na modeli. Thibitisha uoanifu kabla ya kupanga kuhamia uzalishaji.', link: 'Soma maelezo ya miunganisho',
    },
    payments: {
      h2: 'Malipo unayoweza kuyakagua.',
      lead: 'Jaslyn Net haikubali neno la mteja tu. Malipo lazima yalingane na manunuzi kabla ufikiaji haujabadilika.',
      methodsLabel: 'Njia za pesa za simu za Tanzania',
      flow: [
        ['Manunuzi yanaundwa', 'Mteja anachagua kifurushi na njia ya malipo.'],
        ['Malipo yanafika', 'Arifa iliyosainiwa kutoka kwa mtoa huduma wako wa malipo, au uthibitisho wa wafanyakazi wako.'],
        ['Yanalinganishwa na kurekodiwa', 'Kiasi, njia na manunuzi vinakaguliwa pamoja.'],
        ['Ufikiaji unatolewa', 'Baada ya malipo kuthibitishwa tu. Malipo yaliyoshindwa hayatoi kitu.'],
      ],
      note: 'Mtoa huduma wa malipo unayemunganisha huwekwa kwa kila akaunti.',
    },
    pricing: {
      h2: 'Bei',
      empty: 'Bei za mipango hazijaorodheshwa kwenye ukurasa huu.',
      emptyBody: 'Mipango ya sasa inaonekana ndani ya akaunti yako, chini ya Usajili wa jukwaa.',
      cta: 'Fungua akaunti uone mipango', per: 'kwa',
    },
    faq: {
      h2: 'Maswali ambayo waendeshaji huuliza',
      items: [
        ['Ninahitaji nini ili kuanza?', 'Router inayofanya kazi na moja ya adapta au inayounga mkono RADIUS, na njia za malipo unazotaka kutoa. Unaweza kuanza na vocha na kuongeza malipo ya mtandaoni baadaye.'],
        ['Router zipi zinaungwa mkono?', 'Adapta zipo kwa chapa zilizoorodheshwa hapo juu, na kifaa chochote chenye RADIUS kinaweza kuthibitisha wateja. Uwezo unatofautiana kwa mtengenezaji na modeli, kwa hiyo angalia kabla ya kununua vifaa.'],
        ['Naweza kuuza vocha bila malipo ya mtandaoni?', 'Ndiyo. Toa misimbo ya malipo ya awali na wateja wakomboe kwenye portal yako.'],
        ['Malipo yanathibitishwaje?', 'Kwa arifa iliyosainiwa kutoka kwa mtoa huduma wako wa malipo, au uthibitisho wa wafanyakazi wako. Vyovyote, malipo yanalinganishwa na manunuzi kabla ufikiaji haujatolewa.'],
        ['Nini kinatokea malipo yakishindwa?', 'Kushindwa kunarekodiwa na hakuna ufikiaji unaotolewa. Marejesho pia yanarekodiwa.'],
        ['Data yangu imetenganishwa na ya waendeshaji wengine?', 'Ndiyo. Kila akaunti ni tenanti yake, na vitendo muhimu vinarekodiwa kwenye kumbukumbu ya ukaguzi.'],
      ],
      more: 'Maswali zaidi',
    },
    cta: { h2: 'Anzisha eneo lako la kwanza.', body: 'Fungua akaunti, unganisha router na uchapishe kifurushi.', primary: 'Fungua akaunti yako', secondary: 'Soma maswali' },
    footer: {
      tagline: 'Bili za Wi-Fi na uendeshaji wa mtandao.',
      links: [['/platform', 'Jukwaa'], ['/architecture', 'Jinsi inavyofanya kazi'], ['/integrations', 'Miunganisho'], ['/faq', 'Maswali'], ['/legal', 'Sheria']],
      legal: 'Michoro kwenye ukurasa huu inatumia data ya mfano.',
    },
  },
};
