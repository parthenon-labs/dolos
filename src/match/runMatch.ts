import { LlmAgent } from '../game/llmAgent'
import { HumanAgent } from '../game/humanAgent'
import { fakeCompleter } from '../game/fakeLlm'
import { runGame } from '../game/runner'
import type { GameEvent, Role } from '../game/types'
import { msgsFor, useMatch } from './useMatchStore'

/**
 * 在浏览器里跑一整局，你坐一个位置，其余座位由 AI 填。
 *
 * **这是原型的临时形态。** 真正上线时对局跑在服务端，
 * 这里换成 WebSocket 收事件 —— `msgsFor` 和整个界面一行都不用改，
 * 因为它们只认 GameEvent。
 *
 * 现在用假 LLM 而不是真模型：它走完整的 prompt 构造 / 结构化输出解析 /
 * 防泄漏管线，但不联网、瞬间返回。评判界面对不对不需要等真模型，
 * 而且真模型一次调用 25 秒，根本没法反复试界面。
 */
export type MatchOptions = {
  seatCount: number
  /** 你坐第几个位置 */
  mySeat: number
  /** 每次提名前的讨论轮数 */
  discussion?: number
  seed?: number
}

/** 每条消息揭示后停多久再放下一条 */
const REVEAL_MS: Record<string, number> = {
  speech: 1500,
  proposal: 900,
  vote: 1400,
  quest: 1800,
  assassination: 2200,
  system: 700,
}

export function startMatch(opts: MatchOptions): () => void {
  const { seatCount, mySeat, discussion = 2, seed = Math.floor(Math.random() * 9973) } =
    opts

  const m = useMatch.getState()
  m.reset()

  let stopped = false
  const completer = fakeCompleter(seed)

  // 事件一产生就入队，不等界面播完 —— 队列自己保证顺序。
  // 和 3D 那边 cue 队列同一条原则：产生和呈现必须解耦。
  let round = 0
  const onEvent = (e: GameEvent) => {
    if (stopped) return
    for (const msg of msgsFor(e, round)) {
      if (msg.kind === 'proposal') round = msg.round
      useMatch.getState().push(msg)
    }
  }

  // 揭示节奏。用递归 setTimeout 而不是 setInterval：
  // 每条消息该停多久不一样，固定间隔会让长发言一闪而过、短系统消息拖沓
  const pump = () => {
    if (stopped) return
    const s = useMatch.getState()
    const next = s.queue[0]
    if (!next) {
      setTimeout(pump, 120)
      return
    }
    s.drainOne()
    setTimeout(pump, REVEAL_MS[next.kind] ?? 800)
  }
  pump()

  const makeAgents = (roles: Role[]) =>
    roles.map((_, i) =>
      i === mySeat
        ? new HumanAgent('你')
        : new LlmAgent(`P${i}`, completer),
    )

  void runGame(
    { playerCount: seatCount, optionalRoles: ['percival', 'morgana'], seed },
    makeAgents,
    discussion,
    onEvent,
  )
    .then((r) => {
      if (stopped) return
      useMatch.getState().finish(r.winner, r.reason)
    })
    .catch((err) => {
      // 引擎抛错说明是 bug，不该静默 —— 但也不该白屏
      console.error('[dolos] 对局异常中断', err)
    })

  return () => {
    stopped = true
    useMatch.getState().setPending(null)
  }
}
