# AGENTS.md — Easy Auth SDK 的 AI 工作守则

> 本文件是 AI 在本项目中工作的**最高规则与事实来源入口**。任何 AI 会话开始前必须先阅读本文件、
> `docs/AI_AGENT_PROMPT.md`（开发提示词与原则）以及 `docs/AI/SESSION_STATE.md`（当前会话状态），然后再读目标任务文件开始工作。
>
> 核心理念：**为 AI 的可理解性而优化，而非为人类的抽象炫技而优化。**
> 目标是让 AI 能够在有限上下文内可靠地理解、修改、扩展本系统，并跨多次会话稳定演进。

---

## 0. GitHub CLI 与 Git 账号路由规范 (强制执行)

- 本项目位于 `/ssd0/git/easy-auth`，属于 `/ssd0/git` 目录体系。
- **指定 GitHub 账号**: `xzsean666`
- **执行规范**:
  - 在本仓库下进行任何 `gh` 命令（如 `gh pr`、`gh issue`、`gh repo` 等）或需要 GitHub 认证的 Git 操作前，必须确保 `gh` 当前活跃账号为 `xzsean666`。
  - 若当前账号不是 `xzsean666`，必须在执行操作前切换：
    ```bash
    gh auth switch --user xzsean666
    ```
- 每次在终端调用 `gh` 或涉及鉴权的 `git push` / `git fetch` 前，先使用 `gh auth status` 校验当前激活账号。

---

## 1. 项目一句话定位

**Easy Auth** 是一个面向 Node.js 的**通用多源身份认证与关联管理 SDK**：
抹平不同第三方登录（Google、LINE、X、Web3 Wallet、Supabase 等）的认证差异，统一归一化为内部统一的 `User`、`Identity` 与全局唯一的 `User ID`，并向业务后端签发与校验统一的 JWT。

> **核心哲学：Any login → One User → One User ID**

完整架构设计见 `docs/ARCHITECTURE.md`，规范接口见 `docs/SPEC.md`。

---

## 2. 事实来源 (Source of Truth)

以下文件是项目工作的事实来源：
- **项目规则**：`AGENTS.md`（本文件）、`docs/AI_AGENT_PROMPT.md`
- **总目标**：`docs/AI/GOAL.md`
- **任务索引**：`docs/AI/TASK_INDEX.md`
- **当前状态**：`docs/AI/SESSION_STATE.md`
- **当前任务**：`docs/AI/tasks/TASK-xxx.md`
- **架构说明**：`docs/AI/ARCHITECTURE.md`（高层架构见 `docs/ARCHITECTURE.md`）
- **重要决策**：`docs/AI/DECISIONS.md`

每开始任何一步之前，AI **必须**:
1. **明确声明当前处于哪一步及当前 Task**
2. **说明本步将产出什么**
3. **严格按流程顺序执行**

### 步骤工作流

| 步骤 | 名称 | 产出 | 是否允许写实现代码 |
|---|---|---|---|
| Step 1 | 架构设计 (强制最先) | 系统架构 / 模块拆分 / 数据流 / 关键决策 | ❌ 否 |
| Step 2 | 文档与规格 | `docs/SPEC.md` / 任务定义 | ❌ 否 |
| Step 3 | 上下文交接 | `docs/AI/SESSION_STATE.md` | ❌ 否 |
| Step 4 | 实现与测试 | 代码、单元测试、用例 | ✅ 仅在依赖满足且范围明确时 |

---

## 3. 工作原则 (绝对红线)

必须严格遵守：
1. **一次只处理一个 Goal 和一个当前 Task**。
2. **一个 session 默认最多完成一个 Task**。
3. **不实现当前 Task 之外的功能**。
4. **不修改与任务无关的文件**。
5. **不删除、覆盖或回滚用户已有修改**。
6. **不执行 reset、checkout、递归删除等破坏性操作**。
7. **不主动提交、推送、发布或修改生产环境**。
8. **不随意添加依赖**，除非任务明确需要且现有功能无法满足。
9. **所有结论必须基于实际读取或实际运行的结果**。
10. **没有运行过的测试不得声称通过**。
11. **发现额外工作时，创建新 Task，不要立即实现**。

---

## 4. 架构原则 (面向 AI)

1. **认知驱动拆分 (最重要)**：模块按“AI 能否孤立理解”来拆分，不按代码行数盲目拆分。
2. **单一职责**：每个模块只做一件事，有清晰的输入/输出，无隐藏副作用。
3. **局部可理解**：不需要读取整个项目就能完全理解单个模块。避免跨文件循环依赖。
4. **命名即文档**：命名清晰、描述性、显式反映业务与技术用途。严禁模糊缩写。
5. **显式数据流**：禁止隐式全局状态、魔法变量或暗中修改。所有状态流转显式传递。
6. **核心抽象三元组**：`Provider → Identity → User`，所有新认证 Provider 必须适配该契约。
7. **组合优于继承**：采用依赖注入与 Adapter 组合模式，降低类型耦合度。
8. **存储无关性**：核心认证与关联逻辑不强绑定具体数据库，通过 `StorageAdapter` 接口解耦。

---

## 5. 修改前计划与完成交接

### 修改前计划必须包含：
- Request Type
- Goal
- Current Behavior
- Current Task
- Dependencies
- Files To Read / Modify / Create
- Implementation Approach
- Acceptance Criteria
- Verification Method
- Risks and Assumptions

### Session 结束时交接必须包含：
- Goal / Task / Status
- Changed Files / Created Files
- Implementation Summary
- Verification and Test Results
- Known Issues / Remaining Work / Next Task
- 更新 `docs/AI/SESSION_STATE.md`
