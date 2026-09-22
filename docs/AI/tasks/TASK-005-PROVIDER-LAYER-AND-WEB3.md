# TASK-005: Provider 抽象契约、注册表与 Web3 钱包签名认证实现

## Objective
设计并实现认证 Provider 的统一抽象协议、注册表调度中心 `ProviderRegistry`，并实现首个核心认证驱动：Web3 钱包签名认证 Provider（基于 viem / ethers 的底层验证算法，支持 EVM 钱包 EIP-191 签名与地址小写归一化提取）。

## Scope
- `src/providers/base.ts`: `AuthProvider` 契约定义与数据提取类型
- `src/providers/registry.ts`: `ProviderRegistry` 注册表（注册、获取、列举、函数式 Provider 适配）
- `src/providers/oauth2-base.ts`: `OAuth2BaseProvider` 声明式通用 OAuth2 基类（仅需提供 URL 与字段映射）
- `src/providers/web3/index.ts`: `Web3Provider` 实现（验证签名、恢复地址、防重放检查）
- `test/providers/web3.test.ts`: Web3 签名验证单测
- `test/providers/oauth2-base.test.ts`: 通用 OAuth2 模板驱动单测

## Allowed Files
- `src/providers/base.ts`
- `src/providers/registry.ts`
- `src/providers/oauth2-base.ts`
- `src/providers/web3/*`
- `src/providers/index.ts`
- `test/providers/web3.test.ts`
- `test/providers/oauth2-base.test.ts`

## Dependencies
- `TASK-003` (核心类型与错误体系)

## Inputs and Outputs
- **Inputs**: 钱包地址、签名、明文消息；OAuth2 配置对象
- **Outputs**: 归一化后的 `providerUserId`（0x 小写钱包地址或第三方 UID）与验证结果

## Acceptance Criteria
- [x] Provider 接口完全解耦，不依赖存储层与用户表。
- [x] 提供 `OAuth2BaseProvider` 声明式基类，支持通过纯配置快速接入任何标准 OAuth2（如 GitHub、Discord）。
- [x] 支持通过一行函数快速注册自定义 Provider（函数式注册）。
- [x] `Web3Provider` 能够精确验证标准以太坊钱包签名。
- [x] 针对篡改签名、无效地址均能抛出标准的 `INVALID_CREDENTIALS` 错误。

## Verification Commands
```bash
pnpm vitest run test/providers/
```

## Risks and Assumptions
- 钱包签名验签可使用轻量库（如 `viem` 的 `verifyMessage`），避免引入体积过大的 web3 依赖。

## Status
DONE

