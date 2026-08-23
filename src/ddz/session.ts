import { RuleBot } from './bot'
import { describeCombo } from './combo'
import { runGame, type DdzAgent, type Seats } from './engine'
import type { DdzEvent, PlayAction, PlayerView, Seat } from './types'
import { RANK_LABELS, formatRanks, rankOf } from './cards'
import { sfx } from '../audio/sfx'
import { useDdz } from './useDdz'

/**
 * 在浏览器里连开若干局，你坐 0 号位，另外两家由 bot 补。
 *
 * **这是原型形态**：真正联机时对局跑在服务端，这里换成 WebSocket 收事件。
 * 界面只认 DdzEvent，所以那一步不用改渲染 —— 和德州那边留的口子一样。
 */

/** 人类玩家：动作挂成 Promise，等界面点了才 resolve */
class HumanAgent implements DdzAgent {
  bid(view: PlayerView, min: number): Promise<number> {
    useDdz.getState().setView(view)
    return new Promise((resolve) => {
      useDdz.getState().setPending({
        kind: 'bid',
        view,
        min,
        resolve: (s) => {
          useDdz.getState().setPending(null)
          resolve(s)
        },
      })
    })
  }
  play(view: PlayerView): Promise<PlayAction> {
    useDdz.getState().setView(view)
    return new Promise((resolve) => {
      useDdz.getState().setPending({
        kind: 'play',
        view,
        resolve: (a) => {
          useDdz.getState().setPending(null)
          useDdz.getState().setSelected([])
          resolve(a)
        },
      })
    })
  }
}

/**
 * bot 外面包一层，只做两件事：**先亮"在想"，再停一下**。
 *
 * 引擎算完一局要几毫秒，不刻意放慢的话，你点完出牌会直接看到结算 ——
 * 中间两家出了什么完全不知道。这是体验参数，不是技术限制。
 */
class PacedBot implements DdzAgent {
  constructor(
    private inner: RuleBot,
    private seat: Seat,
  ) {}
  private async pause(ms: number) {
    useDdz.getState().setThinking(this.seat)
    await new Promise((r) => setTimeout(r, ms))
    useDdz.getState().setThinking(null)
  }
  async bid(view: PlayerView, min: number) {
    await this.pause(520)
    return this.inner.bid(view, min)
  }
  async play(view: PlayerView) {
    await this.pause(620 + Math.floor(view.myCards.length * 8))
    return this.inner.play(view)
  }
}

export type DdzSessionOptions = {
  seats: { seat: Seat; name: string; color: string; isAI: boolean }[]
  games?: number
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export function startDdzSession(opts: DdzSessionOptions): () => void {
  const maxGames = opts.games ?? 200
  const store = useDdz.getState()
  store.reset()

  let stopped = false
  const seats: Seats = opts.seats.map((s) => ({ ...s, score: 0 }))
  const nameOf = (s: Seat) => seats.find((x) => x.seat === s)?.name ?? `${s} 号`

  const agents = new Map<Seat, DdzAgent>()
  for (const s of seats)
    agents.set(
      s.seat,
      s.isAI
        ? new PacedBot(new RuleBot(s.name, s.seat * 7919 + 13, 0.3 + s.seat * 0.2), s.seat)
        : new HumanAgent(),
    )

  let rngState = Date.now() % 2147483647
  const rng = () => ((rngState = (rngState * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)

  ;(async () => {
    let first: Seat = 0
    for (let g = 1; g <= maxGames && !stopped; g++) {
      useDdz.getState().newGame(g)
      useDdz.getState().push(`—— 第 ${g} 局 ——`, 'system')

      await runGame(g, seats, agents, rng, (e) => apply(e, nameOf), first)
      if (stopped) return

      // 下一局从上一局的地主下家先叫，跟真人桌上的规矩一样
      first = ((first + 1) % 3) as Seat
      useDdz.getState().setScores(
        Object.fromEntries(seats.map((s) => [s.seat, s.score])) as Record<Seat, number>,
      )
      // 结算面板停久一点，玩家要看清楚谁剩了什么
      await sleep(600)
      for (let i = 0; i < 60 && !stopped; i++) {
        if (!useDdz.getState().result) break
        await sleep(200)
      }
      if (useDdz.getState().result) useDdz.getState().setResult(null)
    }
  })().catch((err) => {
    // 引擎抛错说明是 bug（多半是积分不守恒或者非法出牌的断言），必须显式暴露
    console.error('[ddz] 牌局异常中断', err)
    useDdz.getState().push(`牌局异常中断：${(err as Error).message}`, 'system')
  })

  return () => {
    stopped = true
    useDdz.getState().setPending(null)
  }
}

/** 把一条引擎事件落到界面上。**唯一知道事件怎么念的地方** */
function apply(e: DdzEvent, nameOf: (s: Seat) => string) {
  const st = useDdz.getState()
  switch (e.t) {
    case 'bid':
      st.push(e.score > 0 ? `${nameOf(e.seat)} 叫 ${e.score} 分` : `${nameOf(e.seat)} 不叫`)
      break
    case 'redeal':
      st.push(e.reason, 'system')
      st.clearPlaced()
      break
    case 'landlord':
      sfx('deal')
      st.push(
        `${nameOf(e.seat)} 当地主，底牌 ${formatRanks(e.bottom)}，${e.base} 分起`,
        'system',
      )
      st.clearPlaced()
      break
    case 'played':
      sfx('card')
      st.place(e.seat, e.combo)
      st.push(`${nameOf(e.seat)} 出 ${describeCombo(e.combo)}　剩 ${e.left} 张`)
      break
    case 'passed':
      st.place(e.seat, null)
      st.push(`${nameOf(e.seat)} 不要`)
      break
    case 'multiplied':
      sfx('chip')
      st.push(`${nameOf(e.seat)} 的${e.reason} —— ${e.multiplier} 倍`, 'result')
      break
    case 'ended': {
      const who = e.landlordWon ? '地主' : '农民'
      const spring = e.spring === 'spring' ? '　春天！' : e.spring === 'anti' ? '　反春天！' : ''
      sfx(e.winner === 0 ? 'win' : 'lose')
      st.push(`${who}赢　${e.base} 分 × ${e.multiplier} 倍${spring}`, 'result')
      st.setResult(e)
      break
    }
  }
}

export { RANK_LABELS, rankOf }
