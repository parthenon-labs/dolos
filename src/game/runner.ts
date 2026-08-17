import type { Agent } from './agent'
import {
  canFail,
  isRejectLimit,
  project,
  reduce,
  resolveQuest,
  startGame,
  validateTeam,
} from './engine'
import { MAX_REJECTS } from './rules'
import {
  type GameConfig,
  type GameEvent,
  type GameState,
  type PlayerId,
  isEvil,
} from './types'

export type GameResult = {
  winner: 'good' | 'evil'
  reason: string
  events: GameEvent[]
  roles: GameState['roles']
  /** 动作不合法（人数不对、编号越界…）。这是能力指标 */
  illegalActions: number
  /**
   * 调用直接抛错的次数（网络、鉴权、解析）。
   * **和非法动作分开统计** —— 混在一起的话，一个坏掉的 API key 会伪装成
   * "模型很笨"，而这两种问题的排查方向完全相反。
   */
  callErrors: number
}

/** agent 给非法动作时重试几次，超了就用兜底动作 */
const MAX_RETRIES = 3

/**
 * 跑完一整局。
 *
 * 引擎对 agent 的态度是**完全不信任**：队伍不合法就打回重试，
 * 好人想出失败牌直接改成成功，刺杀目标越界就兜底。
 * LLM 给出非法动作是常态而不是异常，整局不该因此崩掉 ——
 * 但也不能默默纵容，所以非法次数会被统计出来，它本身就是个能力指标。
 */
export async function runGame(
  config: GameConfig,
  makeAgents: (roles: GameState['roles']) => Agent[],
  /** 每次提名前的讨论轮数。规则 bot 不发言，设 0 即可 */
  discussionRounds = 0,
  /**
   * 每产生一条事件就回调一次。
   *
   * 返回值里的 events 是跑完才有的，界面需要**边跑边看**。
   * 服务端广播走的也是这个钩子 —— 一条事件产生的瞬间就该发出去，
   * 不能等整局结束。回调里抛错会中断整局，所以实现必须自己吞掉异常。
   */
  onEvent?: (e: GameEvent) => void,
): Promise<GameResult> {
  let { state, events } = startGame(config)
  const agents = makeAgents(state.roles)
  let illegal = 0
  let errors = 0

  const emit = (e: GameEvent) => {
    events.push(e)
    state = reduce(state, e)
    onEvent?.(e)
  }

  const guard = async <T>(
    fn: () => Promise<T>,
    validate: (v: T) => string | null,
    fallback: T,
  ): Promise<T> => {
    for (let i = 0; i < MAX_RETRIES; i++) {
      try {
        const v = await fn()
        if (validate(v) === null) return v
        illegal++ // 答案不合法 —— 模型能力问题
      } catch {
        errors++ // 调用本身炸了 —— 配置/网络问题，不是能力问题
      }
    }
    return fallback
  }

  /**
   * 提名前的自由讨论，用竞价决定谁说话。
   *
   * 抄自 Google Research 的 Werewolf Arena：每个人报一个 0-4 的发言意愿，
   * 最高者发言，平手时**上一轮被点名的人优先**。
   * "何时插话"是语音社交推理里最难的一环，固定轮流发言在阿瓦隆里尤其失真 ——
   * 真实的讨论是抢话的。这套机制现在跑在文字上，
   * 将来接语音时可以原样复用：竞价就是抢麦。
   */
  async function discussion(rounds: number) {
    if (rounds <= 0) return
    let lastMentioned = new Set<PlayerId>()

    for (let r = 0; r < rounds; r++) {
      const bids: { p: PlayerId; bid: number }[] = []
      for (let p = 0; p < config.playerCount; p++) {
        const a = agents[p]
        if (!a.bid || !a.speak) continue
        const v = project(state, p)
        const bid = await guard(
          () => a.bid!(v),
          (x) => (Number.isFinite(x) ? null : '出价必须是数字'),
          0,
        )
        bids.push({ p, bid })
      }
      if (bids.length === 0) return

      const top = Math.max(...bids.map((b) => b.bid))
      if (top <= 0) return // 没人想说，讨论自然结束
      const contenders = bids.filter((b) => b.bid === top).map((b) => b.p)
      // 平手时被点名的人优先回应
      const preferred = contenders.filter((p) => lastMentioned.has(p))
      const speaker = (preferred.length > 0 ? preferred : contenders)[0]

      const text = await guard(
        () => agents[speaker].speak!(project(state, speaker)),
        (x) => (typeof x === 'string' ? null : '发言必须是字符串'),
        '',
      )
      if (!text) continue
      emit({ t: 'speech', player: speaker, text })
      lastMentioned = new Set(
        [...text.matchAll(/(\d+)\s*号/g)].map((m) => Number(m[1])),
      )
    }
  }

  while (state.phase !== 'ended') {
    if (state.phase === 'proposal') {
      await discussion(discussionRounds)
      const leader = state.leader
      const view = project(state, leader)
      const fallback = fallbackTeam(state, leader)
      const team = await guard(
        () => agents[leader].proposeTeam(view),
        (t) => validateTeam(state, t),
        fallback,
      )
      emit({ t: 'proposed', leader, team })
      continue
    }

    if (state.phase === 'vote') {
      const votes: boolean[] = []
      for (let p = 0; p < config.playerCount; p++) {
        const v = await guard(
          () => agents[p].vote(project(state, p)),
          (x) => (typeof x === 'boolean' ? null : '必须是 true/false'),
          true,
        )
        votes.push(v)
      }
      const approvals = votes.filter(Boolean).length
      const passed = approvals * 2 > votes.length
      emit({ t: 'voted', votes })

      if (!passed) {
        const rejects = state.consecutiveRejects + 1
        emit({ t: 'vote_failed', consecutiveRejects: rejects })
        if (isRejectLimit(rejects)) {
          emit({ t: 'ended', winner: 'evil', reason: 'five_rejects' })
        }
      }
      continue
    }

    if (state.phase === 'quest') {
      const questIndex = state.questResults.length
      let fails = 0
      for (const p of state.team) {
        const wantSuccess = await guard(
          () => agents[p].questCard(project(state, p)),
          (x) => (typeof x === 'boolean' ? null : '必须是 true/false'),
          true,
        )
        // **好人不能出失败牌** —— 引擎强制，不给 agent 犯规的余地
        const success = canFail(state.roles[p]) ? wantSuccess : true
        if (!success) fails++
      }
      const ok = resolveQuest(config.playerCount, questIndex, fails)
      emit({ t: 'quest_played', questIndex, fails, success: ok })

      const good = state.questResults.filter((r) => r.success).length
      const evil = state.questResults.length - good
      if (evil >= 3) emit({ t: 'ended', winner: 'evil', reason: 'three_quests_evil' })
      continue
    }

    if (state.phase === 'assassination') {
      const assassin = state.roles.findIndex((r) => r === 'assassin')
      const view = project(state, assassin)
      const target = await guard(
        () => agents[assassin].assassinate(view),
        (t) =>
          Number.isInteger(t) && t >= 0 && t < config.playerCount && t !== assassin
            ? null
            : '刺杀目标不合法',
        fallbackAssassinate(state, assassin),
      )
      const wasMerlin = state.roles[target] === 'merlin'
      emit({ t: 'assassinated', target, wasMerlin })
      emit(
        wasMerlin
          ? { t: 'ended', winner: 'evil', reason: 'assassin_found_merlin' }
          : { t: 'ended', winner: 'good', reason: 'three_quests_good' },
      )
      continue
    }
  }

  return {
    winner: state.winner!,
    reason: state.endReason!,
    events,
    roles: state.roles,
    illegalActions: illegal,
    callErrors: errors,
  }
}

/** 兜底队伍：队长 + 编号最小的几个人。永远合法 */
function fallbackTeam(state: GameState, leader: PlayerId): PlayerId[] {
  const size = project(state, leader).teamSize
  const team = [leader]
  for (let i = 0; team.length < size; i++) if (i !== leader) team.push(i)
  return team
}

function fallbackAssassinate(state: GameState, assassin: PlayerId): PlayerId {
  for (let i = 0; i < state.config.playerCount; i++) {
    if (i !== assassin && !isEvil(state.roles[i])) return i
  }
  return (assassin + 1) % state.config.playerCount
}

export { MAX_REJECTS }
