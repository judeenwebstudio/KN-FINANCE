import type { ActivityLogEntry, ManagerAccount, AgentUser } from '../types';

/**
 * Formats ISO timestamp to DD/MM/YYYY, hh:mm AM/PM in user's local timezone.
 * Example: 23/09/2026, 08:18 PM
 */
export function formatActivityDateTime(isoStr: string): string {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr;

  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();

  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const strHours = String(hours).padStart(2, '0');

  return `${day}/${month}/${year}, ${strHours}:${minutes} ${ampm}`;
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
