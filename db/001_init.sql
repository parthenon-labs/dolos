-- Dolos 初始表结构（Postgres / Neon）
--
-- 设计围绕一条原则：**事件是唯一的真相，状态是算出来的。**
-- 引擎那边已经是 state = fold(events)，这里只是把同一条事件流落到磁盘。
-- 不存"当前状态"快照，是因为两份真相迟早会不一致，而且不一致时
-- 你无法知道该信哪一份。要性能再加物化视图，不要加第二份真相。

CREATE SCHEMA IF NOT EXISTS dolos;
SET search_path TO dolos;

-- ---------------------------------------------------------------
-- 玩家
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS players (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  handle      text NOT NULL,
  -- 头像颜色。和 3D 大厅、2D 头像用同一个值，认人靠它
  color       text NOT NULL DEFAULT '#7a5c3e',
  is_ai       boolean NOT NULL DEFAULT false,
  -- AI 玩家用哪个模型。人类玩家为 NULL
  ai_model    text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------
-- 一局对局
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS matches (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id      text NOT NULL,
  player_count  smallint NOT NULL CHECK (player_count BETWEEN 5 AND 10),
  -- 启用了哪些可选角色，原样存 JSON，避免为每个角色加一列
  optional_roles jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- 随机种子。有它才能完整复现一局，纠纷复盘全靠这个
  seed          integer NOT NULL,
  started_at    timestamptz NOT NULL DEFAULT now(),
  ended_at      timestamptz,
  winner        text CHECK (winner IN ('good','evil')),
  end_reason    text
);

-- 谁坐在哪个位置。**角色不存在这里** —— 见下面 match_roles
CREATE TABLE IF NOT EXISTS match_seats (
  match_id   uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  seat       smallint NOT NULL,
  player_id  uuid NOT NULL REFERENCES players(id),
  PRIMARY KEY (match_id, seat)
);

-- 角色分配单独一张表，而且**只在对局结束后才允许读**。
-- 和事件流分开是有意的：广播事件时不可能顺手把这张表带出去，
-- 隐藏信息泄漏在存储层就少了一条路径。
CREATE TABLE IF NOT EXISTS match_roles (
  match_id  uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  seat      smallint NOT NULL,
  role      text NOT NULL,
  PRIMARY KEY (match_id, seat)
);

-- ---------------------------------------------------------------
-- 事件流 —— 整个系统的地基
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS match_events (
  match_id  uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  -- 局内自增序号。断线重连就是"给我 seq > n 的所有事件"
  seq       integer NOT NULL,
  type      text NOT NULL,
  payload   jsonb NOT NULL,
  at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, seq)
);

-- ---------------------------------------------------------------
-- 发言记录
--
-- 逐字，不改写。摘要要加就另开一列，**原文永远是 text 这一列** ——
-- 指控经常挂在具体措辞上，"我觉得"和"我确定"被抹平之后
-- 整局的推理链就断了，而且没人知道断在哪。
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS speeches (
  id         bigserial PRIMARY KEY,
  match_id   uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  seat       smallint NOT NULL,
  -- 对应到事件流里的哪一条，用来定位"这句话是在哪个阶段说的"
  seq        integer NOT NULL,
  text       text NOT NULL,
  -- 'voice' = 语音转写，'typed' = 打字，'ai' = 模型生成
  source     text NOT NULL CHECK (source IN ('voice','typed','ai')),
  -- 语音转写的置信度，打字和 AI 为 NULL。低置信度的转写在界面上要标出来
  confidence real,
  at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS speeches_match_idx ON speeches (match_id, seq);
CREATE INDEX IF NOT EXISTS matches_table_idx ON matches (table_id, started_at DESC);
