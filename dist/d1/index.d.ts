import { S as StorageAdapter, D as DeleteIdentityOptions } from '../base-DKSmaKSh.js';
import { C as CreateUserData, U as User, a as CreateIdentityData, I as Identity } from '../types-BUHBKPKK.js';

/**
 * Minimal type definition for Cloudflare D1 Database binding
 */
interface D1PreparedStatement {
    bind(...values: any[]): D1PreparedStatement;
    first<T = unknown>(colName?: string): Promise<T | null>;
    all<T = unknown>(): Promise<{
        results: T[];
        success: boolean;
        meta?: any;
    }>;
    run(): Promise<{
        success: boolean;
        meta?: any;
    }>;
}
interface D1DatabaseLike {
    prepare(query: string): D1PreparedStatement;
    batch<T = unknown>(statements: D1PreparedStatement[]): Promise<any[]>;
    withSession?(bookmark?: string): D1DatabaseLike;
}
interface D1StorageOptions {
    /**
     * Cloudflare D1 Database binding instance (e.g. `env.DB`)
     */
    db: D1DatabaseLike;
    /**
     * Optional initial session bookmark for Read-Your-Own-Writes consistency
     */
    bookmark?: string | null;
    /**
     * Automatically initialize database schema and indexes via `db.batch()`.
     * Defaults to true.
     */
    autoInitTables?: boolean;
    /**
     * Custom table name for users. Defaults to "easy_auth_users".
     */
    usersTable?: string;
    /**
     * Custom table name for identities. Defaults to "easy_auth_identities".
     */
    identitiesTable?: string;
}
/**
 * Production-ready Cloudflare D1 StorageAdapter.
 *
 * Highly optimized for Cloudflare Workers / Pages:
 * - Read-Your-Own-Writes (RYW) consistency via D1SessionManager
 * - Single-RPC batch initialization via `db.batch()`
 * - Zero node:fs or native C++ dependencies
 */
declare class D1StorageAdapter implements StorageAdapter {
    private readonly rawDb;
    private readonly sessionManager;
    private readonly usersTable;
    private readonly identitiesTable;
    private readonly autoInitTables;
    private isInitialized;
    private initPromise;
    constructor(options: D1StorageOptions);
    /**
     * Returns the D1Database instance wrapped with active session bookmark
     */
    getDb(): D1DatabaseLike;
    /**
     * Retrieves the current D1 session bookmark.
     */
    getBookmark(): string | null;
    /**
     * Manually sets or advances the active D1 session bookmark.
     */
    setBookmark(bookmark: string | null): void;
    /**
     * Clears the current bookmark.
     */
    clearBookmark(): void;
    /**
     * Ensures database schema and indexes are created via a single D1 batch RPC
     */
    ensureInit(): Promise<void>;
    private captureBookmarkFromResult;
    private mapUserRow;
    private mapIdentityRow;
    createUser(data: CreateUserData): Promise<User>;
    getUserById(id: string): Promise<User | null>;
    updateUserMetadata(id: string, metadata: Record<string, any>): Promise<User>;
    createIdentity(data: CreateIdentityData): Promise<Identity>;
    getIdentity(provider: string, providerUserId: string): Promise<Identity | null>;
    listIdentitiesByUserId(userId: string): Promise<Identity[]>;
    deleteIdentity(userId: string, provider: string, providerUserId: string, options?: DeleteIdentityOptions): Promise<boolean>;
}

/**
 * D1 Session Manager for Read-Your-Own-Writes (RYW) consistency.
 *
 * Cloudflare D1 uses distributed read replicas. To prevent dirty reads
 * where immediately queried records appear missing after writes,
 * D1 sessions track and advance bookmarks via `db.withSession(bookmark)`.
 */
declare class D1SessionManager {
    private currentBookmark;
    constructor(initialBookmark?: string | null);
    /**
     * Sets or advances the session bookmark.
     */
    setBookmark(bookmark: string | null): void;
    /**
     * Retrieves the active bookmark.
     */
    getBookmark(): string | null;
    /**
     * Clears the active bookmark.
     */
    clearBookmark(): void;
    /**
     * Wraps a D1Database instance with the current or explicitly provided session bookmark.
     */
    wrapDatabase<T = any>(db: T, bookmarkOverride?: string | null): T;
}

export { type D1DatabaseLike, type D1PreparedStatement, D1SessionManager, D1StorageAdapter, type D1StorageOptions };
