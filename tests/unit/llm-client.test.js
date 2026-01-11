/**
 * LLM Client 单元测试
 *
 * 测试内容：
 * - 多模型选择策略
 * - 成本计算
 * - 延迟约束
 * - 统计追踪
 * - 错误处理
 */

import { jest } from '@jest/globals';
import LLMClient, { MODELS, TASK_TYPES, MODEL_SELECTION_STRATEGY } from '../../src/llm/client.js';

describe('LLMClient', () => {
  let client;
  let mockCreate;

  beforeEach(() => {
    // 创建测试客户端
    client = new LLMClient({
      apiKey: 'test-api-key',
      defaultStrategy: MODEL_SELECTION_STRATEGY.BALANCED
    });

    // Mock API 响应
    mockCreate = jest.fn().mockResolvedValue({
      id: 'msg_test123',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'Test response' }],
      model: 'claude-sonnet-4-5-20250929',
      usage: {
        input_tokens: 100,
        output_tokens: 50
      }
    });

    // 用 mock 替换真实的 API 方法
    client.anthropic.messages.create = mockCreate;
  });

  describe('模型选择', () => {
    test('应该根据任务类型选择合适的模型', () => {
      // 状态管理任务应该选择 Haiku（快速+便宜）
      const stateModel = client._selectModel({
        taskType: TASK_TYPES.STATE_MANAGEMENT
      });
      expect(stateModel.id).toBe(MODELS.HAIKU.id);

      // 叙事任务应该选择 Sonnet（平衡）
      const narrativeModel = client._selectModel({
        taskType: TASK_TYPES.NARRATIVE
      });
      expect(narrativeModel.id).toBe(MODELS.SONNET.id);

      // 复杂推理应该选择 Opus（强大）
      const reasoningModel = client._selectModel({
        taskType: TASK_TYPES.COMPLEX_REASONING
      });
      expect(reasoningModel.id).toBe(MODELS.OPUS.id);
    });

    test('延迟优化策略应该选择最快的模型', () => {
      const model = client._selectModel({
        taskType: TASK_TYPES.GENERAL,
        strategy: MODEL_SELECTION_STRATEGY.LATENCY_OPTIMIZED
      });
      expect(model.id).toBe(MODELS.HAIKU.id); // Haiku 最快
    });

    test('成本优化策略应该选择最便宜的模型', () => {
      const model = client._selectModel({
        taskType: TASK_TYPES.GENERAL,
        strategy: MODEL_SELECTION_STRATEGY.COST_OPTIMIZED
      });
      expect(model.id).toBe(MODELS.HAIKU.id); // Haiku 最便宜
    });

    test('质量优化策略应该选择最强大的模型', () => {
      const model = client._selectModel({
        taskType: TASK_TYPES.GENERAL,
        strategy: MODEL_SELECTION_STRATEGY.QUALITY_OPTIMIZED
      });
      expect(model.id).toBe(MODELS.OPUS.id); // Opus 最强大
    });
  });

  describe('约束检查', () => {
    test('应该遵守最大延迟约束', () => {
      // 设置严格的延迟限制（只有 Haiku 能满足）
      const model = client._selectModel({
        taskType: TASK_TYPES.GENERAL,
        strategy: MODEL_SELECTION_STRATEGY.QUALITY_OPTIMIZED,
        constraints: {
          maxLatencyMs: 1000
        },
        messages: [{ role: 'user', content: 'test' }]
      });

      // 即使策略是质量优先，也应该降级到 Haiku
      expect(model.id).toBe(MODELS.HAIKU.id);
    });

    test('应该遵守最大成本约束', () => {
      // 设置严格的成本限制（排除 Opus）
      const model = client._selectModel({
        taskType: TASK_TYPES.GENERAL,
        strategy: MODEL_SELECTION_STRATEGY.QUALITY_OPTIMIZED,
        constraints: {
          maxCostUsd: 0.0001
        },
        messages: [{ role: 'user', content: 'test' }]
      });

      // 应该降级到 Haiku
      expect(model.id).toBe(MODELS.HAIKU.id);
    });

    test('没有模型满足约束时应该选择最接近的', () => {
      const model = client._selectModel({
        taskType: TASK_TYPES.GENERAL,
        constraints: {
          maxLatencyMs: 100 // 极端严格的要求
        },
        messages: [{ role: 'user', content: 'test' }]
      });

      // 应该选择最快的模型（Haiku）
      expect(model.id).toBe(MODELS.HAIKU.id);
    });
  });

  describe('成本计算', () => {
    test('应该正确计算单次请求成本', () => {
      const cost = client._calculateCost(MODELS.SONNET, {
        input_tokens: 1000,
        output_tokens: 500
      });

      // Sonnet: $3/1M input, $15/1M output
      // (1000/1M * 3) + (500/1M * 15) = 0.003 + 0.0075 = 0.0105
      expect(cost).toBeCloseTo(0.0105, 4);
    });

    test('应该累积总成本', async () => {
      await client.generate({
        messages: [{ role: 'user', content: 'Hello' }]
      });

      const stats = client.getStats();
      expect(parseFloat(stats.summary.totalCostUsd)).toBeGreaterThan(0);
    });
  });

  describe('统计追踪', () => {
    test('应该按模型追踪请求统计', async () => {
      // 发送多个请求
      await client.generate({
        messages: [{ role: 'user', content: 'Test 1' }],
        taskType: TASK_TYPES.STATE_MANAGEMENT // 使用 Haiku
      });

      await client.generate({
        messages: [{ role: 'user', content: 'Test 2' }],
        taskType: TASK_TYPES.NARRATIVE // 使用 Sonnet
      });

      const stats = client.getStats();

      // 应该有两个模型的统计
      expect(stats.byModel.length).toBeGreaterThan(0);

      // 总请求数应该是 2
      expect(stats.summary.totalRequests).toBe(2);
    });

    test('应该追踪 Token 使用量', async () => {
      await client.generate({
        messages: [{ role: 'user', content: 'Hello' }]
      });

      const stats = client.getStats();
      expect(stats.summary.totalTokens).toBeGreaterThan(0);
    });

    test('应该追踪平均延迟', async () => {
      await client.generate({
        messages: [{ role: 'user', content: 'Test' }]
      });

      const stats = client.getStats();
      expect(stats.summary.averageLatencyMs).toBeGreaterThanOrEqual(0);
      expect(stats.summary.totalRequests).toBe(1);
    });
  });

  describe('错误处理', () => {
    test('API 错误时应该抛出异常', async () => {
      mockCreate.mockRejectedValueOnce(new Error('API Error'));

      await expect(
        client.generate({
          messages: [{ role: 'user', content: 'Test' }]
        })
      ).rejects.toThrow();
    });

    test('无效消息格式应该抛出异常', async () => {
      await expect(
        client.generate({
          messages: [] // 空消息列表
        })
      ).rejects.toThrow('messages cannot be empty');
    });

    test('缺少必需字段应该抛出异常', async () => {
      await expect(
        client.generate({
          messages: [{ role: 'user' }] // 缺少 content
        })
      ).rejects.toThrow('Each message must have role and content');
    });
  });

  describe('高级功能', () => {
    test('应该支持流式响应', async () => {
      // Mock stream 对象
      const mockStreamObject = {
        async *[Symbol.asyncIterator]() {
          yield {
            type: 'message_start',
            message: { usage: { input_tokens: 50 } }
          };
          yield {
            type: 'content_block_delta',
            delta: { type: 'text_delta', text: 'Hello' }
          };
          yield {
            type: 'content_block_delta',
            delta: { type: 'text_delta', text: ' world' }
          };
          yield {
            type: 'message_stop'
          };
        }
      };

      // Mock anthropic.messages.stream
      const mockStream = jest.fn().mockResolvedValue(mockStreamObject);
      client.anthropic.messages.stream = mockStream;

      const chunks = [];
      for await (const chunk of client.generateStream({
        messages: [{ role: 'user', content: 'Test' }]
      })) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
    });

    test('应该支持系统提示词', async () => {
      await client.generate({
        messages: [{ role: 'user', content: 'Hello' }],
        systemPrompt: 'You are a helpful assistant.'
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          system: 'You are a helpful assistant.'
        })
      );
    });

    test('应该支持温度参数', async () => {
      await client.generate({
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.7
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.7
        })
      );
    });
  });

  describe('性能要求', () => {
    test('模型选择应该在 1ms 内完成', () => {
      const start = performance.now();

      for (let i = 0; i < 100; i++) {
        client._selectModel({
          taskType: TASK_TYPES.GENERAL,
          strategy: MODEL_SELECTION_STRATEGY.BALANCED
        });
      }

      const duration = performance.now() - start;
      expect(duration / 100).toBeLessThan(1); // 平均每次 < 1ms
    });

    test('成本计算应该在 0.1ms 内完成', () => {
      const start = performance.now();

      for (let i = 0; i < 1000; i++) {
        client._calculateCost(MODELS.SONNET, {
          input_tokens: 1000,
          output_tokens: 500
        });
      }

      const duration = performance.now() - start;
      expect(duration / 1000).toBeLessThan(0.1);
    });
  });
});
