/**
 * LLM Client - 多模型智能客户端
 *
 * 功能：
 * - 支持多个 Claude 模型（Opus, Sonnet, Haiku）
 * - 根据任务类型智能选择模型
 * - 成本追踪和优化
 * - 延迟监控和优化
 * - 自动重试和降级策略
 *
 * 设计理念：
 * - Haiku: 快速（300-800ms）+ 便宜（$0.25/1M）→ 状态管理、验证
 * - Sonnet: 平衡（1500-4000ms）+ 中等（$3/1M）→ 叙事生成
 * - Opus: 强大（2000-5000ms）+ 昂贵（$15/1M）→ 复杂推理
 *
 * @module llm/client
 * @version 0.1.0
 */

import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../core/logger.js';
import { config } from '../core/config.js';

/**
 * 模型定义
 * 包含：模型名称、性能特征、成本信息
 */
export const MODELS = {
  OPUS: {
    id: 'claude-opus-4-5-20251101',
    name: 'Opus 4.5',
    tier: 'premium',
    avgLatencyMs: 3500,
    maxLatencyMs: 5000,
    costPer1MInput: 15.00,
    costPer1MOutput: 75.00,
    bestFor: ['complex_reasoning', 'creative_writing', 'code_generation'],
    description: '最强大的模型，适合复杂推理和创意任务'
  },
  SONNET: {
    id: 'claude-sonnet-4-5-20250929',
    name: 'Sonnet 4.5',
    tier: 'balanced',
    avgLatencyMs: 2500,
    maxLatencyMs: 4000,
    costPer1MInput: 3.00,
    costPer1MOutput: 15.00,
    bestFor: ['narrative', 'conversation', 'general_tasks'],
    description: '平衡性能和成本，适合叙事生成和对话'
  },
  HAIKU: {
    id: 'claude-haiku-3-5-20241022',
    name: 'Haiku 3.5',
    tier: 'fast',
    avgLatencyMs: 500,
    maxLatencyMs: 800,
    costPer1MInput: 0.25,
    costPer1MOutput: 1.25,
    bestFor: ['classification', 'validation', 'state_management', 'fast_response'],
    description: '最快且最便宜，适合逻辑任务和快速响应'
  }
};

/**
 * 任务类型定义
 * 帮助系统智能选择最合适的模型
 */
export const TASK_TYPES = {
  // 叙事相关
  NARRATIVE: 'narrative',                // 叙事生成
  CONVERSATION: 'conversation',          // 对话
  SCENE_DESCRIPTION: 'scene_description', // 场景描述

  // 逻辑相关
  STATE_MANAGEMENT: 'state_management',  // 状态管理
  VALIDATION: 'validation',              // 验证
  CLASSIFICATION: 'classification',      // 分类

  // 复杂推理
  COMPLEX_REASONING: 'complex_reasoning', // 复杂推理
  PLANNING: 'planning',                  // 规划
  CODE_GENERATION: 'code_generation',    // 代码生成

  // 通用
  GENERAL: 'general'                     // 通用任务
};

/**
 * 模型选择策略
 */
export const MODEL_SELECTION_STRATEGY = {
  // 成本优先：尽可能使用便宜的模型
  COST_OPTIMIZED: 'cost_optimized',

  // 延迟优先：尽可能使用快速的模型
  LATENCY_OPTIMIZED: 'latency_optimized',

  // 质量优先：使用最好的模型
  QUALITY_OPTIMIZED: 'quality_optimized',

  // 平衡：在成本、延迟、质量间平衡
  BALANCED: 'balanced'
};

/**
 * LLM 客户端类
 */
class LLMClient {
  /**
   * @param {Object} options - 配置选项
   * @param {string} options.apiKey - API 密钥
   * @param {string} options.defaultStrategy - 默认选择策略
   * @param {number} options.maxRetries - 最大重试次数
   * @param {number} options.timeoutMs - 请求超时时间
   */
  constructor(options = {}) {
    this.options = {
      apiKey: options.apiKey || config.get('llm.anthropic.apiKey'),
      defaultStrategy: options.defaultStrategy || MODEL_SELECTION_STRATEGY.BALANCED,
      maxRetries: options.maxRetries || 3,
      timeoutMs: options.timeoutMs || config.get('llm.anthropic.timeoutMs', 30000)
    };

    // 创建 Anthropic 客户端
    this.anthropic = new Anthropic({
      apiKey: this.options.apiKey,
      maxRetries: this.options.maxRetries,
      timeout: this.options.timeoutMs
    });

    // 统计信息（按模型分类）
    this.stats = {
      byModel: {
        [MODELS.OPUS.id]: this._createModelStats(),
        [MODELS.SONNET.id]: this._createModelStats(),
        [MODELS.HAIKU.id]: this._createModelStats()
      },
      total: this._createModelStats()
    };

    // 成本累计（单位：美元）
    this.costAccumulated = 0;

    this.logger = logger.child({ module: 'LLMClient' });

    this.logger.info('LLM Client initialized', {
      defaultStrategy: this.options.defaultStrategy,
      supportedModels: Object.keys(MODELS).length
    });
  }

  /**
   * 创建模型统计对象
   * @private
   */
  _createModelStats() {
    return {
      requests: 0,
      successes: 0,
      failures: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalLatencyMs: 0,
      totalCostUsd: 0
    };
  }

  /**
   * 智能生成文本（自动选择模型）
   *
   * @param {Object} params - 生成参数
   * @param {Array} params.messages - 消息数组
   * @param {string} params.taskType - 任务类型（来自 TASK_TYPES）
   * @param {string} params.strategy - 选择策略（可选，覆盖默认策略）
   * @param {string} params.model - 强制使用的模型（可选，跳过智能选择）
   * @param {Object} params.constraints - 约束条件（可选）
   * @param {number} params.constraints.maxLatencyMs - 最大延迟要求
   * @param {number} params.constraints.maxCostUsd - 最大成本要求
   * @param {number} params.maxTokens - 最大 token 数
   * @param {number} params.temperature - 温度参数
   * @param {string} params.systemPrompt - 系统提示词
   * @returns {Promise<Object>} 响应对象
   */
  async generate(params) {
    const requestId = logger.generateRequestId();
    this.logger.setContext({ requestId });

    const timer = this.logger.startTimer('LLM generate');
    const startTime = Date.now();

    try {
      // 参数校验
      this._validateParams(params);

      // 选择模型
      const selectedModel = params.model
        ? this._getModelById(params.model)
        : this._selectModel(params);

      this.logger.info('Model selected', {
        model: selectedModel.name,
        taskType: params.taskType,
        strategy: params.strategy || this.options.defaultStrategy,
        estimatedLatency: selectedModel.avgLatencyMs,
        estimatedCost: this._estimateCost(selectedModel, params.messages)
      });

      // 构建请求参数
      const requestParams = this._buildRequestParams(params, selectedModel);

      // 统计
      const modelStats = this.stats.byModel[selectedModel.id];
      modelStats.requests++;
      this.stats.total.requests++;

      // 调用 API
      const response = await this.anthropic.messages.create(requestParams);

      // 计算实际指标
      const latencyMs = Date.now() - startTime;
      const cost = this._calculateCost(selectedModel, response.usage);

      // 解析响应
      const result = this._parseResponse(response, latencyMs, selectedModel, cost);

      // 更新统计
      modelStats.successes++;
      modelStats.totalInputTokens += result.usage.inputTokens;
      modelStats.totalOutputTokens += result.usage.outputTokens;
      modelStats.totalLatencyMs += latencyMs;
      modelStats.totalCostUsd += cost;

      this.stats.total.successes++;
      this.stats.total.totalInputTokens += result.usage.inputTokens;
      this.stats.total.totalOutputTokens += result.usage.outputTokens;
      this.stats.total.totalLatencyMs += latencyMs;
      this.stats.total.totalCostUsd += cost;

      this.costAccumulated += cost;

      timer.done('LLM generate completed');

      this.logger.info('LLM response received', {
        model: result.model.name,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        latencyMs: result.latencyMs,
        costUsd: result.costUsd,
        stopReason: result.stopReason
      });

      // 检查是否超出约束
      if (params.constraints) {
        this._checkConstraints(result, params.constraints);
      }

      return result;

    } catch (error) {
      const latencyMs = Date.now() - startTime;

      // 更新失败统计
      this.stats.total.failures++;

      timer.done('LLM generate failed');

      this.logger.error('LLM request failed', {
        error: error.message,
        errorType: error.constructor.name,
        latencyMs,
        taskType: params.taskType
      });

      throw this._handleError(error);
    } finally {
      this.logger.clearContext();
    }
  }

  /**
   * 流式生成（支持模型选择）
   *
   * @param {Object} params - 同 generate()
   * @returns {AsyncIterator} 异步迭代器
   */
  async *generateStream(params) {
    const requestId = logger.generateRequestId();
    this.logger.setContext({ requestId });

    const timer = this.logger.startTimer('LLM generateStream');
    const startTime = Date.now();

    try {
      this._validateParams(params);

      // 选择模型
      const selectedModel = params.model
        ? this._getModelById(params.model)
        : this._selectModel(params);

      this.logger.info('Streaming with model', {
        model: selectedModel.name,
        taskType: params.taskType
      });

      // 构建请求参数（启用流式）
      const requestParams = {
        ...this._buildRequestParams(params, selectedModel),
        stream: true
      };

      const modelStats = this.stats.byModel[selectedModel.id];
      modelStats.requests++;
      this.stats.total.requests++;

      // 调用流式 API
      const stream = await this.anthropic.messages.stream(requestParams);

      let inputTokens = 0;
      let outputTokens = 0;

      for await (const event of stream) {
        if (event.type === 'message_start') {
          inputTokens = event.message.usage.input_tokens;
        } else if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            outputTokens++;
            yield {
              content: event.delta.text,
              delta: true,
              finished: false
            };
          }
        } else if (event.type === 'message_stop') {
          const latencyMs = Date.now() - startTime;
          const cost = this._calculateCost(selectedModel, {
            input_tokens: inputTokens,
            output_tokens: outputTokens
          });

          // 更新统计
          modelStats.successes++;
          modelStats.totalInputTokens += inputTokens;
          modelStats.totalOutputTokens += outputTokens;
          modelStats.totalLatencyMs += latencyMs;
          modelStats.totalCostUsd += cost;

          this.stats.total.successes++;
          this.stats.total.totalInputTokens += inputTokens;
          this.stats.total.totalOutputTokens += outputTokens;
          this.stats.total.totalLatencyMs += latencyMs;
          this.stats.total.totalCostUsd += cost;

          this.costAccumulated += cost;

          timer.done('LLM generateStream completed');

          yield {
            content: '',
            delta: false,
            finished: true,
            stats: {
              inputTokens,
              outputTokens,
              latencyMs,
              costUsd: cost,
              model: selectedModel.name
            }
          };
        }
      }

    } catch (error) {
      this.stats.total.failures++;
      timer.done('LLM generateStream failed');

      this.logger.error('LLM streaming failed', {
        error: error.message
      });

      throw this._handleError(error);
    } finally {
      this.logger.clearContext();
    }
  }

  /**
   * 智能选择模型
   * 根据任务类型和策略选择最合适的模型
   * @private
   */
  _selectModel(params) {
    const taskType = params.taskType || TASK_TYPES.GENERAL;
    const strategy = params.strategy || this.options.defaultStrategy;

    // 1. 根据任务类型筛选合适的模型
    let candidates = Object.values(MODELS);

    // 如果任务类型明确，筛选擅长该任务的模型
    if (taskType !== TASK_TYPES.GENERAL) {
      candidates = candidates.filter(model =>
        model.bestFor.includes(taskType)
      );

      // 如果没有明确擅长的模型，使用所有模型
      if (candidates.length === 0) {
        candidates = Object.values(MODELS);
      }
    }

    // 2. 根据策略选择模型
    let selectedModel;

    switch (strategy) {
      case MODEL_SELECTION_STRATEGY.COST_OPTIMIZED:
        // 选择最便宜的模型
        selectedModel = candidates.reduce((cheapest, model) =>
          model.costPer1MInput < cheapest.costPer1MInput ? model : cheapest
        );
        break;

      case MODEL_SELECTION_STRATEGY.LATENCY_OPTIMIZED:
        // 选择最快的模型
        selectedModel = candidates.reduce((fastest, model) =>
          model.avgLatencyMs < fastest.avgLatencyMs ? model : fastest
        );
        break;

      case MODEL_SELECTION_STRATEGY.QUALITY_OPTIMIZED:
        // 选择最强大的模型
        selectedModel = candidates.reduce((best, model) =>
          model.costPer1MInput > best.costPer1MInput ? model : best
        );
        break;

      case MODEL_SELECTION_STRATEGY.BALANCED:
      default:
        // 平衡策略：根据任务类型选择
        if ([TASK_TYPES.STATE_MANAGEMENT, TASK_TYPES.VALIDATION, TASK_TYPES.CLASSIFICATION].includes(taskType)) {
          // 逻辑任务 → Haiku
          selectedModel = MODELS.HAIKU;
        } else if ([TASK_TYPES.COMPLEX_REASONING, TASK_TYPES.PLANNING, TASK_TYPES.CODE_GENERATION].includes(taskType)) {
          // 复杂任务 → Opus
          selectedModel = MODELS.OPUS;
        } else {
          // 叙事/对话任务 → Sonnet
          selectedModel = MODELS.SONNET;
        }
        break;
    }

    // 3. 检查约束条件
    if (params.constraints) {
      if (params.constraints.maxLatencyMs && selectedModel.avgLatencyMs > params.constraints.maxLatencyMs) {
        // 延迟超限，降级到更快的模型
        this.logger.warn('Latency constraint violated, downgrading model', {
          original: selectedModel.name,
          maxLatency: params.constraints.maxLatencyMs
        });
        selectedModel = MODELS.HAIKU;
      }

      if (params.constraints.maxCostUsd) {
        const estimatedCost = this._estimateCost(selectedModel, params.messages);
        if (estimatedCost > params.constraints.maxCostUsd) {
          // 成本超限，降级到更便宜的模型
          this.logger.warn('Cost constraint violated, downgrading model', {
            original: selectedModel.name,
            estimatedCost,
            maxCost: params.constraints.maxCostUsd
          });
          selectedModel = MODELS.HAIKU;
        }
      }
    }

    return selectedModel;
  }

  /**
   * 根据 ID 获取模型
   * @private
   */
  _getModelById(modelId) {
    const model = Object.values(MODELS).find(m => m.id === modelId);
    if (!model) {
      throw new Error(`Unknown model: ${modelId}`);
    }
    return model;
  }

  /**
   * 估算成本
   * @private
   */
  _estimateCost(model, messages) {
    // 粗略估算：每个消息 ~100 tokens
    const estimatedInputTokens = messages.length * 100;
    const estimatedOutputTokens = 200; // 假设输出 200 tokens

    const inputCost = (estimatedInputTokens / 1000000) * model.costPer1MInput;
    const outputCost = (estimatedOutputTokens / 1000000) * model.costPer1MOutput;

    return inputCost + outputCost;
  }

  /**
   * 计算实际成本
   * @private
   */
  _calculateCost(model, usage) {
    const inputCost = (usage.input_tokens / 1000000) * model.costPer1MInput;
    const outputCost = (usage.output_tokens / 1000000) * model.costPer1MOutput;

    return inputCost + outputCost;
  }

  /**
   * 检查约束条件
   * @private
   */
  _checkConstraints(result, constraints) {
    if (constraints.maxLatencyMs && result.latencyMs > constraints.maxLatencyMs) {
      this.logger.warn('Latency constraint exceeded', {
        actual: result.latencyMs,
        max: constraints.maxLatencyMs
      });
    }

    if (constraints.maxCostUsd && result.costUsd > constraints.maxCostUsd) {
      this.logger.warn('Cost constraint exceeded', {
        actual: result.costUsd,
        max: constraints.maxCostUsd
      });
    }
  }

  /**
   * 构建请求参数
   * @private
   */
  _buildRequestParams(params, model) {
    const requestParams = {
      model: model.id,
      max_tokens: params.maxTokens || 1000,
      temperature: params.temperature !== undefined ? params.temperature : 0.8,
      messages: params.messages
    };

    if (params.systemPrompt) {
      requestParams.system = params.systemPrompt;
    }

    if (params.stopSequences) {
      requestParams.stop_sequences = params.stopSequences;
    }

    return requestParams;
  }

  /**
   * 校验参数
   * @private
   */
  _validateParams(params) {
    if (!params.messages || !Array.isArray(params.messages)) {
      throw new Error('messages must be an array');
    }

    if (params.messages.length === 0) {
      throw new Error('messages cannot be empty');
    }

    for (const msg of params.messages) {
      if (!msg.role || !msg.content) {
        throw new Error('Each message must have role and content');
      }

      if (!['user', 'assistant'].includes(msg.role)) {
        throw new Error(`Invalid message role: ${msg.role}`);
      }
    }
  }

  /**
   * 解析响应
   * @private
   */
  _parseResponse(response, latencyMs, model, cost) {
    const content = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('');

    return {
      content,
      model: {
        id: model.id,
        name: model.name
      },
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens
      },
      stopReason: response.stop_reason,
      latencyMs,
      costUsd: cost
    };
  }

  /**
   * 错误处理
   * @private
   */
  _handleError(error) {
    if (error instanceof Anthropic.APIError) {
      if (error.status === 429) {
        return new Error(`Rate limit exceeded: ${error.message}`);
      }
      if (error.status === 401) {
        return new Error(`Authentication failed: ${error.message}`);
      }
      if (error.status === 400) {
        return new Error(`Invalid request: ${error.message}`);
      }
      if (error.status >= 500) {
        return new Error(`API server error: ${error.message}`);
      }
    }

    if (error.name === 'AbortError' || error.message.includes('timeout')) {
      return new Error(`Request timeout after ${this.options.timeoutMs}ms`);
    }

    return error;
  }

  /**
   * 获取统计信息
   * @returns {Object} 统计数据
   */
  getStats() {
    const total = this.stats.total;

    return {
      summary: {
        totalRequests: total.requests,
        successRate: total.requests > 0
          ? ((total.successes / total.requests) * 100).toFixed(2) + '%'
          : '0%',
        totalCostUsd: total.totalCostUsd.toFixed(4),
        averageLatencyMs: total.successes > 0
          ? Math.round(total.totalLatencyMs / total.successes)
          : 0,
        totalTokens: total.totalInputTokens + total.totalOutputTokens
      },
      byModel: Object.entries(this.stats.byModel).map(([modelId, stats]) => {
        const model = this._getModelById(modelId);
        return {
          model: model.name,
          requests: stats.requests,
          successes: stats.successes,
          avgLatencyMs: stats.successes > 0
            ? Math.round(stats.totalLatencyMs / stats.successes)
            : 0,
          totalCostUsd: stats.totalCostUsd.toFixed(4),
          tokens: stats.totalInputTokens + stats.totalOutputTokens
        };
      }).filter(s => s.requests > 0), // 只显示有请求的模型
      costAccumulated: this.costAccumulated.toFixed(4)
    };
  }

  /**
   * 重置统计
   */
  resetStats() {
    this.stats = {
      byModel: {
        [MODELS.OPUS.id]: this._createModelStats(),
        [MODELS.SONNET.id]: this._createModelStats(),
        [MODELS.HAIKU.id]: this._createModelStats()
      },
      total: this._createModelStats()
    };
    this.costAccumulated = 0;

    this.logger.info('Statistics reset');
  }
}

/**
 * 导出
 */
export default LLMClient;
