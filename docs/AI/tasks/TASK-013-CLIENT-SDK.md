# TASK-013 — 框架无关的前端轻量扩展 Client SDK (easy-auth/client)

> **状态**: DONE ✅  
> **负责人**: AI Pair Engineer  
> **所属里程碑**: Milestone 6: 跨平台多生态解耦、Cloudflare D1 驱动与轻量 Client SDK  
> **预估耗时**: 60m  
> **依赖**: TASK-011


---

## 1. 目标与背景

为了让前端以极易扩展、极简心智接入 Easy Auth，并在未来顺畅对接 React / Vue / Svelte / Next.js 等各类前端体系，本任务实现一个框架无关（Vanilla JS / TS）的前端客户端 SDK：
1. 统一管理认证状态（`user`, `token`, `isAuthenticated`），支持事件订阅 `onAuthStateChange`。
2. 可插拔持久化层 `TokenStorageAdapter`（内置 `LocalStorageAdapter`, `SessionStorageAdapter`, `MemoryTokenStorage`）。
3. 封装统一登录 (`login`)、绑定 (`link`)、解绑 (`unlink`)、登出 (`logout`)。
4. 提供高阶 `client.fetch(url, options)`：自动注入 `Authorization: Bearer <token>`，响应 401 自动清理并通知状态。
5. 作为独立子路径 `easy-auth/client` 导出。

---

## 2. 涉及文件与范围

### 需新增文件:
- `src/client/storage.ts`：Token 存储适配器抽象及本地存储实现。
- `src/client/client.ts`：`EasyAuthClient` 核心类。
- `src/client/types.ts`：客户端配置与事件类型。
- `src/client/index.ts`：客户端入口导出。
- `test/client/client.test.ts`：前端客户端单元测试。

---

## 3. 验收标准

1. `EasyAuthClient` 在无浏览器环境（内存存储）和浏览器环境（localStorage）均能正常初始化与读写状态。
2. 登录、获取当前用户、退出登录、状态回调触发均通过测试。
3. `client.fetch` 准确注入请求头并在 401 时触发回调。
4. 单元测试 100% 通过。
