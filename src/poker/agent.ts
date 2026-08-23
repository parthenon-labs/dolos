import { rankOf, suitOf } from './cards'
import { evaluate } from './evaluate'
import type { Action, PlayerView } from './types'

/**
 * 一个玩家（人 / bot）要实现的全部接口。
 *
 * 和阿瓦隆那版同一个形状：**只吃 PlayerView**。
 * 底牌以外的信息在投影时就切掉了，所以 agent 想作弊也没有东西可偷。
 */
export interface PokerAgent {
  readonly name: string
  act(view: PlayerView): Promise<Action>
  /** 可选的桌上闲聊。不影响牌局，纯氛围 */
  speak?(view: PlayerView): Promise<string>
}

/**
 * 启发式 bot。
 *
 * **它不需要很强，需要的是不蠢。** 一个总是跟注的 bot 会让新玩家
 * 五分钟内看穿并失去兴趣；一个偶尔弃牌、偶尔加注、按牌力调整的 bot
 * 已经足够撑住体验。真正的强度交给求解器（CFR 那一类），
 * **不是交给语言模型** —— 德州的强弱是概率和范围的问题，那是算出来的。
 *
 * 决策依据只有两样：手牌强度估计，和跟注要付的比例（底池赔率）。
 * 这已经能产生看起来合理的弃牌/跟注/加注分布。
 */
export class RuleBot implements PokerAgent {
  private rng: () => number

  constructor(
    readonly name: string,
    seed = 1,
    /** 0 = 极紧，1 = 极松。给不同 bot 不同性格，一桌人才不像同一个人 */
    private looseness = 0.5,
  ) {
    let x = seed * 2654435761
    this.rng = () => ((x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  }

  async act(v: PlayerView): Promise<Action> {
    const l = v.legal
    if (!l) return { kind: 'check' }

    const strength = handStrength(v)
    const potNow = v.pots.reduce((a, p) => a + p.amount, 0) +
      v.players.reduce((a, p) => a + p.committed, 0)
    // 底池赔率：要付的钱占跟注后底池的比例。越小越该跟
    const price = l.callAmount / Math.max(1, potNow + l.callAmount)

    const noise = (this.rng() - 0.5) * 0.12
    const s = Math.max(0, Math.min(1, strength + noise))
    const threshold = 0.55 - this.looseness * 0.25

    // 能过牌就基本不弃牌 —— 免费看牌是德扑最基本的常识，
    // bot 在这里犯错会立刻显得很假
    if (l.canCheck) {
      if (s > 0.72 && (l.canBet || l.canRaise) && this.rng() < 0.55) {
        return { kind: l.canBet ? 'bet' : 'raise', to: sizeBet(v, l, potNow, this.rng()) }
      }
      return { kind: 'check' }
    }

    // 牌很强：加注
    if (s > 0.78 && (l.canRaise || l.canBet) && this.rng() < 0.6) {
      return { kind: l.canBet ? 'bet' : 'raise', to: sizeBet(v, l, potNow, this.rng()) }
    }
    // 偶尔诈唬，否则 bot 完全可读
    if (s < 0.3 && (l.canRaise || l.canBet) && this.rng() < 0.08 * (1 + this.looseness)) {
      return { kind: l.canBet ? 'bet' : 'raise', to: sizeBet(v, l, potNow, this.rng()) }
    }

    if (s > threshold || price < 0.18) return { kind: 'call' }
    if (l.canFold) return { kind: 'fold' }
    return { kind: 'check' }
  }
}

/** 下注尺度：半池到满池之间，夹到合法区间 */
function sizeBet(
  v: PlayerView,
  l: NonNullable<PlayerView['legal']>,
  pot: number,
  r: number,
): number {
  const me = v.players.find((p) => p.seat === v.me)!
  const target = me.committed + Math.round(pot * (0.5 + r * 0.6))
  return Math.max(l.minRaiseTo, Math.min(target, l.maxRaiseTo))
}

/**
 * 手牌强度，0..1。
 *
 * 翻牌前用一套简化的起手牌评分（对子、同花、连张、高牌），
 * 翻牌后直接用成手牌的类别。这不是精确的胜率，
 * 只是一个**单调、可解释**的量 —— 精确胜率要蒙特卡洛，
 * 而 bot 的强度瓶颈根本不在这。
 */
export function handStrength(v: PlayerView): number {
  const hole = v.myCards
  if (hole.length < 2) return 0

  if (v.board.length === 0) {
    const [a, b] = hole.map(rankOf).sort((x, y) => y - x)
    const suited = suitOf(hole[0]) === suitOf(hole[1])
    const pair = a === b
    const gap = a - b

    if (pair) return Math.min(1, 0.5 + (a - 2) / 24) // 22≈0.5，AA≈1.0
    let s = (a - 2) / 24 + (b - 2) / 40 // 高牌为主，副牌为辅
    if (suited) s += 0.08
    if (gap === 1) s += 0.06
    else if (gap === 2) s += 0.03
    else if (gap > 4) s -= 0.05
    return Math.max(0, Math.min(0.95, s))
  }

  const r = evaluate([...hole, ...v.board])
  // 类别 0..8 映射到 0..1，高类别之间差距压缩 ——
  // 三条和四条在决策上都是"很强"，没必要区分得太细
  const byCat = [0.12, 0.34, 0.56, 0.72, 0.82, 0.88, 0.93, 0.97, 1]
  return byCat[r.category]
}
