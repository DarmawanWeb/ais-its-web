import { SAFETY_COLORS, type Rgba } from '@/shared/theme/tokens';

const INFO: Rgba = [56, 189, 248, 255];

/** Severity colour on the map: critical = danger red, warning = amber, info = sky. */
export function severityColor(severity: string): Rgba {
  if (severity === 'critical') return SAFETY_COLORS.ewsDanger;
  if (severity === 'warning') return SAFETY_COLORS.ewsWarning;
  return INFO;
}
