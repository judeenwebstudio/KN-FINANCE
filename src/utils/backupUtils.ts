import type {
  KNFinanceBackup,
  ManagerAccount,
  CompanyProfile,
  StoredAgentRecord,
  AgentUser,
  Borrower,
  PaymentRecord,
  ActivityLogEntry,
  AppSettings,
} from '../types';
import { DEFAULT_SETTINGS } from '../types';
import { hashPinSync } from './security';

export const KN_FINANCE_STORAGE_KEYS = [
  'kn_finance_manager',
  'kn_finance_company',
  'kn_finance_agents',
  'kn_finance_borrowers',
  'kn_finance_payments',
  'kn_finance_activity_logs',
  'kn_finance_settings',
] as const;

export interface BackupValidationResult {
  isValid: boolean;
  error?: string;
  backup?: KNFinanceBackup;
}

/**
 * Creates versioned, security-sanitized KN FINANCE backup payload.
 * Generates and includes the 'backup_created' audit entry inside the snapshot.
 */
export function createBackupPayload(params: {
  manager: ManagerAccount | null;
  company: CompanyProfile | null;
  agents: AgentUser[];
  borrowers: Borrower[];
  payments: PaymentRecord[];
  activityLogs: ActivityLogEntry[];
  settings?: AppSettings;
}): { backup: KNFinanceBackup; filename: string; backupActivity: ActivityLogEntry } {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const filename = `KN-FINANCE-Backup-${year}-${month}-${day}.json`;

  // 1. Audit event created BEFORE final snapshot so it is captured inside the export
  const backupActivity: ActivityLogEntry = {
    id: `activity_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    action: 'backup_created',
    performedByUserId: null,
    performedByRole: 'manager',
    message: 'KN FINANCE data backup was created.',
    createdAt: now.toISOString(),
  };

  // 2. Security: Never export raw Manager PIN or transient session state
  const safeManager = params.manager
    ? {
        fullName: params.manager.fullName,
        email: params.manager.email,
        mobile: params.manager.mobile,
        companyCode: params.manager.companyCode,
        keepLoggedIn: params.manager.keepLoggedIn,
      }
    : null;

  // 3. Security: Never export raw Agent PIN or include credentials in agent array
  const safeAgents: AgentUser[] = params.agents.map((agent) => ({
    id: agent.id,
    fullName: agent.fullName,
    mobile: agent.mobile,
    role: agent.role,
    status: agent.status,
    createdAt: agent.createdAt,
  }));

  // 4. Protected authentication section: non-reversible credential verifier hashes only
  const managerPinHash =
    params.manager?.pinHash || (params.manager?.pin ? hashPinSync(params.manager.pin) : undefined);

  const agentPinHashes: Record<string, string> = {};
  try {
    const rawStoredAgents = localStorage.getItem('kn_finance_agents');
    if (rawStoredAgents) {
      const parsedStored = JSON.parse(rawStoredAgents);
      if (Array.isArray(parsedStored)) {
        for (const item of parsedStored) {
          if (item?.id && item?.pinHash) {
            agentPinHashes[item.id] = item.pinHash;
          }
        }
      }
    }
  } catch {
    // fallback if localStorage not accessible
  }

  let currentSettings: AppSettings = DEFAULT_SETTINGS;
  if (params.settings) {
    currentSettings = params.settings;
  } else {
    try {
      const saved = localStorage.getItem('kn_finance_settings');
      if (saved) {
        currentSettings = { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
      }
    } catch {
      // fallback
    }
  }

  const backup: KNFinanceBackup = {
    app: 'KN FINANCE',
    backupVersion: 1,
    createdAt: now.toISOString(),
    data: {
      manager: safeManager,
      company: params.company,
      agents: safeAgents,
      borrowers: params.borrowers,
      payments: params.payments,
      activityLogs: [backupActivity, ...params.activityLogs],
      settings: currentSettings,
      auth: {
        managerPinHash: managerPinHash || undefined,
        agentPinHashes: Object.keys(agentPinHashes).length > 0 ? agentPinHashes : undefined,
      },
    },
  };

  return { backup, filename, backupActivity };
}

/**
 * Triggers in-browser file download without navigating away.
 */
export function downloadBackupFile(backup: KNFinanceBackup, filename: string): void {
  const jsonStr = JSON.stringify(backup, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * Strictly validates an uploaded backup file.
 * Prevents malformed, arbitrary, or unsupported backups from being restored.
 */
export function validateBackupFile(fileContent: string): BackupValidationResult {
  if (!fileContent || !fileContent.trim()) {
    return { isValid: false, error: 'The selected file is empty.' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fileContent);
  } catch {
    return { isValid: false, error: 'This is not a valid KN FINANCE backup file.' };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { isValid: false, error: 'This is not a valid KN FINANCE backup file.' };
  }

  const root = parsed as Record<string, unknown>;

  // Verify application identity
  if (root.app !== 'KN FINANCE') {
    return { isValid: false, error: 'This is not a valid KN FINANCE backup file.' };
  }

  // Verify backup version
  if (root.backupVersion === undefined || typeof root.backupVersion !== 'number') {
    return { isValid: false, error: 'This backup version is not supported.' };
  }

  if (root.backupVersion !== 1) {
    return { isValid: false, error: 'This backup version is not supported.' };
  }

  // Verify creation timestamp
  if (typeof root.createdAt !== 'string' || isNaN(new Date(root.createdAt).getTime())) {
    return { isValid: false, error: 'This is not a valid KN FINANCE backup file.' };
  }

  // Verify data container
  if (!root.data || typeof root.data !== 'object' || Array.isArray(root.data)) {
    return { isValid: false, error: 'This is not a valid KN FINANCE backup file.' };
  }

  const data = root.data as Record<string, unknown>;

  // Verify critical arrays
  if (!Array.isArray(data.borrowers)) {
    return { isValid: false, error: 'This is not a valid KN FINANCE backup file.' };
  }
  if (!Array.isArray(data.payments)) {
    return { isValid: false, error: 'This is not a valid KN FINANCE backup file.' };
  }
  if (!Array.isArray(data.agents)) {
    return { isValid: false, error: 'This is not a valid KN FINANCE backup file.' };
  }
  if (!Array.isArray(data.activityLogs)) {
    return { isValid: false, error: 'This is not a valid KN FINANCE backup file.' };
  }

  // Verify manager object if present
  if (data.manager !== null && data.manager !== undefined) {
    if (typeof data.manager !== 'object' || Array.isArray(data.manager)) {
      return { isValid: false, error: 'This is not a valid KN FINANCE backup file.' };
    }
    const mgr = data.manager as Record<string, unknown>;
    if (!mgr.fullName || typeof mgr.fullName !== 'string') {
      return { isValid: false, error: 'This is not a valid KN FINANCE backup file.' };
    }
  }

  // Verify settings if present (optional for backward compatibility)
  if (data.settings !== undefined && data.settings !== null) {
    if (typeof data.settings !== 'object' || Array.isArray(data.settings)) {
      return { isValid: false, error: 'This is not a valid KN FINANCE backup file.' };
    }
  }

  // Verify borrower structural fields
  for (const b of data.borrowers as unknown[]) {
    if (!b || typeof b !== 'object' || Array.isArray(b)) {
      return { isValid: false, error: 'This is not a valid KN FINANCE backup file.' };
    }
    const borrower = b as Record<string, unknown>;
    if (!borrower.id || typeof borrower.id !== 'string') {
      return { isValid: false, error: 'This is not a valid KN FINANCE backup file.' };
    }
    const hasName = typeof borrower.borrowerName === 'string' || typeof borrower.name === 'string';
    if (!hasName) {
      return { isValid: false, error: 'This is not a valid KN FINANCE backup file.' };
    }
  }

  // Verify agent structural fields
  for (const a of data.agents as unknown[]) {
    if (!a || typeof a !== 'object' || Array.isArray(a)) {
      return { isValid: false, error: 'This is not a valid KN FINANCE backup file.' };
    }
    const agent = a as Record<string, unknown>;
    if (!agent.id || typeof agent.id !== 'string') {
      return { isValid: false, error: 'This is not a valid KN FINANCE backup file.' };
    }
    if (!agent.fullName || typeof agent.fullName !== 'string') {
      return { isValid: false, error: 'This is not a valid KN FINANCE backup file.' };
    }
  }

  // Verify payment structural fields
  for (const p of data.payments as unknown[]) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) {
      return { isValid: false, error: 'This is not a valid KN FINANCE backup file.' };
    }
    const payment = p as Record<string, unknown>;
    if (!payment.id || typeof payment.id !== 'string') {
      return { isValid: false, error: 'This is not a valid KN FINANCE backup file.' };
    }
    if (!payment.borrowerId || typeof payment.borrowerId !== 'string') {
      return { isValid: false, error: 'This is not a valid KN FINANCE backup file.' };
    }
    if (typeof payment.amount !== 'number' || isNaN(payment.amount)) {
      return { isValid: false, error: 'This is not a valid KN FINANCE backup file.' };
    }
  }

  // Verify activity structural fields
  for (const act of data.activityLogs as unknown[]) {
    if (!act || typeof act !== 'object' || Array.isArray(act)) {
      return { isValid: false, error: 'This is not a valid KN FINANCE backup file.' };
    }
    const entry = act as Record<string, unknown>;
    if (!entry.id || typeof entry.id !== 'string') {
      return { isValid: false, error: 'This is not a valid KN FINANCE backup file.' };
    }
    if (!entry.action || typeof entry.action !== 'string') {
      return { isValid: false, error: 'This is not a valid KN FINANCE backup file.' };
    }
  }

  return {
    isValid: true,
    backup: parsed as KNFinanceBackup,
  };
}

/**
 * Performs atomic, safe restore into localStorage.
 * Restores original stable IDs, preserves relationships, appends single 'backup_restored' event,
 * and maintains rollback protection if any write fails.
 */
export function performSafeRestore(backup: KNFinanceBackup): { success: boolean; error?: string } {
  // 1. Take in-memory snapshot of current KN FINANCE keys for rollback protection
  const snapshot: Record<string, string | null> = {};
  for (const key of KN_FINANCE_STORAGE_KEYS) {
    try {
      snapshot[key] = localStorage.getItem(key);
    } catch {
      snapshot[key] = null;
    }
  }

  try {
    // 2. Prepare and serialize all new target values in memory BEFORE writing
    const newValues: Record<string, string> = {};

    // Restore Manager
    if (backup.data.manager) {
      const restoredManager: ManagerAccount = {
        fullName: backup.data.manager.fullName,
        email: backup.data.manager.email,
        mobile: backup.data.manager.mobile,
        companyCode: backup.data.manager.companyCode,
        keepLoggedIn: Boolean(backup.data.manager.keepLoggedIn),
        pinHash: backup.data.auth?.managerPinHash || undefined,
      };
      newValues['kn_finance_manager'] = JSON.stringify(restoredManager);
    }

    // Restore Company Profile
    if (backup.data.company) {
      newValues['kn_finance_company'] = JSON.stringify(backup.data.company);
    }

    // Restore Agents with credentials from protected auth section
    const agentPinHashes = backup.data.auth?.agentPinHashes || {};
    const restoredAgents: StoredAgentRecord[] = backup.data.agents.map((agent) => ({
      ...agent,
      pinHash: agentPinHashes[agent.id] || '',
    }));
    newValues['kn_finance_agents'] = JSON.stringify(restoredAgents);

    // Restore Borrowers (exact original IDs preserved)
    newValues['kn_finance_borrowers'] = JSON.stringify(backup.data.borrowers);

    // Restore Payments (exact original IDs preserved)
    newValues['kn_finance_payments'] = JSON.stringify(backup.data.payments);

    // Restore Activity Logs: Append exactly ONE 'backup_restored' event to restored logs
    const restoreActivity: ActivityLogEntry = {
      id: `activity_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      action: 'backup_restored',
      performedByUserId: null,
      performedByRole: 'manager',
      message: 'KN FINANCE data was restored from backup.',
      createdAt: new Date().toISOString(),
    };

    const finalActivityLogs = [restoreActivity, ...(backup.data.activityLogs || [])];
    newValues['kn_finance_activity_logs'] = JSON.stringify(finalActivityLogs);

    // Restore Settings: Merge with DEFAULT_SETTINGS if old backup has no settings
    const restoredSettings: AppSettings = backup.data.settings
      ? { ...DEFAULT_SETTINGS, ...backup.data.settings }
      : DEFAULT_SETTINGS;
    newValues['kn_finance_settings'] = JSON.stringify(restoredSettings);

    // 3. Perform atomic write of whitelisted keys
    for (const [key, serialized] of Object.entries(newValues)) {
      localStorage.setItem(key, serialized);
    }

    // Maintain logged in session
    localStorage.setItem('kn_finance_logged_in', 'true');

    return { success: true };
  } catch {
    // Rollback all target keys if any write fails
    try {
      for (const key of KN_FINANCE_STORAGE_KEYS) {
        const prev = snapshot[key];
        if (prev !== null) {
          localStorage.setItem(key, prev);
        } else {
          localStorage.removeItem(key);
        }
      }
    } catch {
      // Ignore rollback storage error
    }

    return {
      success: false,
      error: 'Unable to restore backup. Your current data has been preserved.',
    };
  }
}
