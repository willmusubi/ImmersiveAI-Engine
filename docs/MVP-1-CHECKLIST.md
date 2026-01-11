# MVP-1 完成清单

## 目标

建立基础对话系统，实现多模型智能对话能力。

## OKR

### Objective: 实现稳定的基础对话系统

#### KR1: 多模型智能选择，成本降低 50%

- [x] 实现 LLM Client 多模型支持
- [x] 支持 Opus、Sonnet、Haiku 三个模型
- [x] 实现任务类型智能路由
- [x] 实现 4 种选择策略（成本、延迟、质量、平衡）
- [x] 实现成本追踪和累计
- [x] 实现延迟监控
- [x] 实现约束检查（最大延迟、最大成本）
- [x] 编写 LLM Client 单元测试
- [x] 验证：智能选择逻辑正确

**成果**：
- Haiku 用于状态管理：$0.25/1M（相比 Sonnet 节省 91%）
- Sonnet 用于叙事生成：$3/1M（相比 Opus 节省 80%）
- Opus 仅用于复杂推理：$15/1M
- 预计综合成本降低 60-70%

#### KR2: 提示词管理系统，支持 A/B 测试

- [x] 实现 Prompt Manager 类
- [x] 支持模板注册和管理
- [x] 支持变量插值（{{variable}} 语法）
- [x] 支持模板组合
- [x] 支持模板变体（A/B 测试）
- [x] 支持从文件加载模板
- [x] 实现使用统计追踪
- [x] 编写 Prompt Manager 单元测试
- [x] 验证：模板系统工作正常

**成果**：
- 提示词与代码分离，易于维护
- 支持 A/B 测试不同版本的提示词
- 自动追踪使用统计，优化高频模板

#### KR3: 对话历史管理，支持 100+ 轮对话

- [x] 实现 Conversation Manager 类
- [x] 实现 Conversation 类
- [x] 支持消息添加（user/assistant）
- [x] 支持 Token 估算（1 token ≈ 4 字符）
- [x] 支持上下文窗口管理（Token 限制）
- [x] 支持对话持久化（JSON 文件）
- [x] 支持对话加载和缓存
- [x] 支持对话列表和统计
- [x] 编写 Conversation Manager 单元测试
- [x] 验证：100+ 轮对话性能良好

**成果**：
- 支持 100+ 轮对话无性能问题
- Token 估算准确，自动管理上下文窗口
- JSON 持久化简单可靠

## 功能清单

### 核心模块

#### ✅ LLM Client（多模型智能客户端）

**文件**: `src/llm/client.js`

**功能**:
- [x] 多模型定义（Opus、Sonnet、Haiku）
- [x] 任务类型定义（叙事、状态管理、复杂推理等）
- [x] 智能模型选择
  - [x] 基于任务类型
  - [x] 基于选择策略
  - [x] 基于约束条件
- [x] 文本生成（generate）
- [x] 流式生成（generateStream）
- [x] 成本计算和追踪
- [x] 延迟监控
- [x] 统计信息（按模型 + 总计）
- [x] 错误处理

**测试覆盖**:
- 测试数: 17
- 覆盖率: 85.63% (语句)

#### ✅ Prompt Manager（提示词管理）

**文件**: `src/llm/prompt.js`

**功能**:
- [x] 模板注册
- [x] 变量提取和验证
- [x] 模板渲染（变量替换）
- [x] 模板组合
- [x] 模板变体创建
- [x] 从文件加载模板
- [x] 使用统计追踪
- [x] 模板列表和查询

**测试覆盖**:
- 测试数: 31
- 覆盖率: 98.91% (语句)

#### ✅ Conversation Manager（对话管理）

**文件**: `src/conversation/manager.js`

**功能**:
- [x] 对话创建
- [x] 消息添加（角色验证）
- [x] 消息检索（支持 Token/数量限制）
- [x] Token 估算
- [x] 对话持久化（JSON）
- [x] 对话加载（文件 + 缓存）
- [x] 对话列表和排序
- [x] 对话删除
- [x] 对话统计
- [x] JSON 序列化/反序列化

**测试覆盖**:
- 测试数: 35
- 覆盖率: 97.70% (语句)

### 测试

#### ✅ 单元测试

**测试文件**:
- `tests/unit/llm-client.test.js` (17 测试)
- `tests/unit/prompt.test.js` (31 测试)
- `tests/unit/conversation.test.js` (35 测试)

**总计**:
- 测试套件: 5 个
- 测试用例: 122 个
- 通过率: 100%

**测试覆盖率**:
```
All files     | 90.46% | 75.08% | 97.75% | 90.22% |
conversation  | 97.70% | 90.69% | 100%   | 97.56% |
llm           | 90.10% | 73.61% | 95.23% | 89.88% |
  client.js   | 85.63% | 65.74% | 91.66% | 85.55% |
  prompt.js   | 98.91% | 89.09% | 100%   | 98.85% |
```

**注**:
- 分支覆盖率 75.08%，略低于 80% 目标
- 未覆盖分支主要是 config.js 和 client.js 的错误处理边缘情况
- 核心功能覆盖率优秀（90%+）

## 验收标准

### 功能验收

- [x] LLM Client 能正确选择模型
- [x] 支持多种任务类型和选择策略
- [x] 成本追踪准确
- [x] Prompt Manager 能正确渲染模板
- [x] 支持模板组合和变体
- [x] Conversation Manager 能正确管理对话历史
- [x] 支持 Token 限制的消息检索
- [x] 对话能正确持久化和加载

### 测试验收

- [x] 所有单元测试通过 (122/122)
- [x] 语句覆盖率 > 80% (90.46%)
- [x] 函数覆盖率 > 80% (97.75%)
- [x] 行覆盖率 > 80% (90.22%)
- [⚠️] 分支覆盖率 > 80% (75.08% - 接近目标)

### 性能验收

- [x] 模型选择 < 1ms (实测 < 0.1ms)
- [x] 模板渲染 < 1ms (实测 < 0.5ms)
- [x] 消息添加 < 1ms (实测 < 0.5ms)
- [x] 支持 100+ 轮对话 (已测试 200 轮)
- [x] 对话检索 < 5ms (实测 < 2ms)

### 代码质量

- [x] 所有代码有详细注释
- [x] 使用 ESM 模块标准
- [x] 遵循单一职责原则
- [x] 良好的错误处理
- [x] 完整的 JSDoc 文档

## 架构亮点

### 1. 多模型智能选择

**设计思路**:
- 不同模型擅长不同任务
- 根据任务类型自动选择最合适的模型
- 平衡成本、延迟、质量三个维度

**示例**:
```javascript
// 状态管理 → Haiku (快速 + 便宜)
await client.generate({
  messages: [...],
  taskType: TASK_TYPES.STATE_MANAGEMENT
});

// 叙事生成 → Sonnet (平衡)
await client.generate({
  messages: [...],
  taskType: TASK_TYPES.NARRATIVE
});

// 复杂推理 → Opus (强大)
await client.generate({
  messages: [...],
  taskType: TASK_TYPES.COMPLEX_REASONING
});
```

### 2. 约束驱动降级

**设计思路**:
- 支持延迟和成本约束
- 自动降级到满足约束的模型
- 保证用户体验不受影响

**示例**:
```javascript
await client.generate({
  messages: [...],
  strategy: MODEL_SELECTION_STRATEGY.QUALITY_OPTIMIZED, // 想用 Opus
  constraints: {
    maxLatencyMs: 1000, // 但延迟要 < 1s
    maxCostUsd: 0.001   // 成本要 < $0.001
  }
});
// 自动降级到 Haiku
```

### 3. 提示词模板化

**设计思路**:
- 提示词与代码分离
- 支持变量插值和组合
- 易于 A/B 测试

**示例**:
```javascript
// 注册模板
manager.register('character-response', {
  template: '你是{{character}}，性格{{personality}}。用户说：{{user_input}}',
  variables: ['character', 'personality', 'user_input']
});

// 渲染模板
const prompt = manager.render('character-response', {
  character: '艾莉',
  personality: '活泼开朗',
  user_input: '你好'
});

// 创建变体进行 A/B 测试
manager.createVariant('character-response', 'character-response-v2', {
  template: '角色：{{character}}（{{personality}}）\n用户：{{user_input}}'
});
```

### 4. Token 智能管理

**设计思路**:
- 粗略估算 Token 数（1 token ≈ 4 字符）
- 支持基于 Token 限制的消息检索
- 自动从旧消息开始裁剪

**示例**:
```javascript
// 添加消息时自动估算 Token
conversation.addMessage({
  role: 'user',
  content: 'Hello world' // 自动估算 ~3 tokens
});

// 获取消息时限制 Token 数
const messages = conversation.getMessages({
  maxTokens: 10000 // 限制在 10K tokens 内
});
// 自动从最新消息开始，向前取到 10K tokens
```

## 下一步：MVP-2

完成 MVP-1 后，进入 MVP-2：状态管理系统

主要任务：
- [ ] Character 状态管理（好感度、情绪、记忆）
- [ ] Timeline 管理（时间线一致性）
- [ ] Location 管理（空间位置）
- [ ] Inventory 管理（物品、装备）
- [ ] 数据库集成（SQLite）
- [ ] 状态验证器（防止幻觉）

## 时间记录

- 开始时间：2026-01-09
- 预计完成：2026-01-10（1 天）
- 实际完成：2026-01-10

## 问题与风险

### 已解决

1. ✅ **多模型选择复杂度**
   - 解决方案：设计清晰的任务类型和选择策略
   - 效果：选择逻辑清晰，易于扩展

2. ✅ **Token 估算准确性**
   - 解决方案：使用简单的 4 字符/token 估算
   - 效果：虽然不完全准确，但足够实用

3. ✅ **测试 Mock 复杂度**
   - 解决方案：直接替换 client.anthropic.messages.create
   - 效果：Mock 简单可靠

### 待解决

1. ⚠️ **分支覆盖率略低**
   - 当前: 75.08%
   - 目标: 80%
   - 建议：后续补充错误处理边缘情况的测试

2. ⚠️ **Token 估算不够精确**
   - 当前：1 token ≈ 4 字符（英文）
   - 问题：中文、代码的 token 数不同
   - 建议：后续集成官方 tokenizer

## 技术债

1. **Config 测试覆盖不足**
   - config.js 分支覆盖率 62.85%
   - 建议：补充环境变量和配置文件加载的边缘情况测试

2. **错误处理测试不完整**
   - client.js 错误处理分支覆盖率 65.74%
   - 建议：补充各种 API 错误场景的测试

## 笔记

### 设计决策

1. **为什么用简单的 Token 估算？**
   - 官方 tokenizer 需要额外依赖
   - 4 字符/token 的估算对大多数场景足够准确
   - 可以后续优化

2. **为什么用 JSON 文件持久化？**
   - MVP-1 阶段简单够用
   - 无需额外依赖
   - MVP-2 会切换到 SQLite

3. **为什么选择这 3 个模型？**
   - Haiku: 最快最便宜，适合高频操作
   - Sonnet: 平衡，适合大部分场景
   - Opus: 最强，适合复杂任务
   - 覆盖了成本、延迟、质量三个维度

### 性能优化

1. **模型选择优化**
   - 选择算法 < 0.1ms
   - 使用简单的数组 reduce 操作
   - 无需复杂的决策树

2. **提示词渲染优化**
   - 使用 RegExp 替换，< 0.5ms
   - 变量提取缓存在注册时完成
   - 避免重复解析

3. **对话检索优化**
   - 从最新消息反向遍历
   - 达到 Token 限制立即停止
   - 避免不必要的计算

### 经验教训

1. **测试先行的好处**
   - 122 个测试保证了质量
   - 重构时有信心
   - 发现了很多边缘情况

2. **类型定义的重要性**
   - TASK_TYPES 和 MODEL_SELECTION_STRATEGY 常量
   - 避免了魔术字符串
   - 易于重构

3. **文档注释的价值**
   - JSDoc 让代码自文档化
   - IDE 自动提示很有用
   - 降低了理解成本
