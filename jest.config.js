/**
 * Jest 配置文件
 *
 * Jest 是 JavaScript 测试框架
 * 用于单元测试、集成测试和 E2E 测试
 */

export default {
  // 测试环境
  testEnvironment: 'node',

  // 模块转换（支持 import/export）
  transform: {},

  // 测试匹配模式
  testMatch: [
    '**/tests/**/*.test.js',
    '**/?(*.)+(spec|test).js'
  ],

  // 覆盖率收集
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!src/index.js'
  ],

  // 覆盖率阈值（未达到会失败）
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },

  // 测试超时
  testTimeout: 10000,

  // 显示详细输出
  verbose: true,

  // 清除 mock
  clearMocks: true,

  // 错误后继续测试其他文件
  bail: false
};
