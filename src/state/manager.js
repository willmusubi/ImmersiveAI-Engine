/**
 * State Manager - 状态管理系统
 *
 * 功能：
 * - 角色状态管理（好感度、情绪、位置）
 * - 时间线事件管理
 * - 位置信息管理
 * - 物品库存管理
 * - 记忆管理
 * - 状态快照和回滚
 * - 状态缓存（性能优化）
 *
 * 设计原则：
 * - 高性能：缓存热点数据
 * - 一致性：事务保证原子性
 * - 可追溯：快照支持回滚
 *
 * @module state/manager
 * @version 0.1.0
 */

import DatabaseManager from '../core/database.js';
import { logger } from '../core/logger.js';
import { config } from '../core/config.js';
import { randomUUID } from 'crypto';

/**
 * State Manager 类
 *
 * 使用示例：
 * ```javascript
 * const stateManager = new StateManager();
 *
 * // 获取角色状态
 * const character = await stateManager.getCharacterState('char-1');
 *
 * // 更新角色状态
 * await stateManager.updateCharacterState('char-1', {
 *   affection: 60,
 *   emotion: 'happy'
 * });
 *
 * // 添加时间线事件
 * await stateManager.addTimelineEvent({
 *   event_type: 'conversation',
 *   description: 'First meeting',
 *   participants: ['Alice', 'Bob']
 * });
 * ```
 */
class StateManager {
  /**
   * @param {Object} options - 配置选项
   * @param {DatabaseManager} options.db - 数据库管理器实例
   * @param {boolean} options.enableCache - 是否启用缓存
   * @param {number} options.cacheSize - 缓存大小
   */
  constructor(options = {}) {
    this.options = {
      db: options.db || new DatabaseManager(),
      enableCache: options.enableCache !== false,
      cacheSize: options.cacheSize || 100,
      cacheTTL: options.cacheTTL || 60000 // 1 分钟
    };

    this.db = this.options.db;

    // 缓存系统
    this.cache = {
      characters: new Map(),
      locations: new Map(),
      inventory: new Map()
    };

    this.logger = logger.child({ module: 'StateManager' });

    this.logger.info('State Manager initialized', {
      enableCache: this.options.enableCache,
      cacheSize: this.options.cacheSize
    });
  }

  // ============================================
  // 角色状态管理
  // ============================================

  /**
   * 获取角色状态
   *
   * @param {string} characterId - 角色 ID
   * @returns {Object|null} 角色状态
   */
  getCharacterState(characterId) {
    const timer = this.logger.startTimer('getCharacterState');

    try {
      // 检查缓存
      if (this.options.enableCache && this.cache.characters.has(characterId)) {
        const cached = this.cache.characters.get(characterId);
        if (Date.now() - cached.timestamp < this.options.cacheTTL) {
          this.logger.debug('Character state from cache', { characterId });
          timer.done('getCharacterState (cache)');
          return cached.data;
        }
      }

      // 从数据库查询
      const character = this.db.get('characters', { id: characterId });

      if (character && this.options.enableCache) {
        // 更新缓存
        this.cache.characters.set(characterId, {
          data: character,
          timestamp: Date.now()
        });

        // 限制缓存大小
        if (this.cache.characters.size > this.options.cacheSize) {
          const firstKey = this.cache.characters.keys().next().value;
          this.cache.characters.delete(firstKey);
        }
      }

      timer.done('getCharacterState');
      return character;
    } catch (error) {
      this.logger.error('Failed to get character state', {
        characterId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 创建角色
   *
   * @param {Object} data - 角色数据
   * @returns {Object} 创建结果
   */
  createCharacter(data) {
    try {
      const characterData = {
        id: data.id || randomUUID(),
        name: data.name,
        affection: data.affection || 0,
        emotion: data.emotion || 'neutral',
        personality: data.personality ? JSON.stringify(data.personality) : null,
        current_location: data.current_location || null,
        metadata: data.metadata ? JSON.stringify(data.metadata) : null
      };

      const result = this.db.insert('characters', characterData);

      // 清除缓存
      this.cache.characters.delete(characterData.id);

      this.logger.info('Character created', {
        id: result.id,
        name: characterData.name
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to create character', {
        data,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 更新角色状态
   *
   * @param {string} characterId - 角色 ID
   * @param {Object} updates - 更新数据
   * @returns {Object} 更新结果
   */
  updateCharacterState(characterId, updates) {
    try {
      // 序列化 JSON 字段
      const updateData = { ...updates };
      if (updates.personality) {
        updateData.personality = JSON.stringify(updates.personality);
      }
      if (updates.metadata) {
        updateData.metadata = JSON.stringify(updates.metadata);
      }

      const result = this.db.update('characters', { id: characterId }, updateData);

      // 清除缓存
      this.cache.characters.delete(characterId);

      this.logger.info('Character state updated', {
        characterId,
        updates: Object.keys(updates)
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to update character state', {
        characterId,
        updates,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 删除角色
   *
   * @param {string} characterId - 角色 ID
   * @returns {Object} 删除结果
   */
  deleteCharacter(characterId) {
    try {
      const result = this.db.delete('characters', { id: characterId });

      // 清除缓存
      this.cache.characters.delete(characterId);

      this.logger.info('Character deleted', { characterId });

      return result;
    } catch (error) {
      this.logger.error('Failed to delete character', {
        characterId,
        error: error.message
      });
      throw error;
    }
  }

  // ============================================
  // 时间线管理
  // ============================================

  /**
   * 获取时间线事件
   *
   * @param {Object} options - 查询选项
   * @param {number} options.startTime - 开始时间
   * @param {number} options.endTime - 结束时间
   * @param {string} options.eventType - 事件类型
   * @param {number} options.minImportance - 最小重要程度
   * @param {number} options.limit - 限制数量
   * @returns {Array} 事件列表
   */
  getTimeline(options = {}) {
    try {
      const where = {};

      if (options.startTime && options.endTime) {
        where.timestamp = {
          gte: options.startTime,
          lte: options.endTime
        };
      } else if (options.startTime) {
        where.timestamp = { gte: options.startTime };
      } else if (options.endTime) {
        where.timestamp = { lte: options.endTime };
      }

      if (options.eventType) {
        where.event_type = options.eventType;
      }

      if (options.minImportance) {
        where.importance = { gte: options.minImportance };
      }

      const events = this.db.getAll('timeline', {
        where,
        orderBy: 'timestamp',
        order: options.order || 'ASC',
        limit: options.limit
      });

      // 解析 JSON 字段
      return events.map(event => ({
        ...event,
        participants: event.participants ? JSON.parse(event.participants) : [],
        metadata: event.metadata ? JSON.parse(event.metadata) : {}
      }));
    } catch (error) {
      this.logger.error('Failed to get timeline', {
        options,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 添加时间线事件
   *
   * @param {Object} event - 事件数据
   * @returns {Object} 创建结果
   */
  addTimelineEvent(event) {
    try {
      const eventData = {
        id: event.id || randomUUID(),
        timestamp: event.timestamp || Date.now(),
        event_type: event.event_type,
        description: event.description,
        participants: event.participants ? JSON.stringify(event.participants) : null,
        location: event.location || null,
        importance: event.importance || 1,
        metadata: event.metadata ? JSON.stringify(event.metadata) : null
      };

      const result = this.db.insert('timeline', eventData);

      this.logger.info('Timeline event added', {
        id: result.id,
        type: event.event_type
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to add timeline event', {
        event,
        error: error.message
      });
      throw error;
    }
  }

  // ============================================
  // 位置管理
  // ============================================

  /**
   * 获取位置信息
   *
   * @param {string} locationId - 位置 ID
   * @returns {Object|null} 位置信息
   */
  getLocation(locationId) {
    try {
      // 检查缓存
      if (this.options.enableCache && this.cache.locations.has(locationId)) {
        const cached = this.cache.locations.get(locationId);
        if (Date.now() - cached.timestamp < this.options.cacheTTL) {
          return cached.data;
        }
      }

      const location = this.db.get('locations', { id: locationId });

      if (location) {
        // 解析 JSON 字段
        const parsedLocation = {
          ...location,
          connected_to: location.connected_to ? JSON.parse(location.connected_to) : [],
          metadata: location.metadata ? JSON.parse(location.metadata) : {}
        };

        if (this.options.enableCache) {
          this.cache.locations.set(locationId, {
            data: parsedLocation,
            timestamp: Date.now()
          });
        }

        return parsedLocation;
      }

      return null;
    } catch (error) {
      this.logger.error('Failed to get location', {
        locationId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 创建位置
   *
   * @param {Object} data - 位置数据
   * @returns {Object} 创建结果
   */
  createLocation(data) {
    try {
      const locationData = {
        id: data.id || randomUUID(),
        name: data.name,
        type: data.type || null,
        parent_location: data.parent_location || null,
        connected_to: data.connected_to ? JSON.stringify(data.connected_to) : null,
        description: data.description || null,
        metadata: data.metadata ? JSON.stringify(data.metadata) : null
      };

      const result = this.db.insert('locations', locationData);

      this.logger.info('Location created', {
        id: result.id,
        name: data.name
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to create location', {
        data,
        error: error.message
      });
      throw error;
    }
  }

  // ============================================
  // 物品库存管理
  // ============================================

  /**
   * 获取角色库存
   *
   * @param {string} characterId - 角色 ID
   * @param {Object} options - 查询选项
   * @returns {Array} 库存列表
   */
  getInventory(characterId, options = {}) {
    try {
      const where = { character_id: characterId };

      if (options.itemType) {
        where.item_type = options.itemType;
      }

      if (options.equipped !== undefined) {
        where.equipped = options.equipped ? 1 : 0;
      }

      const items = this.db.getAll('inventory', { where });

      // 解析 JSON 字段
      return items.map(item => ({
        ...item,
        properties: item.properties ? JSON.parse(item.properties) : {}
      }));
    } catch (error) {
      this.logger.error('Failed to get inventory', {
        characterId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 添加物品到库存
   *
   * @param {string} characterId - 角色 ID
   * @param {Object} item - 物品数据
   * @returns {Object} 创建结果
   */
  addInventoryItem(characterId, item) {
    try {
      const itemData = {
        id: item.id || randomUUID(),
        character_id: characterId,
        item_name: item.item_name,
        item_type: item.item_type || null,
        quantity: item.quantity || 1,
        equipped: item.equipped ? 1 : 0,
        properties: item.properties ? JSON.stringify(item.properties) : null
      };

      const result = this.db.insert('inventory', itemData);

      this.logger.info('Inventory item added', {
        characterId,
        itemName: item.item_name
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to add inventory item', {
        characterId,
        item,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 更新库存物品
   *
   * @param {string} itemId - 物品 ID
   * @param {Object} updates - 更新数据
   * @returns {Object} 更新结果
   */
  updateInventoryItem(itemId, updates) {
    try {
      const updateData = { ...updates };
      if (updates.properties) {
        updateData.properties = JSON.stringify(updates.properties);
      }
      if (updates.equipped !== undefined) {
        updateData.equipped = updates.equipped ? 1 : 0;
      }

      const result = this.db.update('inventory', { id: itemId }, updateData);

      this.logger.info('Inventory item updated', { itemId });

      return result;
    } catch (error) {
      this.logger.error('Failed to update inventory item', {
        itemId,
        updates,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 删除库存物品
   *
   * @param {string} itemId - 物品 ID
   * @returns {Object} 删除结果
   */
  deleteInventoryItem(itemId) {
    try {
      const result = this.db.delete('inventory', { id: itemId });

      this.logger.info('Inventory item deleted', { itemId });

      return result;
    } catch (error) {
      this.logger.error('Failed to delete inventory item', {
        itemId,
        error: error.message
      });
      throw error;
    }
  }

  // ============================================
  // 记忆管理
  // ============================================

  /**
   * 获取角色记忆
   *
   * @param {string} characterId - 角色 ID
   * @param {Object} options - 查询选项
   * @returns {Array} 记忆列表
   */
  getMemories(characterId, options = {}) {
    try {
      const where = { character_id: characterId };

      if (options.minImportance) {
        where.importance = { gte: options.minImportance };
      }

      const memories = this.db.getAll('memories', {
        where,
        orderBy: options.orderBy || 'importance',
        order: options.order || 'DESC',
        limit: options.limit
      });

      // 解析 JSON 字段
      return memories.map(memory => ({
        ...memory,
        tags: memory.tags ? JSON.parse(memory.tags) : [],
        metadata: memory.metadata ? JSON.parse(memory.metadata) : {}
      }));
    } catch (error) {
      this.logger.error('Failed to get memories', {
        characterId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 添加记忆
   *
   * @param {string} characterId - 角色 ID
   * @param {Object} memory - 记忆数据
   * @returns {Object} 创建结果
   */
  addMemory(characterId, memory) {
    try {
      const memoryData = {
        id: memory.id || randomUUID(),
        character_id: characterId,
        content: memory.content,
        importance: memory.importance || 1,
        timestamp: memory.timestamp || Date.now(),
        tags: memory.tags ? JSON.stringify(memory.tags) : null,
        metadata: memory.metadata ? JSON.stringify(memory.metadata) : null
      };

      const result = this.db.insert('memories', memoryData);

      this.logger.info('Memory added', {
        characterId,
        importance: memory.importance
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to add memory', {
        characterId,
        memory,
        error: error.message
      });
      throw error;
    }
  }

  // ============================================
  // 状态快照和回滚
  // ============================================

  /**
   * 创建状态快照
   *
   * @param {string} description - 快照描述
   * @returns {Object} 快照 ID
   */
  createSnapshot(description = '') {
    try {
      const snapshotId = randomUUID();

      // 收集所有状态
      const state = {
        characters: this.db.getAll('characters'),
        timeline: this.db.getAll('timeline'),
        locations: this.db.getAll('locations'),
        inventory: this.db.getAll('inventory'),
        memories: this.db.getAll('memories')
      };

      const snapshotData = {
        id: snapshotId,
        snapshot_time: Date.now(),
        state_data: JSON.stringify(state),
        description
      };

      this.db.insert('state_snapshots', snapshotData);

      this.logger.info('Snapshot created', {
        id: snapshotId,
        description
      });

      return { id: snapshotId };
    } catch (error) {
      this.logger.error('Failed to create snapshot', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 恢复状态快照
   *
   * @param {string} snapshotId - 快照 ID
   * @returns {Object} 恢复结果
   */
  restoreSnapshot(snapshotId) {
    try {
      const snapshot = this.db.get('state_snapshots', { id: snapshotId });

      if (!snapshot) {
        throw new Error(`Snapshot not found: ${snapshotId}`);
      }

      const state = JSON.parse(snapshot.state_data);

      // 使用事务恢复状态
      this.db.transaction(() => {
        // 清空当前状态
        this.db.raw('DELETE FROM characters');
        this.db.raw('DELETE FROM timeline');
        this.db.raw('DELETE FROM locations');
        this.db.raw('DELETE FROM inventory');
        this.db.raw('DELETE FROM memories');

        // 恢复快照状态
        for (const character of state.characters) {
          this.db.insert('characters', character);
        }
        for (const event of state.timeline) {
          this.db.insert('timeline', event);
        }
        for (const location of state.locations) {
          this.db.insert('locations', location);
        }
        for (const item of state.inventory) {
          this.db.insert('inventory', item);
        }
        for (const memory of state.memories) {
          this.db.insert('memories', memory);
        }
      });

      // 清除所有缓存
      this.cache.characters.clear();
      this.cache.locations.clear();
      this.cache.inventory.clear();

      this.logger.info('Snapshot restored', { snapshotId });

      return { success: true };
    } catch (error) {
      this.logger.error('Failed to restore snapshot', {
        snapshotId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 列出所有快照
   *
   * @param {number} limit - 限制数量
   * @returns {Array} 快照列表
   */
  listSnapshots(limit = 10) {
    try {
      const snapshots = this.db.getAll('state_snapshots', {
        orderBy: 'snapshot_time',
        order: 'DESC',
        limit
      });

      return snapshots.map(snapshot => ({
        id: snapshot.id,
        snapshot_time: snapshot.snapshot_time,
        description: snapshot.description,
        created_at: snapshot.created_at
      }));
    } catch (error) {
      this.logger.error('Failed to list snapshots', {
        error: error.message
      });
      throw error;
    }
  }

  // ============================================
  // 工具方法
  // ============================================

  /**
   * 清除缓存
   */
  clearCache() {
    this.cache.characters.clear();
    this.cache.locations.clear();
    this.cache.inventory.clear();

    this.logger.info('Cache cleared');
  }

  /**
   * 获取统计信息
   *
   * @returns {Object} 统计数据
   */
  getStats() {
    return {
      database: this.db.getStats(),
      cache: {
        characters: this.cache.characters.size,
        locations: this.cache.locations.size,
        inventory: this.cache.inventory.size
      }
    };
  }

  /**
   * 关闭状态管理器
   */
  close() {
    this.clearCache();
    // 不关闭数据库，因为可能被其他模块使用
    this.logger.info('State Manager closed');
  }
}

/**
 * 导出
 */
export default StateManager;
