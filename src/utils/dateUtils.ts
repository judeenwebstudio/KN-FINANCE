import type { AppDateFormat } from '../types';

/**
 * Parses date inputs (ISO strings, YYYY-MM-DD strings, or Date objects)
 * into day, month, and year components.
 */
function extractDateComponents(dateInput: string | Date | undefined | null): {
  day: string;
  month: string;
  year: string;
  hours: number;
  minutes: string;
  ampm: string;
} | null {
  if (!dateInput) return null;

  let d: Date;
  if (typeof dateInput === 'string') {
    // If exact YYYY-MM-DD string, parse components directly to avoid timezone shift
    const ymdMatch = dateInput.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (ymdMatch) {
      return {
        year: ymdMatch[1],
        month: ymdMatch[2],
        day: ymdMatch[3],
        hours: 0,
        minutes: '00',
        ampm: 'AM',
      };
    }
    d = new Date(dateInput);
  } else {
    d = dateInput;
  }

  if (isNaN(d.getTime())) return null;

  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = String(d.getFullYear());

  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;

  return { day, month, year, hours, minutes, ampm };
}

/**
 * Formats a date string or Date object for display according to user's AppDateFormat setting.
 * Example:
 * - 'DD/MM/YYYY' => 24/09/2026
 * - 'MM/DD/YYYY' => 09/24/2026
 * - 'YYYY-MM-DD' => 2026-09-24
 */
export function formatAppDate(
  dateInput: string | Date | undefined | null,
  format: AppDateFormat = 'DD/MM/YYYY'
): string {
  const parts = extractDateComponents(dateInput);
  if (!parts) return typeof dateInput === 'string' ? dateInput : '';

  switch (format) {
    case 'MM/DD/YYYY':
      return `${parts.month}/${parts.day}/${parts.year}`;
    case 'YYYY-MM-DD':
      return `${parts.year}-${parts.month}-${parts.day}`;
    case 'DD/MM/YYYY':
    default:
      return `${parts.day}/${parts.month}/${parts.year}`;
  }
}

/**
 * Formats an ISO timestamp for display with time according to user's AppDateFormat setting.
 * Example:
 * - 'DD/MM/YYYY' => 24/09/2026, 10:15 AM
 * - 'MM/DD/YYYY' => 09/24/2026, 10:15 AM
 * - 'YYYY-MM-DD' => 2026-09-24, 10:15 AM
 */
export function formatAppDateTime(
  isoStr: string | undefined | null,
  format: AppDateFormat = 'DD/MM/YYYY'
): string {
  const parts = extractDateComponents(isoStr);
  if (!parts) return isoStr || '';

  const strHours = String(parts.hours).padStart(2, '0');
  const dateFormatted = formatAppDate(isoStr, format);

  return `${dateFormatted}, ${strHours}:${parts.minutes} ${parts.ampm}`;
}
