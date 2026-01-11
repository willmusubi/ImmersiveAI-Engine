/**
 * State Extractor 单元测试
 *
 * 测试内容：
 * - 好感度变化提取
 * - 情绪识别
 * - 位置变化提取
 * - 库存物品提取
 * - 事件提取
 * - 模式匹配
 * - 准确率验证
 */

import StateExtractor from '../../src/state/extractor.js';
import DatabaseManager from '../../src/core/database.js';
import StateManager from '../../src/state/manager.js';
import { existsSync, unlinkSync } from 'fs';

describe('StateExtractor', () => {
  let extractor;
  let db;
  let stateManager;
  let characterId;
  const testDbPath = '/tmp/test-state-extractor.db';

  beforeEach(() => {
    // 删除旧的测试数据库
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }

    // 创建数据库和状态管理器
    db = new DatabaseManager({ dbPath: testDbPath });
    stateManager = new StateManager({ db });
    extractor = new StateExtractor({ db, stateManager });

    // 创建测试角色
    const result = stateManager.createCharacter({
      name: 'Alice',
      affection: 50,
      emotion: 'neutral'
    });
    characterId = result.id;
  });

  afterEach(() => {
    // 关闭连接
    if (db) {
      db.close();
    }

    // 清理测试文件
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
  });

  describe('好感度提取', () => {
    test('应该能识别明确的好感度增加', () => {
      const text = 'Alice 对你的好感度增加了 10 点';
      const result = extractor.extractAffectionChange(characterId, text);

      expect(result).toBeDefined();
      expect(result.delta).toBe(10);
      expect(result.newValue).toBe(60);
    });

    test('应该能识别好感度减少', () => {
      const text = 'Alice 对你的好感度降低了 5 点';
      const result = extractor.extractAffectionChange(characterId, text);

      expect(result).toBeDefined();
      expect(result.delta).toBe(-5);
      expect(result.newValue).toBe(45);
    });

    test('应该能识别绝对值设置', () => {
      const text = 'Alice 对你的好感度现在是 80';
      const result = extractor.extractAffectionChange(characterId, text);

      expect(result).toBeDefined();
      expect(result.newValue).toBe(80);
    });

    test('没有好感度变化时应该返回 null', () => {
      const text = 'Alice 说：你好！';
      const result = extractor.extractAffectionChange(characterId, text);

      expect(result).toBeNull();
    });
  });

  describe('情绪识别', () => {
    test('应该能识别明确的情绪表达', () => {
      const text = 'Alice 看起来很高兴。她微笑着说："太好了！"';
      const result = extractor.extractEmotion(text);

      expect(result).toBeDefined();
      expect(['happy', 'excited']).toContain(result.emotion);
    });

    test('应该能识别负面情绪', () => {
      const text = 'Alice 皱起了眉头，看起来很生气';
      const result = extractor.extractEmotion(text);

      expect(result).toBeDefined();
      expect(result.emotion).toBe('angry');
    });

    test('应该能从对话内容推断情绪', () => {
      const text = 'Alice："这太糟糕了...我不敢相信会发生这种事..."';
      const result = extractor.extractEmotion(text);

      expect(result).toBeDefined();
      expect(['sad', 'anxious']).toContain(result.emotion);
    });
  });

  describe('位置变化提取', () => {
    test('应该能识别位置移动', () => {
      const text = 'Alice 走进了图书馆';
      const result = extractor.extractLocationChange(text);

      expect(result).toBeDefined();
      expect(result.location).toContain('图书馆');
    });

    test('应该能识别多个地点', () => {
      const text = 'Alice 从咖啡厅来到了公园';
      const result = extractor.extractLocationChange(text);

      expect(result).toBeDefined();
      expect(result.location).toBeDefined();
    });
  });

  describe('库存物品提取', () => {
    test('应该能识别获得物品', () => {
      const text = 'Alice 递给你一把钥匙';
      const result = extractor.extractInventoryChanges(characterId, text);

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].item_name).toContain('钥匙');
      expect(result[0].action).toBe('add');
    });

    test('应该能识别失去物品', () => {
      const text = 'Alice 拿走了你的剑';
      const result = extractor.extractInventoryChanges(characterId, text);

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].item_name).toContain('剑');
      expect(result[0].action).toBe('remove');
    });

    test('应该能识别物品数量', () => {
      const text = 'Alice 给了你 3 个苹果';
      const result = extractor.extractInventoryChanges(characterId, text);

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].quantity).toBe(3);
    });
  });

  describe('事件提取', () => {
    test('应该能识别重要事件', () => {
      const text = 'Alice 第一次向你坦白了她的过去';
      const result = extractor.extractEvents(text);

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].importance).toBeGreaterThanOrEqual(3);
    });

    test('应该能提取事件参与者', () => {
      const text = 'Alice 和 Bob 一起完成了任务';
      const result = extractor.extractEvents(text);

      expect(result).toBeDefined();
      expect(result[0].participants).toContain('Alice');
      expect(result[0].participants).toContain('Bob');
    });
  });

  describe('综合提取', () => {
    test('应该能从复杂文本中提取多种状态', () => {
      const text = `
        Alice 在图书馆里找到了一本古书。
        她兴奋地说："太棒了！我终于找到了！"
        她对你的好感度增加了 5 点。
        Alice 把书递给你。
      `;

      const result = extractor.extractAllStates(characterId, text);

      expect(result.affection).toBeDefined();
      expect(result.emotion).toBeDefined();
      expect(result.location).toBeDefined();
      expect(result.inventory).toBeDefined();
      expect(result.events).toBeDefined();
    });
  });

  describe('模式注册', () => {
    test('应该能注册自定义提取模式', () => {
      extractor.registerPattern('custom', {
        regex: /获得了 (\d+) 经验值/,
        extract: (match) => ({
          type: 'experience',
          value: parseInt(match[1])
        })
      });

      const text = 'Alice 获得了 100 经验值';
      const result = extractor.extract(text, 'custom');

      expect(result).toBeDefined();
      expect(result.type).toBe('experience');
      expect(result.value).toBe(100);
    });
  });

  describe('性能要求', () => {
    test('提取应该 < 50ms', () => {
      const text = 'Alice 很高兴，对你的好感度增加了 10 点，她给了你一把剑';

      const start = performance.now();

      for (let i = 0; i < 100; i++) {
        extractor.extractAllStates(characterId, text);
      }

      const duration = performance.now() - start;
      expect(duration / 100).toBeLessThan(50);
    });
  });

  describe('准确率验证', () => {
    test('应该能正确识别 80% 以上的状态变化', () => {
      const testCases = [
        { text: '好感度 +10', expected: 'affection' },
        { text: 'Alice 很生气', expected: 'emotion' },
        { text: '走进了房间', expected: 'location' },
        { text: '获得了钥匙', expected: 'inventory' },
        { text: '完成了任务', expected: 'event' }
      ];

      let correctCount = 0;

      for (const testCase of testCases) {
        const result = extractor.extractAllStates(characterId, testCase.text);
        if (result[testCase.expected]) {
          correctCount++;
        }
      }

      const accuracy = correctCount / testCases.length;
      expect(accuracy).toBeGreaterThanOrEqual(0.8);
    });
  });
});
