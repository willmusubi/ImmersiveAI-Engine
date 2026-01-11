/**
 * Database Manager 单元测试
 *
 * 测试内容：
 * - 数据库初始化
 * - CRUD 操作
 * - 事务支持
 * - 查询构建
 * - 性能验证
 */

import DatabaseManager from '../../src/core/database.js';
import { existsSync, unlinkSync } from 'fs';
import { jest } from '@jest/globals';

describe('DatabaseManager', () => {
  let db;
  const testDbPath = '/tmp/test-immersive-ai.db';

  beforeEach(() => {
    // 删除旧的测试数据库
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }

    // 创建新的数据库实例
    db = new DatabaseManager({
      dbPath: testDbPath,
      verbose: false
    });
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

  describe('初始化', () => {
    test('应该能创建数据库', () => {
      expect(db.db).toBeDefined();
      expect(existsSync(testDbPath)).toBe(true);
    });

    test('应该能创建所有表', () => {
      const tables = db.raw("SELECT name FROM sqlite_master WHERE type='table'");
      const tableNames = tables.map(t => t.name);

      expect(tableNames).toContain('characters');
      expect(tableNames).toContain('timeline');
      expect(tableNames).toContain('locations');
      expect(tableNames).toContain('inventory');
      expect(tableNames).toContain('memories');
      expect(tableNames).toContain('state_snapshots');
      expect(tableNames).toContain('validation_logs');
    });

    test('应该启用外键约束', () => {
      const result = db.db.pragma('foreign_keys');
      expect(result[0].foreign_keys).toBe(1);
    });
  });

  describe('插入操作', () => {
    test('应该能插入角色', () => {
      const result = db.insert('characters', {
        name: 'Alice',
        affection: 50,
        emotion: 'happy'
      });

      expect(result.id).toBeDefined();
      expect(result.changes).toBe(1);
    });

    test('应该自动生成 ID', () => {
      const result = db.insert('characters', {
        name: 'Bob'
      });

      expect(result.id).toBeDefined();
      expect(result.id).toMatch(/^[0-9a-f-]{36}$/); // UUID 格式
    });

    test('应该自动添加时间戳', () => {
      const result = db.insert('characters', {
        name: 'Charlie'
      });

      const record = db.get('characters', { id: result.id });
      expect(record.created_at).toBeDefined();
      expect(record.updated_at).toBeDefined();
      expect(record.created_at).toBeGreaterThan(0);
    });

    test('应该验证约束（好感度范围）', () => {
      expect(() => {
        db.insert('characters', {
          name: 'Invalid',
          affection: 150 // 超出 0-100 范围
        });
      }).toThrow();
    });
  });

  describe('查询操作', () => {
    beforeEach(() => {
      // 插入测试数据
      db.insert('characters', { name: 'Alice', affection: 50 });
      db.insert('characters', { name: 'Bob', affection: 75 });
      db.insert('characters', { name: 'Charlie', affection: 30 });
    });

    test('应该能查询单条记录', () => {
      const character = db.get('characters', { name: 'Alice' });

      expect(character).toBeDefined();
      expect(character.name).toBe('Alice');
      expect(character.affection).toBe(50);
    });

    test('查询不存在的记录应该返回 null', () => {
      const character = db.get('characters', { name: 'NonExistent' });

      expect(character).toBeNull();
    });

    test('应该能查询所有记录', () => {
      const characters = db.getAll('characters');

      expect(characters).toHaveLength(3);
    });

    test('应该能使用 WHERE 条件查询', () => {
      const characters = db.getAll('characters', {
        where: { affection: { gt: 40 } }
      });

      expect(characters).toHaveLength(2);
      expect(characters.map(c => c.name)).toContain('Alice');
      expect(characters.map(c => c.name)).toContain('Bob');
    });

    test('应该支持排序', () => {
      const characters = db.getAll('characters', {
        orderBy: 'affection',
        order: 'DESC'
      });

      expect(characters[0].name).toBe('Bob'); // 75
      expect(characters[1].name).toBe('Alice'); // 50
      expect(characters[2].name).toBe('Charlie'); // 30
    });

    test('应该支持 LIMIT', () => {
      const characters = db.getAll('characters', {
        limit: 2
      });

      expect(characters).toHaveLength(2);
    });

    test('应该支持复杂查询', () => {
      const characters = db.getAll('characters', {
        where: {
          affection: { gte: 30, lt: 60 }
        },
        orderBy: 'affection',
        order: 'ASC',
        limit: 2
      });

      expect(characters).toHaveLength(2);
      expect(characters[0].name).toBe('Charlie');
      expect(characters[1].name).toBe('Alice');
    });
  });

  describe('更新操作', () => {
    let characterId;

    beforeEach(() => {
      const result = db.insert('characters', {
        name: 'Alice',
        affection: 50
      });
      characterId = result.id;
    });

    test('应该能更新记录', () => {
      const result = db.update(
        'characters',
        { id: characterId },
        { affection: 60 }
      );

      expect(result.changes).toBe(1);

      const character = db.get('characters', { id: characterId });
      expect(character.affection).toBe(60);
    });

    test('应该自动更新 updated_at', async () => {
      const before = db.get('characters', { id: characterId });

      // 等待一点时间确保时间戳不同
      await new Promise(resolve => setTimeout(resolve, 10));

      db.update('characters', { id: characterId }, { affection: 60 });

      const after = db.get('characters', { id: characterId });
      expect(after.updated_at).toBeGreaterThan(before.updated_at);
    });

    test('更新不存在的记录应该返回 changes=0', () => {
      const result = db.update(
        'characters',
        { id: 'non-existent' },
        { affection: 60 }
      );

      expect(result.changes).toBe(0);
    });
  });

  describe('删除操作', () => {
    let characterId;

    beforeEach(() => {
      const result = db.insert('characters', {
        name: 'Alice',
        affection: 50
      });
      characterId = result.id;
    });

    test('应该能删除记录', () => {
      const result = db.delete('characters', { id: characterId });

      expect(result.changes).toBe(1);

      const character = db.get('characters', { id: characterId });
      expect(character).toBeNull();
    });

    test('删除不存在的记录应该返回 changes=0', () => {
      const result = db.delete('characters', { id: 'non-existent' });

      expect(result.changes).toBe(0);
    });

    test('应该支持级联删除（外键）', () => {
      // 插入物品
      db.insert('inventory', {
        character_id: characterId,
        item_name: 'Sword',
        quantity: 1
      });

      // 删除角色
      db.delete('characters', { id: characterId });

      // 物品应该被级联删除
      const items = db.getAll('inventory', {
        where: { character_id: characterId }
      });

      expect(items).toHaveLength(0);
    });
  });

  describe('事务支持', () => {
    test('应该能执行事务', () => {
      db.transaction(() => {
        db.insert('characters', { name: 'Alice', affection: 50 });
        db.insert('characters', { name: 'Bob', affection: 75 });
      });

      const characters = db.getAll('characters');
      expect(characters).toHaveLength(2);
    });

    test('事务失败应该回滚', () => {
      try {
        db.transaction(() => {
          db.insert('characters', { name: 'Alice', affection: 50 });
          throw new Error('Transaction failed');
        });
      } catch (error) {
        // 预期的错误
      }

      const characters = db.getAll('characters');
      expect(characters).toHaveLength(0); // 应该回滚
    });
  });

  describe('原始 SQL', () => {
    test('应该支持 SELECT 查询', () => {
      db.insert('characters', { name: 'Alice', affection: 50 });

      const result = db.raw('SELECT * FROM characters WHERE affection > ?', [40]);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Alice');
    });

    test('应该支持 INSERT/UPDATE/DELETE', () => {
      const result = db.raw("INSERT INTO characters (id, name, affection, created_at, updated_at) VALUES ('test-1', 'Test', 50, ?, ?)", [Date.now(), Date.now()]);

      expect(result.changes).toBe(1);
    });
  });

  describe('统计信息', () => {
    test('应该能获取数据库统计', () => {
      db.insert('characters', { name: 'Alice' });
      db.insert('characters', { name: 'Bob' });

      const stats = db.getStats();

      expect(stats.tables.characters).toBe(2);
      expect(stats.totalRecords).toBeGreaterThanOrEqual(2);
      expect(stats.dbPath).toBe(testDbPath);
    });
  });

  describe('性能要求', () => {
    test('单次查询应该 < 5ms', () => {
      // 插入测试数据
      for (let i = 0; i < 100; i++) {
        db.insert('characters', {
          name: `Character ${i}`,
          affection: Math.floor(Math.random() * 100)
        });
      }

      const start = performance.now();

      for (let i = 0; i < 100; i++) {
        db.get('characters', { name: `Character ${i}` });
      }

      const duration = performance.now() - start;
      expect(duration / 100).toBeLessThan(5); // 平均 < 5ms
    });

    test('批量查询应该 < 10ms', () => {
      // 插入测试数据
      for (let i = 0; i < 100; i++) {
        db.insert('characters', {
          name: `Character ${i}`,
          affection: Math.floor(Math.random() * 100)
        });
      }

      const start = performance.now();
      db.getAll('characters', {
        where: { affection: { gt: 50 } },
        limit: 20
      });
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(10);
    });
  });
});
