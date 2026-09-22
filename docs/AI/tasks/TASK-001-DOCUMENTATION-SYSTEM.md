# TASK-001: 建立 Easy Auth 文档体系与 AI 敏捷规范

## Objective
建立 Easy Auth 项目事实来源（Source of Truth）全套文档与 AI Agent 规范，确立项目定位、架构设计、技术选型、开发工作流与任务拆解，为后续高质量落地实现提供严谨指引。

## Scope
- 创建项目规则：`AGENTS.md`
- 创建 AI 工作规范：`docs/AI_AGENT_PROMPT.md`
- 创建架构文档：`docs/ARCHITECTURE.md` 与 `docs/AI/ARCHITECTURE.md`
- 创建对外开发者规范：`docs/SPEC.md`
- 创建全局规划与决策：`docs/AI/GOAL.md`、`docs/AI/DECISIONS.md`
- 建立任务索引与细化任务卡：`docs/AI/TASK_INDEX.md`、`docs/AI/tasks/`
- 初始化状态跟踪：`docs/AI/SESSION_STATE.md`

## Allowed Files
- `AGENTS.md`
- `docs/AI_AGENT_PROMPT.md`
- `docs/ARCHITECTURE.md`
- `docs/SPEC.md`
- `docs/AI/GOAL.md`
- `docs/AI/ARCHITECTURE.md`
- `docs/AI/DECISIONS.md`
- `docs/AI/TASK_INDEX.md`
- `docs/AI/SESSION_STATE.md`
- `docs/AI/tasks/*`

## Dependencies
- 无（项目首个引导任务）

## Inputs and Outputs
- **Inputs**:
  - 用户提供的 "AI Agent 项目开发提示词"
  - 用户提供的 "Easy Auth Architecture" 1-15 节架构设计
- **Outputs**:
  - 完备的 Markdown 架构与工作流文档体系

## Acceptance Criteria
- [x] `AGENTS.md` 包含 GitHub CLI 账号路由规则（`/ssd0/git` -> `xzsean666`）与 11 条绝对工作原则。
- [x] `docs/ARCHITECTURE.md` 详细涵盖了用户要求的所有核心概念、生命周期、流程图与扩展设计。
- [x] `docs/SPEC.md` 提供了业务后端接入示例、核心 API 签名与数据类型定义。
- [x] `docs/AI/` 目录下各标准文档完整就绪，任务拆分细致合理。
- [x] 所有链接格式规范，遵循事实来源原则。

## Verification Commands
```bash
ls -la /ssd0/git/easy-auth/
ls -la /ssd0/git/easy-auth/docs/
ls -la /ssd0/git/easy-auth/docs/AI/
ls -la /ssd0/git/easy-auth/docs/AI/tasks/
git -C /ssd0/git/easy-auth status --short
```

## Risks and Assumptions
- **假设**：Easy Auth 优先作为通用的轻量 Node.js SDK 库发布，首期内置内存存储，后续无缝接入外置数据库。

## Status
DONE
