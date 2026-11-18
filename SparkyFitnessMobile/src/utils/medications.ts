import type {
  MedicationDetail,
  MedicationEntry,
  SharedScheduleRule,
} from '@workspace/shared';

/** A scheduled dose slot on a given day, as produced by getDueDosesForDate. */
export interface DueDose {
  medication: MedicationDetail;
  schedule: SharedScheduleRule & { id: string };
}

/**
 * True when a logged entry belongs to the given dose slot.
 *
 * Entries logged without schedule attribution (e.g. from the web app) count
 * for any of the medication's scheduled doses, except PRN logs, which never
 * cover a scheduled slot. A null scheduleId matches only the medication's
 * schedule-less entries.
 */
export function entryMatchesDose(
  entry: MedicationEntry,
  medicationId: string,
  scheduleId: string | null
): boolean {
  if (scheduleId) {
    if (entry.schedule_id === scheduleId) return true;
    return (
      entry.medication_id === medicationId &&
      !entry.schedule_id &&
      entry.status !== 'prn_taken'
    );
  }
  return entry.medication_id === medicationId && !entry.schedule_id;
}

export type DoseSlotStatus = 'pending' | 'taken' | 'skipped';

/** Maps a slot's matched entry (if any) to its display status. */
export function doseSlotStatus(
  entry: MedicationEntry | undefined
): DoseSlotStatus {
  if (entry?.status === 'taken' || entry?.status === 'prn_taken')
    return 'taken';
  if (entry?.status === 'skipped') return 'skipped';
  return 'pending';
}

/** True when the dose slot already has a terminal (taken or skipped) entry. */
export function isDoseLogged(
  entries: MedicationEntry[],
  medicationId: string,
  scheduleId: string | null
): boolean {
  return entries.some(
    (e) =>
      entryMatchesDose(e, medicationId, scheduleId) &&
      (e.status === 'taken' || e.status === 'skipped')
  );
}

/** A set of dose slots that share a schedule time of day. */
export interface TimeGroup {
  /** Schedule time of day (HH:MM:SS), or null for time-less schedules. */
  time: string | null;
  dues: DueDose[];
  pending: DueDose[];
}

/**
 * Group dose slots by their schedule time of day and compute the pending
 * subset for each group, sorted chronologically with time-less slots last.
 * Shared by the dashboard card and the "take at once" card so the grouping
 * and pending-count logic live in exactly one place.
 */
export function groupDosesByTime(
  dues: DueDose[],
  entryForDue: (due: DueDose) => MedicationEntry | undefined
): TimeGroup[] {
  const byTime = new Map<string | null, DueDose[]>();
  for (const due of dues) {
    const time = due.schedule.time_of_day ?? '';
    const key = time === '' ? null : time;
    const list = byTime.get(key) ?? [];
    list.push(due);
    byTime.set(key, list);
  }
  return [...byTime.entries()]
    .map(([time, duesInGroup]) => ({
      time,
      dues: duesInGroup,
      pending: duesInGroup.filter(
        (d) => doseSlotStatus(entryForDue(d)) === 'pending'
      ),
    }))
    .sort((a, b) => {
      if (a.time == null) return 1;
      if (b.time == null) return -1;
      return a.time.localeCompare(b.time);
    });
}
