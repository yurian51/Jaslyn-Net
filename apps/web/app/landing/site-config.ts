/**
 * Facts the landing page must not invent. Fill these in when they are confirmed; the page adapts.
 * - plans: when empty, the pricing section says where to find current plans instead of showing numbers.
 * - contact: when null, no phone/WhatsApp/email is rendered.
 */
export interface PlanConfig { name: string; price: string; period: string; audience: string; includes: string[]; highlight?: boolean }
export interface ContactConfig { email?: string; whatsapp?: string }

export const PLANS: PlanConfig[] = [];
export const CONTACT: ContactConfig | null = null;
