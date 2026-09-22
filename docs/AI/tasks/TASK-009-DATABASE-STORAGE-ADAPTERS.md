# TASK-009: SQLite 与 PostgreSQL 持久化存储适配器实现

> **Task ID**: `TASK-009`  
> **所属 Milestone**: `Milestone 5: 持久化数据库引擎与生态集成`  
> **状态**: `DONE` ✅  
> **依赖**: `TASK-003`, `TASK-007`  
> **预估耗时**: 60m  

---

## 1. 目标与背景

当前 Easy Auth 仅内置了 `MemoryStorageAdapter`，在服务重启后用户和身份关联数据会丢失。
为满足生产与本地持久化诉求，需在 `src/storage/` 下新增持久化数据库驱动：
1. **`SqliteStorageAdapter`**：基于 Node.js 22+ 原生内置的 `node:sqlite` (`DatabaseSync`)，零外部编译依赖，开箱即用，支持文件存储与内存持久化。
2. **`PostgresStorageAdapter`**：基于标准 PostgreSQL Client / Pool 接口，支持生产级云端 PostgreSQL 数据库。
3. **`EasyAuthOptions.database` 快捷配置**：在初始化 `EasyAuth` 实例时，支持直接传入 `{ database: { type: 'sqlite', path: '...' } }` 或 `{ database: { type: 'postgres', pool: ... } }`，自动建表并自动实例化对应的 StorageAdapter。

---

## 2. 详细规格要求

### 2.1 表结构自动初始化 (Auto DDL)
- `easy_auth_users`：
  - `id`: TEXT / VARCHAR(255) PRIMARY KEY
  - `metadata`: TEXT (JSON) / JSONB NOT NULL
  - `created_at`: TEXT / TIMESTAMPTZ NOT NULL
  - `updated_at`: TEXT / TIMESTAMPTZ NOT NULL
- `easy_auth_identities`：
  - `id`: TEXT / VARCHAR(255) PRIMARY KEY
  - `user_id`: TEXT / VARCHAR(255) NOT NULL
  - `provider`: TEXT / VARCHAR(255) NOT NULL
  - `provider_user_id`: TEXT / VARCHAR(255) NOT NULL
  - `profile`: TEXT (JSON) / JSONB
  - `created_at`: TEXT / TIMESTAMPTZ NOT NULL
  - `updated_at`: TEXT / TIMESTAMPTZ NOT NULL
  - 唯一索引：`UNIQUE(provider, provider_user_id)`
  - 索引：`idx_easy_auth_identities_user_id (user_id)`

### 2.2 契约实现 (`StorageAdapter`)
完整实现 7 项接口：
- `createUser(data)`
- `getUserById(id)`
- `updateUserMetadata(id, metadata)`
- `createIdentity(data)`
- `getIdentity(provider, providerUserId)`
- `listIdentitiesByUserId(userId)`
- `deleteIdentity(userId, provider, providerUserId)`

---

## 3. 允许修改的文件范围

- `src/storage/sqlite.ts` (新建)
- `src/storage/postgres.ts` (新建)
- `src/storage/index.ts` (导出新适配器)
- `src/core/types.ts` (增加 `database` 配置选项)
- `src/easy-auth.ts` (支持根据 `database` 自动构造持久化 adapter)
- `test/storage/sqlite.test.ts` (新建测试)
- `test/storage/postgres.test.ts` (新建测试)

---

## 4. 验证命令

- `pnpm test test/storage/sqlite.test.ts`
- `pnpm test test/storage/postgres.test.ts`
- `pnpm test` (全量回归)
- `pnpm run typecheck`
