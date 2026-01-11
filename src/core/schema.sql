-- ImmersiveAI Engine Database Schema
-- Version: 0.1.0
-- 用途：存储角色状态、时间线、位置、物品、记忆等信息

-- ============================================
-- Character 表：角色状态
-- ============================================
CREATE TABLE IF NOT EXISTS characters (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  affection INTEGER DEFAULT 0 CHECK(affection >= 0 AND affection <= 100),  -- 好感度 0-100
  emotion TEXT DEFAULT 'neutral',                                           -- 当前情绪
  personality TEXT,                                                         -- 性格特征 JSON
  current_location TEXT,                                                    -- 当前位置
  metadata TEXT,                                                            -- 自定义元数据 JSON
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_characters_name ON characters(name);
CREATE INDEX IF NOT EXISTS idx_characters_location ON characters(current_location);

-- ============================================
-- Timeline 表：时间线事件
-- ============================================
CREATE TABLE IF NOT EXISTS timeline (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,                   -- 事件时间戳（游戏内时间）
  event_type TEXT NOT NULL,                     -- 事件类型
  description TEXT NOT NULL,                    -- 事件描述
  participants TEXT,                            -- 参与者列表 JSON
  location TEXT,                                -- 发生地点
  importance INTEGER DEFAULT 1 CHECK(importance >= 1 AND importance <= 5),  -- 重要程度 1-5
  metadata TEXT,                                -- 额外信息 JSON
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_timeline_timestamp ON timeline(timestamp);
CREATE INDEX IF NOT EXISTS idx_timeline_type ON timeline(event_type);
CREATE INDEX IF NOT EXISTS idx_timeline_importance ON timeline(importance DESC);

-- ============================================
-- Location 表：地点信息
-- ============================================
CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  type TEXT,                                    -- 类型：indoor/outdoor
  parent_location TEXT,                         -- 父位置（层级结构）
  connected_to TEXT,                            -- 可达位置列表 JSON: [{id, travel_time}]
  description TEXT,
  metadata TEXT,                                -- 自定义属性 JSON
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,

  FOREIGN KEY (parent_location) REFERENCES locations(id)
);

CREATE INDEX IF NOT EXISTS idx_locations_name ON locations(name);
CREATE INDEX IF NOT EXISTS idx_locations_type ON locations(type);

-- ============================================
-- Inventory 表：物品库存
-- ============================================
CREATE TABLE IF NOT EXISTS inventory (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL,                   -- 所属角色
  item_name TEXT NOT NULL,
  item_type TEXT,                               -- 类型：weapon/armor/consumable/quest_item
  quantity INTEGER DEFAULT 1 CHECK(quantity >= 0),
  equipped BOOLEAN DEFAULT 0,                   -- 是否装备
  properties TEXT,                              -- 属性 JSON
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,

  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_inventory_character ON inventory(character_id);
CREATE INDEX IF NOT EXISTS idx_inventory_type ON inventory(item_type);
CREATE INDEX IF NOT EXISTS idx_inventory_equipped ON inventory(equipped);

-- ============================================
-- Memory 表：重要记忆
-- ============================================
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL,                   -- 记忆所属角色
  content TEXT NOT NULL,                        -- 记忆内容
  importance INTEGER DEFAULT 1 CHECK(importance >= 1 AND importance <= 5),  -- 重要程度
  timestamp INTEGER NOT NULL,                   -- 记忆时间
  tags TEXT,                                    -- 标签 JSON: ["first_meeting", "important"]
  metadata TEXT,                                -- 额外信息 JSON
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,

  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_memories_character ON memories(character_id);
CREATE INDEX IF NOT EXISTS idx_memories_timestamp ON memories(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance DESC);

-- ============================================
-- StateSnapshots 表：状态快照（用于回滚）
-- ============================================
CREATE TABLE IF NOT EXISTS state_snapshots (
  id TEXT PRIMARY KEY,
  snapshot_time INTEGER NOT NULL,               -- 快照时间
  state_data TEXT NOT NULL,                     -- 完整状态 JSON
  description TEXT,                             -- 快照描述
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_snapshots_time ON state_snapshots(snapshot_time DESC);

-- ============================================
-- ValidationLogs 表：验证日志
-- ============================================
CREATE TABLE IF NOT EXISTS validation_logs (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  validation_type TEXT NOT NULL,                -- 验证类型
  passed BOOLEAN NOT NULL,                      -- 是否通过
  details TEXT,                                 -- 验证详情 JSON
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_validation_logs_time ON validation_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_validation_logs_passed ON validation_logs(passed);
