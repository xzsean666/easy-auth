/**
 * D1 Session Manager for Read-Your-Own-Writes (RYW) consistency.
 *
 * Cloudflare D1 uses distributed read replicas. To prevent dirty reads
 * where immediately queried records appear missing after writes,
 * D1 sessions track and advance bookmarks via `db.withSession(bookmark)`.
 */
export class D1SessionManager {
  private currentBookmark: string | null = null;

  constructor(initialBookmark?: string | null) {
    if (initialBookmark) {
      this.currentBookmark = initialBookmark;
    }
  }

  /**
   * Sets or advances the session bookmark.
   */
  setBookmark(bookmark: string | null): void {
    if (bookmark) {
      this.currentBookmark = bookmark;
    }
  }

  /**
   * Retrieves the active bookmark.
   */
  getBookmark(): string | null {
    return this.currentBookmark;
  }

  /**
   * Clears the active bookmark.
   */
  clearBookmark(): void {
    this.currentBookmark = null;
  }

  /**
   * Wraps a D1Database instance with the current or explicitly provided session bookmark.
   */
  wrapDatabase<T = any>(db: T, bookmarkOverride?: string | null): T {
    const bookmark = bookmarkOverride !== undefined ? bookmarkOverride : this.currentBookmark;
    if (bookmark && typeof (db as any)?.withSession === "function") {
      return (db as any).withSession(bookmark);
    }
    return db;
  }
}
