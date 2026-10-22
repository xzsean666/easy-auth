# TASK-011 — 核心运行时解耦与子路径按需分包体系

> **状态**: DONE ✅  
> **负责人**: AI Pair Engineer  
> **所属里程碑**: Milestone 6: 跨平台多生态解耦、Cloudflare D1 驱动与轻量 Client SDK  
> **预估耗时**: 60m  
> **依赖**: TASK-007, TASK-010


---

## 1. 目标与背景

当前版本 `dist/index.mjs` 顶层静态导入了 `@nestjs/common`、`@nestjs/core`、`node:fs` 与 `node:sqlite`，导致在 Cloudflare Workers 等 Edge 环境或非 NestJS 项目中构建和运行时直接失败。
本任务旨在将核心主入口彻底重构为 **Universal Core**（纯 Web 标准与 TypeScript），并将各平台专有特性解耦到独立子路径：
- `easy-auth`（核心，Edge/Workers/Node/Browser 纯净）
- `easy-auth/nestjs`（NestJS 模块与 Guard）
- `easy-auth/d1`（Cloudflare D1 适配器）
- `easy-auth/client`（前端 Client SDK）

---

## 2. 涉及文件与范围

### 需修改文件:
- `package.json`：配置 `exports`，明确导出各子路径（`.`, `./nestjs`, `./d1`, `./client`）。
- `tsup.config.ts`：配置多 entry 打包，隔离各子路径的依赖树。
- `src/index.ts`：移除 NestJS 与 `SqliteStorageAdapter` 的强绑定导出，仅导出纯净核心与存储适配器。
- `src/easy-auth.ts`：解除对 `SqliteStorageAdapter` 的硬编码构造；当用户未指定存储时，在 Node 环境支持安全降级或引导配置。

---

## 3. 验收标准

1. `easy-auth` 核心打包产物 `dist/index.mjs` 顶层绝不包含 `@nestjs/*`、`fs` 或 `node:sqlite` 的静态 import。
2. 在模拟无 NestJS、无本地文件系统的环境下，`import { EasyAuth } from "easy-auth"` 能正常工作。
3. `easy-auth/nestjs` 子路径继续保留全部已有功能并正常通过测试。
4. 现有 108+ 项测试 100% 通过，无回归问题。
