/**
 * State Manager 单元测试
 *
 * 测试内容：
 * - 角色状态管理
 * - 时间线管理
 * - 位置管理
 * - 库存管理
 * - 记忆管理
 * - 快照和回滚
 * - 缓存功能
 * - 性能验证
 */

import StateManager from '../../src/state/manager.js';
import DatabaseManager from '../../src/core/database.js';
import { existsSync, unlinkSync } from 'fs';

describe('StateManager', () => {
  let stateManager;
  let db;
  const testDbPath = '/tmp/test-state-manager.db';

  beforeEach(() => {
    // 删除旧的测试数据库
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }

    // 创建数据库和状态管理器
    db = new DatabaseManager({ dbPath: testDbPath });
    stateManager = new StateManager({ db, enableCache: true });
  });

  afterEach(() => {
    // 关闭连接
    if (stateManager) {
      stateManager.close();
    }
    if (db) {
      db.close();
    }

    // 清理测试文件
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
  });

  describe('角色状态管理', () => {
    test('应该能创建角色', () => {
      const result = stateManager.createCharacter({
        name: 'Alice',
        affection: 50,
        emotion: 'happy'
      });

      expect(result.id).toBeDefined();
      expect(result.changes).toBe(1);
    });

    test('应该能获取角色状态', () => {
      const created = stateManager.createCharacter({
        name: 'Alice',
        affection: 50
      });

      const character = stateManager.getCharacterState(created.id);

      expect(character).toBeDefined();
      expect(character.name).toBe('Alice');
      expect(character.affection).toBe(50);
    });

    test('应该能更新角色状态', () => {
      const created = stateManager.createCharacter({
        name: 'Alice',
        affection: 50
      });

      stateManager.updateCharacterState(created.id, {
        affection: 60,
        emotion: 'excited'
      });

      const character = stateManager.getCharacterState(created.id);
      expect(character.affection).toBe(60);
      expect(character.emotion).toBe('excited');
    });

    test('应该能删除角色', () => {
      const created = stateManager.createCharacter({
        name: 'Alice'
      });

      stateManager.deleteCharacter(created.id);

      const character = stateManager.getCharacterState(created.id);
      expect(character).toBeNull();
    });

    test('应该支持复杂的 personality 数据', () => {
      const result = stateManager.createCharacter({
        name: 'Alice',
        personality: {
          traits: ['kind', 'brave'],
          preferences: { color: 'blue' }
        }
      });

      const character = stateManager.getCharacterState(result.id);
      const personality = JSON.parse(character.personality);

      expect(personality.traits).toContain('kind');
      expect(personality.preferences.color).toBe('blue');
    });
  });

  describe('时间线管理', () => {
    test('应该能添加时间线事件', () => {
      const result = stateManager.addTimelineEvent({
        event_type: 'conversation',
        description: 'First meeting',
        participants: ['Alice', 'Bob'],
        importance: 5
      });

      expect(result.id).toBeDefined();
    });

    test('应该能查询时间线事件', () => {
      stateManager.addTimelineEvent({
        timestamp: 1000,
        event_type: 'conversation',
        description: 'Event 1'
      });

      stateManager.addTimelineEvent({
        timestamp: 2000,
        event_type: 'battle',
        description: 'Event 2'
      });

      const events = stateManager.getTimeline();

      expect(events).toHaveLength(2);
      expect(events[0].description).toBe('Event 1'); // 按时间升序
    });

    test('应该支持时间范围查询', () => {
      stateManager.addTimelineEvent({ timestamp: 1000, event_type: 'test', description: 'Event 1' });
      stateManager.addTimelineEvent({ timestamp: 2000, event_type: 'test', description: 'Event 2' });
      stateManager.addTimelineEvent({ timestamp: 3000, event_type: 'test', description: 'Event 3' });

      const events = stateManager.getTimeline({
        startTime: 1500,
        endTime: 2500
      });

      expect(events).toHaveLength(1);
      expect(events[0].description).toBe('Event 2');
    });

    test('应该支持按重要程度过滤', () => {
      stateManager.addTimelineEvent({ event_type: 'test', description: 'Low', importance: 1 });
      stateManager.addTimelineEvent({ event_type: 'test', description: 'High', importance: 5 });

      const events = stateManager.getTimeline({
        minImportance: 3
      });

      expect(events).toHaveLength(1);
      expect(events[0].description).toBe('High');
    });
  });

  describe('位置管理', () => {
    test('应该能创建位置', () => {
      const result = stateManager.createLocation({
        name: 'Town Square',
        type: 'outdoor',
        description: 'The central square'
      });

      expect(result.id).toBeDefined();
    });

    test('应该能获取位置信息', () => {
      const created = stateManager.createLocation({
        name: 'Town Square',
        connected_to: [{ id: 'loc-2', travel_time: 300 }]
      });

      const location = stateManager.getLocation(created.id);

      expect(location).toBeDefined();
      expect(location.name).toBe('Town Square');
      expect(location.connected_to).toHaveLength(1);
      expect(location.connected_to[0].id).toBe('loc-2');
    });

    test('应该支持层级位置', () => {
      const parent = stateManager.createLocation({
        name: 'Building'
      });

      const child = stateManager.createLocation({
        name: 'Room 101',
        parent_location: parent.id
      });

      const location = stateManager.getLocation(child.id);
      expect(location.parent_location).toBe(parent.id);
    });
  });

  describe('库存管理', () => {
    let characterId;

    beforeEach(() => {
      const result = stateManager.createCharacter({ name: 'Alice' });
      characterId = result.id;
    });

    test('应该能添加物品', () => {
      const result = stateManager.addInventoryItem(characterId, {
        item_name: 'Sword',
        item_type: 'weapon',
        quantity: 1,
        equipped: true
      });

      expect(result.id).toBeDefined();
    });

    test('应该能获取库存', () => {
      stateManager.addInventoryItem(characterId, {
        item_name: 'Sword',
        item_type: 'weapon'
      });

      stateManager.addInventoryItem(characterId, {
        item_name: 'Shield',
        item_type: 'armor'
      });

      const inventory = stateManager.getInventory(characterId);

      expect(inventory).toHaveLength(2);
    });

    test('应该支持按类型过滤', () => {
      stateManager.addInventoryItem(characterId, {
        item_name: 'Sword',
        item_type: 'weapon'
      });

      stateManager.addInventoryItem(characterId, {
        item_name: 'Potion',
        item_type: 'consumable'
      });

      const weapons = stateManager.getInventory(characterId, {
        itemType: 'weapon'
      });

      expect(weapons).toHaveLength(1);
      expect(weapons[0].item_name).toBe('Sword');
    });

    test('应该能更新物品', () => {
      const added = stateManager.addInventoryItem(characterId, {
        item_name: 'Sword',
        quantity: 1
      });

      stateManager.updateInventoryItem(added.id, {
        quantity: 2,
        equipped: true
      });

      const inventory = stateManager.getInventory(characterId);
      expect(inventory[0].quantity).toBe(2);
      expect(inventory[0].equipped).toBe(1);
    });

    test('应该能删除物品', () => {
      const added = stateManager.addInventoryItem(characterId, {
        item_name: 'Sword'
      });

      stateManager.deleteInventoryItem(added.id);

      const inventory = stateManager.getInventory(characterId);
      expect(inventory).toHaveLength(0);
    });

    test('删除角色应该级联删除物品', () => {
      stateManager.addInventoryItem(characterId, {
        item_name: 'Sword'
      });

      stateManager.deleteCharacter(characterId);

      const inventory = stateManager.getInventory(characterId);
      expect(inventory).toHaveLength(0);
    });
  });

  describe('记忆管理', () => {
    let characterId;

    beforeEach(() => {
      const result = stateManager.createCharacter({ name: 'Alice' });
      characterId = result.id;
    });

    test('应该能添加记忆', () => {
      const result = stateManager.addMemory(characterId, {
        content: 'First meeting with Bob',
        importance: 5,
        tags: ['first_meeting', 'important']
      });

      expect(result.id).toBeDefined();
    });

    test('应该能获取记忆', () => {
      stateManager.addMemory(characterId, {
        content: 'Memory 1',
        importance: 3
      });

      stateManager.addMemory(characterId, {
        content: 'Memory 2',
        importance: 5
      });

      const memories = stateManager.getMemories(characterId);

      expect(memories).toHaveLength(2);
      // 默认按重要程度降序
      expect(memories[0].importance).toBe(5);
    });

    test('应该支持按重要程度过滤', () => {
      stateManager.addMemory(characterId, {
        content: 'Low importance',
        importance: 1
      });

      stateManager.addMemory(characterId, {
        content: 'High importance',
        importance: 5
      });

      const memories = stateManager.getMemories(characterId, {
        minImportance: 3
      });

      expect(memories).toHaveLength(1);
      expect(memories[0].content).toBe('High importance');
    });

    test('应该支持限制数量', () => {
      for (let i = 0; i < 10; i++) {
        stateManager.addMemory(characterId, {
          content: `Memory ${i}`,
          importance: (i % 5) + 1 // 1-5 之间循环
        });
      }

      const memories = stateManager.getMemories(characterId, {
        limit: 5
      });

      expect(memories).toHaveLength(5);
    });
  });

  describe('快照和回滚', () => {
    test('应该能创建快照', () => {
      stateManager.createCharacter({ name: 'Alice' });

      const snapshot = stateManager.createSnapshot('Test snapshot');

      expect(snapshot.id).toBeDefined();
    });

    test('应该能恢复快照', () => {
      // 创建初始状态
      const alice = stateManager.createCharacter({
        name: 'Alice',
        affection: 50
      });

      // 创建快照
      const snapshot = stateManager.createSnapshot('Before changes');

      // 修改状态
      stateManager.updateCharacterState(alice.id, { affection: 100 });
      stateManager.createCharacter({ name: 'Bob' });

      // 恢复快照
      stateManager.restoreSnapshot(snapshot.id);

      // 验证状态已恢复
      const restoredAlice = stateManager.getCharacterState(alice.id);
      expect(restoredAlice.affection).toBe(50);

      // Bob 不应该存在
      const characters = db.getAll('characters');
      expect(characters).toHaveLength(1);
    });

    test('应该能列出快照', async () => {
      stateManager.createSnapshot('Snapshot 1');

      // 等待确保时间戳不同
      await new Promise(resolve => setTimeout(resolve, 10));

      stateManager.createSnapshot('Snapshot 2');

      const snapshots = stateManager.listSnapshots();

      expect(snapshots).toHaveLength(2);
      expect(snapshots[0].description).toBe('Snapshot 2'); // 最新的在前
    });

    test('恢复不存在的快照应该抛出异常', () => {
      expect(() => {
        stateManager.restoreSnapshot('non-existent');
      }).toThrow('Snapshot not found');
    });
  });

  describe('缓存功能', () => {
    test('应该缓存角色状态', () => {
      const created = stateManager.createCharacter({
        name: 'Alice',
        affection: 50
      });

      // 第一次查询（从数据库）
      stateManager.getCharacterState(created.id);

      // 第二次查询（从缓存）
      const start = performance.now();
      stateManager.getCharacterState(created.id);
      const duration = performance.now() - start;

      // 缓存查询应该非常快（< 0.1ms）
      expect(duration).toBeLessThan(0.1);
    });

    test('更新后应该清除缓存', () => {
      const created = stateManager.createCharacter({
        name: 'Alice',
        affection: 50
      });

      // 第一次查询，填充缓存
      stateManager.getCharacterState(created.id);

      // 更新状态
      stateManager.updateCharacterState(created.id, { affection: 60 });

      // 再次查询应该得到更新后的数据
      const character = stateManager.getCharacterState(created.id);
      expect(character.affection).toBe(60);
    });

    test('应该能清除所有缓存', () => {
      stateManager.createCharacter({ name: 'Alice' });
      stateManager.getCharacterState; // 填充缓存

      stateManager.clearCache();

      const stats = stateManager.getStats();
      expect(stats.cache.characters).toBe(0);
    });
  });

  describe('统计信息', () => {
    test('应该能获取统计信息', () => {
      stateManager.createCharacter({ name: 'Alice' });
      stateManager.createCharacter({ name: 'Bob' });

      const stats = stateManager.getStats();

      expect(stats.database).toBeDefined();
      expect(stats.database.tables.characters).toBe(2);
      expect(stats.cache).toBeDefined();
    });
  });

  describe('性能要求', () => {
    test('角色状态查询应该 < 5ms', () => {
      const created = stateManager.createCharacter({ name: 'Alice' });

      const start = performance.now();

      for (let i = 0; i < 100; i++) {
        stateManager.getCharacterState(created.id);
      }

      const duration = performance.now() - start;
      expect(duration / 100).toBeLessThan(5);
    });

    test('批量操作应该高效', () => {
      const created = stateManager.createCharacter({ name: 'Alice' });

      const start = performance.now();

      // 添加 50 个物品
      for (let i = 0; i < 50; i++) {
        stateManager.addInventoryItem(created.id, {
          item_name: `Item ${i}`
        });
      }

      const duration = performance.now() - start;
      expect(duration / 50).toBeLessThan(5); // 平均每个 < 5ms
    });

    test('快照创建应该合理', () => {
      // 创建一些数据
      for (let i = 0; i < 10; i++) {
        stateManager.createCharacter({ name: `Character ${i}` });
      }

      const start = performance.now();
      stateManager.createSnapshot('Test');
      const duration = performance.now() - start;

      // 快照创建应该 < 100ms
      expect(duration).toBeLessThan(100);
    });
  });
});
