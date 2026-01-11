/**
 * State Integrator - 状态集成器
 *
 * 功能：
 * - 协调 Extractor, Validator, Manager
 * - 处理对话流程中的状态更新
 * - 自动提取、验证、应用状态变化
 *
 * 设计目标：
 * - 一站式 API
 * - 自动化工作流
 * - 错误处理和回滚
 *
 * @module state/integrator
 * @version 0.1.0
 */

import { logger } from '../core/logger.js';
import DatabaseManager from '../core/database.js';
import StateManager from './manager.js';
import StateValidator from './validator.js';
import StateExtractor from './extractor.js';

/**
 * State Integrator 类
 *
 * 使用示例：
 * ```javascript
 * const integrator = new StateIntegrator();
 *
 * // 处理 LLM 回复
 * const result = await integrator.processMessage(characterId, messageText);
 *
 * console.log(result.updates);     // 应用的状态更新
 * console.log(result.errors);      // 验证错误
 * console.log(result.warnings);    // 验证警告
 * ```
 */
class StateIntegrator {
  /**
   * @param {Object} options - 配置选项
   * @param {DatabaseManager} options.db - 数据库管理器
   * @param {StateManager} options.stateManager - 状态管理器
   * @param {StateValidator} options.validator - 状态验证器
   * @param {StateExtractor} options.extractor - 状态提取器
   * @param {boolean} options.autoApply - 自动应用状态变化
   * @param {boolean} options.strictMode - 严格模式（有错误时拒绝所有更新）
   */
  constructor(options = {}) {
    this.options = {
      autoApply: options.autoApply !== false,
      strictMode: options.strictMode !== false,
      ...options
    };

    // 初始化组件
    this.db = options.db || new DatabaseManager();
    this.stateManager = options.stateManager || new StateManager({ db: this.db });
    this.validator = options.validator || new StateValidator({ db: this.db });
    this.extractor = options.extractor || new StateExtractor({
      db: this.db,
      stateManager: this.stateManager
    });

    this.logger = logger.child({ module: 'StateIntegrator' });

    this.logger.info('State Integrator initialized', {
      autoApply: this.options.autoApply,
      strictMode: this.options.strictMode
    });
  }

  /**
   * 处理消息并更新状态
   *
   * @param {string} characterId - 角色 ID
   * @param {string} messageText - 消息文本
   * @param {Object} options - 选项
   * @param {boolean} options.dryRun - 仅模拟，不实际应用
   * @returns {Object} 处理结果
   */
  async processMessage(characterId, messageText, options = {}) {
    const timer = this.logger.startTimer('processMessage');
    const dryRun = options.dryRun || false;

    try {
      // 1. 提取状态变化
      this.logger.debug('Extracting states from message', { characterId });
      const extracted = this.extractor.extractAllStates(characterId, messageText);

      // 2. 验证和应用更新
      const result = {
        extracted,
        updates: [],
        errors: [],
        warnings: []
      };

      // 2a. 验证并应用好感度变化
      if (extracted.affection) {
        const affectionResult = await this._processAffection(
          characterId,
          extracted.affection,
          dryRun
        );
        if (affectionResult.applied) {
          result.updates.push({
            type: 'affection',
            ...affectionResult
          });
        }
        result.errors.push(...affectionResult.errors);
        result.warnings.push(...affectionResult.warnings);
      }

      // 2b. 验证并应用情绪变化
      if (extracted.emotion) {
        const emotionResult = await this._processEmotion(
          characterId,
          extracted.emotion,
          dryRun
        );
        if (emotionResult.applied) {
          result.updates.push({
            type: 'emotion',
            ...emotionResult
          });
        }
        result.errors.push(...emotionResult.errors);
        result.warnings.push(...emotionResult.warnings);
      }

      // 2c. 验证并应用位置变化
      if (extracted.location) {
        const locationResult = await this._processLocation(
          characterId,
          extracted.location,
          dryRun
        );
        if (locationResult.applied) {
          result.updates.push({
            type: 'location',
            ...locationResult
          });
        }
        result.errors.push(...locationResult.errors);
        result.warnings.push(...locationResult.warnings);
      }

      // 2d. 验证并应用库存变化
      if (extracted.inventory && extracted.inventory.length > 0) {
        for (const inventoryChange of extracted.inventory) {
          const inventoryResult = await this._processInventory(
            characterId,
            inventoryChange,
            dryRun
          );
          if (inventoryResult.applied) {
            result.updates.push({
              type: 'inventory',
              ...inventoryResult
            });
          }
          result.errors.push(...inventoryResult.errors);
          result.warnings.push(...inventoryResult.warnings);
        }
      }

      // 2e. 添加时间线事件
      if (extracted.events && extracted.events.length > 0) {
        for (const event of extracted.events) {
          const eventResult = await this._processEvent(event, dryRun);
          if (eventResult.applied) {
            result.updates.push({
              type: 'event',
              ...eventResult
            });
          }
          result.errors.push(...eventResult.errors);
          result.warnings.push(...eventResult.warnings);
        }
      }

      timer.done('processMessage');

      this.logger.info('Message processed', {
        characterId,
        updates: result.updates.length,
        errors: result.errors.length,
        warnings: result.warnings.length
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to process message', {
        error: error.message,
        characterId
      });
      throw error;
    }
  }

  /**
   * 处理好感度变化
   * @private
   */
  async _processAffection(characterId, affectionData, dryRun) {
    const result = {
      applied: false,
      errors: [],
      warnings: [],
      data: affectionData
    };

    try {
      // 验证
      const validation = this.validator.validateCharacterUpdate(characterId, {
        affection: affectionData.newValue
      });

      result.errors = validation.errors;
      result.warnings = validation.warnings;

      // 如果验证通过且不是 dry run，应用更新
      if (validation.passed && !dryRun && this.options.autoApply) {
        this.stateManager.updateCharacterState(characterId, {
          affection: affectionData.newValue
        });
        result.applied = true;
      } else if (!validation.passed && this.options.strictMode) {
        result.applied = false;
      }

      return result;
    } catch (error) {
      result.errors.push({
        field: 'affection',
        message: error.message
      });
      return result;
    }
  }

  /**
   * 处理情绪变化
   * @private
   */
  async _processEmotion(characterId, emotionData, dryRun) {
    const result = {
      applied: false,
      errors: [],
      warnings: [],
      data: emotionData
    };

    try {
      // 验证
      const validation = this.validator.validateCharacterUpdate(characterId, {
        emotion: emotionData.emotion
      });

      result.errors = validation.errors;
      result.warnings = validation.warnings;

      // 如果验证通过且不是 dry run，应用更新
      if (validation.passed && !dryRun && this.options.autoApply) {
        this.stateManager.updateCharacterState(characterId, {
          emotion: emotionData.emotion
        });
        result.applied = true;
      }

      return result;
    } catch (error) {
      result.errors.push({
        field: 'emotion',
        message: error.message
      });
      return result;
    }
  }

  /**
   * 处理位置变化
   * @private
   */
  async _processLocation(characterId, locationData, dryRun) {
    const result = {
      applied: false,
      errors: [],
      warnings: [],
      data: locationData
    };

    try {
      // 尝试找到或创建位置
      let locationId = null;

      // 先尝试通过名称查找
      const existingLocation = this.db.get('locations', {
        name: locationData.location
      });

      if (existingLocation) {
        locationId = existingLocation.id;
      } else if (!dryRun && this.options.autoApply) {
        // 自动创建位置
        const created = this.stateManager.createLocation({
          name: locationData.location,
          type: 'unknown'
        });
        locationId = created.id;
      }

      if (locationId) {
        // 验证
        const validation = this.validator.validateCharacterUpdate(characterId, {
          current_location: locationId
        });

        result.errors = validation.errors;
        result.warnings = validation.warnings;

        // 应用更新
        if (validation.passed && !dryRun && this.options.autoApply) {
          this.stateManager.updateCharacterState(characterId, {
            current_location: locationId
          });
          result.applied = true;
        }
      }

      return result;
    } catch (error) {
      result.errors.push({
        field: 'location',
        message: error.message
      });
      return result;
    }
  }

  /**
   * 处理库存变化
   * @private
   */
  async _processInventory(characterId, inventoryData, dryRun) {
    const result = {
      applied: false,
      errors: [],
      warnings: [],
      data: inventoryData
    };

    try {
      // 验证
      const validation = this.validator.validateInventoryItem(characterId, {
        item_name: inventoryData.item_name,
        quantity: inventoryData.quantity
      });

      result.errors = validation.errors;
      result.warnings = validation.warnings;

      // 应用更新
      if (validation.passed && !dryRun && this.options.autoApply) {
        if (inventoryData.action === 'add') {
          this.stateManager.addInventoryItem(characterId, {
            item_name: inventoryData.item_name,
            quantity: inventoryData.quantity
          });
          result.applied = true;
        } else if (inventoryData.action === 'remove') {
          // 查找物品并删除
          const items = this.stateManager.getInventory(characterId);
          const item = items.find(i =>
            i.item_name.includes(inventoryData.item_name) ||
            inventoryData.item_name.includes(i.item_name)
          );

          if (item) {
            this.stateManager.deleteInventoryItem(item.id);
            result.applied = true;
          }
        }
      }

      return result;
    } catch (error) {
      result.errors.push({
        field: 'inventory',
        message: error.message
      });
      return result;
    }
  }

  /**
   * 处理时间线事件
   * @private
   */
  async _processEvent(eventData, dryRun) {
    const result = {
      applied: false,
      errors: [],
      warnings: [],
      data: eventData
    };

    try {
      // 验证
      const validation = this.validator.validateTimelineEvent(eventData);

      result.errors = validation.errors;
      result.warnings = validation.warnings;

      // 应用更新
      if (validation.passed && !dryRun && this.options.autoApply) {
        this.stateManager.addTimelineEvent(eventData);
        result.applied = true;
      }

      return result;
    } catch (error) {
      result.errors.push({
        field: 'event',
        message: error.message
      });
      return result;
    }
  }

  /**
   * 获取统计信息
   *
   * @returns {Object} 统计数据
   */
  getStats() {
    return {
      stateManager: this.stateManager.getStats(),
      validator: this.validator.getValidationStats()
    };
  }

  /**
   * 关闭连接
   */
  close() {
    if (this.stateManager) {
      this.stateManager.close();
    }
  }
}

/**
 * 导出
 */
export default StateIntegrator;
