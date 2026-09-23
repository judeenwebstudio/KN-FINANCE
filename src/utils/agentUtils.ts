import type { AgentUser, Borrower, ManagerAccount, PaymentRecord } from '../types';

/**
 * Resolves the display name of an assigned agent for a borrower.
 * Prioritizes stable agentId -> matching AgentUser (active or inactive).
 * Falls back to legacy assignedAgent string if available.
 */
export function resolveAgentName(
  borrower: Pick<Borrower, 'agentId' | 'assignedAgent'> | { agentId?: string | null; assignedAgent?: string },
  agents: AgentUser[]
): string | null {
  if (borrower.agentId) {
    const matched = agents.find((a) => a.id === borrower.agentId);
    if (matched) {
      return matched.fullName;
    }
  }

  // Graceful fallback for legacy records created before agentId was introduced
  if (borrower.assignedAgent && borrower.assignedAgent.trim()) {
    const trimmed = borrower.assignedAgent.trim();
    // Check if legacy name matches an agent's current or former name
    const matchedByName = agents.find(
      (a) => a.fullName.toLowerCase() === trimmed.toLowerCase()
    );
    if (matchedByName) {
      return matchedByName.fullName;
    }
    return trimmed;
  }

  return null;
}

/**
 * Resolves the collector's display name for a payment record.
 * Handles Manager vs Agent roles cleanly while ensuring historical records
 * survive agent deactivation, name edits, or missing data.
 */
export function resolveCollectorName(
  payment: PaymentRecord,
  manager: ManagerAccount | null,
  agents: AgentUser[]
): string {
  // 1. Explicit Agent role with ID
  if (payment.collectedByRole === 'agent' && payment.collectedByUserId) {
    const agent = agents.find((a) => a.id === payment.collectedByUserId);
    if (agent) return agent.fullName;
  }

  // 2. Explicit Manager role
  if (payment.collectedByRole === 'manager') {
    return manager?.fullName?.trim() || 'Manager';
  }

  // 3. Has userId but no explicit role
  if (payment.collectedByUserId) {
    const agent = agents.find((a) => a.id === payment.collectedByUserId);
    if (agent) return agent.fullName;
  }

  // 4. Legacy collectedBy field fallback
  if (payment.collectedBy && payment.collectedBy.trim()) {
    if (payment.collectedBy === 'Manager' && manager?.fullName?.trim()) {
      return manager.fullName.trim();
    }
    return payment.collectedBy;
  }

  return manager?.fullName?.trim() || 'Manager';
}
