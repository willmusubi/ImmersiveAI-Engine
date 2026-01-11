/**
 * State Integrator 单元测试
 *
 * 测试内容：
 * - 消息处理流程
 * - 自动提取和应用
 * - 验证集成
 * - Dry run 模式
 * - 错误处理
 */

import StateIntegrator from '../../src/state/integrator.js';
import DatabaseManager from '../../src/core/database.js';
import { existsSync, unlinkSync } from 'fs';

describe('StateIntegrator', () => {
  let integrator;
  let db;
  let characterId;
  const testDbPath = '/tmp/test-state-integrator.db';

  beforeEach(() => {
    // 删除旧的测试数据库
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }

    // 创建数据库和集成器
    db = new DatabaseManager({ dbPath: testDbPath });
    integrator = new StateIntegrator({ db, autoApply: true });

    // 创建测试角色
    const result = integrator.stateManager.createCharacter({
      name: 'Alice',
      affection: 50,
      emotion: 'neutral'
    });
    characterId = result.id;
  });

  afterEach(() => {
    // 关闭连接
    if (integrator) {
      integrator.close();
    }

    // 清理测试文件
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
  });

  describe('基本消息处理', () => {
    test('应该能处理包含好感度变化的消息', async () => {
      const message = 'Alice 对你的好感度增加了 10 点';
      const result = await integrator.processMessage(characterId, message);

      expect(result.updates.length).toBeGreaterThan(0);
      expect(result.updates.some(u => u.type === 'affection')).toBe(true);

      const affectionUpdate = result.updates.find(u => u.type === 'affection');
      expect(affectionUpdate.applied).toBe(true);

      // 验证状态已更新
      const character = integrator.stateManager.getCharacterState(characterId);
      expect(character.affection).toBe(60);
    });

    test('应该能处理包含情绪变化的消息', async () => {
      const message = 'Alice 看起来很高兴，她微笑着说："太好了！"';
      const result = await integrator.processMessage(characterId, message);

      expect(result.updates.some(u => u.type === 'emotion')).toBe(true);

      // 验证状态已更新
      const character = integrator.stateManager.getCharacterState(characterId);
      expect(character.emotion).toBeDefined();
    });

    test('应该能处理复杂消息', async () => {
      const message = `
        Alice 在图书馆里找到了一本古书。
        她兴奋地说："太棒了！我终于找到了！"
        她对你的好感度增加了 5 点。
        Alice 把书递给你。
      `;

      const result = await integrator.processMessage(characterId, message);

      expect(result.updates.length).toBeGreaterThan(0);
      expect(result.extracted.affection).toBeDefined();
      expect(result.extracted.emotion).toBeDefined();
      expect(result.extracted.inventory.length).toBeGreaterThan(0);
    });
  });

  describe('Dry Run 模式', () => {
    test('Dry run 不应该实际应用更新', async () => {
      const message = 'Alice 对你的好感度增加了 10 点';
      const result = await integrator.processMessage(characterId, message, {
        dryRun: true
      });

      // 应该提取到更新
      expect(result.extracted.affection).toBeDefined();

      // 但不应该应用
      const character = integrator.stateManager.getCharacterState(characterId);
      expect(character.affection).toBe(50); // 未变化
    });
  });

  describe('验证集成', () => {
    test('应该拒绝无效的好感度', async () => {
      const message = 'Alice 对你的好感度增加了 100 点';
      const result = await integrator.processMessage(characterId, message);

      expect(result.errors.length).toBeGreaterThan(0);

      // 状态不应该更新（因为超出范围）
      const character = integrator.stateManager.getCharacterState(characterId);
      expect(character.affection).toBe(50);
    });

    test('应该警告不合理的情绪转换', async () => {
      // 先设置为 happy
      integrator.stateManager.updateCharacterState(characterId, {
        emotion: 'happy'
      });

      const message = 'Alice 突然变得很悲伤';
      const result = await integrator.processMessage(characterId, message);

      // 应该有警告
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('库存处理', () => {
    test('应该能添加物品', async () => {
      const message = 'Alice 递给你一把钥匙';
      const result = await integrator.processMessage(characterId, message);

      expect(result.updates.some(u => u.type === 'inventory')).toBe(true);

      // 验证物品已添加
      const inventory = integrator.stateManager.getInventory(characterId);
      expect(inventory.length).toBeGreaterThan(0);
    });

    test('应该能移除物品', async () => {
      // 先添加物品
      integrator.stateManager.addInventoryItem(characterId, {
        item_name: '剑'
      });

      const message = 'Alice 拿走了你的剑';
      const result = await integrator.processMessage(characterId, message);

      expect(result.updates.some(u => u.type === 'inventory')).toBe(true);

      // 验证物品已移除
      const inventory = integrator.stateManager.getInventory(characterId);
      expect(inventory).toHaveLength(0);
    });
  });

  describe('时间线事件', () => {
    test('应该能添加重要事件', async () => {
      const message = 'Alice 第一次向你坦白了她的过去';
      const result = await integrator.processMessage(characterId, message);

      // 应该有事件更新
      expect(result.updates.some(u => u.type === 'event')).toBe(true);

      // 验证事件已添加
      const events = integrator.stateManager.getTimeline();
      expect(events.length).toBeGreaterThan(0);
    });
  });

  describe('位置处理', () => {
    test('应该能自动创建新位置', async () => {
      const message = 'Alice 走进了图书馆';
      const result = await integrator.processMessage(characterId, message);

      expect(result.updates.some(u => u.type === 'location')).toBe(true);

      // 验证位置已创建和应用
      const character = integrator.stateManager.getCharacterState(characterId);
      expect(character.current_location).toBeDefined();
    });
  });

  describe('统计信息', () => {
    test('应该能获取统计信息', () => {
      const stats = integrator.getStats();

      expect(stats.stateManager).toBeDefined();
      expect(stats.validator).toBeDefined();
    });
  });

  describe('错误处理', () => {
    test('应该能处理无效的角色 ID', async () => {
      const message = 'Alice 对你的好感度增加了 10 点';

      const result = await integrator.processMessage('invalid-id', message);

      // 提取器会在角色不存在时返回 null，因此不会有好感度更新
      expect(result.extracted.affection).toBeNull();
      // 但可能会有其他提取（如事件）
      expect(result).toBeDefined();
    });

    test('应该能处理空消息', async () => {
      const result = await integrator.processMessage(characterId, '');

      expect(result.updates).toHaveLength(0);
    });
  });

  describe('性能要求', () => {
    test('消息处理应该 < 100ms', async () => {
      const message = 'Alice 很高兴，对你的好感度增加了 5 点';

      const start = performance.now();

      for (let i = 0; i < 10; i++) {
        await integrator.processMessage(characterId, message);
      }

      const duration = performance.now() - start;
      expect(duration / 10).toBeLessThan(100);
    });
  });
});
