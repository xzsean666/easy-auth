# TASK-010: NestJS 零 Controller 自动化模块与 Guard 接入实现

> **Task ID**: `TASK-010`  
> **所属 Milestone**: `Milestone 5: 持久化数据库引擎与生态集成`  
> **状态**: `DONE` ✅  
> **依赖**: `TASK-009`  
> **预估耗时**: 60m  

---

## 1. 目标与背景

为了让 NestJS 项目能够以最少的心智负担接入 Easy Auth，无需开发者手写重复的 `AuthController`、路由绑定与 Guard 逻辑，提供专门的 NestJS 模块导出：
1. **`EasyAuthModule.forRoot(options)`**：动态模块注册，支持传入 `EasyAuthOptions` 与 `routePrefix`（默认 `/api/auth`）。
2. **`EasyAuthController`**：内置预置控制器，自动映射 `/login`, `/link`, `/unlink`, `/me`, `/identities` 等常用端点。
3. **`EasyAuthGuard`**：标准 NestJS 守卫，自动解析 `Bearer <token>`，并通过 `EasyAuth.verify` 校验并将 `user` 挂载到 `req.user`。
4. **`@CurrentUser()` 与 `@Public()` 装饰器**：提供开箱即用的参数提取与白名单放行能力。

---

## 2. 详细规格要求

### 2.1 模块结构
- `src/nestjs/index.ts`
- `src/nestjs/easy-auth.module.ts`
- `src/nestjs/easy-auth.controller.ts`
- `src/nestjs/easy-auth.guard.ts`
- `src/nestjs/decorators.ts`
- `src/nestjs/constants.ts`

### 2.2 导出与打包支持
- 支持从 `easy-auth/nestjs` 独立引入或主包导出。
- `package.json` 补充相应导出声明。

---

## 3. 验证命令

- `pnpm test test/nestjs/`
- `pnpm run typecheck`
- `pnpm run build`
