/**
 * Conversation Manager - 对话管理系统
 *
 * 功能：
 * - 对话历史管理（增删查改）
 * - 上下文窗口管理（Token 限制）
 * - 对话持久化（存储/加载）
 * - 对话摘要和压缩
 * - 多对话会话管理
 *
 * 设计原则：
 * - 高性能：内存缓存 + 异步持久化
 * - 可扩展：支持 100+ 轮对话
 * - 智能上下文：自动管理 Token 预算
 *
 * @module conversation/manager
 * @version 0.1.0
 */

import { logger } from '../core/logger.js';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

/**
 * Conversation Manager 类
 *
 * 使用示例：
 * ```javascript
 * const manager = new ConversationManager();
 * const conversation = manager.createConversation();
 *
 * conversation.addMessage({ role: 'user', content: 'Hello!' });
 * conversation.addMessage({ role: 'assistant', content: 'Hi!' });
 *
 * await manager.save(conversation.id);
 * ```
 */
class ConversationManager {
  /**
   * @param {Object} options - 配置选项
   * @param {string} options.storageDir - 存储目录
   * @param {number} options.maxContextTokens - 最大上下文 Token 数
   * @param {boolean} options.autoSave - 是否自动保存
   */
  constructor(options = {}) {
    this.options = {
      storageDir: options.storageDir || join(process.cwd(), 'data', 'conversations'),
      maxContextTokens: options.maxContextTokens || 100000, // Claude 支持 200K，留一半
      autoSave: options.autoSave !== false
    };

    // 内存中的对话缓存（conversationId => Conversation）
    this.conversations = new Map();

    this.logger = logger.child({ module: 'ConversationManager' });

    // 确保存储目录存在
    this._ensureStorageDir();

    this.logger.info('Conversation Manager initialized', {
      storageDir: this.options.storageDir,
      maxContextTokens: this.options.maxContextTokens
    });
  }

  /**
   * 确保存储目录存在
   * @private
   */
  async _ensureStorageDir() {
    if (!existsSync(this.options.storageDir)) {
      await mkdir(this.options.storageDir, { recursive: true });
      this.logger.info('Storage directory created', {
        path: this.options.storageDir
      });
    }
  }

  /**
   * 创建新对话
   *
   * @param {Object} metadata - 对话元数据
   * @param {string} metadata.title - 对话标题
   * @param {string} metadata.characterName - 角色名称
   * @param {Object} metadata.customData - 自定义数据
   * @returns {Conversation} 对话对象
   */
  createConversation(metadata = {}) {
    const conversation = new Conversation({
      id: randomUUID(),
      title: metadata.title || 'New Conversation',
      characterName: metadata.characterName || 'AI',
      customData: metadata.customData || {},
      createdAt: Date.now()
    });

    this.conversations.set(conversation.id, conversation);

    this.logger.info('Conversation created', {
      id: conversation.id,
      title: conversation.title
    });

    return conversation;
  }

  /**
   * 获取对话
   *
   * @param {string} conversationId - 对话 ID
   * @returns {Conversation|null} 对话对象
   */
  getConversation(conversationId) {
    return this.conversations.get(conversationId) || null;
  }

  /**
   * 加载对话（从文件）
   *
   * @param {string} conversationId - 对话 ID
   * @returns {Promise<Conversation>} 对话对象
   */
  async load(conversationId) {
    // 先检查缓存
    if (this.conversations.has(conversationId)) {
      this.logger.debug('Conversation loaded from cache', { conversationId });
      return this.conversations.get(conversationId);
    }

    // 从文件加载
    const filePath = this._getConversationPath(conversationId);

    if (!existsSync(filePath)) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    const data = await readFile(filePath, 'utf8');
    const json = JSON.parse(data);

    const conversation = Conversation.fromJSON(json);
    this.conversations.set(conversationId, conversation);

    this.logger.info('Conversation loaded from file', {
      conversationId,
      messageCount: conversation.messages.length
    });

    return conversation;
  }

  /**
   * 保存对话（到文件）
   *
   * @param {string} conversationId - 对话 ID
   * @returns {Promise<void>}
   */
  async save(conversationId) {
    const conversation = this.conversations.get(conversationId);

    if (!conversation) {
      throw new Error(`Conversation not found in memory: ${conversationId}`);
    }

    const filePath = this._getConversationPath(conversationId);
    const json = conversation.toJSON();

    await writeFile(filePath, JSON.stringify(json, null, 2), 'utf8');

    this.logger.debug('Conversation saved to file', {
      conversationId,
      filePath,
      messageCount: conversation.messages.length
    });
  }

  /**
   * 删除对话
   *
   * @param {string} conversationId - 对话 ID
   */
  deleteConversation(conversationId) {
    this.conversations.delete(conversationId);

    // 注意：这里没有删除文件，只是从内存中移除
    // 如果需要删除文件，可以使用 fs.unlink

    this.logger.info('Conversation deleted from memory', { conversationId });
  }

  /**
   * 获取对话列表
   *
   * @returns {Array} 对话摘要列表
   */
  listConversations() {
    const conversations = [];

    for (const [id, conv] of this.conversations.entries()) {
      conversations.push({
        id,
        title: conv.title,
        characterName: conv.characterName,
        messageCount: conv.messages.length,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt
      });
    }

    // 按更新时间降序排序
    conversations.sort((a, b) => b.updatedAt - a.updatedAt);

    return conversations;
  }

  /**
   * 获取对话文件路径
   * @private
   */
  _getConversationPath(conversationId) {
    return join(this.options.storageDir, `${conversationId}.json`);
  }
}

/**
 * Conversation 类
 * 表示一个对话会话
 */
class Conversation {
  /**
   * @param {Object} options - 对话选项
   */
  constructor(options) {
    this.id = options.id;
    this.title = options.title;
    this.characterName = options.characterName;
    this.customData = options.customData || {};
    this.createdAt = options.createdAt;
    this.updatedAt = options.updatedAt || Date.now();

    // 消息列表
    this.messages = options.messages || [];

    // Token 计数（粗略估算）
    this.estimatedTokens = 0;
  }

  /**
   * 添加消息
   *
   * @param {Object} message - 消息对象
   * @param {string} message.role - 角色（'user' 或 'assistant'）
   * @param {string} message.content - 消息内容
   * @param {Object} message.metadata - 消息元数据（可选）
   */
  addMessage(message) {
    if (!message.role || !message.content) {
      throw new Error('Message must have role and content');
    }

    if (!['user', 'assistant'].includes(message.role)) {
      throw new Error(`Invalid role: ${message.role}`);
    }

    const msg = {
      id: randomUUID(),
      role: message.role,
      content: message.content,
      metadata: message.metadata || {},
      timestamp: Date.now()
    };

    this.messages.push(msg);
    this.updatedAt = Date.now();

    // 更新 Token 估算（粗略：1 token ≈ 4 字符）
    this.estimatedTokens += Math.ceil(message.content.length / 4);

    logger.debug('Message added to conversation', {
      conversationId: this.id,
      messageId: msg.id,
      role: msg.role,
      contentLength: message.content.length
    });

    return msg;
  }

  /**
   * 获取消息列表（用于 API 调用）
   *
   * @param {Object} options - 选项
   * @param {number} options.maxTokens - 最大 Token 数（可选）
   * @param {number} options.maxMessages - 最大消息数（可选）
   * @returns {Array} 消息列表
   */
  getMessages(options = {}) {
    let messages = [...this.messages];

    // 限制消息数量
    if (options.maxMessages) {
      messages = messages.slice(-options.maxMessages);
    }

    // 限制 Token 数量（从最新消息开始计算）
    if (options.maxTokens) {
      let tokenCount = 0;
      const filtered = [];

      for (let i = messages.length - 1; i >= 0; i--) {
        const msgTokens = Math.ceil(messages[i].content.length / 4);

        if (tokenCount + msgTokens > options.maxTokens) {
          break;
        }

        filtered.unshift(messages[i]);
        tokenCount += msgTokens;
      }

      messages = filtered;
    }

    // 转换为 API 格式
    return messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
  }

  /**
   * 获取最后 N 条消息
   *
   * @param {number} count - 消息数量
   * @returns {Array} 消息列表
   */
  getLastMessages(count) {
    return this.messages.slice(-count);
  }

  /**
   * 清空对话历史
   */
  clear() {
    this.messages = [];
    this.estimatedTokens = 0;
    this.updatedAt = Date.now();

    logger.info('Conversation cleared', {
      conversationId: this.id
    });
  }

  /**
   * 获取对话统计
   *
   * @returns {Object} 统计数据
   */
  getStats() {
    const userMessages = this.messages.filter(m => m.role === 'user').length;
    const assistantMessages = this.messages.filter(m => m.role === 'assistant').length;

    return {
      totalMessages: this.messages.length,
      userMessages,
      assistantMessages,
      estimatedTokens: this.estimatedTokens,
      duration: this.updatedAt - this.createdAt
    };
  }

  /**
   * 序列化为 JSON
   *
   * @returns {Object} JSON 对象
   */
  toJSON() {
    return {
      id: this.id,
      title: this.title,
      characterName: this.characterName,
      customData: this.customData,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      messages: this.messages,
      estimatedTokens: this.estimatedTokens
    };
  }

  /**
   * 从 JSON 反序列化
   *
   * @param {Object} json - JSON 对象
   * @returns {Conversation} 对话对象
   */
  static fromJSON(json) {
    return new Conversation({
      id: json.id,
      title: json.title,
      characterName: json.characterName,
      customData: json.customData,
      createdAt: json.createdAt,
      updatedAt: json.updatedAt,
      messages: json.messages
    });
  }
}

/**
 * 导出
 */
export { ConversationManager, Conversation };
export default ConversationManager;
