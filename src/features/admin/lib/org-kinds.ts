import { FlaskConical, Landmark, type LucideIcon, Satellite, Ship } from 'lucide-react';

/** Icon of each organization kind (spec §13.1: shipping_company, authority, platform, research). */
export const KIND_ICONS: Record<string, LucideIcon> = {
  shipping_company: Ship,
  authority: Landmark,
  research: FlaskConical,
  platform: Satellite,
};
