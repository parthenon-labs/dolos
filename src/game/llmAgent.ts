import type { Agent } from './agent'
import type { Completer } from './llm'
import { ASK, systemPrompt } from './prompt'
import { type PlayerId, type PlayerView, isEvil } from './types'

export type LlmAgentOptions = {
  /** 发言前做一次泄漏审查，默认开 */
  guardSpeech?: boolean
  /** 记录每次调用，用来看 agent 到底在想什么 */
  onTrace?: (t: { player: PlayerId; action: string; result: unknown }) => void
}

/**
 * LLM 驱动的玩家。
 *
 * 每个 agent 只拿到自己的 PlayerView，prompt 也只由这份视图构造 ——
 * 所以多个 AI 跑在同一个进程里时，**上下文串味在结构上就不可能发生**。
 * 这是 AvalonBench 那类实验里最容易出错、也最难事后发现的地方。
 */
export class LlmAgent implements Agent {
  readonly name: string
  private complete: Completer
  private opts: LlmAgentOptions

  constructor(name: string, complete: Completer, opts: LlmAgentOptions = {}) {
    this.name = name
    this.complete = complete
    this.opts = opts
  }

  private async ask<T>(v: PlayerView, action: string, q: { user: string; schema: object }) {
    const res = await this.complete({
      system: systemPrompt(v),
      user: q.user,
      schema: q.schema,
    })
    this.opts.onTrace?.({ player: v.me, action, result: res })
    return res as T
  }

  async proposeTeam(v: PlayerView): Promise<PlayerId[]> {
    const r = await this.ask<{ team: number[] }>(v, 'propose', ASK.propose(v))
    return r.team
  }

  async vote(v: PlayerView): Promise<boolean> {
    const r = await this.ask<{ approve: boolean }>(v, 'vote', ASK.vote(v))
    return r.approve
  }

  async questCard(v: PlayerView): Promise<boolean> {
    // 好人不必问 —— 引擎无论如何会强制成功牌，问一次纯属浪费 token
    if (!isEvil(v.myRole)) return true
    const r = await this.ask<{ success: boolean }>(v, 'quest', ASK.quest(v))
    return r.success
  }

  async assassinate(v: PlayerView): Promise<PlayerId> {
    const r = await this.ask<{ target: number }>(v, 'assassinate', ASK.assassinate(v))
    return r.target
  }

  async bid(v: PlayerView): Promise<number> {
    const r = await this.ask<{ bid: number }>(v, 'bid', ASK.bid(v))
    return Math.max(0, Math.min(4, Math.round(r.bid ?? 0)))
  }

  async speak(v: PlayerView): Promise<string> {
    const r = await this.ask<{ speech: string }>(v, 'speak', ASK.speak(v))
    const raw = (r.speech ?? '').trim()
    if (!raw) return ''
    if (this.opts.guardSpeech === false) return raw
    return guardSpeech(v, raw, this.opts.onTrace)
  }
}

/* ---------------- 发言泄漏审查 ---------------- */

/**
 * 发言送出去之前的最后一道闸。
 *
 * AvalonBench 记录过一个结构性失效：**LLM 坏人经常在讨论里自曝身份**。
 * 那不是能力问题 —— system prompt 里明写着"你是刺客，同伙是 3 号"，
 * 模型的注意力就会往那儿泄。靠把提示词写得更严厉是压不住的。
 *
 * 所以这里不劝，直接审查：把私有信息和发言做对照，
 * 命中就打回。审查是**纯本地的字符串规则**，不额外花一次 API 调用 ——
 * 廉价、确定、可测，比再叫一次模型可靠。
 */
export function guardSpeech(
  v: PlayerView,
  speech: string,
  onTrace?: LlmAgentOptions['onTrace'],
): string {
  const leak = detectLeak(v, speech)
  if (!leak) return speech
  onTrace?.({ player: v.me, action: 'speech_blocked', result: { speech, leak } })
  // 打回而不是删改：一句被改过的发言往往前后不通，反而更可疑
  return '我再听听，先不表态。'
}

/** 返回泄漏原因，没泄漏返回 null */
export function detectLeak(v: PlayerView, speech: string): string | null {
  const known = v.knowledge.seesEvil
  if (known.length === 0 && v.knowledge.seesMerlinOrMorgana.length === 0) return null

  // 发言里提到的玩家编号
  const mentioned = new Set(
    [...speech.matchAll(/(\d+)\s*号/g)].map((m) => Number(m[1])),
  )

  // 只有靠身份才可能知道的确定性措辞
  const certainty = /(我(确定|知道|看得到|清楚)|一定是|肯定是|绝对是|我能看到)/.test(speech)

  if (isEvil(v.myRole) && known.length > 0) {
    // 坏人点名自己的同伙 —— 无论褒贬都是在泄漏阵营结构
    const named = known.filter((p) => mentioned.has(p))
    if (named.length > 0 && certainty) {
      return `坏人以确定语气点名了同伙 ${named.join('、')}`
    }
    // 把同伙**全部**说出来，即使语气不确定也等于交底
    if (known.every((p) => mentioned.has(p)) && known.length > 1) {
      return `坏人一次说出了全部同伙 ${known.join('、')}`
    }
  }

  if (v.myRole === 'merlin' && known.length > 0) {
    // 梅林以确定语气点名真坏人 —— 这是刺客最想要的信号
    const named = known.filter((p) => mentioned.has(p))
    if (named.length > 0 && certainty) {
      return `梅林以确定语气点名了坏人 ${named.join('、')}`
    }
  }

  // 任何角色直接自报身份
  if (/我是(梅林|刺客|莫甘娜|莫德雷德|奥伯伦|派西维尔)/.test(speech)) {
    const claimed = /我是(梅林|刺客|莫甘娜|莫德雷德|奥伯伦|派西维尔)/.exec(speech)![1]
    const roleCn: Record<string, string> = {
      merlin: '梅林', assassin: '刺客', morgana: '莫甘娜',
      mordred: '莫德雷德', oberon: '奥伯伦', percival: '派西维尔',
    }
    // 只拦"说了实话"的自曝。假称身份是合法战术，不该拦
    if (roleCn[v.myRole] === claimed) return `直接自报了真实身份「${claimed}」`
  }

  return null
}
