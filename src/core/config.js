/**
 * Config - 配置管理系统
 *
 * 功能：
 * - 多环境配置（development, production, test）
 * - 配置校验（必填项、类型检查）
 * - 环境变量注入
 * - 配置热更新（可选）
 *
 * 设计原则：
 * - 安全第一：敏感信息从环境变量读取
 * - 类型安全：所有配置项有默认值和类型校验
 * - 易扩展：新增配置项简单明了
 *
 * @module core/config
 * @version 0.0.1
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Config 类
 * 提供统一的配置管理接口
 */
class Config {
  /**
   * @param {string} env - 环境名称（development, production, test）
   */
  constructor(env = process.env.NODE_ENV || 'development') {
    this.env = env;
    this.config = {};
    this.loaded = false;

    // 加载配置
    this._load();
  }

  /**
   * 加载配置
   * 优先级：环境变量 > 环境配置文件 > 默认配置文件
   * @private
   */
  _load() {
    try {
      // 1. 加载 .env 文件
      const envPath = join(process.cwd(), '.env');
      if (existsSync(envPath)) {
        dotenv.config({ path: envPath });
        logger.debug('Loaded .env file', { path: envPath });
      }

      // 2. 加载默认配置
      const defaultConfigPath = join(process.cwd(), 'config', 'default.json');
      const defaultConfig = this._loadJsonFile(defaultConfigPath) || {};

      // 3. 加载环境特定配置
      const envConfigPath = join(process.cwd(), 'config', `${this.env}.json`);
      const envConfig = this._loadJsonFile(envConfigPath) || {};

      // 4. 合并配置（环境配置覆盖默认配置）
      this.config = this._deepMerge(defaultConfig, envConfig);

      // 5. 从环境变量覆盖配置
      this._applyEnvOverrides();

      // 6. 校验配置
      this._validate();

      this.loaded = true;
      logger.info('Configuration loaded successfully', {
        env: this.env,
        configKeys: Object.keys(this.config)
      });
    } catch (error) {
      logger.error('Failed to load configuration', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * 加载 JSON 配置文件
   * @private
   */
  _loadJsonFile(path) {
    try {
      if (!existsSync(path)) {
        logger.warn('Config file not found', { path });
        return null;
      }

      const content = readFileSync(path, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      logger.error('Failed to load config file', {
        path,
        error: error.message
      });
      return null;
    }
  }

  /**
   * 深度合并对象
   * @private
   */
  _deepMerge(target, source) {
    const result = { ...target };

    for (const key in source) {
      if (source[key] instanceof Object && !Array.isArray(source[key])) {
        result[key] = this._deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }

  /**
   * 从环境变量覆盖配置
   * @private
   */
  _applyEnvOverrides() {
    // LLM API 配置
    if (process.env.ANTHROPIC_API_KEY) {
      this.config.llm = this.config.llm || {};
      this.config.llm.anthropic = this.config.llm.anthropic || {};
      this.config.llm.anthropic.apiKey = process.env.ANTHROPIC_API_KEY;
    }

    // 应用配置
    if (process.env.PORT) {
      this.config.app = this.config.app || {};
      this.config.app.port = parseInt(process.env.PORT, 10);
    }

    // 日志配置
    if (process.env.LOG_LEVEL) {
      this.config.logging = this.config.logging || {};
      this.config.logging.level = process.env.LOG_LEVEL;
    }

    if (process.env.LOG_TO_FILE !== undefined) {
      this.config.logging = this.config.logging || {};
      this.config.logging.toFile = process.env.LOG_TO_FILE === 'true';
    }

    // 数据库配置
    if (process.env.DB_PATH) {
      this.config.database = this.config.database || {};
      this.config.database.path = process.env.DB_PATH;
    }

    // 性能配置
    if (process.env.MAX_CONCURRENT_REQUESTS) {
      this.config.performance = this.config.performance || {};
      this.config.performance.maxConcurrentRequests = parseInt(
        process.env.MAX_CONCURRENT_REQUESTS,
        10
      );
    }

    if (process.env.REQUEST_TIMEOUT_MS) {
      this.config.performance = this.config.performance || {};
      this.config.performance.requestTimeoutMs = parseInt(
        process.env.REQUEST_TIMEOUT_MS,
        10
      );
    }
  }

  /**
   * 校验配置
   * @private
   */
  _validate() {
    const errors = [];

    // 校验 LLM API Key（生产环境必须）
    if (this.env === 'production') {
      if (!this.config.llm?.anthropic?.apiKey) {
        errors.push('Missing required config: llm.anthropic.apiKey');
      }
    }

    // 校验数据库路径
    if (!this.config.database?.path) {
      errors.push('Missing required config: database.path');
    }

    // 校验日志级别
    const validLogLevels = ['error', 'warn', 'info', 'debug', 'trace'];
    if (this.config.logging?.level &&
        !validLogLevels.includes(this.config.logging.level)) {
      errors.push(`Invalid log level: ${this.config.logging.level}`);
    }

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
    }
  }

  /**
   * 获取配置值
   * 支持点号路径，如 config.get('llm.anthropic.apiKey')
   *
   * @param {string} path - 配置路径（用点号分隔）
   * @param {*} defaultValue - 默认值（可选）
   * @returns {*} 配置值
   */
  get(path, defaultValue = undefined) {
    const keys = path.split('.');
    let value = this.config;

    for (const key of keys) {
      if (value === undefined || value === null) {
        return defaultValue;
      }
      value = value[key];
    }

    return value !== undefined ? value : defaultValue;
  }

  /**
   * 设置配置值（运行时修改，不持久化）
   * 支持点号路径，如 config.set('llm.anthropic.model', 'sonnet-4.5')
   *
   * @param {string} path - 配置路径
   * @param {*} value - 配置值
   */
  set(path, value) {
    const keys = path.split('.');
    let target = this.config;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!target[key] || typeof target[key] !== 'object') {
        target[key] = {};
      }
      target = target[key];
    }

    target[keys[keys.length - 1]] = value;

    logger.debug('Configuration updated', { path, value });
  }

  /**
   * 获取所有配置（只读）
   * @returns {Object} 配置对象的深拷贝
   */
  getAll() {
    return JSON.parse(JSON.stringify(this.config));
  }

  /**
   * 检查是否为生产环境
   * @returns {boolean}
   */
  isProduction() {
    return this.env === 'production';
  }

  /**
   * 检查是否为开发环境
   * @returns {boolean}
   */
  isDevelopment() {
    return this.env === 'development';
  }

  /**
   * 检查是否为测试环境
   * @returns {boolean}
   */
  isTest() {
    return this.env === 'test';
  }
}

/**
 * 导出默认 Config 实例（单例）
 */
export const config = new Config();

/**
 * 导出 Config 类（用于测试）
 */
export default Config;
