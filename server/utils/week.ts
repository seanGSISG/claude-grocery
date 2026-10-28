/**
 * Which week the planner is planning.
 */

/**
 * The Sunday the coming week starts on.
 *
 * Both halves have to be local. Taking the weekday locally and then formatting
 * with toISOString() mixes local and UTC: on a Saturday evening in Denver the
 * UTC date has already rolled over, so the Saturday push — the one this whole
 * agent exists for — produced a week starting on Monday.
 */
export function nextSunday(now = new Date()): string {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() + ((7 - start.getDay()) % 7 || 7));
  return formatLocalDate(start);
}

/** YYYY-MM-DD in the local calendar, not UTC's. */
export function formatLocalDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}
