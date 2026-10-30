import { createFileRoute } from "@tanstack/react-router";
import { Navbar } from "@/components/landing/navbar";
import { Hero } from "@/components/landing/hero";
import { ProblemSolution, Pillars } from "@/components/landing/capabilities";
import { ProductExperience, HotspotPppoe, Compatibility, Payments } from "@/components/landing/product";
import { UseCases, Onboarding, Security } from "@/components/landing/solutions";
import { Pricing, Faq } from "@/components/landing/pricing";
import { FinalCta, Footer } from "@/components/landing/footer";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NEXORA — The Operating System for Modern WiFi Businesses" },
      { name: "description", content: "NEXORA unifies WiFi billing, hotspot & PPPoE access, router management, payments, and analytics in one platform for ISPs, venues, and operators." },
      { property: "og:title", content: "NEXORA — The Operating System for Modern WiFi Businesses" },
      { property: "og:description", content: "WiFi billing, hotspot & PPPoE access, router management, direct-settlement payments, and network intelligence — in one console." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "NEXORA — The Operating System for Modern WiFi Businesses" },
      { name: "twitter:description", content: "WiFi billing, hotspot & PPPoE access, router management, direct-settlement payments, and network intelligence — in one console." },
    ],
    links: [{ rel: "canonical", href: "/" }],
    scripts: [{ type: "application/ld+json", children: JSON.stringify({ "@context": "https://schema.org", "@type": "Organization", name: "NEXORA", description: "NEXORA is a WiFi billing and network operations platform for ISPs, WISPs, venues, campuses, and managed network operators.", brand: { "@type": "Brand", name: "NEXORA" } }) }],
  }),
  component: Index,
});

function Index() {
  return <div className="min-h-screen overflow-x-hidden bg-background text-foreground"><a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground">Skip to content</a><Navbar /><main id="main"><Hero /><ProblemSolution /><Pillars /><ProductExperience /><HotspotPppoe /><Compatibility /><Payments /><UseCases /><Onboarding /><Security /><Pricing /><Faq /><FinalCta /></main><Footer /></div>;
}