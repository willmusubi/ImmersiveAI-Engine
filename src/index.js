/**
 * Immersive AI Engine - 入口文件
 *
 * 这是应用的主入口点，负责：
 * - 初始化核心模块（Logger, Config）
 * - 启动应用
 * - 处理优雅关闭
 *
 * @version 0.0.1
 */

import { logger } from './core/logger.js';
import { config } from './core/config.js';

/**
 * 应用主类
 */
class ImmersiveAIEngine {
  constructor() {
    this.initialized = false;
  }

  /**
   * 初始化应用
   */
  async initialize() {
    try {
      logger.info('='.repeat(60));
      logger.info(`Immersive AI Engine v${config.get('app.version')}`);
      logger.info(`Environment: ${config.env}`);
      logger.info('='.repeat(60));

      // 显示配置信息
      logger.info('Configuration loaded:', {
        port: config.get('app.port'),
        logLevel: config.get('logging.level'),
        dbPath: config.get('database.path'),
        features: config.get('features')
      });

      this.initialized = true;
      logger.info('Application initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize application', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * 启动应用
   */
  async start() {
    if (!this.initialized) {
      await this.initialize();
    }

    logger.info('Application started');

    // MVP-0: 只做基础初始化，暂不启动服务器
    logger.info('MVP-0: Basic infrastructure ready');
    logger.info('Waiting for MVP-1 to implement actual functionality...');
  }

  /**
   * 优雅关闭
   */
  async shutdown() {
    logger.info('Shutting down application...');

    // TODO: 清理资源（数据库连接、定时器等）

    logger.info('Application shut down successfully');
    process.exit(0);
  }
}

// 创建应用实例
const app = new ImmersiveAIEngine();

// 处理进程信号
process.on('SIGINT', () => {
  logger.warn('Received SIGINT signal');
  app.shutdown();
});

process.on('SIGTERM', () => {
  logger.warn('Received SIGTERM signal');
  app.shutdown();
});

// 处理未捕获的错误
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', {
    error: error.message,
    stack: error.stack
  });
  app.shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', {
    reason,
    promise
  });
  app.shutdown();
});

// 启动应用
app.start().catch((error) => {
  logger.error('Failed to start application', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});

// 导出应用实例（用于测试）
export default app;
