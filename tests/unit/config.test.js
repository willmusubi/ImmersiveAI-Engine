/**
 * Config 单元测试
 *
 * 测试目标：
 * - 配置加载和合并
 * - 环境变量覆盖
 * - 配置校验
 * - 配置读写操作
 *
 * @module tests/unit/config.test
 */

import Config from '../../src/core/config.js';

describe('Config', () => {
  let config;

  beforeEach(() => {
    // 使用测试环境
    config = new Config('test');
  });

  describe('基础功能', () => {
    test('应该能创建 Config 实例', () => {
      expect(config).toBeInstanceOf(Config);
      expect(config.loaded).toBe(true);
    });

    test('应该正确识别环境', () => {
      expect(config.env).toBe('test');
      expect(config.isTest()).toBe(true);
      expect(config.isProduction()).toBe(false);
      expect(config.isDevelopment()).toBe(false);
    });

    test('应该加载默认配置', () => {
      expect(config.get('app.name')).toBe('Immersive AI Engine');
      expect(config.get('app.version')).toBe('0.0.1');
    });

    test('测试配置应该覆盖默认配置', () => {
      // test.json 中 port 是 3001
      expect(config.get('app.port')).toBe(3001);

      // test.json 中 logging.level 是 error
      expect(config.get('logging.level')).toBe('error');
    });
  });

  describe('配置读取', () => {
    test('get() 应该支持点号路径', () => {
      expect(config.get('llm.anthropic.model')).toBe('claude-sonnet-4-5-20250929');
    });

    test('get() 应该返回默认值（当路径不存在时）', () => {
      expect(config.get('non.existent.path', 'default')).toBe('default');
    });

    test('get() 应该能读取嵌套对象', () => {
      const llmConfig = config.get('llm');

      expect(llmConfig).toHaveProperty('anthropic');
      expect(llmConfig.anthropic).toHaveProperty('model');
    });

    test('getAll() 应该返回所有配置的副本', () => {
      const allConfig = config.getAll();

      expect(allConfig).toHaveProperty('app');
      expect(allConfig).toHaveProperty('llm');
      expect(allConfig).toHaveProperty('database');

      // 修改返回的配置不应影响原配置
      allConfig.app.name = 'Modified';
      expect(config.get('app.name')).toBe('Immersive AI Engine');
    });
  });

  describe('配置写入', () => {
    test('set() 应该能设置简单值', () => {
      config.set('app.port', 4000);
      expect(config.get('app.port')).toBe(4000);
    });

    test('set() 应该支持点号路径创建嵌套对象', () => {
      config.set('new.nested.value', 'test');
      expect(config.get('new.nested.value')).toBe('test');
    });

    test('set() 应该能覆盖现有值', () => {
      const originalModel = config.get('llm.anthropic.model');
      config.set('llm.anthropic.model', 'haiku-3.5');

      expect(config.get('llm.anthropic.model')).toBe('haiku-3.5');
      expect(config.get('llm.anthropic.model')).not.toBe(originalModel);
    });
  });

  describe('环境变量覆盖', () => {
    test('环境变量应该覆盖配置文件', () => {
      // 设置环境变量
      process.env.PORT = '5000';

      const newConfig = new Config('test');

      expect(newConfig.get('app.port')).toBe(5000);

      // 清理
      delete process.env.PORT;
    });

    test('ANTHROPIC_API_KEY 应该从环境变量读取', () => {
      process.env.ANTHROPIC_API_KEY = 'sk-test-key';

      const newConfig = new Config('test');

      expect(newConfig.get('llm.anthropic.apiKey')).toBe('sk-test-key');

      // 清理
      delete process.env.ANTHROPIC_API_KEY;
    });

    test('LOG_LEVEL 应该从环境变量读取', () => {
      process.env.LOG_LEVEL = 'debug';

      const newConfig = new Config('test');

      expect(newConfig.get('logging.level')).toBe('debug');

      // 清理
      delete process.env.LOG_LEVEL;
    });
  });

  describe('配置校验', () => {
    test('测试环境不强制要求 API Key', () => {
      expect(() => {
        new Config('test');
      }).not.toThrow();
    });

    test('缺少数据库路径应该抛出错误', () => {
      // 创建临时配置文件（缺少 database.path）
      const invalidConfig = new Config('test');
      invalidConfig.config.database = {};

      expect(() => {
        invalidConfig._validate();
      }).toThrow('database.path');
    });

    test('无效的日志级别应该抛出错误', () => {
      const invalidConfig = new Config('test');
      invalidConfig.config.logging = { level: 'invalid' };

      expect(() => {
        invalidConfig._validate();
      }).toThrow('Invalid log level');
    });
  });

  describe('性能要求', () => {
    test('加载配置应该在 50ms 内完成', () => {
      const startTime = Date.now();

      new Config('test');

      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(50);
    });

    test('读取 1000 次配置应该很快', () => {
      const startTime = Date.now();

      for (let i = 0; i < 1000; i++) {
        config.get('llm.anthropic.model');
      }

      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(10);
    });
  });
});
