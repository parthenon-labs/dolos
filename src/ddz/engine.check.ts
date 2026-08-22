/**
 * 斗地主引擎的检查：`npm run check:ddz`
 *
 * 和德州那边一个思路：**用例只能覆盖你想到的情况，真正的网是不变量。**
 * 这里有三张：
 *
 * - **牌守恒** —— 一局打完，打出去的牌加上各家剩的牌，必须精确等于 54 张，
 *   而且每张只出现一次。发牌、拿底牌、出牌移除，任何一处写错都会破坏它
 * - **积分守恒** —— 三家的积分变化加起来必须精确为零。
 *   地主是农民的两倍这条算错了，它立刻不成立
 * - **样本量** —— 炸弹、王炸、春天、重新发牌这些分支在均匀对局里出现得不密，
 *   所以要盯住它们的出现次数。这个数字掉下去就说明覆盖没了，
 *   而不会有任何一条用例变红
 */
import { RANK_LABELS, formatRanks, sortCards, type Card } from './cards'
import { RuleBot, estimatePlays } from './bot'
import { runGame, type Seats } from './engine'
import type { DdzEvent, Seat } from './types'

let bad = 0
const fail = (msg: string) => {
  if (bad < 12) console.log(`✗ ${msg}`)
  bad++
}

let rngState = 20260822
const rng = () => ((rngState = (rngState * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)

const seats: Seats = [
  { seat: 0, name: 'Ultimo', color: '#9a6b3f', isAI: true, score: 0 },
  { seat: 1, name: 'Broadway', color: '#4a6a7a', isAI: true, score: 0 },
  { seat: 2, name: 'Haymarket', color: '#7a4a5f', isAI: true, score: 0 },
]

console.log('—— 手数估计 ——')
/** estimatePlays 是 bot 全部判断的地基，先单独钉几个 */
const plays = (s: string, expect: number) => {
  // 用牌面写：'3 4 5 6 7' 这种
  const RANKS = RANK_LABELS
  const used = new Map<number, number>()
  const cards: Card[] = s.trim().split(/\s+/).map((t) => {
    const r = RANKS.indexOf(t)
    const k = used.get(r) ?? 0
    used.set(r, k + 1)
    return r >= 13 ? (r === 13 ? 52 : 53) : (r << 2) | k
  })
  const got = estimatePlays(cards)
  if (got !== expect) fail(`手数估计：${s} → ${got} 手，应为 ${expect} 手`)
  else console.log(`✓ ${s.padEnd(30)} ${got} 手`)
}
plays('3 4 5 6 7', 1)
plays('3 3 4 4 5 5', 1)
plays('3 3 3 3', 1)
plays('小王 大王', 1)
plays('3 5 7 9', 4)
plays('3 3 3 4', 1)
plays('3 4 5 6 7 8 9 10', 1)
plays('2 2 小王 大王', 2)

console.log('\n—— 随机对局 ——')
const GAMES = 4000
let bombs = 0
let rockets = 0
let springs = 0
let antiSprings = 0
let redeals = 0
let landlordWins = 0
let totalTurns = 0
let maxMultiplier = 1
const scores = [0, 0, 0]

for (let g = 1; g <= GAMES; g++) {
  const agents = new Map(
    seats.map((s) => [
      s.seat as Seat,
      new RuleBot(s.name, g * 7919 + s.seat * 131 + 7, 0.3 + s.seat * 0.2),
    ]),
  )
  const evs: DdzEvent[] = []
  const played: Card[] = []
  try {
    await runGame(g, seats, agents, rng, (e) => {
      evs.push(e)
      if (e.t === 'played') played.push(...e.combo.cards)
    }, g % 3)
  } catch (err) {
    fail(`第 ${g} 局抛错：${(err as Error).message}`)
    continue
  }

  const end = evs.find((e) => e.t === 'ended')
  if (!end || end.t !== 'ended') {
    fail(`第 ${g} 局没有结算事件`)
    continue
  }

  // —— 牌守恒 ——
  const remaining = end.revealed.flatMap((x) => x.cards)
  const all = sortCards([...played, ...remaining])
  if (all.length !== 54)
    fail(`第 ${g} 局牌不守恒：打出 ${played.length} + 剩 ${remaining.length} = ${all.length}，应为 54`)
  const seen = new Set(all)
  if (seen.size !== all.length) fail(`第 ${g} 局有重复的牌：${formatRanks(all)}`)

  // —— 赢家必须真的走完了 ——
  const winnerLeft = end.revealed.find((x) => x.seat === end.winner)!.cards.length
  if (winnerLeft !== 0) fail(`第 ${g} 局赢家手里还剩 ${winnerLeft} 张`)

  // —— 积分守恒 ——
  const sum = end.deltas.reduce((a, d) => a + d.delta, 0)
  if (sum !== 0) fail(`第 ${g} 局积分不守恒：${sum}`)
  for (const d of end.deltas) scores[d.seat] += d.delta

  // —— 地主的进出必须是农民的两倍 ——
  const lordDelta = end.deltas.find((d) => d.seat === (evs.find((e) => e.t === 'landlord') as { seat: Seat }).seat)!.delta
  const farmerDelta = end.deltas.find((d) => d.seat !== (evs.find((e) => e.t === 'landlord') as { seat: Seat }).seat)!.delta
  if (lordDelta !== -2 * farmerDelta)
    fail(`第 ${g} 局地主 ${lordDelta} 不是农民 ${farmerDelta} 的负两倍`)

  if (end.landlordWon) landlordWins++
  if (end.spring === 'spring') springs++
  if (end.spring === 'anti') antiSprings++
  maxMultiplier = Math.max(maxMultiplier, end.multiplier)
  for (const e of evs) {
    if (e.t === 'multiplied') e.reason === '王炸' ? rockets++ : bombs++
    if (e.t === 'redeal') redeals++
    if (e.t === 'played' || e.t === 'passed') totalTurns++
  }
}

console.log(`✓ ${GAMES} 局随机对局全部正常结束，牌守恒、积分守恒`)
console.log(`  三家累计积分 ${scores.join(' / ')}，合计 ${scores.reduce((a, b) => a + b, 0)}`)
if (scores.reduce((a, b) => a + b, 0) !== 0) fail('跨局累计积分不为零')

console.log(`  平均每局 ${(totalTurns / GAMES).toFixed(1)} 个回合，最高倍数 ${maxMultiplier}`)
console.log(`  地主胜率 ${((landlordWins / GAMES) * 100).toFixed(1)}%`)

console.log('\n—— 覆盖率（不是统计，是断言）——')
/**
 * 这几个分支在均匀对局里天然稀疏。
 * 数字掉到门槛以下 = 那条代码路径这次根本没被跑到，
 * 而所有用例依然是绿的 —— 这正是最危险的一种"测过了"。
 */
const need = (name: string, got: number, min: number) => {
  if (got < min) fail(`${name} 只出现 ${got} 次，少于 ${min} 次 —— 这条路径的覆盖没了`)
  else console.log(`✓ ${name.padEnd(16)} ${got} 次`)
}
need('炸弹', bombs, 200)
need('王炸', rockets, 40)
need('春天', springs, 3)
need('反春天', antiSprings, 3)
need('重新发牌', redeals, 5)

/** 地主胜率跑到两头去，说明 bot 或者规则有一边坏了 */
const wr = landlordWins / GAMES
if (wr < 0.35 || wr > 0.75)
  fail(`地主胜率 ${(wr * 100).toFixed(1)}% 不在 35%~75% 之间 —— 多半是某一边的 bot 或规则坏了`)
else console.log(`✓ 地主胜率落在合理区间`)

console.log(bad === 0 ? '\n全部通过' : `\n${bad} 项不通过`)
if (bad > 0) process.exit(1)
