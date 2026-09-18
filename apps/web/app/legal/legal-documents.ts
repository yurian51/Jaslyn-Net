export type LegalSection = {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
};

export type LegalDocument = {
  slug: string;
  title: string;
  shortTitle: string;
  summary: string;
  effectiveDate: string;
  sections: LegalSection[];
};

export const LEGAL_EFFECTIVE_DATE = '18 September 2026';

export const legalDocuments: LegalDocument[] = [
  {
    slug: 'terms',
    title: 'Terms of Use and Service Agreement',
    shortTitle: 'Terms of Use',
    summary: 'The contract governing access to and use of JASLYN NET by customers, operators, administrators and authorized users.',
    effectiveDate: LEGAL_EFFECTIVE_DATE,
    sections: [
      { title: '1. Contract and acceptance', paragraphs: [
        'These Terms of Use and Service Agreement (Terms) form a legally binding agreement between you and YURIAN TECH LTD (Company) concerning your access to and use of JASLYN NET, a connectivity and ISP operations platform (Service). By creating an account, accepting these Terms, purchasing a Service plan, connecting a router or otherwise using the Service, you confirm that you have read and accepted these Terms and have authority to bind the organization you represent.',
        'If you use the Service on behalf of a company, school, ISP, hotspot operator, reseller or other organization, references to “you” include that organization and you represent that you have authority to accept these Terms for it. If you do not have that authority, do not use the Service.',
        'These Terms must be read together with the Privacy Notice, Cookie Policy, Acceptable Use and Network Operations Policy, Billing and Refund Policy, Security Policy, SLA where applicable, and any signed order form or service-specific agreement. Where a signed agreement expressly conflicts with these Terms, the signed agreement controls for that specific conflict.'
      ]},
      { title: '2. Service scope', paragraphs: [
        'JASLYN NET provides software for network operations, ISP and WiFi administration, customer management, plans and products, vouchers, sessions, payments and reconciliation, reporting, router management, network policies, audit records and related operational functions that are actually enabled for your account.',
        'The Service is a control-plane product. It may communicate with routers, RADIUS infrastructure, payment providers, messaging providers, hosting infrastructure and other systems selected or configured by you. The Service does not guarantee the availability, configuration, security or performance of third-party infrastructure that it does not control.',
        'Features may differ by subscription, organization, region, technical integration and supported vendor. Documentation or an interface label must not be interpreted as a promise that an unsupported vendor or feature is automatically operational.'
      ]},
      { title: '3. Eligibility and authority', paragraphs: [
        'You must be legally capable of entering a binding contract and must provide accurate registration and billing information. Where local law imposes a minimum age for independent contracting, you must meet that requirement. Users under the applicable age may only use the Service through an organization and authorized adult or administrator where lawful.',
        'You must maintain authority over every router, network, customer record, payment account, domain, IP address, credential and integration that you connect to the Service. You must not connect equipment or data belonging to another person without lawful authorization.'
      ]},
      { title: '4. Accounts, credentials and tenant security', paragraphs: [
        'You are responsible for safeguarding account credentials, API keys, router credentials, recovery mechanisms and other authentication factors issued to or configured by you. You must use unique credentials, enable available multi-factor authentication, restrict administrative access, and promptly remove access for personnel who leave or no longer require it.',
        'You must immediately notify the Company through the designated security or support channel if you suspect unauthorized access, credential compromise, payment fraud, data exposure or unauthorized router changes. You remain responsible for activity performed through credentials under your control unless the Company caused the compromise through its own breach or negligence as determined under applicable law.'
      ]},
      { title: '5. Customer data and instructions', paragraphs: [
        'You retain ownership of customer information, network records and other content that you submit to the Service, subject to the rights necessary for the Company to operate the Service. You authorize the Company to host, process, transmit, back up and otherwise handle that data only as reasonably necessary to provide, secure, maintain and improve the Service and to comply with law.',
        'You are responsible for ensuring that your collection and use of end-user information is lawful and that you have an appropriate privacy notice, lawful basis, consent where required, customer terms and operational procedures. If you use JASLYN NET to operate an ISP or public WiFi service, you remain responsible for notices and obligations owed directly to your subscribers and users.'
      ]},
      { title: '6. Network and router operations', paragraphs: [
        'Network automation can change routing, firewall, hotspot, address-list, authentication or other device state. You authorize only the operations that your administrators configure or approve through the Service. You must maintain an out-of-band management method and a safe recovery path for critical infrastructure.',
        'The Company does not guarantee that a router, firmware version, third-party API or network topology will behave as expected. Automated actions are subject to vendor capabilities, credentials, connectivity, permissions, configuration and safety controls. Where the interface states that an operation was “verified”, that means the configured adapter obtained the relevant confirmation from the connected system; it does not mean that the entire network is free of faults.'
      ]},
      { title: '7. Payments and third-party services', paragraphs: [
        'Where the Service supports payments, payment processing may be performed by licensed or otherwise applicable third-party payment service providers. JASLYN NET does not become the issuer of electronic money merely because it displays a transaction status. Fees, settlement timing, reversals, chargebacks, taxes and provider-specific requirements may be governed by the applicable payment provider.',
        'You must not use payment integrations to facilitate fraud, money laundering, unauthorized collection, sanctions evasion or other unlawful activity. Transaction records may be retained for accounting, dispute, security and legal purposes.'
      ]},
      { title: '8. Intellectual property', paragraphs: [
        'The Service, software, interfaces, trademarks, documentation, visual design, code, databases, workflows and Company-created materials are owned by or licensed to the Company and are protected by applicable intellectual property law. Except for the limited right to use the Service under these Terms, no ownership is transferred to you.',
        'You may not copy, reverse engineer, decompile, circumvent technical restrictions, resell the software as a competing product, remove proprietary notices, or use the Service to develop a substantially similar service except where applicable law expressly permits such activity.'
      ]},
      { title: '9. Prohibited conduct', bullets: [
        'Unauthorized access to accounts, routers, networks, systems or data.',
        'Interception, disruption, scanning, exploitation, credential theft, malware deployment or denial-of-service activity without explicit authorization.',
        'Use of the Service to violate privacy, telecommunications, consumer protection, intellectual property, payment, sanctions, tax or other applicable laws.',
        'Submission of malicious code, unlawful content, stolen credentials, intentionally false identity information or data that you have no right to process.',
        'Circumventing billing, quotas, access controls, rate limits, security controls or network policies.',
        'Using automation in a way that creates an unreasonable risk to connected infrastructure or third parties.'
      ]},
      { title: '10. Suspension and termination', paragraphs: [
        'The Company may restrict or suspend access where reasonably necessary to prevent security harm, comply with law, respond to abuse, protect the Service or address material non-payment. Where practicable, the Company will provide notice and an opportunity to cure before suspension for non-security contractual breaches.',
        'You may stop using the Service at any time. Cancellation does not automatically erase transaction, audit, security or legally required records. Financial obligations incurred before termination remain payable. Data export and deletion are governed by the applicable plan, agreement and Privacy Notice.'
      ]},
      { title: '11. Availability, warranties and liability', paragraphs: [
        'Except where a written SLA or mandatory law provides otherwise, the Service is provided on an “as available” basis. The Company does not warrant uninterrupted operation, error-free software, continuous third-party connectivity, specific business results, network capacity or compatibility with every device or provider.',
        'To the maximum extent permitted by law, the Company is not liable for indirect, incidental, special, consequential or punitive loss, loss of anticipated profits, loss caused by third-party infrastructure, or loss arising from your unlawful or unauthorized use of the Service. Nothing in these Terms excludes liability that cannot lawfully be excluded or limited.',
        'Where liability may lawfully be limited, the aggregate contractual liability of the Company for a claim arising from the Service will not exceed the fees actually paid by the affected customer for the Service during the twelve months immediately preceding the event giving rise to the claim, unless a different cap is required by a signed agreement or mandatory law.'
      ]},
      { title: '12. Indemnity', paragraphs: [
        'To the extent permitted by law, you will defend and indemnify the Company against third-party claims, losses and reasonable costs arising from your unlawful content, unauthorized network access, violation of these Terms, infringement of another person’s rights, or use of the Service in breach of applicable law. This obligation does not apply to the extent a claim was caused by the Company’s own unlawful conduct or a matter for which the Company is legally responsible.'
      ]},
      { title: '13. Governing law and disputes', paragraphs: [
        'These Terms are governed by the laws applicable in the United Republic of Tanzania, subject to any mandatory law that applies to the customer or transaction. The parties will first attempt in good faith to resolve a dispute through written notice and escalation to authorized representatives. If unresolved, the dispute may be submitted to a court or other competent forum having jurisdiction under applicable Tanzanian law.',
        'Nothing in this section prevents a party from seeking urgent interim relief where necessary to protect confidential information, security, intellectual property or critical infrastructure.'
      ]},
      { title: '14. Changes', paragraphs: [
        'The Company may update these Terms to reflect changes in the Service, law, security requirements or business operations. Material changes will be communicated through the Service or another reasonable channel. Continued use after the effective date of an updated version constitutes acceptance to the extent permitted by law.'
      ]},
      { title: '15. Compliance framework', paragraphs: [
        'Depending on the Service, transaction and location, JASLYN NET operations may be subject to applicable Tanzanian laws and regulatory requirements concerning personal data protection, electronic transactions, cybercrime, payments, consumer protection, telecommunications and intellectual property. Relevant instruments include the Personal Data Protection Act, 2022, the Electronic Transactions Act, the Cybercrimes Act, the National Payment Systems Act and other laws or regulations applicable to the particular activity.',
        'The Company does not represent that one policy alone satisfies every legal obligation of a customer operating an ISP, hotspot or telecommunications-related business. Customers remain responsible for obtaining the licences, registrations, permits and regulatory approvals applicable to their own services.'
      ]},
      { title: '16. Legal contact', paragraphs: [
        'The contracting entity is YURIAN TECH LTD. Formal legal notices should be submitted through the official JASLYN NET support or legal contact channel made available in the Service and should identify the organization, account, subject matter and requested action. The Company may require identity and authority verification before processing a legal request.'
      ]}
    ]
  },
  {
    slug: 'privacy',
    title: 'Privacy Notice and Personal Data Protection Policy',
    shortTitle: 'Privacy Notice',
    summary: 'How JASLYN NET collects, uses, protects, retains and discloses personal data.',
    effectiveDate: LEGAL_EFFECTIVE_DATE,
    sections: [
      { title: '1. Scope and controller roles', paragraphs: [
        'This Privacy Notice explains how YURIAN TECH LTD processes personal data in connection with JASLYN NET. Depending on the activity, the Company may act as a data controller for account, billing, security and support information, or as a data processor/service provider when an organization uses JASLYN NET to process its customers’ data under that organization’s instructions.',
        'Where you operate an ISP, hotspot, school, business or other organization through JASLYN NET, that organization is generally responsible for deciding why its end-user data is collected and how it is used. The Company processes such customer data primarily to provide the contracted Service and according to the organization’s instructions.'
      ]},
      { title: '2. Data we may collect', bullets: [
        'Identity and account data: name, username, organization, role, contact details and authentication metadata.',
        'Customer and service data entered by an operator, including subscriber identifiers, package, service status, account balance and operational notes.',
        'Network and device data, including IP addresses, MAC addresses, router identifiers, session times, traffic counters, device information and connectivity events where the enabled feature requires them.',
        'Payment and transaction data, including transaction identifiers, amounts, currency, status, timestamps, provider references and reconciliation information. Full payment card or mobile-money credentials are generally handled by the relevant payment provider rather than stored by JASLYN NET unless expressly stated.',
        'Security and audit data, including login events, administrator actions, API requests, security events, approximate location derived from network data where necessary, and system logs.',
        'Technical data such as browser, operating system, application version, diagnostic information and cookie identifiers where enabled.'
      ]},
      { title: '3. Purposes and lawful processing', paragraphs: [
        'We process personal data for account administration, authentication, tenant isolation, network operations, customer support, billing and reconciliation, fraud prevention, security monitoring, auditability, incident response, service analytics, product reliability and compliance with legal obligations.',
        'We use the minimum information reasonably necessary for the relevant purpose. Where consent is the appropriate legal basis, we will request it and provide a practical mechanism for withdrawal. Withdrawal of consent does not invalidate processing that was already lawful on another applicable basis or processing required by law or contract.'
      ]},
      { title: '4. Customer and network data', paragraphs: [
        'Network operators may use JASLYN NET to process highly operational information. This can include subscriber identifiers, authentication records, session history, IP allocation, device identifiers, bandwidth or usage measurements and service status. Operators must provide their own lawful notices to subscribers and configure retention and access according to their obligations.',
        'We do not sell personal data. We do not use customer network data for unrelated advertising purposes merely because it is available to the platform.'
      ]},
      { title: '5. Sharing and disclosures', bullets: [
        'Infrastructure and hosting providers that process information on our behalf under contractual safeguards.',
        'Payment providers where a payment or reconciliation requires their participation.',
        'Network, messaging, email, SMS, RADIUS or other integrations expressly configured by the customer.',
        'Professional advisers, auditors, insurers or corporate transaction parties where reasonably necessary and subject to confidentiality obligations.',
        'Authorities, regulators, courts or law-enforcement bodies where disclosure is required or legally authorized.',
        'Other parties with the customer’s or data subject’s lawful instruction or consent where applicable.'
      ]},
      { title: '6. International transfers', paragraphs: [
        'JASLYN NET may use infrastructure or service providers located outside the data subject’s country. Where personal data is transferred across borders, the Company will apply the safeguards required by applicable data protection law, including appropriate contractual, technical or regulatory measures where required.',
        'The Company will not intentionally transfer personal data merely to avoid applicable privacy obligations.'
      ]},
      { title: '7. Security', paragraphs: [
        'We use technical and organizational safeguards appropriate to the risk, including access control, tenant isolation, authentication, encryption in transit, protected secret storage, audit logging, rate limiting, secure development practices, backup controls and restricted administrative access. No Internet service can guarantee absolute security, so customers must also secure their credentials, devices, integrations and administrator accounts.'
      ]},
      { title: '8. Retention', paragraphs: [
        'Personal data is retained only for as long as reasonably necessary for the purpose for which it was collected, contractual operations, security, accounting, dispute resolution and legal obligations. Different records may have different retention periods. Security and financial records may need to remain available after account closure.',
        'When retention is no longer required, information will be securely deleted, anonymized or otherwise handled in accordance with applicable law and technical constraints.'
      ]},
      { title: '9. Data subject rights', bullets: [
        'Request access to personal data held about you.',
        'Request correction of inaccurate or incomplete information.',
        'Request deletion where the applicable legal conditions are satisfied.',
        'Request restriction of certain processing where provided by law.',
        'Object to direct marketing and certain processing where provided by law.',
        'Withdraw consent where processing is based on consent.',
        'Request information about automated decision-making where applicable.',
        'Lodge a complaint with the Personal Data Protection Commission (PDPC) or another competent authority.'
      ]},
      { title: '10. Requests and verification', paragraphs: [
        'Privacy requests must contain enough information for us to identify the requester and locate the relevant account or organization. We may request reasonable proof of identity or authority to prevent unauthorized disclosure. Where a request is submitted by an organization administrator, we may also verify that the administrator is authorized to act for that organization.',
        'Requests can be made through the official support or privacy channel exposed in JASLYN NET. We will respond within the period required by applicable law, subject to lawful extensions and identity verification.'
      ]},
      { title: '11. Children', paragraphs: [
        'JASLYN NET is primarily an operational business platform and is not designed as a direct-to-child consumer service. Customers must not use the Service to collect children’s personal data unless they have a lawful basis, appropriate safeguards and any required parental or guardian authorization.'
      ]},
      { title: '12. Breach response', paragraphs: [
        'If the Company determines that a personal data incident has occurred, it will investigate, contain, document and remediate the incident and make notifications required by applicable law. Customers must promptly report suspected breaches involving their accounts or data so that coordinated response can begin.'
      ]},
      { title: '13. Regulatory framework', paragraphs: [
        'For Tanzania-related processing, this Notice is designed with reference to the Personal Data Protection Act, 2022 and applicable regulations and guidance issued by the Personal Data Protection Commission. The Act establishes minimum requirements for collection and processing and recognizes rights and duties for data controllers, processors and data subjects.',
        'Nothing in this Notice removes a right or protection that cannot lawfully be excluded.'
      ]}
    ]
  },
  {
    slug: 'cookies',
    title: 'Cookie and Tracking Technologies Policy',
    shortTitle: 'Cookie Policy',
    summary: 'The technologies JASLYN NET uses to keep sessions secure, remember preferences and measure product reliability.',
    effectiveDate: LEGAL_EFFECTIVE_DATE,
    sections: [
      { title: '1. What cookies are', paragraphs: [
        'Cookies are small data files stored by a browser or application. Similar technologies include local storage, session storage, authentication tokens, pixels and server-side identifiers. JASLYN NET uses these technologies primarily for security, authentication, functionality and operational measurement.'
      ]},
      { title: '2. Categories', bullets: [
        'Strictly necessary: authentication, security, session management, load balancing and fraud prevention. These cannot normally be disabled without breaking core functionality.',
        'Functional: preferences and interface settings that improve usability.',
        'Analytics and diagnostics: aggregate or technical measurements used to understand reliability, performance, errors and feature usage.',
        'Marketing: if introduced in a future customer-facing experience, these will be separately disclosed and controlled where consent is required.'
      ]},
      { title: '3. Authentication tokens', paragraphs: [
        'JASLYN NET may use browser storage or cookies for authenticated sessions. These credentials are security-sensitive. You must not share browser profiles, access tokens or administrator devices with unauthorized users. Logout should be used on shared devices.'
      ]},
      { title: '4. Third-party technologies', paragraphs: [
        'An integration may set its own cookies or identifiers when you intentionally use a third-party service. Such technologies are governed by the third party’s privacy documentation. The Company does not control third-party cookies.'
      ]},
      { title: '5. Controls', paragraphs: [
        'You can restrict cookies through browser settings. Blocking strictly necessary storage may prevent login, security controls or other Service functions from working. Where consent is legally required for optional tracking, the Service will provide an appropriate choice mechanism.'
      ]}
    ]
  },
  {
    slug: 'acceptable-use',
    title: 'Acceptable Use and Network Operations Policy',
    shortTitle: 'Acceptable Use',
    summary: 'Operational rules for lawful, secure and responsible use of JASLYN NET and connected infrastructure.',
    effectiveDate: LEGAL_EFFECTIVE_DATE,
    sections: [
      { title: '1. Purpose', paragraphs: [
        'This Policy protects customers, subscribers, networks, third parties and the JASLYN NET platform from misuse. It applies to accounts, administrators, API clients, connected routers, integrations and automated jobs.'
      ]},
      { title: '2. Security prohibitions', bullets: [
        'Unauthorized access, credential attacks, privilege escalation or persistence on any system.',
        'Scanning, interception or exploitation of systems without authorization.',
        'Malware, ransomware, botnet control, cryptojacking, phishing infrastructure or malicious payload distribution.',
        'Denial-of-service or traffic amplification against third-party systems.',
        'Manipulation of router, RADIUS, payment or audit records to conceal activity or bypass controls.',
        'Circumvention of authentication, quotas, billing, rate limits or security controls.'
      ]},
      { title: '3. Network operator responsibilities', bullets: [
        'Obtain authorization for every connected router and network.',
        'Maintain accurate subscriber and service records.',
        'Apply lawful customer terms, privacy notices and acceptable-use rules to your own subscribers.',
        'Secure router management interfaces and avoid exposing administrative APIs directly to the public Internet unless properly protected.',
        'Keep firmware and integration credentials maintained and revoke obsolete access.',
        'Maintain emergency access and a recovery configuration before enabling automated routing or firewall changes.'
      ]},
      { title: '4. Automated operations', paragraphs: [
        'Automation may affect live infrastructure. Customers must test changes where feasible and define safe maintenance windows for high-risk operations. The Company may rate-limit, block or require confirmation for operations that create unusual risk.'
      ]},
      { title: '5. Enforcement', paragraphs: [
        'The Company may investigate suspected abuse, preserve relevant security evidence, restrict affected credentials or integrations, and cooperate with competent authorities where legally required. Where feasible, we will distinguish accidental misconfiguration from deliberate abuse and provide a remediation path.'
      ]}
    ]
  },
  {
    slug: 'billing-refunds',
    title: 'Billing, Cancellation and Refund Policy',
    shortTitle: 'Billing & Refunds',
    summary: 'Rules for subscriptions, charges, payment processing, cancellations, reversals and service credits.',
    effectiveDate: LEGAL_EFFECTIVE_DATE,
    sections: [
      { title: '1. Charges', paragraphs: [
        'Subscription prices, usage charges, setup charges and taxes are presented through the applicable order, pricing page or invoice. You authorize the selected payment method to be charged for amounts properly due under your order.'
      ]},
      { title: '2. Taxes and fees', paragraphs: [
        'Unless expressly stated otherwise, applicable taxes, statutory levies and payment-provider charges may be added to the amount payable. Customers are responsible for taxes imposed on their own business or transactions.'
      ]},
      { title: '3. Failed payments', paragraphs: [
        'A failed or reversed payment may cause restricted access after reasonable notice. The Company may retry a payment where authorized by the provider. Customers remain responsible for amounts validly due even if a payment attempt fails.'
      ]},
      { title: '4. Cancellation', paragraphs: [
        'You may request cancellation through the account or support process applicable to your plan. Unless a written order states otherwise, cancellation takes effect at the end of the current paid period and does not automatically refund unused time.'
      ]},
      { title: '5. Refunds', paragraphs: [
        'Refunds are considered where a duplicate charge, unauthorized Company error, material failure covered by a written commitment, or applicable mandatory consumer law requires one. Provider-side delays, bank reversals, customer misconfiguration, unused capacity, or third-party outages do not automatically create a refund right.',
        'Where a refund is approved, it may be returned through the original payment method or another lawful method selected by the payment provider. Processing times depend on the provider and financial institution.'
      ]},
      { title: '6. Chargebacks and disputes', paragraphs: [
        'Customers should contact the Company before initiating a chargeback when the issue concerns a Service invoice. Fraudulent or abusive chargebacks may result in suspension while the transaction is investigated. Nothing in this section limits mandatory rights available under applicable law.'
      ]},
      { title: '7. Service credits', paragraphs: [
        'If an SLA applies and a service-level failure qualifies for a credit, the credit is calculated according to that SLA. Service credits are not cash refunds unless the applicable agreement expressly says otherwise.'
      ]}
    ]
  },
  {
    slug: 'security',
    title: 'Information Security and Responsible Disclosure Policy',
    shortTitle: 'Security Policy',
    summary: 'Security controls, customer responsibilities, vulnerability reporting and coordinated incident response.',
    effectiveDate: LEGAL_EFFECTIVE_DATE,
    sections: [
      { title: '1. Security baseline', paragraphs: [
        'JASLYN NET is designed around tenant isolation, role-based access control, least privilege, audit logging, protected secrets, encrypted router credentials, controlled destructive actions, rate limiting and signed or authenticated integrations where supported.'
      ]},
      { title: '2. Customer security obligations', bullets: [
        'Use strong unique administrator credentials and available multi-factor authentication.',
        'Do not share API keys or router credentials through chat, tickets or source repositories.',
        'Restrict management access to trusted networks and approved administrators.',
        'Review audit records and revoke unused access.',
        'Report suspected compromise promptly.',
        'Maintain backups and recovery procedures for critical network configurations.'
      ]},
      { title: '3. Responsible disclosure', paragraphs: [
        'Security researchers are encouraged to report suspected vulnerabilities privately through the official security/support channel. Reports should include affected URL or component, reproducible steps, impact, timestamps, and a safe proof of concept where appropriate.',
        'Researchers must avoid accessing data that does not belong to them, destroying data, degrading availability, social engineering staff, or publicly disclosing an unpatched vulnerability before reasonable coordinated disclosure.'
      ]},
      { title: '4. Incident response', paragraphs: [
        'The Company may isolate accounts, rotate credentials, disable integrations, preserve evidence, deploy mitigations and communicate with affected customers or regulators as required. Incident communications will distinguish confirmed facts from ongoing investigation.'
      ]},
      { title: '5. No absolute guarantee', paragraphs: [
        'Security controls reduce risk but cannot eliminate all risk. Customers remain responsible for their own devices, networks, passwords, third-party integrations, subscriber endpoints and operational procedures.'
      ]}
    ]
  },
  {
    slug: 'dpa',
    title: 'Data Processing Addendum',
    shortTitle: 'Data Processing Addendum',
    summary: 'Processor terms for organizations that use JASLYN NET to process personal data of their customers, staff or end users.',
    effectiveDate: LEGAL_EFFECTIVE_DATE,
    sections: [
      { title: '1. Roles', paragraphs: [
        'For Customer Data processed through JASLYN NET on the customer’s instructions, the customer acts as the data controller or equivalent decision-maker and YURIAN TECH LTD acts as processor/service provider to the extent recognized by applicable law.'
      ]},
      { title: '2. Processing instructions', paragraphs: [
        'The Company will process Customer Data only to provide, secure, support and maintain the Service, comply with documented customer instructions that are lawful and technically feasible, and comply with legal obligations. The customer is responsible for the lawfulness of its instructions and the original collection of Customer Data.'
      ]},
      { title: '3. Confidentiality', paragraphs: [
        'Personnel and contractors authorized to process Customer Data must be subject to confidentiality obligations appropriate to their role.'
      ]},
      { title: '4. Security measures', bullets: [
        'Access control and role-based privileges.',
        'Tenant-level data isolation controls.',
        'Encryption in transit and protected secret storage.',
        'Audit logging and security monitoring.',
        'Backup and recovery controls appropriate to the Service.',
        'Vulnerability management and secure software development practices.'
      ]},
      { title: '5. Subprocessors', paragraphs: [
        'The Company may use infrastructure, hosting, payment, communications, monitoring and other subprocessors needed to operate the Service. Subprocessors receive only the access reasonably necessary for their function and are subject to contractual or equivalent confidentiality and security obligations. A current service-specific list may be provided through the Service or support channel.'
      ]},
      { title: '6. Data subject assistance', paragraphs: [
        'Taking into account the nature of processing, the Company will provide reasonable technical assistance for access, correction, deletion, restriction, export or other data subject requests that the customer is legally required to handle. The Company may charge reasonable costs for unusually extensive assistance where permitted by law and the applicable agreement.'
      ]},
      { title: '7. Security incidents', paragraphs: [
        'The Company will notify the customer of a confirmed personal-data security incident affecting Customer Data without undue delay after becoming aware of it, subject to legal restrictions and the need to protect the investigation. Notifications will contain available information about the nature of the incident, affected systems or data, mitigation and relevant next steps.'
      ]},
      { title: '8. International transfers', paragraphs: [
        'Where processing involves a transfer to another jurisdiction, the parties will use transfer mechanisms and safeguards required by applicable data protection law. The customer will not instruct the Company to make a transfer that is unlawful.'
      ]},
      { title: '9. Deletion and return', paragraphs: [
        'At the end of the applicable Service, the Company will delete or return Customer Data according to the customer’s lawful instructions and technical capabilities, except information that must be retained for legal, security, accounting, dispute or backup purposes. Backup copies may persist for a limited period before normal secure expiration.'
      ]},
      { title: '10. Audit and compliance evidence', paragraphs: [
        'The Company may provide reasonable information about its security practices to help customers assess compliance. On-site audits, penetration testing against production infrastructure and access to confidential security material require prior written authorization and must not create operational or security risk.'
      ]}
    ]
  },
  {
    slug: 'sla',
    title: 'Service Level Agreement',
    shortTitle: 'SLA',
    summary: 'Availability commitments, exclusions, incident classification and service-credit rules for plans that include an SLA.',
    effectiveDate: LEGAL_EFFECTIVE_DATE,
    sections: [
      { title: '1. Applicability', paragraphs: [
        'This SLA applies only where the customer’s order or subscription expressly states that an SLA is included. If no SLA is included, the availability language in the Terms applies.'
      ]},
      { title: '2. Service availability', paragraphs: [
        'For an SLA-covered production control plane, the monthly availability target is 99.5%, measured during the calendar month, excluding the events listed below. Availability concerns the Company-controlled Service and does not include the customer’s ISP link, router, LAN, power, RADIUS deployment, payment provider, DNS provider, Internet transit or other third-party dependency.'
      ]},
      { title: '3. Planned maintenance', paragraphs: [
        'Planned maintenance communicated through the Service is excluded from availability calculations. Emergency maintenance may also be excluded where reasonably necessary to prevent or respond to a material security or infrastructure incident.'
      ]},
      { title: '4. Exclusions', bullets: [
        'Customer configuration, credential, router or network failures.',
        'Third-party payment, DNS, hosting, telecommunications or API failures.',
        'Internet-wide routing failures outside Company-controlled infrastructure.',
        'Force majeure and events outside reasonable control.',
        'Abuse, denial-of-service or attacks that materially affect availability despite reasonable safeguards.',
        'Suspension permitted under the Terms or Acceptable Use Policy.',
        'Features or environments explicitly marked beta, experimental or unsupported.'
      ]},
      { title: '5. Incident severity', bullets: [
        'Critical: widespread loss of a core control-plane function or a confirmed security event requiring immediate containment.',
        'High: material degradation affecting a substantial operational function with no practical workaround.',
        'Normal: limited feature degradation with a workaround or non-critical impact.',
        'Informational: questions, requests and issues without material service impact.'
      ]},
      { title: '6. Service credits', paragraphs: [
        'Where a written order provides credits, the credit is calculated against the recurring Service fee for the affected month. Credits are the customer’s exclusive monetary remedy for an SLA availability failure to the maximum extent permitted by law, except where mandatory law provides otherwise.'
      ]},
      { title: '7. Claim procedure', paragraphs: [
        'A credit request must identify the affected account, dates, impact and relevant incident or ticket reference and should be submitted within thirty days after the end of the affected month. The Company will validate the measurement against its monitoring records.'
      ]}
    ]
  },
  {
    slug: 'third-parties',
    title: 'Third-Party Services and Subprocessors Notice',
    shortTitle: 'Third Parties',
    summary: 'How external providers participate in hosting, payments, messaging, network integrations and other Service functions.',
    effectiveDate: LEGAL_EFFECTIVE_DATE,
    sections: [
      { title: '1. Why third parties are used', paragraphs: [
        'JASLYN NET may depend on external infrastructure and specialist services to deliver hosting, databases, email, SMS, payments, monitoring, DNS, networking, identity, storage and other functions. The specific providers available to a customer depend on the deployment and integrations they activate.'
      ]},
      { title: '2. Customer-controlled integrations', paragraphs: [
        'When a customer connects its own router, payment account, RADIUS server, SMS provider or other third-party account, the customer authorizes the exchange of information necessary to perform that integration. The customer is responsible for reviewing the third party’s terms, privacy notice, security configuration and regulatory requirements.'
      ]},
      { title: '3. Provider changes', paragraphs: [
        'The Company may replace or add infrastructure providers when reasonably necessary for reliability, security, cost, performance or legal compliance. Material privacy impacts will be handled according to the Privacy Notice and applicable law.'
      ]},
      { title: '4. Third-party terms', paragraphs: [
        'A third party’s service may be governed by its own terms. JASLYN NET does not assume responsibility for a third party’s independent acts, outages, security failures or policy decisions, except where applicable law or a written agreement expressly makes the Company responsible.'
      ]}
    ]
  },
  {
    slug: 'ip-content',
    title: 'Intellectual Property, Content and Brand Use Policy',
    shortTitle: 'IP & Brand Policy',
    summary: 'Ownership, permitted use, customer content rights, infringement reporting and JASLYN NET brand restrictions.',
    effectiveDate: LEGAL_EFFECTIVE_DATE,
    sections: [
      { title: '1. Company intellectual property', paragraphs: [
        'JASLYN NET, JASLYN, related logos, interface design, software, documentation, service names and Company-created materials are protected intellectual property. Unauthorized copying, extraction, resale or confusingly similar branding is prohibited.'
      ]},
      { title: '2. Customer content', paragraphs: [
        'Customers retain rights in content and data they lawfully submit. By submitting content, the customer grants the Company the limited rights needed to host, process, transmit, back up and display it for Service operation, support, security and compliance.'
      ]},
      { title: '3. Feedback', paragraphs: [
        'If you voluntarily submit suggestions, ideas or product feedback, you grant the Company a non-exclusive right to use that feedback to improve the Service without creating an obligation to pay royalties, unless a separate written agreement states otherwise.'
      ]},
      { title: '4. Brand use', paragraphs: [
        'Customers may accurately identify JASLYN NET as the software they use, but may not imply that they own the JASLYN NET brand, are an authorized representative, or have a partnership or endorsement that does not exist. Logo assets must be used in their supplied form and must not be altered to create a misleading identity.'
      ]},
      { title: '5. Infringement notices', paragraphs: [
        'A rights holder who believes content made available through the Service infringes its rights should submit a written notice identifying the protected work, the allegedly infringing material, evidence of ownership or authority, contact details and the requested remedy. The Company may request additional information and may restrict content where legally justified.'
      ]}
    ]
  }
];

export const legalDocumentMap = new Map(legalDocuments.map((document) => [document.slug, document]));
