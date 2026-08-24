import { RESOURCE_NAMES, type Resource } from './board'
import { RuleBot, type CatanAgent } from './bot'
import { runGame } from './runner'
import {
  DEV_NAMES,
  handSize,
  type CatanAction,
  type CatanEvent,
  type PlayerView,
  type Seat,
  type TradeOffer,
} from './types'
import { sfx } from '../audio/sfx'
import { useLobby } from '../lobby/useLobby'
import { useCatan } from './useCatan'

/**
 * 在浏览器里开一局卡坦，你坐 0 号位，其余由 bot 补。
 *
 * **这是原型形态**：真正联机时对局跑在服务端，这里换成 WebSocket 收事件。
 * 界面只认 CatanEvent 和 PlayerView，那一步不用改渲染。
 */

/** 别人提议跟你换，多久没答就当拒绝 */
const TRADE_TIMEOUT_MS = 14000

class HumanAgent implements CatanAgent {
  /**
   * 有人跟你换牌。
   *
   * **必须能超时。** 玩家去倒杯水，整局就卡在这里等他 ——
   * 这在单机里只是烦，联机时是把三个人一起冻住。
   * 超时当拒绝，是最保守也最不会出错的默认。
   */
  respondTrade(_view: PlayerView, offer: TradeOffer): Promise<boolean> {
    return new Promise((resolve) => {
      let done = false
      const finish = (yes: boolean) => {
        if (done) return
        done = true
        clearTimeout(timer)
        useCatan.getState().setTradeAsk(null)
        resolve(yes)
      }
      const timer = setTimeout(() => finish(false), TRADE_TIMEOUT_MS)
      useCatan.getState().setTradeAsk({ offer, resolve: finish })
    })
  }

  act(view: PlayerView, options: CatanAction[]): Promise<CatanAction> {
    useCatan.getState().setView(view)
    return new Promise((resolve) => {
      useCatan.getState().setPending({
        view,
        options,
        resolve: (a) => {
          useCatan.getState().setPending(null)
          resolve(a)
        },
      })
    })
  }
}

/**
 * bot 外面包一层节奏。
 *
 * 卡坦一个回合里 bot 可能连做五六个动作，每个都停一样长会显得很拖。
 * 所以**只在"看得见的动作"上停** —— 掷骰、建造、动强盗要看清楚，
 * 换银行和买卡快速带过。
 */
const PACE: Partial<Record<CatanAction['kind'], number>> = {
  roll: 700,
  move_robber: 800,
  build_settlement: 600,
  build_city: 600,
  build_road: 380,
  place_settlement: 700,
  place_road: 450,
  play_knight: 600,
  play_monopoly: 700,
  play_year_of_plenty: 600,
  discard: 500,
  bank_trade: 220,
  buy_dev: 300,
  end_turn: 260,
}

class PacedBot implements CatanAgent {
  constructor(
    private inner: RuleBot,
    private seat: Seat,
  ) {}
  async respondTrade(view: PlayerView, offer: TradeOffer): Promise<boolean> {
    // 停一下再答，不然"提议"和"成交"会在同一帧刷出来，看不出发生过什么
    await new Promise((r) => setTimeout(r, 420))
    return this.inner.respondTrade(view, offer)
  }
  async act(view: PlayerView, options: CatanAction[]): Promise<CatanAction> {
    useCatan.getState().setThinking(this.seat)
    useCatan.getState().setView(view)
    const a = this.inner.act(view, options)
    await new Promise((r) => setTimeout(r, PACE[a.kind] ?? 300))
    useCatan.getState().setThinking(null)
    return a
  }
}

export type CatanSessionOptions = {
  seats: { seat: Seat; name: string; color: string; isAI: boolean }[]
}

export function startCatanSession(opts: CatanSessionOptions): () => void {
  const store = useCatan.getState()
  store.reset()

  let stopped = false
  const seats = opts.seats
  const nameOf = (s: Seat) => seats.find((x) => x.seat === s)?.name ?? `${s} 号`

  const agents = new Map<Seat, CatanAgent>(
    seats.map((s) => [
      s.seat,
      s.isAI
        ? new PacedBot(new RuleBot(s.name, s.seat * 7919 + 13, 0.3 + s.seat * 0.15), s.seat)
        : new HumanAgent(),
    ]),
  )

  let rngState = Date.now() % 2147483647
  const rng = () => ((rngState = (rngState * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)

  useCatan.getState().push('—— 开局摆放 ——', 'system')
  void runGame(seats, agents, rng, (e) => {
    if (!stopped) apply(e, nameOf)
  })
    .then((r) => {
      if (stopped || r.winner === null) return
      // 卡坦的一局很长，所以战绩记的是**分数**而不是胜负次数 ——
      // 输了拿八分和输了拿三分，在同一桌人心里完全不是一回事
      useLobby.getState().recordResult(
        r.vps.map((v) => ({ name: nameOf(v.seat), delta: v.vp, won: v.seat === r.winner })),
      )
    })
    .catch((err) => {
    // 引擎抛错说明是 bug（多半是守恒断言或者非法动作），必须显式暴露
    console.error('[catan] 牌局异常中断', err)
    useCatan.getState().push(`对局异常中断：${(err as Error).message}`, 'system')
  })

  return () => {
    stopped = true
    useCatan.getState().setPending(null)
  }
}

const listHand = (h: Partial<Record<Resource, number>>) =>
  Object.entries(h)
    .filter(([, n]) => n && n > 0)
    .map(([r, n]) => `${RESOURCE_NAMES[r as Resource]}×${n}`)
    .join(' ')

/** 把一条引擎事件念成人话。**唯一知道事件怎么念的地方** */
function apply(e: CatanEvent, nameOf: (s: Seat) => string) {
  const st = useCatan.getState()
  switch (e.t) {
    case 'setup_placed':
      sfx('place')
      st.push(
        `${nameOf(e.seat)} 摆下村庄` + (e.gained && handSize(e.gained as never) ? `，收 ${listHand(e.gained)}` : ''),
      )
      break
    case 'setup_road':
      break
    case 'turn_started':
      st.push(`—— 第 ${e.turnNo} 回合 · ${nameOf(e.seat)} ——`, 'system')
      break
    case 'rolled':
      sfx('dice')
      st.setLastRoll({ dice: e.dice, seat: e.seat, at: Date.now() })
      st.push(`${nameOf(e.seat)} 掷出 ${e.sum}（${e.dice[0]}+${e.dice[1]}）`)
      break
    case 'produced':
      sfx('chip')
      st.push(
        e.rows.map((r) => `${nameOf(r.seat)} 收 ${RESOURCE_NAMES[r.res]}×${r.n}`).join('　'),
        'result',
      )
      break
    case 'robber_blocked':
      st.push('强盗压着的地不产出', 'system')
      break
    case 'discarded':
      st.push(`${nameOf(e.seat)} 弃掉 ${listHand(e.give)}`)
      break
    case 'robber_moved':
      sfx('back')
      st.push(
        `${nameOf(e.seat)} 移动强盗` +
          (e.stole
            ? e.stole.res
              ? `，从 ${nameOf(e.stole.from)} 抢走一张`
              : `，${nameOf(e.stole.from)} 没牌可抢`
            : ''),
      )
      break
    case 'built': {
      sfx('place')
      const what = { road: '路', settlement: '村庄', city: '城市' }[e.what]
      st.push(`${nameOf(e.seat)} 建造${what}`)
      break
    }
    case 'bought_dev':
      st.push(`${nameOf(e.seat)} 买了一张发展卡`)
      break
    case 'played_dev':
      st.push(`${nameOf(e.seat)} 打出${DEV_NAMES[e.card]}${e.detail ? `（${e.detail}）` : ''}`, 'result')
      break
    case 'trade_offered':
      st.push(
        `${nameOf(e.from)} 想用 ${listHand(e.give)} 换 ${listHand(e.want)}`,
        'result',
      )
      break
    case 'trade_done':
      sfx('chip')
      st.push(`${nameOf(e.from)} 和 ${nameOf(e.to)} 换成了`, 'result')
      break
    case 'trade_refused':
      st.push('没人接这笔交易')
      break
    case 'bank_traded':
      st.push(
        `${nameOf(e.seat)} ${e.rate}:1 换牌 —— ${RESOURCE_NAMES[e.give]}换${RESOURCE_NAMES[e.want]}`,
      )
      break
    case 'longest_road':
      st.push(`${nameOf(e.seat)} 拿下最长路（${e.len} 条）`, 'result')
      break
    case 'largest_army':
      st.push(`${nameOf(e.seat)} 拿下最大军（${e.n} 骑士）`, 'result')
      break
    case 'won':
      sfx(e.seat === 0 ? 'win' : 'lose')
      st.push(`${nameOf(e.seat)} 达到 ${e.vp} 分，获胜`, 'result')
      st.setResult(e)
      break
  }
}
