/**
 * State Validator - 状态验证器
 *
 * 功能：
 * - 角色状态验证（好感度范围、情绪合理性）
 * - 时间线验证（时间顺序、因果关系）
 * - 位置验证（空间可达性、移动速度）
 * - 库存验证（物品存在性、数量合理性）
 * - 规则引擎（可扩展的验证规则）
 *
 * 设计目标：
 * - 拒绝 90% 以上的幻觉内容
 * - 验证延迟 < 20ms
 * - 误报率 < 5%
 *
 * @module state/validator
 * @version 0.1.0
 */

import { logger } from '../core/logger.js';
import DatabaseManager from '../core/database.js';

/**
 * 验证规则类型
 */
export const VALIDATION_TYPES = {
  CHARACTER: 'character',
  TIMELINE: 'timeline',
  LOCATION: 'location',
  INVENTORY: 'inventory',
  GENERAL: 'general'
};

/**
 * 验证严重程度
 */
export const SEVERITY = {
  ERROR: 'error',     // 严重错误，必须拒绝
  WARNING: 'warning', // 警告，建议修正
  INFO: 'info'        // 提示信息
};

/**
 * State Validator 类
 *
 * 使用示例：
 * ```javascript
 * const validator = new StateValidator();
 *
 * // 验证角色状态变化
 * const result = validator.validateCharacterUpdate('char-1', {
 *   affection: 150 // 超出范围
 * });
 *
 * if (!result.passed) {
 *   console.log(result.errors); // 错误列表
 * }
 * ```
 */
class StateValidator {
  /**
   * @param {Object} options - 配置选项
   * @param {DatabaseManager} options.db - 数据库管理器
   * @param {boolean} options.strictMode - 严格模式
   */
  constructor(options = {}) {
    this.options = {
      db: options.db || new DatabaseManager(),
      strictMode: options.strictMode !== false
    };

    this.db = this.options.db;

    // 初始化 logger（必须在 _registerDefaultRules 之前）
    this.logger = logger.child({ module: 'StateValidator' });

    // 验证规则注册表
    this.rules = new Map();

    // 注册默认规则
    this._registerDefaultRules();

    this.logger.info('State Validator initialized', {
      strictMode: this.options.strictMode
    });
  }

  // ============================================
  // 角色状态验证
  // ============================================

  /**
   * 验证角色状态更新
   *
   * @param {string} characterId - 角色 ID
   * @param {Object} updates - 更新数据
   * @returns {Object} 验证结果
   */
  validateCharacterUpdate(characterId, updates) {
    const timer = this.logger.startTimer('validateCharacterUpdate');
    const errors = [];
    const warnings = [];

    try {
      // 获取当前状态
      const currentState = this.db.get('characters', { id: characterId });

      if (!currentState) {
        errors.push({
          field: 'id',
          message: `Character not found: ${characterId}`,
          severity: SEVERITY.ERROR
        });
        return this._buildResult(false, errors, warnings);
      }

      // 验证好感度
      if (updates.affection !== undefined) {
        const affectionErrors = this._validateAffection(
          currentState.affection,
          updates.affection
        );
        errors.push(...affectionErrors);
      }

      // 验证情绪
      if (updates.emotion !== undefined) {
        const emotionErrors = this._validateEmotion(
          currentState.emotion,
          updates.emotion
        );
        errors.push(...emotionErrors);
      }

      // 验证位置
      if (updates.current_location !== undefined) {
        const locationErrors = this._validateLocationChange(
          currentState.current_location,
          updates.current_location
        );
        errors.push(...locationErrors);
      }

      timer.done('validateCharacterUpdate');

      return this._buildResult(errors.length === 0, errors, warnings);
    } catch (error) {
      this.logger.error('Character validation failed', {
        characterId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 验证好感度变化
   * @private
   */
  _validateAffection(currentValue, newValue) {
    const errors = [];

    // 范围检查（0-100）
    if (newValue < 0 || newValue > 100) {
      errors.push({
        field: 'affection',
        message: `Affection must be between 0-100, got ${newValue}`,
        severity: SEVERITY.ERROR,
        currentValue,
        newValue
      });
    }

    // 单次变化幅度检查（±20）
    if (currentValue !== null && currentValue !== undefined) {
      const delta = Math.abs(newValue - currentValue);
      if (delta > 20) {
        errors.push({
          field: 'affection',
          message: `Affection change too large: ${delta} (max 20 per update)`,
          severity: SEVERITY.WARNING,
          currentValue,
          newValue,
          delta
        });
      }
    }

    return errors;
  }

  /**
   * 验证情绪变化
   * @private
   */
  _validateEmotion(currentEmotion, newEmotion) {
    const errors = [];

    // 合法的情绪列表
    const validEmotions = [
      'neutral', 'happy', 'sad', 'angry', 'excited',
      'scared', 'confused', 'calm', 'anxious', 'loving'
    ];

    if (!validEmotions.includes(newEmotion)) {
      errors.push({
        field: 'emotion',
        message: `Invalid emotion: ${newEmotion}`,
        severity: SEVERITY.ERROR,
        validEmotions
      });
    }

    // 情绪转换合理性检查
    const invalidTransitions = {
      'happy': ['sad', 'angry', 'scared'],
      'sad': ['happy', 'excited'],
      'angry': ['happy', 'loving'],
      'calm': ['angry', 'anxious']
    };

    if (currentEmotion && invalidTransitions[currentEmotion]?.includes(newEmotion)) {
      errors.push({
        field: 'emotion',
        message: `Unlikely emotion transition: ${currentEmotion} → ${newEmotion}`,
        severity: SEVERITY.WARNING,
        currentEmotion,
        newEmotion
      });
    }

    return errors;
  }

  /**
   * 验证位置变化
   * @private
   */
  _validateLocationChange(currentLocation, newLocation) {
    const errors = [];

    if (!currentLocation || !newLocation) {
      return errors; // 跳过，允许从/到 null
    }

    // 检查新位置是否存在
    const locationExists = this.db.get('locations', { id: newLocation });
    if (!locationExists) {
      errors.push({
        field: 'current_location',
        message: `Location does not exist: ${newLocation}`,
        severity: SEVERITY.ERROR
      });
      return errors;
    }

    // 检查位置可达性
    const currentLocationData = this.db.get('locations', { id: currentLocation });
    if (currentLocationData && currentLocationData.connected_to) {
      try {
        const connectedLocations = JSON.parse(currentLocationData.connected_to);
        const isReachable = connectedLocations.some(loc => loc.id === newLocation);

        if (!isReachable && currentLocation !== newLocation) {
          errors.push({
            field: 'current_location',
            message: `Location ${newLocation} is not reachable from ${currentLocation}`,
            severity: SEVERITY.WARNING,
            currentLocation,
            newLocation
          });
        }
      } catch (e) {
        // JSON 解析失败，跳过验证
      }
    }

    return errors;
  }

  // ============================================
  // 时间线验证
  // ============================================

  /**
   * 验证时间线事件
   *
   * @param {Object} event - 事件数据
   * @returns {Object} 验证结果
   */
  validateTimelineEvent(event) {
    const timer = this.logger.startTimer('validateTimelineEvent');
    const errors = [];
    const warnings = [];

    try {
      // 验证必需字段
      if (!event.event_type) {
        errors.push({
          field: 'event_type',
          message: 'Event type is required',
          severity: SEVERITY.ERROR
        });
      }

      if (!event.description) {
        errors.push({
          field: 'description',
          message: 'Event description is required',
          severity: SEVERITY.ERROR
        });
      }

      // 验证时间戳
      if (event.timestamp !== undefined) {
        const timestampErrors = this._validateTimestamp(event.timestamp);
        errors.push(...timestampErrors);
      }

      // 验证重要程度
      if (event.importance !== undefined) {
        if (event.importance < 1 || event.importance > 5) {
          errors.push({
            field: 'importance',
            message: `Importance must be between 1-5, got ${event.importance}`,
            severity: SEVERITY.ERROR
          });
        }
      }

      // 验证参与者存在性
      if (event.participants) {
        const participantErrors = this._validateParticipants(event.participants);
        errors.push(...participantErrors);
      }

      timer.done('validateTimelineEvent');

      return this._buildResult(errors.length === 0, errors, warnings);
    } catch (error) {
      this.logger.error('Timeline validation failed', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 验证时间戳
   * @private
   */
  _validateTimestamp(timestamp) {
    const errors = [];

    // 检查是否为合理的时间戳
    if (timestamp < 0) {
      errors.push({
        field: 'timestamp',
        message: `Invalid timestamp: ${timestamp}`,
        severity: SEVERITY.ERROR
      });
    }

    // 检查是否在未来（警告）
    const now = Date.now();
    if (timestamp > now + 86400000) { // 超过当前时间 24 小时
      errors.push({
        field: 'timestamp',
        message: `Timestamp is too far in the future: ${new Date(timestamp).toISOString()}`,
        severity: SEVERITY.WARNING,
        timestamp
      });
    }

    return errors;
  }

  /**
   * 验证参与者
   * @private
   */
  _validateParticipants(participants) {
    const errors = [];

    if (!Array.isArray(participants)) {
      errors.push({
        field: 'participants',
        message: 'Participants must be an array',
        severity: SEVERITY.ERROR
      });
      return errors;
    }

    // 检查参与者数量合理性
    if (participants.length > 10) {
      errors.push({
        field: 'participants',
        message: `Too many participants: ${participants.length} (max 10)`,
        severity: SEVERITY.WARNING
      });
    }

    return errors;
  }

  // ============================================
  // 库存验证
  // ============================================

  /**
   * 验证库存物品
   *
   * @param {string} characterId - 角色 ID
   * @param {Object} item - 物品数据
   * @returns {Object} 验证结果
   */
  validateInventoryItem(characterId, item) {
    const timer = this.logger.startTimer('validateInventoryItem');
    const errors = [];
    const warnings = [];

    try {
      // 验证必需字段
      if (!item.item_name) {
        errors.push({
          field: 'item_name',
          message: 'Item name is required',
          severity: SEVERITY.ERROR
        });
      }

      // 验证数量
      if (item.quantity !== undefined) {
        if (item.quantity < 0) {
          errors.push({
            field: 'quantity',
            message: `Quantity cannot be negative: ${item.quantity}`,
            severity: SEVERITY.ERROR
          });
        }

        if (item.quantity > 999) {
          errors.push({
            field: 'quantity',
            message: `Quantity too large: ${item.quantity} (max 999)`,
            severity: SEVERITY.WARNING
          });
        }
      }

      // 验证装备冲突
      if (item.equipped && item.item_type) {
        const equippedErrors = this._validateEquipmentConflict(
          characterId,
          item.item_type,
          item.id
        );
        errors.push(...equippedErrors);
      }

      timer.done('validateInventoryItem');

      return this._buildResult(errors.length === 0, errors, warnings);
    } catch (error) {
      this.logger.error('Inventory validation failed', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 验证装备冲突
   * @private
   */
  _validateEquipmentConflict(characterId, itemType, currentItemId) {
    const errors = [];

    // 每个槽位只能装备一件
    const slotTypes = ['weapon', 'armor', 'accessory'];

    if (slotTypes.includes(itemType)) {
      const equippedItems = this.db.getAll('inventory', {
        where: {
          character_id: characterId,
          item_type: itemType,
          equipped: 1
        }
      });

      // 如果已经有装备，且不是当前物品
      const conflictingItems = equippedItems.filter(
        item => item.id !== currentItemId
      );

      if (conflictingItems.length > 0) {
        errors.push({
          field: 'equipped',
          message: `Already has equipped ${itemType}: ${conflictingItems[0].item_name}`,
          severity: SEVERITY.WARNING,
          conflictingItem: conflictingItems[0].item_name
        });
      }
    }

    return errors;
  }

  // ============================================
  // 规则引擎
  // ============================================

  /**
   * 注册验证规则
   *
   * @param {string} name - 规则名称
   * @param {Function} validator - 验证函数
   * @param {string} type - 验证类型
   */
  registerRule(name, validator, type = VALIDATION_TYPES.GENERAL) {
    this.rules.set(name, {
      validator,
      type
    });

    this.logger.debug('Rule registered', { name, type });
  }

  /**
   * 注册默认规则
   * @private
   */
  _registerDefaultRules() {
    // 示例：禁止负数好感度
    this.registerRule('no-negative-affection', (data) => {
      if (data.affection !== undefined && data.affection < 0) {
        return {
          passed: false,
          errors: [{
            field: 'affection',
            message: 'Affection cannot be negative',
            severity: SEVERITY.ERROR
          }]
        };
      }
      return { passed: true, errors: [] };
    }, VALIDATION_TYPES.CHARACTER);

    // 示例：时间戳不能为负数
    this.registerRule('no-negative-timestamp', (data) => {
      if (data.timestamp !== undefined && data.timestamp < 0) {
        return {
          passed: false,
          errors: [{
            field: 'timestamp',
            message: 'Timestamp cannot be negative',
            severity: SEVERITY.ERROR
          }]
        };
      }
      return { passed: true, errors: [] };
    }, VALIDATION_TYPES.TIMELINE);
  }

  /**
   * 执行自定义规则验证
   *
   * @param {Object} data - 待验证数据
   * @param {string} type - 验证类型
   * @returns {Object} 验证结果
   */
  validateWithRules(data, type) {
    const errors = [];
    const warnings = [];

    // 获取对应类型的规则
    for (const [name, rule] of this.rules.entries()) {
      if (rule.type === type || rule.type === VALIDATION_TYPES.GENERAL) {
        try {
          const result = rule.validator(data);
          if (!result.passed) {
            errors.push(...result.errors);
          }
          if (result.warnings) {
            warnings.push(...result.warnings);
          }
        } catch (error) {
          this.logger.error('Rule execution failed', {
            rule: name,
            error: error.message
          });
        }
      }
    }

    return this._buildResult(errors.length === 0, errors, warnings);
  }

  // ============================================
  // 验证日志
  // ============================================

  /**
   * 记录验证日志
   *
   * @param {string} validationType - 验证类型
   * @param {boolean} passed - 是否通过
   * @param {Object} details - 详情
   */
  logValidation(validationType, passed, details = {}) {
    try {
      this.db.insert('validation_logs', {
        timestamp: Date.now(),
        validation_type: validationType,
        passed: passed ? 1 : 0,
        details: JSON.stringify(details)
      });
    } catch (error) {
      this.logger.error('Failed to log validation', {
        error: error.message
      });
    }
  }

  /**
   * 获取验证统计
   *
   * @param {Object} options - 查询选项
   * @returns {Object} 统计数据
   */
  getValidationStats(options = {}) {
    try {
      const where = {};

      if (options.validationType) {
        where.validation_type = options.validationType;
      }

      const logs = this.db.getAll('validation_logs', {
        where,
        orderBy: 'timestamp',
        order: 'DESC',
        limit: options.limit || 100
      });

      const total = logs.length;
      const passed = logs.filter(log => log.passed === 1).length;
      const failed = total - passed;

      return {
        total,
        passed,
        failed,
        passRate: total > 0 ? ((passed / total) * 100).toFixed(2) + '%' : '0%',
        recentLogs: logs.slice(0, 10)
      };
    } catch (error) {
      this.logger.error('Failed to get validation stats', {
        error: error.message
      });
      return null;
    }
  }

  // ============================================
  // 工具方法
  // ============================================

  /**
   * 构建验证结果
   * @private
   */
  _buildResult(passed, errors, warnings) {
    return {
      passed,
      errors: errors.filter(e => e.severity === SEVERITY.ERROR),
      warnings: warnings.concat(errors.filter(e => e.severity === SEVERITY.WARNING)),
      info: errors.filter(e => e.severity === SEVERITY.INFO)
    };
  }
}

/**
 * 导出
 */
export default StateValidator;
