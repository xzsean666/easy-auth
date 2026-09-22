# TASK-002: 初始化 pnpm + TypeScript 5 + Vitest + tsup 工程脚手架

## Objective
初始化 Easy Auth 的生产级 TypeScript 工程基础配置，包括 package.json、tsconfig.json、tsup.config.ts、vitest.config.ts 与基础目录结构，确保可以进行类型检查、构建与测试。

## Scope
- 创建 `package.json`（设定名字为 `easy-auth`，主入口、类型入口与 scripts）
- 创建 `tsconfig.json`（严格模式、ESNext 目标、NodeNext 解析）
- 创建 `tsup.config.ts`（输出 ESM 与 CJS 双格式）
- 创建 `vitest.config.ts`
- 创建 `.gitignore`
- 创建 `src/index.ts` 占位与烟囱测试 `test/smoke.test.ts`

## Allowed Files
- `package.json`
- `tsconfig.json`
- `tsup.config.ts`
- `vitest.config.ts`
- `.gitignore`
- `src/index.ts`
- `test/smoke.test.ts`
- `pnpm-lock.yaml`

## Dependencies
- `TASK-001` (文档系统建立)

## Inputs and Outputs
- **Inputs**: Node.js 18+ 环境与 pnpm
- **Outputs**: 可直接运行 `pnpm build`、`pnpm test` 的脚手架

## Acceptance Criteria
- [x] `pnpm build` 成功输出 `dist/index.cjs`、`dist/index.mjs` 与 `dist/index.d.ts`。
- [x] `pnpm test` 可顺利运行 Vitest 单元测试且通过。
- [x] TypeScript 编译无类型报错。

## Verification Commands
```bash
pnpm install
pnpm build
pnpm test
```

## Risks and Assumptions
- 外部依赖需精简，不引入非必要的厚重依赖。

## Status
DONE

