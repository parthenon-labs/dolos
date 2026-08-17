import { handStrength } from './agent'
import { describe, evaluate } from './evaluate'
import type { PlayerView } from './types'

/**
 * 把当前局面翻译成人话。
 *
 * 存在的理由很直接：**新手盯着"弃牌/过牌/加注"三个按钮不知道点哪个。**
 * 按钮本身没有信息量 —— 它们只说了"能做什么"，没说"现在是什么情况"、
 * "我手里算好还是烂"、"跟这一注划不划算"。
 *
 * 写成纯函数是因为这段文案要反复调：它是这个游戏的教学面，
 * 埋在组件里就没法单独试。
 */

export type Coach = {
  /** 现在是第几条街，一句话 */
  street: string
  /** 你手里现在成了什么牌。翻牌前只有两张，说不出牌型，就描述底牌 */
  hand: string
  /** 当前局面：没人下注 / 谁下了多少 / 你要付多少 */
  situation: string
  /** 划不划算。只在需要跟注时出现 */
  odds: string | null
  /** 每个按钮是什么意思 */
  hints: { fold: string; check: string; call: string; raise: string }
  /** 要提醒的风险 */
  warning: string | null
}

const STREET_CN: Record<string, string> = {
  preflop: '翻牌前',
  flop: '翻牌',
  turn: '转牌',
  river: '河牌',
  showdown: '摊牌',
}

export function coachFor(v: PlayerView): Coach | null {
  const l = v.legal
  if (!l) return null

  const me = v.players.find((p) => p.seat === v.me)
  if (!me) return null

  const pot =
    v.pots.reduce((a, p) => a + p.amount, 0) +
    v.players.reduce((a, p) => a + p.committed, 0)

  /*
    手牌描述。
    **强弱必须和牌型一起说。** 早先这里只描述形状，于是 3♦2♥ 被写成
    "32 连张，有做顺子的机会" —— 那是德扑里最烂的牌之一，
    而这句话会直接让新手去跟注。教学面上，误导比不说严重得多。

    强弱直接复用 bot 用的那个 handStrength，不另开一套：
    两套评估迟早会给出互相矛盾的建议。
  */
  const strength = handStrength(v)
  const verdict =
    strength >= 0.75 ? '很强' : strength >= 0.58 ? '不错' : strength >= 0.42 ? '一般' : '很弱'

  const hand =
    (v.board.length >= 3
      ? describe(evaluate([...v.myCards, ...v.board]))
      : preflopShape(v)) + ` · ${verdict}`

  // 局面
  const owed = l.callAmount
  let situation: string
  if (l.canCheck) {
    situation = '目前没人下注，你可以免费看下一张牌'
  } else {
    const bettor = v.players.find(
      (p) => p.committed === v.toCall && p.seat !== v.me && !p.folded,
    )
    const who = bettor ? `${bettor.name}` : '有人'
    situation = `${who} 下到了 ${v.toCall}，你要付 ${owed} 才能继续`
  }

  // 底池赔率：跟这一注需要多少胜率才不亏。
  // 这是新手最该建立的一个直觉，而且它完全可以算出来
  let odds: string | null = null
  if (owed > 0) {
    const need = owed / (pot + owed)
    odds = `跟这 ${owed}，你大约需要 ${Math.round(need * 100)}% 的胜率才划算（底池 ${pot}）`
  }

  const warning =
    owed >= me.stack && owed > 0
      ? '跟注会用光你的筹码（全下）'
      : v.street === 'preflop' && me.stack <= v.config.bigBlind * 5
        ? '你的筹码只剩不到 5 个大盲，通常这时要么弃牌要么全下'
        : null

  return {
    street: STREET_CN[v.street] ?? v.street,
    hand,
    situation,
    odds,
    warning,
    hints: {
      fold: '放弃这手牌。已经投进底池的筹码不退',
      check: '不下注，免费进入下一张公共牌',
      call: `付 ${owed} 跟上，继续留在这手牌里`,
      raise: '提高价码，逼对手多付筹码，或者直接把他们赶走',
    },
  }
}

/**
 * 翻牌前的底牌描述。
 *
 * 只讲**事实**（对子 / 同花 / 连张 / 大小），强弱交给外面的 verdict。
 * 这里绝不能写"有机会"这类鼓励性措辞：
 * 32 连张确实"连"，但它是最差的一档牌，说成有机会就是误导。
 */
function preflopShape(v: PlayerView): string {
  if (v.myCards.length < 2) return '等待发牌'
  const [a, b] = v.myCards
  const ra = a >> 2
  const rb = b >> 2
  const L = (r: number) => '23456789TJQKA'[r]
  const hi = Math.max(ra, rb)
  const lo = Math.min(ra, rb)
  const suited = (a & 3) === (b & 3)

  if (ra === rb) return `口袋对子 ${L(ra)}${L(ra)}`

  const parts: string[] = [`${L(hi)}${L(lo)}${suited ? ' 同花' : ''}`]
  const gap = hi - lo
  // 连张只在**点数够大**时才真的有价值。低位连张成顺也常常是输的那一头，
  // 所以这里只对 8 以上的连张给正面描述
  if (gap === 1 && lo >= 6) parts.push('连张')
  else if (gap === 1) parts.push('低位连张')
  if (hi >= 12 && lo >= 10) parts.push('两张大牌')
  else if (hi >= 12) parts.push(`带一张 ${L(hi)}`)
  return parts.join(' · ')
}
