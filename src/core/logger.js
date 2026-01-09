/**
 * Logger - 核心日志系统
 *
 * 功能：
 * - 多级别日志（ERROR, WARN, INFO, DEBUG, TRACE）
 * - 自动按日期轮转日志文件
 * - 请求追踪（requestId）
 * - 性能监控（操作耗时）
 * - 结构化日志（JSON 格式）
 *
 * 设计原则：
 * - 日志优先：所有关键操作必须记录
 * - 高性能：异步写入，不阻塞主线程
 * - 易调试：清晰的日志格式和上下文信息
 *
 * @module core/logger
 * @version 0.0.1
 */

import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { randomUUID } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * 日志级别定义
 * @enum {string}
 */
export const LOG_LEVELS = {
  ERROR: 'error',   // 错误：系统故障，需要立即处理
  WARN: 'warn',     // 警告：潜在问题，需要关注
  INFO: 'info',     // 信息：重要的业务事件
  DEBUG: 'debug',   // 调试：详细的调试信息
  TRACE: 'trace'    // 追踪：最详细的执行流程
};

/**
 * 自定义日志格式
 * 包含：时间戳、级别、requestId、消息、上下文数据
 */
const customFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, requestId, duration, ...meta }) => {
    // 基础日志信息
    let log = `[${timestamp}] [${level.toUpperCase()}]`;

    // 添加 requestId（用于追踪单个请求的完整链路）
    if (requestId) {
      log += ` [${requestId}]`;
    }

    // 添加消息
    log += ` ${message}`;

    // 添加耗时（用于性能监控）
    if (duration !== undefined) {
      log += ` (${duration}ms)`;
    }

    // 添加额外上下文信息
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta)}`;
    }

    return log;
  })
);

/**
 * Logger 类
 * 提供统一的日志接口和上下文管理
 */
class Logger {
  /**
   * @param {Object} options - 配置选项
   * @param {string} options.level - 日志级别（默认: info）
   * @param {boolean} options.toFile - 是否写入文件（默认: true）
   * @param {boolean} options.toConsole - 是否输出到控制台（默认: true）
   * @param {string} options.logDir - 日志文件目录（默认: ./data/logs）
   */
  constructor(options = {}) {
    this.options = {
      level: options.level || process.env.LOG_LEVEL || 'info',
      toFile: options.toFile !== false,
      toConsole: options.toConsole !== false,
      logDir: options.logDir || join(process.cwd(), 'data', 'logs')
    };

    this.winston = this._createWinstonLogger();

    // 存储当前上下文（如 requestId）
    this.context = {};
  }

  /**
   * 创建 Winston Logger 实例
   * @private
   */
  _createWinstonLogger() {
    const transports = [];

    // 控制台输出（开发环境）
    if (this.options.toConsole) {
      transports.push(
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            customFormat
          )
        })
      );
    }

    // 文件输出（所有环境）
    if (this.options.toFile) {
      // 所有日志
      transports.push(
        new DailyRotateFile({
          filename: join(this.options.logDir, 'combined-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          maxSize: '20m',
          maxFiles: '14d',
          format: customFormat
        })
      );

      // 错误日志（单独文件，便于快速排查）
      transports.push(
        new DailyRotateFile({
          level: 'error',
          filename: join(this.options.logDir, 'error-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          maxSize: '20m',
          maxFiles: '30d',
          format: customFormat
        })
      );
    }

    return winston.createLogger({
      level: this.options.level,
      levels: {
        error: 0,
        warn: 1,
        info: 2,
        debug: 3,
        trace: 4
      },
      transports
    });
  }

  /**
   * 设置上下文信息（如 requestId）
   * 用法：logger.setContext({ requestId: '123' })
   *
   * @param {Object} context - 上下文键值对
   */
  setContext(context) {
    Object.assign(this.context, context);
  }

  /**
   * 清除上下文信息
   */
  clearContext() {
    this.context = {};
  }

  /**
   * 生成唯一的 requestId
   * @returns {string} UUID v4
   */
  generateRequestId() {
    return randomUUID();
  }

  /**
   * 记录 ERROR 级别日志
   * @param {string} message - 日志消息
   * @param {Object} meta - 额外信息
   */
  error(message, meta = {}) {
    this.winston.error(message, { ...this.context, ...meta });
  }

  /**
   * 记录 WARN 级别日志
   * @param {string} message - 日志消息
   * @param {Object} meta - 额外信息
   */
  warn(message, meta = {}) {
    this.winston.warn(message, { ...this.context, ...meta });
  }

  /**
   * 记录 INFO 级别日志
   * @param {string} message - 日志消息
   * @param {Object} meta - 额外信息
   */
  info(message, meta = {}) {
    this.winston.info(message, { ...this.context, ...meta });
  }

  /**
   * 记录 DEBUG 级别日志
   * @param {string} message - 日志消息
   * @param {Object} meta - 额外信息
   */
  debug(message, meta = {}) {
    this.winston.debug(message, { ...this.context, ...meta });
  }

  /**
   * 记录 TRACE 级别日志（最详细）
   * @param {string} message - 日志消息
   * @param {Object} meta - 额外信息
   */
  trace(message, meta = {}) {
    this.winston.log('trace', message, { ...this.context, ...meta });
  }

  /**
   * 性能计时器
   * 用法：
   *   const timer = logger.startTimer();
   *   // ... 执行操作 ...
   *   timer.done('操作完成');
   *
   * @param {string} label - 计时器标签
   * @returns {Object} 计时器对象
   */
  startTimer(label = 'operation') {
    const startTime = Date.now();
    const requestId = this.context.requestId || this.generateRequestId();

    return {
      done: (message = `${label} completed`) => {
        const duration = Date.now() - startTime;
        this.info(message, {
          requestId,
          duration,
          label
        });
        return duration;
      }
    };
  }

  /**
   * 创建子 Logger（继承父 Logger 的上下文）
   * 用法：const childLogger = logger.child({ module: 'LLM' })
   *
   * @param {Object} context - 子 Logger 的额外上下文
   * @returns {Logger} 子 Logger 实例
   */
  child(context) {
    const childLogger = new Logger(this.options);
    childLogger.context = { ...this.context, ...context };
    childLogger.winston = this.winston;
    return childLogger;
  }
}

/**
 * 导出默认 Logger 实例（单例）
 * 应用中应该使用这个实例，而不是创建新的 Logger
 */
export const logger = new Logger();

/**
 * 导出 Logger 类（用于测试或特殊场景）
 */
export default Logger;
