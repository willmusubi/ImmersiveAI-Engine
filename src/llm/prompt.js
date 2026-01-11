/**
 * Prompt Manager - 提示词管理系统
 *
 * 功能：
 * - 提示词模板管理
 * - 变量插值和替换
 * - 提示词组合和复用
 * - 提示词版本管理
 * - 提示词性能追踪
 *
 * 设计原则：
 * - 声明式：提示词与代码分离
 * - 可复用：模板化、组件化
 * - 可测试：易于 A/B 测试不同版本
 *
 * @module llm/prompt
 * @version 0.1.0
 */

import { logger } from '../core/logger.js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Prompt Manager 类
 *
 * 使用示例：
 * ```javascript
 * const manager = new PromptManager();
 *
 * // 注册模板
 * manager.register('character-response', {
 *   template: '你是{{character}}，用户说：{{user_input}}',
 *   variables: ['character', 'user_input']
 * });
 *
 * // 渲染模板
 * const prompt = manager.render('character-response', {
 *   character: '艾莉',
 *   user_input: '你好'
 * });
 * ```
 */
class PromptManager {
  /**
   * @param {Object} options - 配置选项
   * @param {string} options.templatesDir - 模板文件目录（可选）
   */
  constructor(options = {}) {
    this.options = {
      templatesDir: options.templatesDir || join(process.cwd(), 'prompts')
    };

    // 存储已注册的模板
    this.templates = new Map();

    // 存储模板使用统计
    this.stats = new Map();

    this.logger = logger.child({ module: 'PromptManager' });

    this.logger.info('Prompt Manager initialized', {
      templatesDir: this.options.templatesDir
    });
  }

  /**
   * 注册提示词模板
   *
   * @param {string} name - 模板名称
   * @param {Object} template - 模板定义
   * @param {string} template.template - 模板字符串（支持 {{variable}} 语法）
   * @param {Array} template.variables - 必需的变量列表（可选）
   * @param {string} template.description - 模板描述（可选）
   * @param {string} template.version - 版本号（可选，默认: '1.0.0'）
   * @param {Object} template.defaults - 默认变量值（可选）
   *
   * @example
   * manager.register('greeting', {
   *   template: 'Hello {{name}}! How are you?',
   *   variables: ['name'],
   *   description: 'Simple greeting template',
   *   version: '1.0.0',
   *   defaults: { name: 'User' }
   * });
   */
  register(name, template) {
    if (!name) {
      throw new Error('Template name is required');
    }

    if (!template || !template.template) {
      throw new Error('Template must have a template string');
    }

    // 提取模板中的变量
    const extractedVars = this._extractVariables(template.template);

    // 校验声明的变量
    if (template.variables) {
      const missingVars = extractedVars.filter(v => !template.variables.includes(v));
      if (missingVars.length > 0) {
        this.logger.warn(`Template "${name}" uses undeclared variables`, {
          missing: missingVars
        });
      }
    }

    // 存储模板
    this.templates.set(name, {
      template: template.template,
      variables: template.variables || extractedVars,
      description: template.description || '',
      version: template.version || '1.0.0',
      defaults: template.defaults || {},
      createdAt: Date.now()
    });

    // 初始化统计
    this.stats.set(name, {
      usageCount: 0,
      lastUsed: null
    });

    this.logger.info('Template registered', {
      name,
      variables: template.variables || extractedVars,
      version: template.version || '1.0.0'
    });
  }

  /**
   * 从文件加载模板
   *
   * @param {string} name - 模板名称
   * @param {string} filePath - 文件路径（相对于 templatesDir）
   *
   * @example
   * manager.loadFromFile('character-response', 'character-response.txt');
   */
  loadFromFile(name, filePath) {
    const fullPath = join(this.options.templatesDir, filePath);

    if (!existsSync(fullPath)) {
      throw new Error(`Template file not found: ${fullPath}`);
    }

    const content = readFileSync(fullPath, 'utf8');

    // 解析文件头部的元数据（可选）
    // 格式：
    // ---
    // variables: name, age
    // description: Example template
    // version: 1.0.0
    // ---
    // Template content...

    const metaMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

    let template;
    let meta = {};

    if (metaMatch) {
      // 解析元数据
      const metaLines = metaMatch[1].split('\n');
      for (const line of metaLines) {
        const [key, value] = line.split(':').map(s => s.trim());
        if (key && value) {
          if (key === 'variables') {
            meta.variables = value.split(',').map(v => v.trim());
          } else {
            meta[key] = value;
          }
        }
      }

      template = metaMatch[2].trim();
    } else {
      template = content.trim();
    }

    this.register(name, {
      template,
      ...meta
    });

    this.logger.info('Template loaded from file', {
      name,
      filePath
    });
  }

  /**
   * 渲染模板
   *
   * @param {string} name - 模板名称
   * @param {Object} variables - 变量值
   * @returns {string} 渲染后的提示词
   *
   * @example
   * const prompt = manager.render('greeting', { name: 'Alice' });
   * // => "Hello Alice! How are you?"
   */
  render(name, variables = {}) {
    const template = this.templates.get(name);

    if (!template) {
      throw new Error(`Template not found: ${name}`);
    }

    // 合并默认值
    const allVariables = {
      ...template.defaults,
      ...variables
    };

    // 检查必需的变量
    const missingVars = template.variables.filter(
      v => allVariables[v] === undefined || allVariables[v] === null
    );

    if (missingVars.length > 0) {
      throw new Error(
        `Missing required variables for template "${name}": ${missingVars.join(', ')}`
      );
    }

    // 渲染模板
    let rendered = template.template;

    for (const [key, value] of Object.entries(allVariables)) {
      const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      rendered = rendered.replace(placeholder, String(value));
    }

    // 更新统计
    const stats = this.stats.get(name);
    stats.usageCount++;
    stats.lastUsed = Date.now();

    this.logger.debug('Template rendered', {
      name,
      version: template.version,
      length: rendered.length
    });

    return rendered;
  }

  /**
   * 组合多个模板
   *
   * @param {Array} components - 组件列表
   * @param {string} components[].name - 模板名称
   * @param {Object} components[].variables - 变量值
   * @param {string} separator - 分隔符（默认: '\n\n'）
   * @returns {string} 组合后的提示词
   *
   * @example
   * const prompt = manager.compose([
   *   { name: 'system-prompt', variables: {} },
   *   { name: 'character-info', variables: { character: '艾莉' } },
   *   { name: 'user-message', variables: { message: '你好' } }
   * ]);
   */
  compose(components, separator = '\n\n') {
    const rendered = components.map(component => {
      return this.render(component.name, component.variables);
    });

    return rendered.join(separator);
  }

  /**
   * 创建模板变体（用于 A/B 测试）
   *
   * @param {string} baseName - 基础模板名称
   * @param {string} variantName - 变体名称
   * @param {Object} changes - 要修改的部分
   *
   * @example
   * manager.createVariant('greeting', 'greeting-v2', {
   *   template: 'Hi {{name}}! Welcome!'
   * });
   */
  createVariant(baseName, variantName, changes) {
    const baseTemplate = this.templates.get(baseName);

    if (!baseTemplate) {
      throw new Error(`Base template not found: ${baseName}`);
    }

    const variantTemplate = {
      ...baseTemplate,
      ...changes,
      version: changes.version || baseTemplate.version + '-variant'
    };

    this.register(variantName, variantTemplate);

    this.logger.info('Template variant created', {
      baseName,
      variantName,
      version: variantTemplate.version
    });
  }

  /**
   * 获取模板信息
   *
   * @param {string} name - 模板名称
   * @returns {Object} 模板信息
   */
  getTemplate(name) {
    const template = this.templates.get(name);

    if (!template) {
      return null;
    }

    const stats = this.stats.get(name);

    return {
      ...template,
      stats: {
        usageCount: stats.usageCount,
        lastUsed: stats.lastUsed
      }
    };
  }

  /**
   * 列出所有模板
   *
   * @returns {Array} 模板列表
   */
  listTemplates() {
    const templates = [];

    for (const [name, template] of this.templates.entries()) {
      const stats = this.stats.get(name);
      templates.push({
        name,
        description: template.description,
        version: template.version,
        variables: template.variables,
        usageCount: stats.usageCount
      });
    }

    return templates;
  }

  /**
   * 删除模板
   *
   * @param {string} name - 模板名称
   */
  unregister(name) {
    if (!this.templates.has(name)) {
      throw new Error(`Template not found: ${name}`);
    }

    this.templates.delete(name);
    this.stats.delete(name);

    this.logger.info('Template unregistered', { name });
  }

  /**
   * 获取统计信息
   *
   * @returns {Object} 统计数据
   */
  getStats() {
    const stats = [];

    for (const [name, stat] of this.stats.entries()) {
      const template = this.templates.get(name);
      stats.push({
        name,
        version: template.version,
        usageCount: stat.usageCount,
        lastUsed: stat.lastUsed
      });
    }

    // 按使用次数排序
    stats.sort((a, b) => b.usageCount - a.usageCount);

    return {
      totalTemplates: this.templates.size,
      templates: stats,
      mostUsed: stats[0] || null
    };
  }

  /**
   * 提取模板中的变量
   * @private
   */
  _extractVariables(template) {
    const matches = template.match(/\{\{(\w+)\}\}/g);

    if (!matches) {
      return [];
    }

    // 提取变量名并去重
    const variables = matches.map(match => match.slice(2, -2));
    return [...new Set(variables)];
  }
}

/**
 * 导出
 */
export default PromptManager;
