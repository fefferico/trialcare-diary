import type { DiaryRow } from './diary.models';

export interface MedicineCabinetExpiry {
  packageDate: string | null;
  afterOpeningDate: string | null;
  effectiveDate: string | null;
  effectiveSource: 'package' | 'after-opening' | 'both' | null;
  monthOnly: boolean;
}

export function medicineCabinetExpiry(row: DiaryRow): MedicineCabinetExpiry {
  const packageDate = validDateKey(row['expiry_date']);
  const openedDate = validDateKey(row['opened_date']);
  const shelfLifeDays = Number(row['opened_expiry_days']);
  const afterOpeningDate = openedDate && Number.isSafeInteger(shelfLifeDays) && shelfLifeDays > 0
    ? addDays(openedDate, shelfLifeDays)
    : null;

  if (!packageDate && !afterOpeningDate) {
    return { packageDate, afterOpeningDate, effectiveDate: null, effectiveSource: null, monthOnly: false };
  }
  if (!packageDate) {
    return { packageDate, afterOpeningDate, effectiveDate: afterOpeningDate, effectiveSource: 'after-opening', monthOnly: false };
  }
  if (!afterOpeningDate || packageDate < afterOpeningDate) {
    return {
      packageDate,
      afterOpeningDate,
      effectiveDate: packageDate,
      effectiveSource: 'package',
      monthOnly: row['expiry_precision'] === 'month',
    };
  }
  if (afterOpeningDate < packageDate) {
    return { packageDate, afterOpeningDate, effectiveDate: afterOpeningDate, effectiveSource: 'after-opening', monthOnly: false };
  }
  return { packageDate, afterOpeningDate, effectiveDate: packageDate, effectiveSource: 'both', monthOnly: false };
}

function validDateKey(value: unknown): string | null {
  const date = String(value ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
    ? date
    : null;
}

function addDays(date: string, days: number): string | null {
  const [year, month, day] = date.split('-').map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + days));
  if (!Number.isFinite(result.getTime())) return null;
  return result.toISOString().slice(0, 10);
}
