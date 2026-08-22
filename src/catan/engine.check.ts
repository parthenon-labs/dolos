/**
 * 卡坦岛的检查：`npm run check:catan`
 *
 * 卡坦的规则面比前两个游戏宽得多，用例根本铺不满。所以这里几乎全押在不变量上：
 *
 * - **资源守恒** —— 每种资源在场上永远是 19 张（银行 + 所有人手上）。
 *   产出、抢劫、弃牌、换银行、垄断、盖东西，任何一处漏了都会破坏它。
 *   这是这个游戏的"筹码守恒"
 * - **发展卡守恒** —— 25 张，牌堆 + 手上 + 打出去的
 * - **组件守恒** —— 每人 15 条路 5 个村庄 4 座城市，摆出去的加上剩下的必须对得上
 * - **距离规则** —— 任何时刻都不该有两个相邻路口同时有建筑
 * - **样本量** —— 掷 7、弃牌、垄断、修路、最长路、最大军、港口交易这些分支
 *   在随机对局里出现得不密，得盯着次数
 */
import { RESOURCES, makeBoard } from './board'
import { RuleBot } from './bot'
import { longestRoadFor, publicVp, totalVp, VP_TO_WIN } from './engine'
import { runGame } from './runner'
import type { CatanEvent, Seat } from './types'

let bad = 0
const fail = (msg: string) => {
  if (bad < 12) console.log(`✗ ${msg}`)
  bad++
}

let rngState = 20260822
const rng = () => ((rngState = (rngState * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)

console.log('—— 棋盘 ——')
for (let i = 0; i < 400; i++) {
  const b = makeBoard(rng)
  if (b.hexes.length !== 19) fail(`地块 ${b.hexes.length} 块，应为 19`)
  if (b.vertices.length !== 54) fail(`路口 ${b.vertices.length} 个，应为 54`)
  if (b.edges.length !== 72) fail(`路 ${b.edges.length} 条，应为 72`)
  // 六边形网格里路口的度数只可能是 2 或 3
  if (b.vertices.some((v) => v.adj.length < 2 || v.adj.length > 3))
    fail('有路口的邻居数不是 2 或 3 —— 坐标去重出问题了')
  if (b.vertices.filter((v) => v.port).length !== 18) fail('港口不是 9 个（18 个路口）')
  const nums = b.hexes.map((h) => h.number).filter((n): n is number => n !== null)
  if (nums.length !== 18) fail(`数字标记 ${nums.length} 个，应为 18`)
  if (nums.includes(7)) fail('数字标记里出现了 7')
}
console.log('✓ 400 副随机棋盘：19 地块 / 54 路口 / 72 路 / 9 港口，度数与数字分布正常')

console.log('\n—— 随机对局 ——')
const GAMES = 300
const seats = [
  { seat: 0, name: 'Ultimo', color: '#9a6b3f', isAI: true },
  { seat: 1, name: 'Broadway', color: '#4a6a7a', isAI: true },
  { seat: 2, name: 'Haymarket', color: '#7a4a5f', isAI: true },
  { seat: 3, name: 'Dysart', color: '#5f7a4a', isAI: true },
]

const seen = {
  sevens: 0,
  discards: 0,
  robberSteals: 0,
  monopoly: 0,
  roadBuilding: 0,
  yearOfPlenty: 0,
  knights: 0,
  longestRoad: 0,
  largestArmy: 0,
  cities: 0,
  portTrades: 0,
  bankTrades: 0,
}
let totalSteps = 0
let totalTurns = 0
/**
 * 真正被检查过的局数。
 *
 * 第一版没有这个数：跑不完的局在守恒检查之前就 continue 掉了，
 * 而末尾照样打印"资源守恒、发展卡守恒、组件守恒，全部成立"。
 * 300 局全部没跑完的那次，这句话依然出现在屏幕上 ——
 * **报了一句从来没验过的结论**，这比测试挂掉危险得多。
 */
let audited = 0
const winsBySeat = [0, 0, 0, 0]

for (let g = 1; g <= GAMES; g++) {
  const agents = new Map(
    seats.map((s) => [s.seat as Seat, new RuleBot(s.name, g * 7919 + s.seat * 131 + 7, 0.3 + s.seat * 0.15)]),
  )
  const evs: CatanEvent[] = []
  let r
  try {
    r = await runGame(seats, agents, rng, (e) => evs.push(e))
  } catch (err) {
    fail(`第 ${g} 局抛错：${(err as Error).message}`)
    continue
  }
  const s = r.state
  totalSteps += r.steps

  if (r.winner === null) {
    fail(`第 ${g} 局没分出胜负（跑了 ${r.steps} 步）`)
    continue
  }
  winsBySeat[r.winner]++
  if (totalVp(s, r.winner) < VP_TO_WIN)
    fail(`第 ${g} 局赢家只有 ${totalVp(s, r.winner)} 分，不到 ${VP_TO_WIN}`)

  audited++

  // —— 资源守恒 ——
  for (const res of RESOURCES) {
    const total = s.bank[res] + s.players.reduce((a, p) => a + p.hand[res], 0)
    if (total !== 19) fail(`第 ${g} 局 ${res} 不守恒：场上共 ${total} 张，应为 19`)
  }

  // —— 发展卡守恒 ——
  const held = s.players.reduce((a, p) => a + p.dev.length, 0)
  const played = evs.filter((e) => e.t === 'played_dev').length
  if (s.devDeck.length + held + played !== 25)
    fail(`第 ${g} 局发展卡不守恒：牌堆 ${s.devDeck.length} + 手上 ${held} + 打出 ${played}`)

  // —— 组件守恒 ——
  for (const p of s.players) {
    const roads = s.roads.filter((o) => o === p.seat).length
    const setts = s.buildings.filter((b) => b?.owner === p.seat && b.kind === 'settlement').length
    const cities = s.buildings.filter((b) => b?.owner === p.seat && b.kind === 'city').length
    if (roads + p.roadsLeft !== 15) fail(`第 ${g} 局 ${p.name} 的路不守恒：${roads}+${p.roadsLeft}`)
    if (setts + p.settlementsLeft !== 5)
      fail(`第 ${g} 局 ${p.name} 的村庄不守恒：${setts}+${p.settlementsLeft}`)
    if (cities + p.citiesLeft !== 4)
      fail(`第 ${g} 局 ${p.name} 的城市不守恒：${cities}+${p.citiesLeft}`)
  }

  // —— 距离规则 ——
  for (let v = 0; v < s.buildings.length; v++) {
    if (!s.buildings[v]) continue
    if (s.board.vertices[v].adj.some((n) => s.buildings[n]))
      fail(`第 ${g} 局有两个相邻路口同时有建筑（${v}）`)
  }

  // —— 最长路不可能超过自己路的条数 ——
  for (const p of s.players) {
    const owned = s.roads.filter((o) => o === p.seat).length
    const len = longestRoadFor(s, p.seat)
    if (len > owned) fail(`第 ${g} 局 ${p.name} 的最长路 ${len} 超过了他的路数 ${owned}`)
  }
  if (s.longestRoad && s.longestRoad.len < 5)
    fail(`第 ${g} 局最长路只有 ${s.longestRoad.len} 条却发了奖`)
  if (s.largestArmy && s.largestArmy.n < 3)
    fail(`第 ${g} 局最大军只有 ${s.largestArmy.n} 张骑士却发了奖`)

  // —— 公开分不能超过真实分 ——
  for (const p of s.players)
    if (publicVp(s, p.seat) > totalVp(s, p.seat))
      fail(`第 ${g} 局 ${p.name} 的公开分比真实分还高`)

  for (const e of evs) {
    switch (e.t) {
      case 'rolled': if (e.sum === 7) seen.sevens++; totalTurns++; break
      case 'discarded': seen.discards++; break
      case 'robber_moved': if (e.stole?.res) seen.robberSteals++; break
      case 'played_dev':
        if (e.card === 'monopoly') seen.monopoly++
        if (e.card === 'road_building') seen.roadBuilding++
        if (e.card === 'year_of_plenty') seen.yearOfPlenty++
        if (e.card === 'knight') seen.knights++
        break
      case 'longest_road': seen.longestRoad++; break
      case 'largest_army': seen.largestArmy++; break
      case 'built': if (e.what === 'city') seen.cities++; break
      case 'bank_traded': seen.bankTrades++; if (e.rate < 4) seen.portTrades++; break
    }
  }
}

console.log(`✓ ${GAMES} 局四人对局全部分出胜负`)
console.log(`  平均每局 ${(totalTurns / GAMES).toFixed(0)} 个回合、${(totalSteps / GAMES).toFixed(0)} 步动作`)
if (audited < GAMES) fail(`只有 ${audited}/${GAMES} 局跑到了守恒检查，其余的连检查都没做`)
else console.log(`  资源守恒、发展卡守恒、组件守恒、距离规则，${audited} 局全部成立`)
console.log(`  各座位胜率 ${winsBySeat.map((w) => `${((w / GAMES) * 100).toFixed(0)}%`).join(' / ')}`)

console.log('\n—— 覆盖率（不是统计，是断言）——')
const need = (name: string, got: number, min: number) => {
  if (got < min) fail(`${name} 只出现 ${got} 次，少于 ${min} 次 —— 这条路径的覆盖没了`)
  else console.log(`✓ ${name.padEnd(14)} ${got} 次`)
}
need('掷出 7', seen.sevens, 300)
need('弃牌', seen.discards, 100)
need('强盗抢到牌', seen.robberSteals, 200)
need('骑士', seen.knights, 200)
need('垄断', seen.monopoly, 20)
need('修路卡', seen.roadBuilding, 20)
need('丰收卡', seen.yearOfPlenty, 20)
need('最长路易主', seen.longestRoad, 100)
need('最大军易主', seen.largestArmy, 50)
need('升城市', seen.cities, 300)
need('换银行', seen.bankTrades, 200)
need('港口优惠汇率', seen.portTrades, 20)

/**
 * 先手优势是卡坦的老问题，但**四家胜率不该差太多** ——
 * 差得离谱说明摆放顺序或者产出算错了，而不是策略差异
 */
const worst = Math.min(...winsBySeat) / GAMES
const best = Math.max(...winsBySeat) / GAMES
if (best > 0.45 || worst < 0.1)
  fail(`座位胜率失衡：最高 ${(best * 100).toFixed(0)}%、最低 ${(worst * 100).toFixed(0)}%`)
else console.log('✓ 四个座位的胜率没有失衡')

console.log(bad === 0 ? '\n全部通过' : `\n${bad} 项不通过`)
if (bad > 0) process.exit(1)
