# TASK-003: 核心模型定义、错误体系与 MemoryStorage 适配器实现

## Objective
实现 Easy Auth 的核心类型体系（User、Identity、Metadata 等）、标准化错误系统（EasyAuthError）以及存储适配器抽象契约与零依赖的内存存储驱动（MemoryStorageAdapter）。

## Scope
- `src/core/types.ts`: 领域实体模型与配置类型
- `src/core/errors.ts`: 规范化错误码与 EasyAuthError 类
- `src/storage/base.ts`: `StorageAdapter` 接口
- `src/storage/memory.ts`: `MemoryStorageAdapter` 实现（支持 User 与 Identity 的 CRUD、按 provider+providerUserId 索引、按 userId 检索与删除）
- `test/storage/memory.test.ts`: 单元测试

## Allowed Files
- `src/core/types.ts`
- `src/core/errors.ts`
- `src/storage/base.ts`
- `src/storage/memory.ts`
- `src/storage/index.ts`
- `test/storage/memory.test.ts`

## Dependencies
- `TASK-002` (工程脚手架就绪)

## Inputs and Outputs
- **Inputs**: 核心架构设计的类型与存储要求
- **Outputs**: 可插拔、经过完整单元测试的存储层与核心实体类型定义

## Acceptance Criteria
- [x] 完整支持 `User`、`Identity` 结构。
- [x] `MemoryStorageAdapter` 实现唯一性校验：同一个 `(provider, providerUserId)` 不能重复创建。
- [x] 单元测试覆盖创建、查找、更新元数据、删除身份与唯一性冲突分支。

## Verification Commands
```bash
pnpm vitest run test/storage/memory.test.ts
```

## Risks and Assumptions
- 内存存储主要用于测试和原型，内部使用 Map 与 Set 保障高吞吐。

## Status
DONE

