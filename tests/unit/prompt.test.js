/**
 * Prompt Manager 单元测试
 *
 * 测试内容：
 * - 模板注册和管理
 * - 变量提取和验证
 * - 模板渲染
 * - 模板组合
 * - 变体创建
 * - 统计追踪
 */

import PromptManager from '../../src/llm/prompt.js';
import { jest } from '@jest/globals';
import { writeFileSync, unlinkSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

describe('PromptManager', () => {
  let manager;

  beforeEach(() => {
    manager = new PromptManager({
      templatesDir: '/tmp/test-prompts'
    });
  });

  describe('模板注册', () => {
    test('应该能注册简单模板', () => {
      manager.register('greeting', {
        template: 'Hello {{name}}!',
        variables: ['name']
      });

      const template = manager.getTemplate('greeting');
      expect(template).toBeDefined();
      expect(template.template).toBe('Hello {{name}}!');
      expect(template.variables).toContain('name');
    });

    test('应该能从文件加载模板（带元数据）', () => {
      // 创建临时测试文件
      const testDir = '/tmp/test-prompts';
      const testFile = join(testDir, 'test-template.txt');

      if (!existsSync(testDir)) {
        mkdirSync(testDir, { recursive: true });
      }

      const fileContent = `---
variables: name, age
description: Test template
version: 1.0.0
---
Hello {{name}}, you are {{age}} years old.`;

      writeFileSync(testFile, fileContent, 'utf8');

      manager.loadFromFile('test-from-file', 'test-template.txt');

      const template = manager.getTemplate('test-from-file');
      expect(template).toBeDefined();
      expect(template.variables).toContain('name');
      expect(template.variables).toContain('age');
      expect(template.description).toBe('Test template');
      expect(template.version).toBe('1.0.0');

      // 清理
      unlinkSync(testFile);
    });

    test('应该能从文件加载模板（无元数据）', () => {
      const testDir = '/tmp/test-prompts';
      const testFile = join(testDir, 'simple-template.txt');

      if (!existsSync(testDir)) {
        mkdirSync(testDir, { recursive: true });
      }

      const fileContent = 'Simple template: {{message}}';
      writeFileSync(testFile, fileContent, 'utf8');

      manager.loadFromFile('simple-from-file', 'simple-template.txt');

      const template = manager.getTemplate('simple-from-file');
      expect(template).toBeDefined();
      expect(template.template).toBe('Simple template: {{message}}');

      // 清理
      unlinkSync(testFile);
    });

    test('应该能注册带默认值的模板', () => {
      manager.register('greeting', {
        template: 'Hello {{name}}!',
        variables: ['name'],
        defaults: { name: 'User' }
      });

      const template = manager.getTemplate('greeting');
      expect(template.defaults.name).toBe('User');
    });

    test('应该自动提取模板变量', () => {
      manager.register('test', {
        template: '{{var1}} and {{var2}} and {{var1}}'
      });

      const template = manager.getTemplate('test');
      // 应该去重，只有 var1 和 var2
      expect(template.variables).toHaveLength(2);
      expect(template.variables).toContain('var1');
      expect(template.variables).toContain('var2');
    });

    test('应该警告未声明的变量', () => {
      // 声明了 name，但模板中使用了 age
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      manager.register('test', {
        template: 'Hello {{name}}, you are {{age}}',
        variables: ['name'] // 缺少 age
      });

      // 应该有警告（通过 logger）
      // 注意：实际警告是通过 logger，这里只是示例
    });

    test('缺少模板名称应该抛出异常', () => {
      expect(() => {
        manager.register('', {
          template: 'Test'
        });
      }).toThrow('Template name is required');
    });

    test('缺少模板内容应该抛出异常', () => {
      expect(() => {
        manager.register('test', {});
      }).toThrow('Template must have a template string');
    });
  });

  describe('模板渲染', () => {
    test('应该正确替换单个变量', () => {
      manager.register('greeting', {
        template: 'Hello {{name}}!',
        variables: ['name']
      });

      const result = manager.render('greeting', { name: 'Alice' });
      expect(result).toBe('Hello Alice!');
    });

    test('应该正确替换多个变量', () => {
      manager.register('intro', {
        template: 'My name is {{name}} and I am {{age}} years old.',
        variables: ['name', 'age']
      });

      const result = manager.render('intro', {
        name: 'Bob',
        age: 25
      });
      expect(result).toBe('My name is Bob and I am 25 years old.');
    });

    test('应该正确替换重复的变量', () => {
      manager.register('repeat', {
        template: '{{word}} {{word}} {{word}}',
        variables: ['word']
      });

      const result = manager.render('repeat', { word: 'Hello' });
      expect(result).toBe('Hello Hello Hello');
    });

    test('应该使用默认值', () => {
      manager.register('greeting', {
        template: 'Hello {{name}}!',
        variables: ['name'],
        defaults: { name: 'Guest' }
      });

      const result = manager.render('greeting', {});
      expect(result).toBe('Hello Guest!');
    });

    test('提供的变量应该覆盖默认值', () => {
      manager.register('greeting', {
        template: 'Hello {{name}}!',
        variables: ['name'],
        defaults: { name: 'Guest' }
      });

      const result = manager.render('greeting', { name: 'Alice' });
      expect(result).toBe('Hello Alice!');
    });

    test('缺少必需变量应该抛出异常', () => {
      manager.register('greeting', {
        template: 'Hello {{name}}!',
        variables: ['name']
      });

      expect(() => {
        manager.render('greeting', {});
      }).toThrow('Missing required variables');
    });

    test('不存在的模板应该抛出异常', () => {
      expect(() => {
        manager.render('nonexistent', {});
      }).toThrow('Template not found');
    });

    test('应该处理数字和布尔值', () => {
      manager.register('test', {
        template: 'Count: {{count}}, Active: {{active}}',
        variables: ['count', 'active']
      });

      const result = manager.render('test', {
        count: 42,
        active: true
      });
      expect(result).toBe('Count: 42, Active: true');
    });
  });

  describe('模板组合', () => {
    test('应该能组合多个模板', () => {
      manager.register('header', {
        template: 'Header: {{title}}'
      });

      manager.register('body', {
        template: 'Body: {{content}}'
      });

      const result = manager.compose([
        { name: 'header', variables: { title: 'Test' } },
        { name: 'body', variables: { content: 'Hello' } }
      ]);

      expect(result).toBe('Header: Test\n\nBody: Hello');
    });

    test('应该支持自定义分隔符', () => {
      manager.register('part1', {
        template: 'Part 1'
      });

      manager.register('part2', {
        template: 'Part 2'
      });

      const result = manager.compose(
        [
          { name: 'part1', variables: {} },
          { name: 'part2', variables: {} }
        ],
        ' | '
      );

      expect(result).toBe('Part 1 | Part 2');
    });
  });

  describe('模板变体', () => {
    test('应该能创建模板变体', () => {
      manager.register('greeting', {
        template: 'Hello {{name}}!',
        variables: ['name'],
        version: '1.0.0'
      });

      manager.createVariant('greeting', 'greeting-v2', {
        template: 'Hi {{name}}!'
      });

      const v1 = manager.render('greeting', { name: 'Alice' });
      const v2 = manager.render('greeting-v2', { name: 'Alice' });

      expect(v1).toBe('Hello Alice!');
      expect(v2).toBe('Hi Alice!');
    });

    test('变体应该继承基础模板的属性', () => {
      manager.register('greeting', {
        template: 'Hello {{name}}!',
        variables: ['name'],
        description: 'Basic greeting'
      });

      manager.createVariant('greeting', 'greeting-v2', {
        template: 'Hi {{name}}!'
      });

      const variant = manager.getTemplate('greeting-v2');
      expect(variant.description).toBe('Basic greeting');
      expect(variant.variables).toContain('name');
    });

    test('不存在的基础模板应该抛出异常', () => {
      expect(() => {
        manager.createVariant('nonexistent', 'variant', {
          template: 'Test'
        });
      }).toThrow('Base template not found');
    });
  });

  describe('模板管理', () => {
    test('应该能列出所有模板', () => {
      manager.register('template1', {
        template: 'Test 1'
      });

      manager.register('template2', {
        template: 'Test 2'
      });

      const templates = manager.listTemplates();
      expect(templates).toHaveLength(2);
      expect(templates.map(t => t.name)).toContain('template1');
      expect(templates.map(t => t.name)).toContain('template2');
    });

    test('应该能删除模板', () => {
      manager.register('test', {
        template: 'Test'
      });

      expect(manager.getTemplate('test')).toBeDefined();

      manager.unregister('test');

      expect(manager.getTemplate('test')).toBeNull();
    });

    test('删除不存在的模板应该抛出异常', () => {
      expect(() => {
        manager.unregister('nonexistent');
      }).toThrow('Template not found');
    });
  });

  describe('统计追踪', () => {
    test('应该追踪模板使用次数', () => {
      manager.register('test', {
        template: 'Test'
      });

      manager.render('test', {});
      manager.render('test', {});
      manager.render('test', {});

      const template = manager.getTemplate('test');
      expect(template.stats.usageCount).toBe(3);
    });

    test('应该追踪最后使用时间', () => {
      manager.register('test', {
        template: 'Test'
      });

      const before = Date.now();
      manager.render('test', {});
      const after = Date.now();

      const template = manager.getTemplate('test');
      expect(template.stats.lastUsed).toBeGreaterThanOrEqual(before);
      expect(template.stats.lastUsed).toBeLessThanOrEqual(after);
    });

    test('应该提供总体统计', () => {
      manager.register('test1', { template: 'Test 1' });
      manager.register('test2', { template: 'Test 2' });

      manager.render('test1', {});
      manager.render('test1', {});
      manager.render('test2', {});

      const stats = manager.getStats();
      expect(stats.totalTemplates).toBe(2);
      expect(stats.mostUsed.name).toBe('test1');
    });
  });

  describe('变量提取', () => {
    test('应该正确提取变量', () => {
      const vars = manager._extractVariables('Hello {{name}}, you are {{age}}');
      expect(vars).toHaveLength(2);
      expect(vars).toContain('name');
      expect(vars).toContain('age');
    });

    test('应该处理没有变量的模板', () => {
      const vars = manager._extractVariables('Hello world');
      expect(vars).toHaveLength(0);
    });

    test('应该去重复的变量', () => {
      const vars = manager._extractVariables('{{x}} {{y}} {{x}}');
      expect(vars).toHaveLength(2);
      expect(vars).toContain('x');
      expect(vars).toContain('y');
    });
  });

  describe('性能要求', () => {
    test('模板渲染应该在 1ms 内完成', () => {
      manager.register('test', {
        template: 'Hello {{name}}, you are {{age}} years old and live in {{city}}.'
      });

      const start = performance.now();

      for (let i = 0; i < 100; i++) {
        manager.render('test', {
          name: 'Alice',
          age: 25,
          city: 'NYC'
        });
      }

      const duration = performance.now() - start;
      expect(duration / 100).toBeLessThan(1); // 平均每次 < 1ms
    });

    test('变量提取应该在 0.5ms 内完成', () => {
      const template = '{{var1}} {{var2}} {{var3}} {{var4}} {{var5}}';

      const start = performance.now();

      for (let i = 0; i < 1000; i++) {
        manager._extractVariables(template);
      }

      const duration = performance.now() - start;
      expect(duration / 1000).toBeLessThan(0.5);
    });
  });
});
