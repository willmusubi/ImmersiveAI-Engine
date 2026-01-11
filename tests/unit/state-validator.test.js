/**
 * State Validator 单元测试
 *
 * 测试内容：
 * - 角色状态验证
 * - 时间线事件验证
 * - 库存物品验证
 * - 规则引擎
 * - 验证日志
 * - 性能验证
 */

import StateValidator, { VALIDATION_TYPES, SEVERITY } from '../../src/state/validator.js';
import DatabaseManager from '../../src/core/database.js';
import StateManager from '../../src/state/manager.js';
import { existsSync, unlinkSync } from 'fs';

describe('StateValidator', () => {
  let validator;
  let db;
  let stateManager;
  const testDbPath = '/tmp/test-state-validator.db';

  beforeEach(() => {
    // 删除旧的测试数据库
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }

    // 创建数据库和状态管理器
    db = new DatabaseManager({ dbPath: testDbPath });
    stateManager = new StateManager({ db });
    validator = new StateValidator({ db });
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

  describe('角色状态验证', () => {
    let characterId;

    beforeEach(() => {
      const result = stateManager.createCharacter({
        name: 'Alice',
        affection: 50,
        emotion: 'neutral'
      });
      characterId = result.id;
    });

    test('合理的好感度更新应该通过', () => {
      const result = validator.validateCharacterUpdate(characterId, {
        affection: 60
      });

      expect(result.passed).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('超出范围的好感度应该被拒绝', () => {
      const result = validator.validateCharacterUpdate(characterId, {
        affection: 150
      });

      expect(result.passed).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].field).toBe('affection');
    });

    test('负数好感度应该被拒绝', () => {
      const result = validator.validateCharacterUpdate(characterId, {
        affection: -10
      });

      expect(result.passed).toBe(false);
      expect(result.errors[0].message).toContain('0-100');
    });

    test('单次变化过大应该警告', () => {
      const result = validator.validateCharacterUpdate(characterId, {
        affection: 90 // 从 50 变化到 90，差值 40
      });

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].field).toBe('affection');
      expect(result.warnings[0].delta).toBe(40);
    });

    test('合理的情绪更新应该通过', () => {
      const result = validator.validateCharacterUpdate(characterId, {
        emotion: 'happy'
      });

      expect(result.passed).toBe(true);
    });

    test('无效的情绪应该被拒绝', () => {
      const result = validator.validateCharacterUpdate(characterId, {
        emotion: 'invalid_emotion'
      });

      expect(result.passed).toBe(false);
      expect(result.errors[0].field).toBe('emotion');
    });

    test('不合理的情绪转换应该警告', () => {
      // 先设置为 happy
      stateManager.updateCharacterState(characterId, { emotion: 'happy' });

      // 尝试切换到 sad
      const result = validator.validateCharacterUpdate(characterId, {
        emotion: 'sad'
      });

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0].message).toContain('transition');
    });

    test('不存在的角色应该报错', () => {
      const result = validator.validateCharacterUpdate('non-existent', {
        affection: 60
      });

      expect(result.passed).toBe(false);
      expect(result.errors[0].message).toContain('not found');
    });
  });

  describe('位置验证', () => {
    let characterId;
    let location1Id;
    let location2Id;

    beforeEach(() => {
      const char = stateManager.createCharacter({ name: 'Alice' });
      characterId = char.id;

      const loc1 = stateManager.createLocation({
        name: 'Town Square',
        connected_to: []
      });
      location1Id = loc1.id;

      const loc2 = stateManager.createLocation({
        name: 'Market',
        connected_to: [{ id: location1Id, travel_time: 300 }]
      });
      location2Id = loc2.id;

      // 设置角色初始位置
      stateManager.updateCharacterState(characterId, {
        current_location: location1Id
      });
    });

    test('移动到存在的位置应该通过', () => {
      const result = validator.validateCharacterUpdate(characterId, {
        current_location: location2Id
      });

      // 可能会有警告（不可达），但不应该是错误
      expect(result.errors).toHaveLength(0);
    });

    test('移动到不存在的位置应该被拒绝', () => {
      const result = validator.validateCharacterUpdate(characterId, {
        current_location: 'non-existent-location'
      });

      expect(result.passed).toBe(false);
      expect(result.errors[0].message).toContain('does not exist');
    });

    test('移动到不可达的位置应该警告', () => {
      const result = validator.validateCharacterUpdate(characterId, {
        current_location: location2Id
      });

      // location1 的 connected_to 是空的，所以 location2 不可达
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('时间线事件验证', () => {
    test('合理的事件应该通过', () => {
      const result = validator.validateTimelineEvent({
        event_type: 'conversation',
        description: 'First meeting',
        timestamp: Date.now(),
        importance: 3
      });

      expect(result.passed).toBe(true);
    });

    test('缺少必需字段应该被拒绝', () => {
      const result = validator.validateTimelineEvent({
        timestamp: Date.now()
      });

      expect(result.passed).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('负数时间戳应该被拒绝', () => {
      const result = validator.validateTimelineEvent({
        event_type: 'test',
        description: 'Test event',
        timestamp: -1000
      });

      expect(result.passed).toBe(false);
      expect(result.errors[0].field).toBe('timestamp');
    });

    test('未来时间戳应该警告', () => {
      const futureTime = Date.now() + 86400000 * 2; // 2 天后

      const result = validator.validateTimelineEvent({
        event_type: 'test',
        description: 'Future event',
        timestamp: futureTime
      });

      expect(result.warnings.length).toBeGreaterThan(0);
    });

    test('重要程度超出范围应该被拒绝', () => {
      const result = validator.validateTimelineEvent({
        event_type: 'test',
        description: 'Test event',
        importance: 10
      });

      expect(result.passed).toBe(false);
      expect(result.errors[0].field).toBe('importance');
    });

    test('参与者过多应该警告', () => {
      const result = validator.validateTimelineEvent({
        event_type: 'test',
        description: 'Test event',
        participants: new Array(15).fill('person')
      });

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0].message).toContain('Too many');
    });
  });

  describe('库存物品验证', () => {
    let characterId;

    beforeEach(() => {
      const result = stateManager.createCharacter({ name: 'Alice' });
      characterId = result.id;
    });

    test('合理的物品应该通过', () => {
      const result = validator.validateInventoryItem(characterId, {
        item_name: 'Sword',
        item_type: 'weapon',
        quantity: 1,
        equipped: false
      });

      expect(result.passed).toBe(true);
    });

    test('缺少物品名称应该被拒绝', () => {
      const result = validator.validateInventoryItem(characterId, {
        quantity: 1
      });

      expect(result.passed).toBe(false);
      expect(result.errors[0].field).toBe('item_name');
    });

    test('负数数量应该被拒绝', () => {
      const result = validator.validateInventoryItem(characterId, {
        item_name: 'Sword',
        quantity: -1
      });

      expect(result.passed).toBe(false);
      expect(result.errors[0].message).toContain('negative');
    });

    test('过大的数量应该警告', () => {
      const result = validator.validateInventoryItem(characterId, {
        item_name: 'Gold',
        quantity: 9999
      });

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0].message).toContain('too large');
    });

    test('装备冲突应该警告', () => {
      // 先添加一件已装备的武器
      stateManager.addInventoryItem(characterId, {
        item_name: 'Sword',
        item_type: 'weapon',
        equipped: true
      });

      // 尝试装备另一件武器
      const result = validator.validateInventoryItem(characterId, {
        item_name: 'Axe',
        item_type: 'weapon',
        equipped: true
      });

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0].message).toContain('Already has equipped');
    });
  });

  describe('规则引擎', () => {
    test('应该能注册自定义规则', () => {
      validator.registerRule('test-rule', (data) => {
        if (data.value > 100) {
          return {
            passed: false,
            errors: [{
              field: 'value',
              message: 'Value too large',
              severity: SEVERITY.ERROR
            }]
          };
        }
        return { passed: true, errors: [] };
      }, VALIDATION_TYPES.GENERAL);

      const result = validator.validateWithRules(
        { value: 150 },
        VALIDATION_TYPES.GENERAL
      );

      expect(result.passed).toBe(false);
      expect(result.errors[0].message).toBe('Value too large');
    });

    test('默认规则应该生效', () => {
      const result = validator.validateWithRules(
        { affection: -10 },
        VALIDATION_TYPES.CHARACTER
      );

      expect(result.passed).toBe(false);
    });

    test('多个规则应该都执行', () => {
      validator.registerRule('rule1', (data) => ({
        passed: data.a !== undefined,
        errors: data.a === undefined ? [{
          field: 'a',
          message: 'Missing a',
          severity: SEVERITY.ERROR
        }] : []
      }));

      validator.registerRule('rule2', (data) => ({
        passed: data.b !== undefined,
        errors: data.b === undefined ? [{
          field: 'b',
          message: 'Missing b',
          severity: SEVERITY.ERROR
        }] : []
      }));

      const result = validator.validateWithRules({}, VALIDATION_TYPES.GENERAL);

      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('验证日志', () => {
    test('应该能记录验证日志', () => {
      validator.logValidation('test', true, { test: 'data' });

      const logs = db.getAll('validation_logs');
      expect(logs).toHaveLength(1);
      expect(logs[0].validation_type).toBe('test');
      expect(logs[0].passed).toBe(1);
    });

    test('应该能获取验证统计', () => {
      // 记录一些日志
      validator.logValidation('test', true, {});
      validator.logValidation('test', true, {});
      validator.logValidation('test', false, {});

      const stats = validator.getValidationStats();

      expect(stats.total).toBe(3);
      expect(stats.passed).toBe(2);
      expect(stats.failed).toBe(1);
      expect(stats.passRate).toBe('66.67%');
    });

    test('应该能按类型过滤统计', () => {
      validator.logValidation('character', true, {});
      validator.logValidation('timeline', false, {});

      const stats = validator.getValidationStats({
        validationType: 'character'
      });

      expect(stats.total).toBe(1);
    });
  });

  describe('性能要求', () => {
    let characterId;

    beforeEach(() => {
      const result = stateManager.createCharacter({
        name: 'Alice',
        affection: 50
      });
      characterId = result.id;
    });

    test('角色验证应该 < 20ms', () => {
      const start = performance.now();

      for (let i = 0; i < 100; i++) {
        validator.validateCharacterUpdate(characterId, {
          affection: 60
        });
      }

      const duration = performance.now() - start;
      expect(duration / 100).toBeLessThan(20);
    });

    test('事件验证应该 < 20ms', () => {
      const start = performance.now();

      for (let i = 0; i < 100; i++) {
        validator.validateTimelineEvent({
          event_type: 'test',
          description: 'Test event',
          timestamp: Date.now()
        });
      }

      const duration = performance.now() - start;
      expect(duration / 100).toBeLessThan(20);
    });

    test('库存验证应该 < 20ms', () => {
      const start = performance.now();

      for (let i = 0; i < 100; i++) {
        validator.validateInventoryItem(characterId, {
          item_name: 'Sword',
          quantity: 1
        });
      }

      const duration = performance.now() - start;
      expect(duration / 100).toBeLessThan(20);
    });
  });

  describe('准确率验证', () => {
    let characterId;

    beforeEach(() => {
      const result = stateManager.createCharacter({
        name: 'Alice',
        affection: 50
      });
      characterId = result.id;
    });

    test('应该正确拒绝明显的错误', () => {
      const testCases = [
        { affection: -10 },   // 负数
        { affection: 150 },   // 超出范围
        { emotion: 'invalid' } // 无效情绪
      ];

      const results = testCases.map(update =>
        validator.validateCharacterUpdate(characterId, update)
      );

      const rejectedCount = results.filter(r => !r.passed).length;

      // 应该全部拒绝
      expect(rejectedCount).toBe(testCases.length);
    });

    test('应该通过合理的更新', () => {
      const testCases = [
        { affection: 55 },
        { affection: 60 },
        { emotion: 'happy' },
        { emotion: 'sad' }
      ];

      const results = testCases.map(update =>
        validator.validateCharacterUpdate(characterId, update)
      );

      const passedCount = results.filter(r => r.passed).length;

      // 应该全部通过
      expect(passedCount).toBe(testCases.length);
    });
  });
});
