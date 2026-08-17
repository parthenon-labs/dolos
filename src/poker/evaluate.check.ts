/**
 * 牌力评估的用例检查：`npm run check:poker`
 *
 * 这是整个项目里**唯一算错就会直接把玩家的钱分错**的地方，
 * 所以用例铺得比别处密：每个类别的边界、A 的两种用法、
 * 踢脚牌比较、以及必须精确相等的平局。
 *
 * 平局尤其重要 —— 德扑里相等意味着分池，"差不多相等"会让筹码凭空多出来或少掉。
 */
import { formatCards, parseCards } from './cards'
import { HAND_NAMES, describe, evaluate } from './evaluate'

let bad = 0
const fail = (msg: string) => {
  console.log(`✗ ${msg}`)
  bad++
}
const ok = (msg: string) => console.log(`✓ ${msg}`)

/** 类别判定 */
function cat(name: string, hand: string, expect: number) {
  const r = evaluate(parseCards(hand))
  if (r.category !== expect) {
    fail(`${name}：${hand} → 判成「${HAND_NAMES[r.category]}」，应为「${HAND_NAMES[expect]}」`)
  } else {
    console.log(`✓ ${name.padEnd(26)} ${hand.padEnd(24)} ${describe(r)}`)
  }
}

/** a 必须严格大于 b */
function beats(name: string, a: string, b: string) {
  const ra = evaluate(parseCards(a))
  const rb = evaluate(parseCards(b))
  if (ra.score <= rb.score) {
    fail(`${name}：${a}（${describe(ra)}）应大于 ${b}（${describe(rb)}）`)
  } else {
    console.log(`✓ ${name.padEnd(26)} ${describe(ra)} > ${describe(rb)}`)
  }
}

/** a 和 b 必须精确相等（平局要分池） */
function ties(name: string, a: string, b: string) {
  const ra = evaluate(parseCards(a))
  const rb = evaluate(parseCards(b))
  if (ra.score !== rb.score) {
    fail(`${name}：${a} 与 ${b} 应平局，实际 ${ra.score} vs ${rb.score}`)
  } else {
    console.log(`✓ ${name.padEnd(26)} 平局 ${describe(ra)}`)
  }
}

console.log('—— 类别判定 ——')
cat('同花顺', 'Ts Js Qs Ks As 2h 3d', 8)
cat('最小同花顺（轮子）', 'As 2s 3s 4s 5s 9h Kd', 8)
cat('四条', '9s 9h 9d 9c 2s 3h 4d', 7)
cat('葫芦', 'Ks Kh Kd 2s 2h 7d 9c', 6)
cat('同花', '2s 5s 9s Js Ks 3h 4d', 5)
cat('顺子', '5h 6d 7s 8c 9h 2s 3d', 4)
cat('轮子顺（A 当 1）', 'Ah 2d 3s 4c 5h Kd Qs', 4)
cat('三条', '7s 7h 7d 2s 5h 9c Jd', 3)
cat('两对', 'Js Jh 4d 4c 9s 2h 7d', 2)
cat('一对', 'As Ah 2d 5c 9s Jh 3d', 1)
cat('高牌', 'As Kh 9d 7c 4s 2h 3d', 0)

console.log('\n—— 边界：容易写错的地方 ——')
// 轮子必须是最小的顺子。把 A 当高牌算的话它会变成最大的
beats('普通顺 > 轮子顺', '2h 3d 4s 5c 6h 9s Kd', 'Ah 2d 3s 4c 5h 9s Kd')
beats('同花顺 > 四条', '2s 3s 4s 5s 6s Ah Ad', '9s 9h 9d 9c Ah Kd 2s')
beats('四条 > 葫芦', '9s 9h 9d 9c 2h 3d 4s', 'Ks Kh Kd As Ah 2d 3s')
beats('葫芦 > 同花', '2s 2h 2d 3s 3h 9c Jd', 'As Ks Qs Js 9s 2h 3d')
beats('同花 > 顺子', '2s 5s 9s Js Ks 3h 4d', '5h 6d 7s 8c 9h 2s 3d')
// 七张里同时成顺子和同花时必须选同花。
// 这手牌：黑桃 2/5/6/7/8 成同花，同时 5-6-7-8-9 成顺子 —— 必须判成同花
cat('顺子同花并存时选同花', '5s 6s 7s 8s 2s 9h Td', 5)
beats('同花(8高) > 顺子(9高)', '5s 6s 7s 8s 2s 9h Td', '5h 6d 7s 8c 9h 2s 3d')

console.log('\n—— 踢脚牌 ——')
beats('对子相同比踢脚', 'As Ah Kd 5c 3s 2h 7d', 'As Ah Qd 5c 3s 2h 7d')
beats('两对相同比第五张', 'Js Jh 4d 4c As 2h 3d', 'Js Jh 4d 4c Ks 2h 3d')
beats('同花比第二大', 'As Ks 9s 5s 3s 2h 4d', 'As Qs 9s 5s 3s 2h 4d')

console.log('\n—— 踢脚牌必须出现在描述里 ——')
// 两家同为「两对 Q 和 8」但踢脚不同时，描述必须能区分 ——
// 否则摊牌界面上一个赢一个输却写着同样的字，玩家只会认为引擎乱判
{
  const a = describe(evaluate(parseCards('Jd 8h 8c 3c 2c Qc Qs')))
  const b = describe(evaluate(parseCards('6d 8d 8c 3c 2c Qc Qs')))
  if (a === b) fail(`踢脚不同但描述相同：两家都写「${a}」`)
  else ok(`踢脚可区分：${a}　vs　${b}`)
}

console.log('\n—— 平局（必须精确相等）——')
ties('公共牌成手，两家平分', 'As Ks Qs Js Ts 2h 3d', 'As Ks Qs Js Ts 7c 8d')
ties('花色不影响大小', '2s 2h 5d 9c Ks 3h 4d', '2d 2c 5s 9h Kh 3s 4c')
ties('第六七张不参与比较', 'As Ah Kd Qc Js 2h 3d', 'As Ah Kd Qc Js 9h 8d')

console.log('\n—— 穷举自检 ——')
// 随机对局里不该出现任何异常分数：类别必须落在 0-8，best 必须正好 5 张
import { freshDeck, shuffle } from './cards'
let rngState = 12345
const rng = () => {
  rngState = (rngState * 1103515245 + 12345) & 0x7fffffff
  return rngState / 0x7fffffff
}
let checked = 0
for (let i = 0; i < 20000; i++) {
  const d = shuffle(freshDeck(), rng).slice(0, 7)
  const r = evaluate(d)
  if (r.category < 0 || r.category > 8) fail(`异常类别 ${r.category}：${formatCards(d)}`)
  if (r.best.length !== 5) fail(`best 不是 5 张：${formatCards(d)}`)
  // best 必须真的来自这七张
  if (!r.best.every((c) => d.includes(c))) fail(`best 里有不属于该手牌的牌：${formatCards(d)}`)
  checked++
}
console.log(`✓ 随机 ${checked} 手牌，类别、张数、来源均正常`)

console.log(bad === 0 ? '\n全部通过' : `\n${bad} 项不通过`)
if (bad > 0) process.exit(1)
