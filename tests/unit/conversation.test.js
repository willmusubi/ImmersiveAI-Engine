/**
 * Conversation Manager 单元测试
 *
 * 测试内容：
 * - 对话创建和管理
 * - 消息添加和检索
 * - Token 估算
 * - 上下文窗口管理
 * - 持久化（保存/加载）
 * - 统计追踪
 */

import { ConversationManager, Conversation } from '../../src/conversation/manager.js';
import { existsSync } from 'fs';
import { unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { jest } from '@jest/globals';

describe('ConversationManager', () => {
  let manager;
  const testStorageDir = '/tmp/test-conversations';

  beforeEach(async () => {
    // 创建测试目录
    if (!existsSync(testStorageDir)) {
      await mkdir(testStorageDir, { recursive: true });
    }

    manager = new ConversationManager({
      storageDir: testStorageDir,
      maxContextTokens: 10000,
      autoSave: false
    });
  });

  afterEach(async () => {
    // 清理测试文件
    try {
      const conversations = manager.listConversations();
      for (const conv of conversations) {
        const filePath = join(testStorageDir, `${conv.id}.json`);
        if (existsSync(filePath)) {
          await unlink(filePath);
        }
      }
    } catch (error) {
      // 忽略清理错误
    }
  });

  describe('对话创建', () => {
    test('应该能创建新对话', () => {
      const conversation = manager.createConversation({
        title: 'Test Chat',
        characterName: 'TestBot'
      });

      expect(conversation).toBeDefined();
      expect(conversation.id).toBeDefined();
      expect(conversation.title).toBe('Test Chat');
      expect(conversation.characterName).toBe('TestBot');
    });

    test('应该能使用默认值创建对话', () => {
      const conversation = manager.createConversation();

      expect(conversation.title).toBe('New Conversation');
      expect(conversation.characterName).toBe('AI');
    });

    test('应该能存储自定义数据', () => {
      const conversation = manager.createConversation({
        customData: { theme: 'dark', language: 'zh-CN' }
      });

      expect(conversation.customData.theme).toBe('dark');
      expect(conversation.customData.language).toBe('zh-CN');
    });

    test('创建的对话应该在管理器中可访问', () => {
      const conversation = manager.createConversation();
      const retrieved = manager.getConversation(conversation.id);

      expect(retrieved).toBe(conversation);
    });
  });

  describe('消息管理', () => {
    let conversation;

    beforeEach(() => {
      conversation = manager.createConversation();
    });

    test('应该能添加用户消息', () => {
      const msg = conversation.addMessage({
        role: 'user',
        content: 'Hello!'
      });

      expect(msg).toBeDefined();
      expect(msg.id).toBeDefined();
      expect(msg.role).toBe('user');
      expect(msg.content).toBe('Hello!');
      expect(msg.timestamp).toBeDefined();
    });

    test('应该能添加助手消息', () => {
      const msg = conversation.addMessage({
        role: 'assistant',
        content: 'Hi there!'
      });

      expect(msg.role).toBe('assistant');
      expect(msg.content).toBe('Hi there!');
    });

    test('应该能添加消息元数据', () => {
      const msg = conversation.addMessage({
        role: 'user',
        content: 'Test',
        metadata: { emotion: 'happy' }
      });

      expect(msg.metadata.emotion).toBe('happy');
    });

    test('缺少角色应该抛出异常', () => {
      expect(() => {
        conversation.addMessage({ content: 'Test' });
      }).toThrow('Message must have role and content');
    });

    test('缺少内容应该抛出异常', () => {
      expect(() => {
        conversation.addMessage({ role: 'user' });
      }).toThrow('Message must have role and content');
    });

    test('无效角色应该抛出异常', () => {
      expect(() => {
        conversation.addMessage({
          role: 'invalid',
          content: 'Test'
        });
      }).toThrow('Invalid role');
    });

    test('应该按顺序存储消息', () => {
      conversation.addMessage({ role: 'user', content: 'Message 1' });
      conversation.addMessage({ role: 'assistant', content: 'Message 2' });
      conversation.addMessage({ role: 'user', content: 'Message 3' });

      expect(conversation.messages).toHaveLength(3);
      expect(conversation.messages[0].content).toBe('Message 1');
      expect(conversation.messages[1].content).toBe('Message 2');
      expect(conversation.messages[2].content).toBe('Message 3');
    });
  });

  describe('Token 估算', () => {
    let conversation;

    beforeEach(() => {
      conversation = manager.createConversation();
    });

    test('应该估算消息的 Token 数', () => {
      // 假设 1 token ≈ 4 characters
      const content = 'a'.repeat(400); // 400 字符 ≈ 100 tokens

      conversation.addMessage({
        role: 'user',
        content
      });

      expect(conversation.estimatedTokens).toBeCloseTo(100, -1);
    });

    test('应该累积多条消息的 Token 数', () => {
      conversation.addMessage({
        role: 'user',
        content: 'a'.repeat(400) // ~100 tokens
      });

      conversation.addMessage({
        role: 'assistant',
        content: 'b'.repeat(800) // ~200 tokens
      });

      expect(conversation.estimatedTokens).toBeCloseTo(300, -1);
    });
  });

  describe('消息检索', () => {
    let conversation;

    beforeEach(() => {
      conversation = manager.createConversation();

      // 添加测试消息
      for (let i = 0; i < 10; i++) {
        conversation.addMessage({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message ${i}`
        });
      }
    });

    test('应该能获取所有消息', () => {
      const messages = conversation.getMessages();
      expect(messages).toHaveLength(10);
    });

    test('应该能限制消息数量', () => {
      const messages = conversation.getMessages({ maxMessages: 5 });
      expect(messages).toHaveLength(5);

      // 应该是最新的 5 条
      expect(messages[messages.length - 1].content).toBe('Message 9');
    });

    test('应该能限制 Token 数量', () => {
      // 每条消息约 2-3 个 token，限制为 10 个 token
      const messages = conversation.getMessages({ maxTokens: 10 });

      // 应该返回最新的几条消息
      expect(messages.length).toBeLessThanOrEqual(10);
      expect(messages.length).toBeGreaterThan(0);
    });

    test('应该返回 API 格式的消息', () => {
      const messages = conversation.getMessages();

      messages.forEach(msg => {
        expect(msg).toHaveProperty('role');
        expect(msg).toHaveProperty('content');
        expect(msg).not.toHaveProperty('id');
        expect(msg).not.toHaveProperty('timestamp');
      });
    });

    test('应该能获取最后 N 条消息', () => {
      const lastThree = conversation.getLastMessages(3);

      expect(lastThree).toHaveLength(3);
      expect(lastThree[0].content).toBe('Message 7');
      expect(lastThree[2].content).toBe('Message 9');
    });
  });

  describe('对话操作', () => {
    let conversation;

    beforeEach(() => {
      conversation = manager.createConversation();
      conversation.addMessage({ role: 'user', content: 'Hello' });
      conversation.addMessage({ role: 'assistant', content: 'Hi' });
    });

    test('应该能清空对话', () => {
      conversation.clear();

      expect(conversation.messages).toHaveLength(0);
      expect(conversation.estimatedTokens).toBe(0);
    });

    test('应该能获取对话统计', () => {
      const stats = conversation.getStats();

      expect(stats.totalMessages).toBe(2);
      expect(stats.userMessages).toBe(1);
      expect(stats.assistantMessages).toBe(1);
      expect(stats.estimatedTokens).toBeGreaterThan(0);
      expect(stats.duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('对话持久化', () => {
    test('应该能保存对话到文件', async () => {
      const conversation = manager.createConversation({ title: 'Test' });
      conversation.addMessage({ role: 'user', content: 'Hello' });

      await manager.save(conversation.id);

      const filePath = join(testStorageDir, `${conversation.id}.json`);
      expect(existsSync(filePath)).toBe(true);
    });

    test('应该能从文件加载对话', async () => {
      const conversation = manager.createConversation({ title: 'Test' });
      conversation.addMessage({ role: 'user', content: 'Hello' });
      conversation.addMessage({ role: 'assistant', content: 'Hi' });

      await manager.save(conversation.id);

      // 创建新的管理器实例
      const newManager = new ConversationManager({
        storageDir: testStorageDir
      });

      const loaded = await newManager.load(conversation.id);

      expect(loaded.id).toBe(conversation.id);
      expect(loaded.title).toBe('Test');
      expect(loaded.messages).toHaveLength(2);
      expect(loaded.messages[0].content).toBe('Hello');
    });

    test('加载不存在的对话应该抛出异常', async () => {
      await expect(
        manager.load('nonexistent-id')
      ).rejects.toThrow('Conversation not found');
    });

    test('保存不存在的对话应该抛出异常', async () => {
      await expect(
        manager.save('nonexistent-id')
      ).rejects.toThrow('Conversation not found in memory');
    });

    test('应该能从缓存加载对话', async () => {
      const conversation = manager.createConversation();
      await manager.save(conversation.id);

      // 第二次加载应该从缓存
      const loaded = await manager.load(conversation.id);

      expect(loaded).toBe(conversation); // 应该是同一个对象
    });
  });

  describe('对话列表', () => {
    test('应该能列出所有对话', () => {
      manager.createConversation({ title: 'Chat 1' });
      manager.createConversation({ title: 'Chat 2' });
      manager.createConversation({ title: 'Chat 3' });

      const list = manager.listConversations();

      expect(list).toHaveLength(3);
      expect(list.map(c => c.title)).toContain('Chat 1');
      expect(list.map(c => c.title)).toContain('Chat 2');
      expect(list.map(c => c.title)).toContain('Chat 3');
    });

    test('列表应该按更新时间降序排序', async () => {
      const conv1 = manager.createConversation({ title: 'First' });
      await new Promise(resolve => setTimeout(resolve, 10));

      const conv2 = manager.createConversation({ title: 'Second' });
      await new Promise(resolve => setTimeout(resolve, 10));

      const conv3 = manager.createConversation({ title: 'Third' });

      const list = manager.listConversations();

      expect(list[0].title).toBe('Third');
      expect(list[1].title).toBe('Second');
      expect(list[2].title).toBe('First');
    });

    test('列表项应该包含关键信息', () => {
      const conversation = manager.createConversation({ title: 'Test' });
      conversation.addMessage({ role: 'user', content: 'Hello' });

      const list = manager.listConversations();

      expect(list[0]).toHaveProperty('id');
      expect(list[0]).toHaveProperty('title');
      expect(list[0]).toHaveProperty('characterName');
      expect(list[0]).toHaveProperty('messageCount');
      expect(list[0]).toHaveProperty('createdAt');
      expect(list[0]).toHaveProperty('updatedAt');
      expect(list[0].messageCount).toBe(1);
    });
  });

  describe('对话删除', () => {
    test('应该能从内存中删除对话', () => {
      const conversation = manager.createConversation();
      const id = conversation.id;

      manager.deleteConversation(id);

      expect(manager.getConversation(id)).toBeNull();
    });

    test('删除后应该不在列表中', () => {
      const conversation = manager.createConversation();
      manager.deleteConversation(conversation.id);

      const list = manager.listConversations();
      expect(list.map(c => c.id)).not.toContain(conversation.id);
    });
  });

  describe('序列化', () => {
    test('应该能序列化为 JSON', () => {
      const conversation = new Conversation({
        id: 'test-id',
        title: 'Test',
        characterName: 'Bot',
        customData: { key: 'value' },
        createdAt: 123456,
        updatedAt: 123457
      });

      conversation.addMessage({ role: 'user', content: 'Hello' });

      const json = conversation.toJSON();

      expect(json.id).toBe('test-id');
      expect(json.title).toBe('Test');
      expect(json.characterName).toBe('Bot');
      expect(json.customData.key).toBe('value');
      expect(json.messages).toHaveLength(1);
      expect(json.estimatedTokens).toBeGreaterThan(0);
    });

    test('应该能从 JSON 反序列化', () => {
      const json = {
        id: 'test-id',
        title: 'Test',
        characterName: 'Bot',
        customData: { key: 'value' },
        createdAt: 123456,
        updatedAt: 123457,
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            content: 'Hello',
            metadata: {},
            timestamp: 123456
          }
        ]
      };

      const conversation = Conversation.fromJSON(json);

      expect(conversation.id).toBe('test-id');
      expect(conversation.title).toBe('Test');
      expect(conversation.messages).toHaveLength(1);
      expect(conversation.messages[0].content).toBe('Hello');
    });
  });

  describe('性能要求', () => {
    test('添加消息应该在 1ms 内完成', () => {
      const conversation = manager.createConversation();

      const start = performance.now();

      for (let i = 0; i < 100; i++) {
        conversation.addMessage({
          role: 'user',
          content: 'Test message'
        });
      }

      const duration = performance.now() - start;
      expect(duration / 100).toBeLessThan(1);
    });

    test('获取消息应该在 1ms 内完成', () => {
      const conversation = manager.createConversation();

      // 添加 100 条消息
      for (let i = 0; i < 100; i++) {
        conversation.addMessage({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message ${i}`
        });
      }

      const start = performance.now();

      for (let i = 0; i < 100; i++) {
        conversation.getMessages({ maxMessages: 20 });
      }

      const duration = performance.now() - start;
      expect(duration / 100).toBeLessThan(1);
    });

    test('应该支持 100+ 轮对话', () => {
      const conversation = manager.createConversation();

      for (let i = 0; i < 200; i++) {
        conversation.addMessage({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Turn ${Math.floor(i / 2)}`
        });
      }

      expect(conversation.messages).toHaveLength(200);

      // 应该能快速获取最新的消息
      const start = performance.now();
      const messages = conversation.getMessages({ maxMessages: 20 });
      const duration = performance.now() - start;

      expect(messages).toHaveLength(20);
      expect(duration).toBeLessThan(5); // < 5ms
    });
  });
});
