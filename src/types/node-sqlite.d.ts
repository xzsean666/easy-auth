declare module "node:sqlite" {
  export interface DatabaseSyncOptions {
    open?: boolean;
    readOnly?: boolean;
    enableForeignKeyConstraints?: boolean;
  }

  export class DatabaseSync {
    constructor(location: string, options?: DatabaseSyncOptions);
    close(): void;
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
  }

  export class StatementSync {
    all(...params: any[]): any[];
    get(...params: any[]): any | undefined;
    run(...params: any[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  }
}
