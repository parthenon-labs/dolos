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
  /** agent 给出非法动作的次数。LLM 高、规则 bot 应该恒为 0 */
  illegalActions: number
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
): Promise<GameResult> {
  let { state, events } = startGame(config)
  const agents = makeAgents(state.roles)
  let illegal = 0

  const emit = (e: GameEvent) => {
    events.push(e)
    state = reduce(state, e)
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
        illegal++
      } catch {
        illegal++
      }
    }
    return fallback
  }

  while (state.phase !== 'ended') {
    if (state.phase === 'proposal') {
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
