# TASK-007: SDK 统一门面封装、全链路端到端测试与使用示例

## Objective
封装顶层用户接入主门面 `EasyAuth` 类，暴露清晰、直观、低心智负担的 API。补充全链路端到端集成测试，并编写业务后端集成示例代码（Express / Fastify 接入范例）。

## Scope
- `src/index.ts`: 统一对外导出 `EasyAuth`、各类 Provider、存储适配器与核心类型
- `test/e2e/easy-auth.e2e.test.ts`: 模拟真实场景下的初始化、Web3 登录、身份关联、JWT 验签与解绑全流程
- `examples/express-server.ts`: 业务后端接入示例
- `README.md`: 项目主页说明、安装与接入指南

## Allowed Files
- `src/index.ts`
- `test/e2e/easy-auth.e2e.test.ts`
- `examples/*`
- `README.md`

## Dependencies
- `TASK-006` (核心引擎就绪)

## Inputs and Outputs
- **Inputs**: 封装就绪的各个内部子系统
- **Outputs**: 供外部项目直接 `import { EasyAuth } from "easy-auth"` 的完整 SDK 体验

## Acceptance Criteria
- [x] 仅需实例化 `new EasyAuth(config)` 即可一站式使用所有认证功能。
- [x] 提供顶层 `auth.verify(token)` 与 `auth.verifyToken(token)`，验证成功直出一级 `{ userId, metadata, user, payload }`。
- [x] 端到端测试全绿通过，覆盖登录、绑定与中间件验证全链路。
- [x] `examples/express-server.ts` 明确演示在业务中间件中通过 `const { userId, metadata } = await auth.verify(token)` 完成鉴权并流转业务。

## Verification Commands
```bash
pnpm test
pnpm build
```

## Risks and Assumptions
- 示例代码保持无多余依赖，可独立作为文档展示。

## Status
DONE

