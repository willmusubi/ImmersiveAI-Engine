/**
 * Database Manager - 数据库管理系统
 *
 * 功能：
 * - 数据库初始化和迁移
 * - CRUD 操作封装
 * - 事务支持
 * - 连接管理
 * - 查询性能优化
 *
 * 技术选型：
 * - better-sqlite3：同步 API，性能优秀
 * - SQLite：轻量级，无需额外服务
 *
 * @module core/database
 * @version 0.1.0
 */

import Database from 'better-sqlite3';
import { logger } from './logger.js';
import { config } from './config.js';
import { readFileSync, existsSync } from 'fs';
import { mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { randomUUID } from 'crypto';

/**
 * Database Manager 类
 *
 * 使用示例：
 * ```javascript
 * const db = new DatabaseManager();
 *
 * // 查询
 * const character = db.get('characters', { name: 'Alice' });
 *
 * // 插入
 * db.insert('characters', {
 *   id: 'char-1',
 *   name: 'Alice',
 *   affection: 50
 * });
 *
 * // 更新
 * db.update('characters', { id: 'char-1' }, { affection: 60 });
 *
 * // 删除
 * db.delete('characters', { id: 'char-1' });
 * ```
 */
class DatabaseManager {
  /**
   * @param {Object} options - 配置选项
   * @param {string} options.dbPath - 数据库文件路径
   * @param {boolean} options.readonly - 是否只读模式
   * @param {boolean} options.verbose - 是否输出 SQL 日志
   */
  constructor(options = {}) {
    this.options = {
      dbPath: options.dbPath || config.get('database.path'),
      readonly: options.readonly || false,
      verbose: options.verbose || config.get('database.verbose', false)
    };

    this.db = null;
    this.logger = logger.child({ module: 'DatabaseManager' });

    // 初始化数据库
    this._initialize();

    this.logger.info('Database Manager initialized', {
      dbPath: this.options.dbPath,
      readonly: this.options.readonly
    });
  }

  /**
   * 初始化数据库
   * @private
   */
  _initialize() {
    try {
      // 确保数据库目录存在
      const dbDir = dirname(this.options.dbPath);
      if (!existsSync(dbDir)) {
        mkdir(dbDir, { recursive: true });
        this.logger.info('Database directory created', { path: dbDir });
      }

      // 打开数据库连接
      this.db = new Database(this.options.dbPath, {
        readonly: this.options.readonly,
        fileMustExist: false,
        timeout: 5000
      });

      // 启用 WAL 模式（Write-Ahead Logging）提升并发性能
      this.db.pragma('journal_mode = WAL');

      // 启用外键约束
      this.db.pragma('foreign_keys = ON');

      // 设置同步模式（NORMAL 平衡性能和安全）
      this.db.pragma('synchronous = NORMAL');

      // 设置缓存大小（-2000 表示 2MB）
      this.db.pragma('cache_size = -2000');

      // 启用 SQL 日志（如果配置了）
      if (this.options.verbose) {
        this.db.on('trace', (sql) => {
          this.logger.debug('SQL Query', { sql });
        });
      }

      // 运行 Schema 迁移
      this._runMigrations();

    } catch (error) {
      this.logger.error('Database initialization failed', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 运行 Schema 迁移
   * @private
   */
  _runMigrations() {
    try {
      // 读取 Schema 文件
      const schemaPath = join(dirname(new URL(import.meta.url).pathname), 'schema.sql');
      const schema = readFileSync(schemaPath, 'utf8');

      // 执行 Schema
      this.db.exec(schema);

      this.logger.info('Database schema migrated');
    } catch (error) {
      this.logger.error('Schema migration failed', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 查询单条记录
   *
   * @param {string} table - 表名
   * @param {Object} where - 查询条件
   * @returns {Object|null} 记录对象
   *
   * @example
   * const character = db.get('characters', { name: 'Alice' });
   */
  get(table, where = {}) {
    const timer = this.logger.startTimer('DB get');

    try {
      const { sql, params } = this._buildSelectQuery(table, where);
      const stmt = this.db.prepare(sql);
      const result = stmt.get(params);

      timer.done(`DB get from ${table}`);

      return result || null;
    } catch (error) {
      this.logger.error('Query failed', {
        table,
        where,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 查询多条记录
   *
   * @param {string} table - 表名
   * @param {Object} options - 查询选项
   * @param {Object} options.where - 查询条件
   * @param {string} options.orderBy - 排序字段
   * @param {string} options.order - 排序方向（ASC/DESC）
   * @param {number} options.limit - 限制数量
   * @param {number} options.offset - 偏移量
   * @returns {Array} 记录列表
   *
   * @example
   * const characters = db.getAll('characters', {
   *   where: { affection: { gt: 50 } },
   *   orderBy: 'affection',
   *   order: 'DESC',
   *   limit: 10
   * });
   */
  getAll(table, options = {}) {
    const timer = this.logger.startTimer('DB getAll');

    try {
      const { sql, params } = this._buildSelectQuery(
        table,
        options.where || {},
        options
      );
      const stmt = this.db.prepare(sql);
      const results = stmt.all(params);

      timer.done(`DB getAll from ${table}`);

      return results;
    } catch (error) {
      this.logger.error('Query failed', {
        table,
        options,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 插入记录
   *
   * @param {string} table - 表名
   * @param {Object} data - 数据对象
   * @returns {Object} 插入结果
   *
   * @example
   * db.insert('characters', {
   *   id: 'char-1',
   *   name: 'Alice',
   *   affection: 50
   * });
   */
  insert(table, data) {
    const timer = this.logger.startTimer('DB insert');

    try {
      // 添加时间戳
      const now = Date.now();
      const record = {
        ...data,
        id: data.id || randomUUID(),
        created_at: now,
        updated_at: now
      };

      const columns = Object.keys(record);
      const placeholders = columns.map(() => '?').join(', ');
      const values = columns.map(col => record[col]);

      const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
      const stmt = this.db.prepare(sql);
      const result = stmt.run(values);

      timer.done(`DB insert into ${table}`);

      this.logger.debug('Record inserted', {
        table,
        id: record.id,
        changes: result.changes
      });

      return {
        id: record.id,
        changes: result.changes
      };
    } catch (error) {
      this.logger.error('Insert failed', {
        table,
        data,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 更新记录
   *
   * @param {string} table - 表名
   * @param {Object} where - 查询条件
   * @param {Object} data - 更新数据
   * @returns {Object} 更新结果
   *
   * @example
   * db.update('characters', { id: 'char-1' }, { affection: 60 });
   */
  update(table, where, data) {
    const timer = this.logger.startTimer('DB update');

    try {
      // 添加更新时间
      const updateData = {
        ...data,
        updated_at: Date.now()
      };

      const setClause = Object.keys(updateData)
        .map(key => `${key} = ?`)
        .join(', ');
      const setValues = Object.values(updateData);

      const { whereClause, whereValues } = this._buildWhereClause(where);

      const sql = `UPDATE ${table} SET ${setClause} WHERE ${whereClause}`;
      const stmt = this.db.prepare(sql);
      const result = stmt.run([...setValues, ...whereValues]);

      timer.done(`DB update in ${table}`);

      this.logger.debug('Record updated', {
        table,
        where,
        changes: result.changes
      });

      return {
        changes: result.changes
      };
    } catch (error) {
      this.logger.error('Update failed', {
        table,
        where,
        data,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 删除记录
   *
   * @param {string} table - 表名
   * @param {Object} where - 查询条件
   * @returns {Object} 删除结果
   *
   * @example
   * db.delete('characters', { id: 'char-1' });
   */
  delete(table, where) {
    const timer = this.logger.startTimer('DB delete');

    try {
      const { whereClause, whereValues } = this._buildWhereClause(where);

      const sql = `DELETE FROM ${table} WHERE ${whereClause}`;
      const stmt = this.db.prepare(sql);
      const result = stmt.run(whereValues);

      timer.done(`DB delete from ${table}`);

      this.logger.debug('Record deleted', {
        table,
        where,
        changes: result.changes
      });

      return {
        changes: result.changes
      };
    } catch (error) {
      this.logger.error('Delete failed', {
        table,
        where,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 执行事务
   *
   * @param {Function} callback - 事务回调函数
   * @returns {*} 回调函数的返回值
   *
   * @example
   * db.transaction(() => {
   *   db.insert('characters', { name: 'Alice' });
   *   db.insert('characters', { name: 'Bob' });
   * });
   */
  transaction(callback) {
    const timer = this.logger.startTimer('DB transaction');

    try {
      const result = this.db.transaction(callback)();

      timer.done('DB transaction');

      return result;
    } catch (error) {
      this.logger.error('Transaction failed', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 执行原始 SQL
   *
   * @param {string} sql - SQL 语句
   * @param {Array} params - 参数
   * @returns {*} 查询结果
   *
   * @example
   * const result = db.raw('SELECT * FROM characters WHERE affection > ?', [50]);
   */
  raw(sql, params = []) {
    try {
      const stmt = this.db.prepare(sql);

      // 根据 SQL 类型返回不同结果
      if (sql.trim().toUpperCase().startsWith('SELECT')) {
        return stmt.all(params);
      } else {
        return stmt.run(params);
      }
    } catch (error) {
      this.logger.error('Raw query failed', {
        sql,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 构建 SELECT 查询
   * @private
   */
  _buildSelectQuery(table, where = {}, options = {}) {
    let sql = `SELECT * FROM ${table}`;
    let params = [];

    // WHERE 子句
    if (Object.keys(where).length > 0) {
      const { whereClause, whereValues } = this._buildWhereClause(where);
      sql += ` WHERE ${whereClause}`;
      params = whereValues;
    }

    // ORDER BY 子句
    if (options.orderBy) {
      const order = options.order || 'ASC';
      sql += ` ORDER BY ${options.orderBy} ${order}`;
    }

    // LIMIT 子句
    if (options.limit) {
      sql += ` LIMIT ${options.limit}`;

      if (options.offset) {
        sql += ` OFFSET ${options.offset}`;
      }
    }

    return { sql, params };
  }

  /**
   * 构建 WHERE 子句
   * @private
   */
  _buildWhereClause(where) {
    const conditions = [];
    const values = [];

    for (const [key, value] of Object.entries(where)) {
      if (typeof value === 'object' && value !== null) {
        // 支持运算符: { gt: 50 }, { lt: 100 }, { like: '%Alice%' }
        for (const [op, val] of Object.entries(value)) {
          switch (op) {
            case 'gt':
              conditions.push(`${key} > ?`);
              values.push(val);
              break;
            case 'gte':
              conditions.push(`${key} >= ?`);
              values.push(val);
              break;
            case 'lt':
              conditions.push(`${key} < ?`);
              values.push(val);
              break;
            case 'lte':
              conditions.push(`${key} <= ?`);
              values.push(val);
              break;
            case 'like':
              conditions.push(`${key} LIKE ?`);
              values.push(val);
              break;
            case 'in':
              const placeholders = val.map(() => '?').join(', ');
              conditions.push(`${key} IN (${placeholders})`);
              values.push(...val);
              break;
            default:
              throw new Error(`Unknown operator: ${op}`);
          }
        }
      } else {
        // 简单相等
        conditions.push(`${key} = ?`);
        values.push(value);
      }
    }

    return {
      whereClause: conditions.join(' AND '),
      whereValues: values
    };
  }

  /**
   * 关闭数据库连接
   */
  close() {
    if (this.db) {
      this.db.close();
      this.logger.info('Database connection closed');
    }
  }

  /**
   * 获取数据库统计信息
   *
   * @returns {Object} 统计数据
   */
  getStats() {
    try {
      const tables = [
        'characters',
        'timeline',
        'locations',
        'inventory',
        'memories',
        'state_snapshots',
        'validation_logs'
      ];

      const stats = {};
      for (const table of tables) {
        const result = this.db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get();
        stats[table] = result.count;
      }

      return {
        tables: stats,
        totalRecords: Object.values(stats).reduce((sum, count) => sum + count, 0),
        dbPath: this.options.dbPath,
        dbSize: this._getDbSize()
      };
    } catch (error) {
      this.logger.error('Failed to get stats', {
        error: error.message
      });
      return null;
    }
  }

  /**
   * 获取数据库文件大小
   * @private
   */
  _getDbSize() {
    try {
      const fs = require('fs');
      const stats = fs.statSync(this.options.dbPath);
      return (stats.size / 1024).toFixed(2) + ' KB';
    } catch {
      return 'Unknown';
    }
  }
}

/**
 * 导出
 */
export default DatabaseManager;
