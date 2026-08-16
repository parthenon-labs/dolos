import {
  MAX_REJECTS,
  QUESTS,
  buildRoles,
  knowledgeFor,
  makeRng,
  needsTwoFails,
  shuffle,
  teamSize,
} from './rules'
import {
  type GameConfig,
  type GameEvent,
  type GameState,
  type PlayerId,
  type PlayerView,
  type Role,
  isEvil,
} from './types'

/* ---------------- 事件 → 状态 ---------------- */

/**
 * 纯 reducer。状态永远是事件流 fold 出来的，不允许在别处直接改状态。
 *
 * 这条纪律的回报在于：重连只要把事件重放一遍，回放只要慢速重放一遍，
 * AI 的上下文只要读事件流，全都不需要额外的代码路径。
 */
export function reduce(state: GameState, e: GameEvent): GameState {
  switch (e.t) {
    case 'started':
      return { ...state, roles: e.roles, leader: e.firstLeader, phase: 'proposal' }

    case 'proposed':
      return { ...state, team: e.team, pendingLeader: e.leader, phase: 'vote' }

    case 'voted': {
      const approvals = e.votes.filter(Boolean).length
      const passed = approvals * 2 > e.votes.length
      return {
        ...state,
        lastVotes: e.votes,
        // 被否决的提名也要留档 —— "谁挺谁"本身就是强信息
        proposals: [
          ...state.proposals,
          {
            questIndex: state.quests.length,
            leader: state.pendingLeader ?? state.leader,
            team: state.team,
            votes: e.votes,
            approved: passed,
          },
        ],
        phase: passed ? 'quest' : 'proposal',
        consecutiveRejects: passed ? 0 : state.consecutiveRejects,
      }
    }

    case 'vote_failed':
      return {
        ...state,
        consecutiveRejects: e.consecutiveRejects,
        leader: (state.leader + 1) % state.config.playerCount,
        team: [],
      }

    case 'quest_played': {
      const questResults = [...state.questResults, { fails: e.fails, success: e.success }]
      return {
        ...state,
        questResults,
        quests: [
          ...state.quests,
          {
            questIndex: e.questIndex,
            leader: state.pendingLeader ?? state.leader,
            team: state.team,
            fails: e.fails,
            success: e.success,
          },
        ],
        pendingLeader: null,
        team: [],
        lastVotes: null,
        consecutiveRejects: 0,
        leader: (state.leader + 1) % state.config.playerCount,
        phase: nextPhaseAfterQuest(questResults),
      }
    }

    case 'speech':
      return { ...state, transcript: [...state.transcript, { player: e.player, text: e.text }] }

    case 'assassinated':
      return { ...state, phase: 'ended' }

    case 'ended':
      return { ...state, phase: 'ended', winner: e.winner, endReason: e.reason }
  }
}

function nextPhaseAfterQuest(results: { success: boolean }[]) {
  const good = results.filter((r) => r.success).length
  const evil = results.length - good
  if (evil >= 3) return 'ended' as const
  // 好人过了三轮还没赢 —— 还要过刺客那一关
  if (good >= 3) return 'assassination' as const
  return 'proposal' as const
}

export function emptyState(config: GameConfig): GameState {
  return {
    config,
    roles: [],
    phase: 'proposal',
    leader: 0,
    team: [],
    questResults: [],
    consecutiveRejects: 0,
    lastVotes: null,
    winner: null,
    endReason: null,
    transcript: [],
    proposals: [],
    quests: [],
    pendingLeader: null,
  }
}

export function replay(config: GameConfig, events: GameEvent[]): GameState {
  return events.reduce(reduce, emptyState(config))
}

/* ---------------- 每玩家视图投影 ---------------- */

/**
 * **服务端发给客户端的唯一合法出口。**
 *
 * 最常见的致命错误是把完整 state 广播出去、让前端负责"不显示" ——
 * 那等于把梅林是谁写在网络帧里，F12 就赢了。
 * 这个函数存在的意义就是让那种写法没有可乘之机。
 */
export function project(state: GameState, me: PlayerId): PlayerView {
  const questIndex = state.questResults.length
  return {
    me,
    myRole: state.roles[me],
    playerCount: state.config.playerCount,
    knowledge: knowledgeFor(me, state.roles),
    phase: state.phase,
    leader: state.leader,
    team: state.team,
    questResults: state.questResults,
    consecutiveRejects: state.consecutiveRejects,
    lastVotes: state.lastVotes,
    proposals: state.proposals,
    quests: state.quests,
    teamSize: teamSize(
      state.config.playerCount,
      Math.min(questIndex, QUESTS - 1),
    ),
    needsTwoFails: needsTwoFails(
      state.config.playerCount,
      Math.min(questIndex, QUESTS - 1),
    ),
    transcript: state.transcript,
    winner: state.winner,
  }
}

/* ---------------- 开局 ---------------- */

export function startGame(config: GameConfig): { state: GameState; events: GameEvent[] } {
  const rng = makeRng(config.seed)
  const roles = shuffle(buildRoles(config.playerCount, config.optionalRoles), rng)
  const firstLeader = Math.floor(rng() * config.playerCount)
  const started: GameEvent = { t: 'started', roles, firstLeader }
  return { state: reduce(emptyState(config), started), events: [started] }
}

/* ---------------- 合法性校验 ---------------- */

/**
 * 服务端必须自己判合法，不能信客户端。
 * 这里返回错误字符串而不是抛异常 —— AI 给出非法动作是常态，
 * 上层要能把错误喂回去让它重试，而不是让整局崩掉。
 */
export function validateTeam(state: GameState, team: PlayerId[]): string | null {
  const size = teamSize(state.config.playerCount, state.questResults.length)
  if (team.length !== size) return `队伍必须是 ${size} 人，收到 ${team.length} 人`
  if (new Set(team).size !== team.length) return '队伍里有重复的人'
  for (const p of team) {
    if (!Number.isInteger(p) || p < 0 || p >= state.config.playerCount) {
      return `${p} 不是合法的玩家编号`
    }
  }
  return null
}

/** 只有坏人能出失败牌 */
export function canFail(role: Role): boolean {
  return isEvil(role)
}

/** 判定这一轮任务成功与否 */
export function resolveQuest(
  playerCount: number,
  questIndex: number,
  fails: number,
): boolean {
  return fails < (needsTwoFails(playerCount, questIndex) ? 2 : 1)
}

/** 五次否决 = 坏人直接赢 */
export const isRejectLimit = (consecutiveRejects: number) =>
  consecutiveRejects >= MAX_REJECTS
