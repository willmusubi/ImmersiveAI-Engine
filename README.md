# Immersive AI Engine

> 下一代沉浸式 AI 对话系统 - 解决状态一致性、记忆连贯性、情感深度问题

## 项目愿景

打造比 SillyTavern 体验更好的沉浸式 AI 系统，核心特性：
- ✅ **强状态约束**：好感度、装备、时间线永不出错
- ✅ **多 Agent 架构**：叙事、状态、验证分离
- ✅ **Skills-First 设计**：模块化、可扩展、社区友好
- ✅ **完善的日志和测试**：每一步都可追溯和验证

## MVP 迭代计划

### MVP-0: 基础框架 ✅ 当前阶段
- [x] 项目初始化
- [x] 日志系统（Logger）
- [x] 配置管理（Config）
- [x] 基础测试框架
- [ ] 简单的 LLM 调用封装

**OKR:**
- O: 建立稳定的基础设施
- KR1: 日志覆盖所有关键路径
- KR2: 单元测试覆盖率 > 80%
- KR3: 无内存泄漏，运行 1000 次无崩溃

### MVP-1: 基础对话系统
- [ ] LLM 接口封装（支持 Claude API）
- [ ] 简单的 Prompt 管理
- [ ] 基础状态存储（内存 + JSON 文件）
- [ ] 对话历史管理

**OKR:**
- O: 实现基本的对话功能
- KR1: 支持连续对话 > 100 轮
- KR2: 响应延迟 < 5s（P95）
- KR3: 状态持久化成功率 100%

### MVP-2: 状态管理系统
- [ ] 结构化状态 Schema
- [ ] SQLite 数据库集成
- [ ] 状态验证器（Pre/Post）
- [ ] 时间线系统

**OKR:**
- O: 实现可靠的状态管理
- KR1: 状态不一致率 < 1%
- KR2: 数据库操作延迟 < 20ms
- KR3: 支持 10,000+ 条历史记录

### MVP-3: Skills 系统
- [ ] Skill Router
- [ ] 核心 Skills（character-response, state-update, validate）
- [ ] Skills 配置和热加载
- [ ] Skills 市场原型

**OKR:**
- O: 实现模块化的 Skills 架构
- KR1: 添加新 Skill < 10 分钟
- KR2: Skills 并行执行延迟 < 50ms
- KR3: 社区贡献 Skills > 5 个

### MVP-4: 多 Agent 架构
- [ ] Agent 协调器
- [ ] Narrator Agent（叙事）
- [ ] State Manager Agent（状态）
- [ ] Validator Agent（验证）
- [ ] Emotion Tracker（情感）

**OKR:**
- O: 实现高质量的多 Agent 系统
- KR1: 准确性提升 > 95%
- KR2: 用户感知延迟 < +50ms
- KR3: API 成本增加 < 50%

## 技术栈

### 后端
- **Runtime**: Node.js 18+
- **数据库**: SQLite（better-sqlite3）
- **LLM API**: Claude API（Anthropic SDK）
- **测试**: Jest + Supertest
- **日志**: Winston

### 前端（未来）
- **框架**: Vue 3 + TypeScript
- **状态管理**: Pinia
- **UI 组件**: Element Plus

## 项目结构

```
ImmersiveAI-Engine/
├── src/                    # 源代码
│   ├── core/              # 核心模块
│   │   ├── logger.js      # 日志系统
│   │   ├── config.js      # 配置管理
│   │   └── database.js    # 数据库封装
│   ├── llm/               # LLM 接口
│   │   ├── client.js      # API 客户端
│   │   └── prompt.js      # Prompt 管理
│   ├── state/             # 状态管理
│   │   ├── manager.js     # 状态管理器
│   │   └── validator.js   # 状态验证
│   ├── skills/            # Skills 系统
│   │   ├── router.js      # Skill 路由
│   │   └── registry.js    # Skill 注册
│   └── agents/            # Agent 系统
│       ├── orchestrator.js # 协调器
│       └── base.js        # Agent 基类
├── tests/                 # 测试
│   ├── unit/             # 单元测试
│   ├── integration/      # 集成测试
│   └── e2e/              # 端到端测试
├── docs/                  # 文档
│   ├── architecture.md   # 架构设计
│   ├── api.md           # API 文档
│   └── skills-guide.md  # Skills 开发指南
├── config/               # 配置文件
│   ├── default.json     # 默认配置
│   └── test.json        # 测试配置
├── data/                 # 数据目录
│   ├── db/              # 数据库文件
│   └── logs/            # 日志文件
├── package.json
├── .gitignore
└── README.md
```

## 开发原则

### 1. 日志优先
- 所有关键操作必须记录日志
- 日志级别：ERROR > WARN > INFO > DEBUG > TRACE
- 每个请求都有唯一 requestId

### 2. 测试驱动
- 先写测试，再写代码（TDD）
- 单元测试覆盖率 > 80%
- 集成测试覆盖核心流程

### 3. 渐进式迭代
- 每个 MVP 都可独立运行和测试
- 达到 OKR 后再进入下一阶段
- 保持向后兼容

### 4. 文档即代码
- 代码注释详尽
- API 自动生成文档
- 架构决策记录（ADR）

## 快速开始

### 安装依赖

```bash
npm install
```

### 运行测试

```bash
# 单元测试
npm test

# 测试覆盖率
npm run test:coverage

# 观察模式
npm run test:watch
```

### 运行开发服务器

```bash
npm run dev
```

### 运行生产构建

```bash
npm run build
npm start
```

## 性能基准

| 指标 | 目标 | 当前 |
|------|------|------|
| 对话响应延迟（P95） | < 5s | - |
| 状态更新延迟 | < 20ms | - |
| 内存占用 | < 200MB | - |
| 并发用户数 | > 100 | - |

## 贡献指南

参见 [CONTRIBUTING.md](./CONTRIBUTING.md)

## 许可证

MIT

---

**当前版本**: MVP-0 (基础框架)
**最后更新**: 2026-01-09
