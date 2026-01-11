/**
 * State Extractor - 状态提取器
 *
 * 功能：
 * - 从文本中提取状态变化
 * - 识别好感度、情绪、位置、库存等
 * - 支持自定义提取模式
 * - 基于正则表达式和关键词匹配
 *
 * 设计目标：
 * - 准确率 > 80%
 * - 提取延迟 < 50ms
 * - 支持中英文
 *
 * @module state/extractor
 * @version 0.1.0
 */

import { logger } from '../core/logger.js';

/**
 * State Extractor 类
 *
 * 使用示例：
 * ```javascript
 * const extractor = new StateExtractor({ stateManager });
 *
 * const text = "Alice 很高兴，对你的好感度增加了 10 点";
 * const states = extractor.extractAllStates('char-1', text);
 *
 * console.log(states.affection); // { delta: 10, newValue: 60 }
 * console.log(states.emotion);   // { emotion: 'happy' }
 * ```
 */
class StateExtractor {
  /**
   * @param {Object} options - 配置选项
   * @param {DatabaseManager} options.db - 数据库管理器
   * @param {StateManager} options.stateManager - 状态管理器
   */
  constructor(options = {}) {
    this.options = options;
    this.db = options.db;
    this.stateManager = options.stateManager;

    // 自定义模式注册表
    this.customPatterns = new Map();

    // 初始化内置模式
    this._initializePatterns();

    this.logger = logger.child({ module: 'StateExtractor' });

    this.logger.info('State Extractor initialized');
  }

  /**
   * 初始化内置提取模式
   * @private
   */
  _initializePatterns() {
    // 好感度模式
    this.affectionPatterns = [
      // 中文
      { regex: /好感度[增加提升上升]+了?\s*(\d+)\s*点/i, type: 'delta' },
      { regex: /好感度[减少降低下降]+了?\s*(\d+)\s*点/i, type: 'delta', negative: true },
      { regex: /好感度(?:变成|现在是|达到|为)\s*(\d+)/i, type: 'absolute' },
      { regex: /对.*?好感度现在是\s*(\d+)/i, type: 'absolute' },
      { regex: /好感度?\s*[+＋]\s*(\d+)/i, type: 'delta' },
      { regex: /好感度?\s*[-－]\s*(\d+)/i, type: 'delta', negative: true },

      // 英文
      { regex: /affection\s+increased\s+by\s+(\d+)/i, type: 'delta' },
      { regex: /affection\s+decreased\s+by\s+(\d+)/i, type: 'delta', negative: true },
      { regex: /affection\s+is\s+now\s+(\d+)/i, type: 'absolute' },
      { regex: /affection\s*[+＋]\s*(\d+)/i, type: 'delta' }
    ];

    // 情绪关键词映射
    this.emotionKeywords = {
      happy: ['高兴', '开心', '愉快', '快乐', '欢喜', '兴奋', '微笑', '太好了', 'happy', 'cheerful', 'joyful', 'smile'],
      sad: ['难过', '伤心', '悲伤', '沮丧', '失落', '哭泣', '太糟糕', '不敢相信', 'sad', 'depressed', 'cry', 'terrible'],
      angry: ['生气', '愤怒', '恼火', '火大', '怒', '皱眉', 'angry', 'furious', 'mad', 'frown'],
      excited: ['激动', '兴奋', '振奋', '热情', 'excited', 'enthusiastic'],
      scared: ['害怕', '恐惧', '惊恐', '惧怕', 'scared', 'afraid', 'fearful'],
      confused: ['困惑', '迷惑', '疑惑', '不解', 'confused', 'puzzled'],
      calm: ['平静', '冷静', '淡定', '安静', 'calm', 'peaceful'],
      anxious: ['焦虑', '不安', '紧张', '担心', 'anxious', 'worried', 'nervous'],
      loving: ['爱', '深情', '温柔', '亲密', 'loving', 'affectionate', 'tender']
    };

    // 位置关键词
    this.locationKeywords = [
      '走进', '来到', '到达', '进入', '抵达', '前往', '去了',
      'entered', 'arrived at', 'went to', 'moved to'
    ];

    // 库存动作模式
    this.inventoryPatterns = {
      add: [
        { regex: /(?:给|递给|交给)(?:了)?(?:你|我)\s*([一两三四五六七八九十\d]+)?\s*(?:个|把|件|张|本)?\s*(.+)/i },
        { regex: /(?:获得|得到|拿到|收到)了?\s*([一两三四五六七八九十\d]+)?\s*(?:个|把|件|张|本)?\s*(.+)/i },
        { regex: /gave\s+(?:you|me)\s+(\d+)?\s*(.+)/i }
      ],
      remove: [
        { regex: /(?:拿走|取走|没收)了?(?:你|我的)?\s*([一两三四五六七八九十\d]+)?\s*(?:个|把|件|张|本)?\s*(.+)/i },
        { regex: /(?:失去|丢失|遗失)了?\s*([一两三四五六七八九十\d]+)?\s*(?:个|把|件|张|本)?\s*(.+)/i },
        { regex: /took\s+(?:your|my)\s+(.+)/i }
      ]
    };
  }

  // ============================================
  // 好感度提取
  // ============================================

  /**
   * 提取好感度变化
   *
   * @param {string} characterId - 角色 ID
   * @param {string} text - 文本内容
   * @returns {Object|null} 好感度变化 { delta, newValue } 或 null
   */
  extractAffectionChange(characterId, text) {
    try {
      // 获取当前好感度
      const character = this.stateManager.getCharacterState(characterId);
      if (!character) {
        return null;
      }

      const currentAffection = character.affection || 0;

      // 尝试匹配所有好感度模式
      for (const pattern of this.affectionPatterns) {
        const match = text.match(pattern.regex);
        if (match) {
          const value = parseInt(match[1]);

          if (pattern.type === 'absolute') {
            // 绝对值
            return {
              delta: value - currentAffection,
              newValue: value,
              currentValue: currentAffection
            };
          } else {
            // 相对变化
            const delta = pattern.negative ? -value : value;
            return {
              delta,
              newValue: currentAffection + delta,
              currentValue: currentAffection
            };
          }
        }
      }

      return null;
    } catch (error) {
      this.logger.error('Failed to extract affection', {
        error: error.message,
        characterId
      });
      return null;
    }
  }

  // ============================================
  // 情绪识别
  // ============================================

  /**
   * 提取情绪
   *
   * @param {string} text - 文本内容
   * @returns {Object|null} 情绪 { emotion, confidence } 或 null
   */
  extractEmotion(text) {
    try {
      const emotionScores = {};

      // 计算每种情绪的匹配分数
      for (const [emotion, keywords] of Object.entries(this.emotionKeywords)) {
        let score = 0;
        for (const keyword of keywords) {
          // 使用正则匹配，忽略大小写
          const regex = new RegExp(keyword, 'gi');
          const matches = text.match(regex);
          if (matches) {
            score += matches.length;
          }
        }
        if (score > 0) {
          emotionScores[emotion] = score;
        }
      }

      // 找到得分最高的情绪
      if (Object.keys(emotionScores).length === 0) {
        return null;
      }

      const sortedEmotions = Object.entries(emotionScores)
        .sort((a, b) => b[1] - a[1]);

      const [emotion, score] = sortedEmotions[0];

      return {
        emotion,
        confidence: Math.min(score / 3, 1), // 归一化到 0-1
        alternatives: sortedEmotions.slice(1, 3).map(([e, s]) => ({
          emotion: e,
          confidence: Math.min(s / 3, 1)
        }))
      };
    } catch (error) {
      this.logger.error('Failed to extract emotion', {
        error: error.message
      });
      return null;
    }
  }

  // ============================================
  // 位置提取
  // ============================================

  /**
   * 提取位置变化
   *
   * @param {string} text - 文本内容
   * @returns {Object|null} 位置 { location } 或 null
   */
  extractLocationChange(text) {
    try {
      // 寻找位置关键词后的内容
      for (const keyword of this.locationKeywords) {
        const regex = new RegExp(`${keyword}[了]?(.{2,10})`, 'i');
        const match = text.match(regex);

        if (match) {
          // 提取位置名称（去除标点符号）
          let location = match[1].trim();
          location = location.replace(/[。，！？；、,!?;].*/, '');

          if (location.length > 0) {
            return {
              location,
              keyword
            };
          }
        }
      }

      return null;
    } catch (error) {
      this.logger.error('Failed to extract location', {
        error: error.message
      });
      return null;
    }
  }

  // ============================================
  // 库存提取
  // ============================================

  /**
   * 提取库存变化
   *
   * @param {string} characterId - 角色 ID
   * @param {string} text - 文本内容
   * @returns {Array} 库存变化列表
   */
  extractInventoryChanges(characterId, text) {
    const changes = [];

    try {
      // 检测添加物品
      for (const pattern of this.inventoryPatterns.add) {
        const matches = [...text.matchAll(new RegExp(pattern.regex, 'gi'))];

        for (const match of matches) {
          let item_name, quantity;

          if (match[0].match(/gave/i)) {
            // 英文格式: gave you 3 apples
            quantity = match[1] ? parseInt(match[1]) : 1;
            item_name = match[2];
          } else {
            // 中文格式: 捕获组1是数量，捕获组2是物品名
            quantity = match[1] ? this._parseChineseNumber(match[1]) : 1;
            item_name = match[2];
          }

          if (item_name) {
            item_name = item_name.trim().replace(/[。，！？；、,!?;].*/, '');

            changes.push({
              action: 'add',
              item_name,
              quantity,
              character_id: characterId
            });
          }
        }
      }

      // 检测移除物品
      for (const pattern of this.inventoryPatterns.remove) {
        const matches = [...text.matchAll(new RegExp(pattern.regex, 'gi'))];

        for (const match of matches) {
          let item_name, quantity;

          if (match[0].match(/took/i)) {
            // 英文格式: took your sword
            item_name = match[1];
            quantity = 1;
          } else {
            // 中文格式: 捕获组1是数量，捕获组2是物品名
            quantity = match[1] ? this._parseChineseNumber(match[1]) : 1;
            item_name = match[2];
          }

          if (item_name) {
            item_name = item_name.trim().replace(/[。，！？；、,!?;].*/, '');

            changes.push({
              action: 'remove',
              item_name,
              quantity,
              character_id: characterId
            });
          }
        }
      }

      return changes;
    } catch (error) {
      this.logger.error('Failed to extract inventory', {
        error: error.message,
        characterId
      });
      return changes;
    }
  }

  /**
   * 解析中文数字
   * @private
   */
  _parseChineseNumber(str) {
    const chineseNumbers = {
      '一': 1, '两': 2, '二': 2, '三': 3, '四': 4,
      '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10
    };

    // 如果是阿拉伯数字，直接返回
    if (/^\d+$/.test(str)) {
      return parseInt(str);
    }

    // 简单的中文数字转换
    return chineseNumbers[str] || 1;
  }

  // ============================================
  // 事件提取
  // ============================================

  /**
   * 提取事件
   *
   * @param {string} text - 文本内容
   * @returns {Array} 事件列表
   */
  extractEvents(text) {
    const events = [];

    try {
      // 重要性关键词
      const importanceKeywords = {
        5: ['第一次', '首次', '终于', '史无前例', 'first time', 'finally'],
        4: ['完成', '成功', '达成', '实现', 'completed', 'achieved'],
        3: ['坦白', '承认', '告诉', '透露', 'confessed', 'revealed'],
        2: ['发现', '找到', '遇到', 'found', 'discovered'],
        1: ['说', '做', '去', 'said', 'did']
      };

      // 检测重要性
      let importance = 1;
      for (const [level, keywords] of Object.entries(importanceKeywords)) {
        for (const keyword of keywords) {
          if (text.toLowerCase().includes(keyword.toLowerCase())) {
            importance = Math.max(importance, parseInt(level));
            break;
          }
        }
      }

      // 提取参与者（简单的人名识别）
      const participants = [];

      // 匹配 "Alice 和 Bob" 或 "Alice and Bob"
      const namePattern = /([A-Z][a-z]+|[\u4e00-\u9fa5]{2,4})\s*(?:和|与|跟|,|and)\s*([A-Z][a-z]+|[\u4e00-\u9fa5]{2,4})/gi;
      const matches = [...text.matchAll(namePattern)];

      for (const match of matches) {
        participants.push(match[1], match[2]);
      }

      // 也尝试匹配单独出现的名字（在句首）
      const singleNamePattern = /(?:^|\s)([A-Z][a-z]{2,}|[\u4e00-\u9fa5]{2,4})(?:\s|[：:说做])/g;
      const singleMatches = [...text.matchAll(singleNamePattern)];

      for (const match of singleMatches) {
        participants.push(match[1]);
      }

      // 如果有明显的事件特征，添加事件
      if (importance >= 2 || participants.length > 0) {
        events.push({
          event_type: 'general',
          description: text.slice(0, 200), // 截取前200字符
          timestamp: Date.now(),
          importance,
          participants: [...new Set(participants)] // 去重
        });
      }

      return events;
    } catch (error) {
      this.logger.error('Failed to extract events', {
        error: error.message
      });
      return events;
    }
  }

  // ============================================
  // 综合提取
  // ============================================

  /**
   * 从文本中提取所有状态
   *
   * @param {string} characterId - 角色 ID
   * @param {string} text - 文本内容
   * @returns {Object} 所有提取的状态
   */
  extractAllStates(characterId, text) {
    const timer = this.logger.startTimer('extractAllStates');

    try {
      const result = {
        affection: this.extractAffectionChange(characterId, text),
        emotion: this.extractEmotion(text),
        location: this.extractLocationChange(text),
        inventory: this.extractInventoryChanges(characterId, text),
        events: this.extractEvents(text)
      };

      timer.done('extractAllStates');

      return result;
    } catch (error) {
      this.logger.error('Failed to extract all states', {
        error: error.message,
        characterId
      });
      return {};
    }
  }

  // ============================================
  // 自定义模式
  // ============================================

  /**
   * 注册自定义提取模式
   *
   * @param {string} name - 模式名称
   * @param {Object} pattern - 模式配置
   * @param {RegExp} pattern.regex - 正则表达式
   * @param {Function} pattern.extract - 提取函数
   */
  registerPattern(name, pattern) {
    if (!pattern.regex || !pattern.extract) {
      throw new Error('Pattern must have regex and extract function');
    }

    this.customPatterns.set(name, pattern);

    this.logger.debug('Custom pattern registered', { name });
  }

  /**
   * 使用自定义模式提取
   *
   * @param {string} text - 文本内容
   * @param {string} patternName - 模式名称
   * @returns {*} 提取结果
   */
  extract(text, patternName) {
    const pattern = this.customPatterns.get(patternName);

    if (!pattern) {
      this.logger.warn('Pattern not found', { patternName });
      return null;
    }

    try {
      const match = text.match(pattern.regex);
      if (match) {
        return pattern.extract(match);
      }
      return null;
    } catch (error) {
      this.logger.error('Failed to extract with custom pattern', {
        error: error.message,
        patternName
      });
      return null;
    }
  }
}

/**
 * 导出
 */
export default StateExtractor;
