import { createFileRoute } from "@tanstack/react-router";
import { Navbar } from "@/components/landing/navbar";
import { Hero } from "@/components/landing/hero";
import { ProblemSolution, Pillars } from "@/components/landing/capabilities";
import { ProductExperience, HotspotPppoe, Compatibility, Payments } from "@/components/landing/product";
import { UseCases, Onboarding, Security } from "@/components/landing/solutions";
import { Pricing, Faq } from "@/components/landing/pricing";
import { FinalCta, Footer } from "@/components/landing/footer";

const pageTitle = "Jaslyn Net — The Operating Platform for Internet Businesses";
const pageDescription = "Run subscriber billing, hotspot and PPPoE access, network operations, router management, payments and service enforcement from one connected platform.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: pageTitle },
      { name: "description", content: pageDescription },
      { property: "og:title", content: pageTitle },
      { property: "og:description", content: pageDescription },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: pageTitle },
      { name: "twitter:description", content: pageDescription },
      { name: "theme-color", content: "#101820" },
    ],
    links: [{ rel: "canonical", href: "/" }],
    scripts: [{ type: "application/ld+json", children: JSON.stringify({ "@context": "https://schema.org", "@type": "Organization", name: "Jaslyn Net", description: pageDescription, brand: { "@type": "Brand", name: "Jaslyn Net" } }) }],
  }),
  component: Index,
});

function Index() {
  return <div id="top" className="min-h-screen overflow-x-hidden bg-background text-foreground"><a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground">Skip to content</a><Navbar /><main id="main"><Hero /><ProblemSolution /><Pillars /><ProductExperience /><HotspotPppoe /><Compatibility /><Payments /><UseCases /><Onboarding /><Security /><Pricing /><Faq /><FinalCta /></main><Footer /></div>;
}
