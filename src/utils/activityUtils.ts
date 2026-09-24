import type { ActivityLogEntry, ManagerAccount, AgentUser, AppDateFormat } from '../types';
import { formatAppDateTime } from './dateUtils';

/**
 * Formats ISO timestamp to date + time in user's local timezone according to date format preference.
 * Example: 23/09/2026, 08:18 PM
 */
export function formatActivityDateTime(
  isoStr: string,
  format: AppDateFormat = 'DD/MM/YYYY'
): string {
  return formatAppDateTime(isoStr, format);
}

/**
 * Dynamically resolves the performer's display name from role and userId.
 * Survives agent renames and keeps history accurate.
 */
export function resolvePerformerName(
  entry: ActivityLogEntry,
  manager: ManagerAccount | null,
  agents: AgentUser[]
): string {
  if (entry.performedByRole === 'agent' && entry.performedByUserId) {
    const agent = agents.find((a) => a.id === entry.performedByUserId);
    if (agent) return agent.fullName;
  }

  if (entry.performedByRole === 'manager') {
    return manager?.fullName?.trim() || 'Sirajudeen';
  }

  if (entry.performedByUserId) {
    const agent = agents.find((a) => a.id === entry.performedByUserId);
    if (agent) return agent.fullName;
  }

  return manager?.fullName?.trim() || 'Manager';
}
