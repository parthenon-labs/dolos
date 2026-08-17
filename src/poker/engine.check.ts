/**
 * 下注引擎与边池的用例检查：`npm run check:engine`
 *
 * 重点全在 all-in 上。边池只在 all-in 时出现，而 all-in 在随机对局里
 * 出现得不够密 —— 所以必须专门造局面。
 *
 * 最后那个随机压力测试查的是**筹码守恒**：
 * 一手牌前后所有人的筹码总和必须相等，一分都不能多、不能少。
 * 这一条能兜住绝大多数分池 bug，因为分错钱几乎必然破坏守恒。
 */
import { parseCards } from './cards'
import { applyAction, legalActions, seatOf, startHand } from './engine'
import { buildPots, awardPots } from './pots'
import { RuleBot } from './agent'
import { nextButton, runHand } from './table'
import type { HandState, PlayerState, Seat } from './types'

let bad = 0
const fail = (m: string) => {
  console.log(`✗ ${m}`)
  bad++
}
const ok = (m: string) => console.log(`✓ ${m}`)
const eq = (name: string, got: unknown, want: unknown) => {
  const a = JSON.stringify(got)
  const b = JSON.stringify(want)
  if (a === b) ok(`${name}`)
  else fail(`${name}\n    实际 ${a}\n    应为 ${b}`)
}

/* ---------------- 边池分层 ---------------- */

const P = (seat: Seat, total: number, folded = false): PlayerState =>
  ({
    seat, name: `P${seat}`, color: '#888', isAI: true,
    stack: 0, committed: 0, totalCommitted: total,
    cards: [], folded, allIn: false, sittingOut: false,
  }) as PlayerState

console.log('—— 边池分层 ——')

eq(
  '三人不同 all-in：主池 + 两个边池',
  buildPots([P(0, 100), P(1, 50), P(2, 20)]),
  [
    { amount: 60, eligible: [0, 1, 2] }, // 20×3
    { amount: 60, eligible: [0, 1] },    // 30×2
    { amount: 50, eligible: [0] },       // 50×1
  ],
)

eq(
  '投入相同则只有一个主池',
  buildPots([P(0, 50), P(1, 50), P(2, 50)]),
  [{ amount: 150, eligible: [0, 1, 2] }],
)

// 最容易写错的一条：弃牌的人钱留在池里，但没资格争。
// 这里两层的有资格者都是 [0,1]，所以会被合并成一个池 —— 合并是有意的，
// 否则界面上会出现一堆资格相同、分开显示毫无意义的小池。
// 关键是**总额必须是 240**（100+100+40），2 号的 40 不能丢
eq(
  '弃牌者的钱留在池里但无资格',
  buildPots([P(0, 100), P(1, 100), P(2, 40, true)]),
  [{ amount: 240, eligible: [0, 1] }],
)

// 资格不同的层必须分开。
// 这里 1 号投了 60 但弃牌了，所以 40 那层的资格是 [0,2]，
// 60 和 100 那层只剩 [0] —— 资格变了，不能合并
eq(
  '资格不同的层不合并',
  buildPots([P(0, 100), P(1, 60, true), P(2, 40)]),
  [
    { amount: 120, eligible: [0, 2] }, // 40×3
    { amount: 80, eligible: [0] },     // 20×2 + 40×1，资格相同故合并
  ],
)

eq(
  '短码弃牌后钱仍进主池',
  buildPots([P(0, 30), P(1, 30), P(2, 10, true)]),
  [{ amount: 70, eligible: [0, 1] }],
)

/* ---------------- 分配与零头 ---------------- */

console.log('\n—— 分配 ——')

{
  const pots = buildPots([P(0, 100), P(1, 50), P(2, 20)])
  // 2 号牌最大，但他只能拿主池
  const scores = new Map<Seat, number>([[0, 10], [1, 20], [2, 30]])
  const won = awardPots(pots, scores, [0, 1, 2])
  eq('短码赢牌只能拿主池', [...won.entries()].sort(), [[0, 50], [1, 60], [2, 60]])
}

{
  // 奇数底池两人平分：零头给钮位左手最近的赢家
  const pots = [{ amount: 101, eligible: [0, 1] }]
  const won = awardPots(pots, new Map([[0, 5], [1, 5]]), [1, 0])
  eq('奇数底池零头给钮位左手', [...won.entries()].sort(), [[0, 50], [1, 51]])
  const total = [...won.values()].reduce((a, b) => a + b, 0)
  if (total !== 101) fail(`零头分配后总额是 ${total}，应为 101`)
  else ok('零头分配后筹码守恒')
}

/* ---------------- 下注流程 ---------------- */

console.log('\n—— 下注流程 ——')

const seats = (n: number, stack = 200) =>
  Array.from({ length: n }, (_, i) => ({
    seat: i, name: `P${i}`, color: '#888', isAI: true, stack,
  }))

const rng = (() => {
  let x = 999
  return () => ((x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
})()

{
  const s = startHand({ smallBlind: 1, bigBlind: 2, startingStack: 200 }, seats(6), 0, 1, rng)
  eq('六人局：小盲在钮位左手', seatOf(s, 1).totalCommitted, 1)
  eq('六人局：大盲在小盲左手', seatOf(s, 2).totalCommitted, 2)
  eq('六人局：翻牌前枪口先说话', s.turn, 3)
  eq('起手要跟到大盲', s.toCall, 2)
}

{
  // 单挑规则和多人局相反，是最常写错的地方
  const s = startHand({ smallBlind: 1, bigBlind: 2, startingStack: 200 }, seats(2), 0, 1, rng)
  eq('单挑：钮位是小盲', seatOf(s, 0).totalCommitted, 1)
  eq('单挑：另一人是大盲', seatOf(s, 1).totalCommitted, 2)
  eq('单挑：翻牌前钮位先说话', s.turn, 0)
}

{
  const s = startHand({ smallBlind: 1, bigBlind: 2, startingStack: 200 }, seats(3), 0, 1, rng)
  const l = legalActions(s, s.turn!)!
  eq('起手最小加注到 = 大盲 ×2', l.minRaiseTo, 4)
  eq('起手不能过牌', l.canCheck, false)
  eq('跟注要付 2', l.callAmount, 2)
}

{
  // all-in 不足最小加注量时不重开下注权
  const s = startHand({ smallBlind: 1, bigBlind: 2, startingStack: 200 }, seats(3), 0, 1, rng)
  seatOf(s, 0).stack = 3 // 钮位是短码
  applyAction(s, 0, { kind: 'raise', to: 10 }) // 只有 3，会被压成 all-in 3
  eq('筹码不足时加注降级为 all-in', seatOf(s, 0).allIn, true)
  eq('不足额 all-in 只抬高跟注额', s.toCall, 3)
  eq('不足额 all-in 不改变最小加注增量', s.minRaise, 2)
}

/* ---------------- 随机压力测试：筹码守恒 ---------------- */

console.log('\n—— 随机压力测试 ——')

function randomAction(s: HandState, seat: Seat, r: () => number) {
  const l = legalActions(s, seat)!
  const roll = r()
  if (l.canCheck && roll < 0.45) return { kind: 'check' as const }
  if (roll < 0.15 && l.canFold) return { kind: 'fold' as const }
  if ((l.canBet || l.canRaise) && roll > 0.8) {
    const span = l.maxRaiseTo - l.minRaiseTo
    return { kind: (l.canBet ? 'bet' : 'raise') as 'bet' | 'raise',
             to: l.minRaiseTo + Math.floor(r() * (span + 1)) }
  }
  if (l.canCall) return { kind: 'call' as const }
  return { kind: 'check' as const }
}

let hands = 0
let allInHands = 0
let sidePotHands = 0
const stress = (() => {
  let x = 4242
  return () => ((x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
})()

for (let i = 0; i < 4000; i++) {
  const n = 2 + Math.floor(stress() * 5)
  // 故意用参差不齐的筹码量，逼出边池
  const table = Array.from({ length: n }, (_, k) => ({
    seat: k, name: `P${k}`, color: '#888', isAI: true,
    stack: 10 + Math.floor(stress() * 200),
  }))
  const before = table.reduce((a, p) => a + p.stack, 0)

  let s: HandState
  try {
    s = startHand({ smallBlind: 1, bigBlind: 2, startingStack: 200 }, table, i % n, i, stress)
  } catch {
    continue // 有筹码的人不足两个，跳过
  }

  let guard = 0
  while (!s.finished && guard++ < 500) {
    const seat = s.turn
    if (seat === null) break
    applyAction(s, seat, randomAction(s, seat, stress))
  }
  if (!s.finished) {
    fail(`第 ${i} 手牌没有结束（可能死循环）`)
    break
  }

  const after = s.players.reduce((a, p) => a + p.stack, 0)
  if (after !== before) {
    fail(`第 ${i} 手牌筹码不守恒：开局 ${before}，结束 ${after}`)
    break
  }
  if (s.players.some((p) => p.stack < 0)) {
    fail(`第 ${i} 手牌出现负筹码`)
    break
  }

  hands++
  if (s.players.some((p) => p.allIn)) allInHands++
  if (s.pots.length > 1) sidePotHands++
}

ok(`${hands} 手随机牌局全部结束且筹码守恒`)
console.log(`  其中含 all-in ${allInHands} 手，产生边池 ${sidePotHands} 手`)
if (sidePotHands < 50) fail('边池样本太少，这轮压力测试没有真正覆盖到边池')

/* ---------------- 连续多手：会话层 ---------------- */

console.log('\n—— 连续多手（钮位轮转 + 筹码回写）——')

{
  const table = Array.from({ length: 6 }, (_, k) => ({
    seat: k, name: `P${k}`, color: '#888', isAI: true, stack: 200,
  }))
  const startTotal = table.reduce((a, p) => a + p.stack, 0)
  const agents = new Map(
    table.map((s) => [s.seat, new RuleBot(s.name, s.seat * 7919 + 13, 0.3 + s.seat / 12)]),
  )
  const r = (() => {
    let x = 77
    return () => ((x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  })()

  let button = 0
  let played = 0
  let broke = 0
  const buttons = new Set<number>()

  for (let h = 1; h <= 400; h++) {
    if (table.filter((p) => p.stack > 0).length < 2) {
      broke = h
      break
    }
    button = nextButton(table, button)
    buttons.add(button)
    const res = await runHand(
      { smallBlind: 1, bigBlind: 2, startingStack: 200 },
      table, button, h, agents, r,
    )
    for (const s of table) {
      const p = res.state.players.find((x) => x.seat === s.seat)
      if (p) s.stack = p.stack
    }
    if (table.some((p) => p.stack < 0)) {
      fail(`第 ${h} 手后出现负筹码`)
      break
    }
    const total = table.reduce((a, p) => a + p.stack, 0)
    if (total !== startTotal) {
      fail(`第 ${h} 手后筹码不守恒：${total}，应为 ${startTotal}`)
      break
    }
    played++
  }

  ok(`连打 ${played} 手，全程筹码守恒（总量恒为 ${startTotal}）`)
  // 钮位必须转遍所有座位，否则某些位置永远轮不到盲注
  if (buttons.size < 6 && broke === 0) {
    fail(`钮位只到过 ${buttons.size} 个座位，应为 6`)
  } else {
    ok(`钮位轮转覆盖 ${buttons.size} 个座位`)
  }
  // bot 之间应该有输赢分化 —— 全都恰好 200 说明根本没在打
  const spread = Math.max(...table.map((p) => p.stack)) - Math.min(...table.map((p) => p.stack))
  if (spread === 0) fail('所有人筹码完全相同，牌局可能没有真正进行')
  else ok(`筹码分化正常，最大最小相差 ${spread}`)
}

console.log(bad === 0 ? '\n全部通过' : `\n${bad} 项不通过`)
if (bad > 0) process.exit(1)
void parseCards
