import type Database from 'better-sqlite3';

export interface MatchFeedback {
  canonicalName: string;
  displayName: string;
  rejectedUpc: string | null;
  rejectedDescription: string | null;
  searchTerm: string | null;
  note: string | null;
  reportedBy: string | null;
  weekStart: string | null;
}

/** Bad product matches, reported from Slack. */
export class FeedbackRepository {
  constructor(private readonly db: Database.Database) {}

  record(feedback: MatchFeedback): void {
    this.db
      .prepare(
        `INSERT INTO match_feedback
           (canonical_name, display_name, rejected_upc, rejected_description, search_term, note, reported_by, week_start)
         VALUES (@canonicalName, @displayName, @rejectedUpc, @rejectedDescription, @searchTerm, @note, @reportedBy, @weekStart)`
      )
      .run(feedback);
  }

  /** UPCs never to use again for a given ingredient. */
  rejectedUpcs(): Map<string, Set<string>> {
    const rows = this.db
      .prepare('SELECT canonical_name, rejected_upc FROM match_feedback WHERE rejected_upc IS NOT NULL')
      .all() as Array<{ canonical_name: string; rejected_upc: string }>;

    const map = new Map<string, Set<string>>();
    for (const row of rows) {
      const set = map.get(row.canonical_name) ?? new Set<string>();
      set.add(row.rejected_upc);
      map.set(row.canonical_name, set);
    }
    return map;
  }

  /** Everything reported, newest first — the list of what to fix. */
  all(limit = 50): Array<MatchFeedback & { createdAt: string }> {
    const rows = this.db
      .prepare(
        `SELECT canonical_name, display_name, rejected_upc, rejected_description,
                search_term, note, reported_by, week_start, created_at
           FROM match_feedback ORDER BY id DESC LIMIT ?`
      )
      .all(limit) as Array<Record<string, string | null>>;

    return rows.map((row) => ({
      canonicalName: row.canonical_name!,
      displayName: row.display_name!,
      rejectedUpc: row.rejected_upc,
      rejectedDescription: row.rejected_description,
      searchTerm: row.search_term,
      note: row.note,
      reportedBy: row.reported_by,
      weekStart: row.week_start,
      createdAt: row.created_at!,
    }));
  }
}
