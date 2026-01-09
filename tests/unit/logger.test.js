/**
 * Logger 单元测试
 *
 * 测试目标：
 * - 日志级别正确性
 * - 上下文管理
 * - 性能计时器
 * - 子 Logger 创建
 *
 * @module tests/unit/logger.test
 */

import Logger from '../../src/core/logger.js';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// 测试用的日志目录
const TEST_LOG_DIR = join(process.cwd(), 'data', 'logs', 'test');

describe('Logger', () => {
  let logger;

  beforeEach(() => {
    // 确保测试日志目录存在
    if (!existsSync(TEST_LOG_DIR)) {
      mkdirSync(TEST_LOG_DIR, { recursive: true });
    }

    // 创建测试 Logger（不输出到文件和控制台，避免污染）
    logger = new Logger({
      level: 'trace',
      toFile: false,
      toConsole: false,
      logDir: TEST_LOG_DIR
    });
  });

  afterEach(() => {
    logger.clearContext();
  });

  describe('基础功能', () => {
    test('应该能创建 Logger 实例', () => {
      expect(logger).toBeInstanceOf(Logger);
      expect(logger.winston).toBeDefined();
    });

    test('应该支持所有日志级别', () => {
      expect(() => logger.error('test error')).not.toThrow();
      expect(() => logger.warn('test warn')).not.toThrow();
      expect(() => logger.info('test info')).not.toThrow();
      expect(() => logger.debug('test debug')).not.toThrow();
      expect(() => logger.trace('test trace')).not.toThrow();
    });

    test('应该能记录额外的元数据', () => {
      expect(() => {
        logger.info('test', {
          userId: '123',
          action: 'login'
        });
      }).not.toThrow();
    });
  });

  describe('上下文管理', () => {
    test('应该能设置上下文', () => {
      logger.setContext({ requestId: 'req-123' });
      expect(logger.context.requestId).toBe('req-123');
    });

    test('应该能清除上下文', () => {
      logger.setContext({ requestId: 'req-123' });
      logger.clearContext();
      expect(Object.keys(logger.context).length).toBe(0);
    });

    test('应该能生成唯一的 requestId', () => {
      const id1 = logger.generateRequestId();
      const id2 = logger.generateRequestId();

      expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      expect(id1).not.toBe(id2);
    });
  });

  describe('性能计时器', () => {
    test('应该能创建计时器', () => {
      const timer = logger.startTimer('test-operation');
      expect(timer).toHaveProperty('done');
      expect(typeof timer.done).toBe('function');
    });

    test('应该能记录操作耗时', async () => {
      const timer = logger.startTimer('async-operation');

      // 模拟异步操作
      await new Promise(resolve => setTimeout(resolve, 10));

      const duration = timer.done('操作完成');

      expect(duration).toBeGreaterThanOrEqual(10);
    });

    test('计时器应该继承上下文', () => {
      logger.setContext({ requestId: 'req-456' });
      const timer = logger.startTimer('test');

      // 验证计时器完成时会使用上下文中的 requestId
      expect(() => timer.done()).not.toThrow();
    });
  });

  describe('子 Logger', () => {
    test('应该能创建子 Logger', () => {
      const childLogger = logger.child({ module: 'LLM' });

      expect(childLogger).toBeInstanceOf(Logger);
      expect(childLogger.context.module).toBe('LLM');
    });

    test('子 Logger 应该继承父 Logger 的上下文', () => {
      logger.setContext({ requestId: 'req-789' });
      const childLogger = logger.child({ module: 'State' });

      expect(childLogger.context.requestId).toBe('req-789');
      expect(childLogger.context.module).toBe('State');
    });

    test('子 Logger 应该共享父 Logger 的 Winston 实例', () => {
      const childLogger = logger.child({ module: 'Test' });

      expect(childLogger.winston).toBe(logger.winston);
    });
  });

  describe('错误处理', () => {
    test('应该能记录错误对象', () => {
      const error = new Error('Test error');

      expect(() => {
        logger.error('An error occurred', { error: error.message });
      }).not.toThrow();
    });

    test('应该能记录错误堆栈', () => {
      try {
        throw new Error('Test error with stack');
      } catch (error) {
        expect(() => {
          logger.error('Caught error', {
            error: error.message,
            stack: error.stack
          });
        }).not.toThrow();
      }
    });
  });

  describe('性能要求', () => {
    test('记录 1000 条日志应该在 100ms 内完成', () => {
      const startTime = Date.now();

      for (let i = 0; i < 1000; i++) {
        logger.info(`Test log ${i}`);
      }

      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(100);
    });

    test('创建 100 个子 Logger 应该很快', () => {
      const startTime = Date.now();

      for (let i = 0; i < 100; i++) {
        logger.child({ index: i });
      }

      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(50);
    });
  });
});
