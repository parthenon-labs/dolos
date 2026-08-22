/**
 * 斗地主牌型的检查：`npm run check:ddz`
 *
 * 这个文件盯的是**"这堆牌是什么"和"谁压得住谁"**。
 * 斗地主没有筹码守恒那样的天然不变量兜底，牌型认错的后果是
 * 一手本该压不住的牌打了出去，而且当场没人看得出来 —— 所以用例要密，
 * 而且随机部分必须检查结构性质，不能只检查"没崩"。
 */
import { RANK_LABELS, formatRanks, freshDeck, makeCard, shuffle, type Card } from './cards'
import { beats, candidates, describeCombo, parse, type Combo, type ComboType } from './combo'

let bad = 0
const fail = (msg: string) => {
  console.log(`✗ ${msg}`)
  bad++
}

/**
 * 用牌面写牌，方便写用例："3 3 3 4" / "小王 大王"。
 * 同一个牌面出现几次就自动换花色 —— 斗地主不看花色，但牌是不同的实体。
 */
function hand(s: string): Card[] {
  const used = new Map<number, number>()
  return s.trim().split(/\s+/).map((tok) => {
    const r = RANK_LABELS.indexOf(tok)
    if (r < 0) throw new Error(`看不懂的牌：${tok}`)
    const k = used.get(r) ?? 0
    used.set(r, k + 1)
    return makeCard(r, k)
  })
}

function is(name: string, s: string, type: ComboType, len = 1) {
  const c = parse(hand(s))
  if (!c) return fail(`${name}：${s} 应是${type}，却认不出来`)
  if (c.type !== type || c.len !== len)
    return fail(`${name}：${s} → ${c.type}/${c.len}，应为 ${type}/${len}`)
  console.log(`✓ ${name.padEnd(18)} ${s.padEnd(26)} ${describeCombo(c)}`)
}

function no(name: string, s: string) {
  const c = parse(hand(s))
  if (c) return fail(`${name}：${s} 不该是牌型，却认成了 ${describeCombo(c)}`)
  console.log(`✓ ${name.padEnd(18)} ${s.padEnd(26)} 不成牌型`)
}

function over(name: string, a: string, b: string) {
  const ca = parse(hand(a))
  const cb = parse(hand(b))
  if (!ca || !cb) return fail(`${name}：${a} 或 ${b} 认不出牌型`)
  if (!beats(ca, cb)) return fail(`${name}：${a} 应能压住 ${b}`)
  if (beats(cb, ca)) return fail(`${name}：${b} 反过来也压住了 ${a} —— 大小关系不反对称`)
  console.log(`✓ ${name.padEnd(18)} ${describeCombo(ca)} 压 ${describeCombo(cb)}`)
}

function cannot(name: string, a: string, b: string) {
  const ca = parse(hand(a))
  const cb = parse(hand(b))
  if (!ca || !cb) return fail(`${name}：${a} 或 ${b} 认不出牌型`)
  if (beats(ca, cb)) return fail(`${name}：${a} 不该压得住 ${b}`)
  console.log(`✓ ${name.padEnd(18)} ${describeCombo(ca)} 压不住 ${describeCombo(cb)}`)
}

console.log('—— 基本牌型 ——')
is('单张', '7', 'single')
is('对子', '9 9', 'pair')
is('三张', 'K K K', 'trio')
is('三带一', 'K K K 4', 'trio_single')
is('三带一对', 'K K K 4 4', 'trio_pair')
is('炸弹', '6 6 6 6', 'bomb')
is('王炸', '小王 大王', 'rocket')
is('三个 2', '2 2 2', 'trio')

console.log('\n—— 顺子与连对 ——')
is('五张顺子', '3 4 5 6 7', 'straight', 5)
is('到 A 的顺子', '10 J Q K A', 'straight', 5)
is('十二张顺子', '3 4 5 6 7 8 9 10 J Q K A', 'straight', 12)
no('四张不成顺', '3 4 5 6')
no('顺子不能带 2', '10 J Q K A 2')
no('顺子不能绕回来', 'J Q K A 3')
is('三连对', '5 5 6 6 7 7', 'straight_pair', 3)
no('两连对不够', '5 5 6 6')
no('连对不能带 2', 'K K A A 2 2')
no('连对不能断', '5 5 6 6 8 8')

console.log('\n—— 飞机 ——')
is('飞机不带', '7 7 7 8 8 8', 'plane', 2)
is('飞机带单', '7 7 7 8 8 8 3 4', 'plane_single', 2)
is('飞机带对', '7 7 7 8 8 8 3 3 4 4', 'plane_pair', 2)
is('三连飞机', '7 7 7 8 8 8 9 9 9', 'plane', 3)
is('三连带单', '7 7 7 8 8 8 9 9 9 3 4 5', 'plane_single', 3)
no('飞机不能含 2', 'A A A 2 2 2')
no('飞机不能断', '7 7 7 9 9 9')
no('带的牌不能是炸弹', '7 7 7 8 8 8 5 5 5 5')
no('两个炸弹不是飞机带单', '7 7 7 7 8 8 8 8')
is('长的优先：四连读成飞机', '7 7 7 8 8 8 9 9 9 10 10 10', 'plane', 4)

console.log('\n—— 四带二 ——')
is('四带两张单', '6 6 6 6 3 9', 'four_two_singles')
is('四带一对当两张单', '6 6 6 6 3 3', 'four_two_singles')
is('四带两对', '6 6 6 6 3 3 9 9', 'four_two_pairs')
no('四带两张不成对', '6 6 6 6 3 3 9 10')
no('三带两张散牌', 'K K K 4 5')

console.log('\n—— 大小关系 ——')
over('单张比大小', '2', 'A')
over('大王最大', '大王', '2')
over('对子比大小', '2 2', 'A A')
over('三带一只看三张', '9 9 9 3', '8 8 8 A')
over('顺子比最大那张', '4 5 6 7 8', '3 4 5 6 7')
cannot('顺子长度不同不能比', '3 4 5 6 7 8', '4 5 6 7 8')
over('炸弹压任何非炸弹', '3 3 3 3', '2 2 2 2 2'.slice(0, 5))
over('炸弹压四带二', '3 3 3 3', '6 6 6 6 3 9')
over('大炸弹压小炸弹', '9 9 9 9', '6 6 6 6')
over('王炸压炸弹', '小王 大王', '2 2 2 2')
cannot('炸弹压不住王炸', '2 2 2 2', '小王 大王')
cannot('四带二不是炸弹', '6 6 6 6 3 9', '2 2')
cannot('同一张牌压不住自己', '9 9', '9 9')

console.log('\n—— 随机检查：枚举出来的打法必须真的能打 ——')
let rngState = 20260822
const rng = () => ((rngState = (rngState * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)

/** 多重集包含：打出的牌必须真的在手里，且不能一张当两张用 */
function subsetOf(part: Card[], whole: Card[]): boolean {
  const pool = whole.slice()
  for (const c of part) {
    const i = pool.indexOf(c)
    if (i < 0) return false
    pool.splice(i, 1)
  }
  return true
}

/**
 * 上家的牌**不能靠随机切几张碰运气** —— 随机切出来的牌九成认不出牌型，
 * 真正走到"必须压住"那条路径的轮次会少得可怜（第一版只有 1500 轮里的 310 轮）。
 * 改成从另一副手牌里枚举出一个合法打法当上家 —— 覆盖率是设计出来的，不是撞出来的。
 */
function randomCombo(deck: Card[], from: number, rand: () => number): Combo | null {
  const pool = deck.slice(from, from + 17)
  const all = candidates(pool, null)
  if (all.length === 0) return null
  return all[Math.floor(rand() * all.length)]
}

let enumerated = 0
let withReq = 0
const typesSeen = new Set<ComboType>()
for (let i = 0; i < 3000; i++) {
  const deck = shuffle(freshDeck(), rng)
  const h = deck.slice(0, 17)
  const req = i % 2 === 0 ? null : randomCombo(deck, 17, rng)
  if (req) {
    withReq++
    typesSeen.add(req.type)
  }

  for (const c of candidates(h, req)) {
    enumerated++
    typesSeen.add(c.type)
    if (!subsetOf(c.cards, h))
      fail(`枚举出了手上没有的牌：${formatRanks(c.cards)}（手牌 ${formatRanks(h)}）`)
    const re = parse(c.cards)
    if (!re) fail(`枚举出的牌自己都认不出来：${formatRanks(c.cards)}`)
    else if (re.type !== c.type || re.rank !== c.rank || re.len !== c.len)
      fail(`枚举的牌型和重新识别的不一致：${formatRanks(c.cards)} ${c.type} vs ${re.type}`)
    if (!beats(c, req))
      fail(`枚举出了压不住的打法：${formatRanks(c.cards)} 压不住 ${req && describeCombo(req)}`)
  }
}
console.log(`✓ 3000 副随机手牌，共枚举 ${enumerated} 种打法（其中 ${withReq} 轮需要压上家），全部合法`)

/**
 * 覆盖率本身也是一条断言。
 * 十四种牌型必须**每一种都在随机流里出现过** —— 少一种就说明枚举漏了一整类，
 * 而这种漏法不会让任何用例变红，只会让人以为测过了。
 */
const ALL_TYPES: ComboType[] = [
  'single', 'pair', 'trio', 'trio_single', 'trio_pair',
  'straight', 'straight_pair', 'plane', 'plane_single', 'plane_pair',
  'four_two_singles', 'four_two_pairs', 'bomb', 'rocket',
]
const missing = ALL_TYPES.filter((t) => !typesSeen.has(t))
if (missing.length) fail(`随机流里从没出现过这些牌型，覆盖有洞：${missing.join('、')}`)
else console.log(`✓ 十四种牌型在随机流里全部出现过`)

console.log('\n—— 随机检查：大小关系必须是严格偏序 ——')
let pairsChecked = 0
for (let i = 0; i < 6000; i++) {
  const deck = shuffle(freshDeck(), rng)
  const a = randomCombo(deck, 0, rng)
  const b = randomCombo(deck, 17, rng)
  if (!a || !b) continue
  if (beats(a, b) && beats(b, a))
    fail(`互相压得住：${describeCombo(a)} 与 ${describeCombo(b)}`)
  if (beats(a, a)) fail(`自己压得住自己：${describeCombo(a)}`)
  // 传递性：找第三个来夹一下
  const c = randomCombo(deck, 34, rng)
  if (c && beats(a, b) && beats(b, c) && !beats(a, c))
    fail(`不传递：${describeCombo(a)} > ${describeCombo(b)} > ${describeCombo(c)}，但 a 压不住 c`)
  pairsChecked++
}
console.log(`✓ ${pairsChecked} 组随机牌型，反对称、非自反、传递都成立`)

console.log(bad === 0 ? '\n全部通过' : `\n${bad} 项不通过`)
if (bad > 0) process.exit(1)
