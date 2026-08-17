/**
 * 防泄漏层的用例检查：`npm run check:leak`
 *
 * 这一层的价值全在**边界**上：它必须拦住"说真话的自曝"，
 * 同时放行"假称身份"—— 后者是阿瓦隆的合法战术，拦掉等于把游戏玩坏了。
 * 光读代码判断不了这条边界有没有被改歪，所以固化成用例。
 *
 * 没引测试框架是有意的：和 `npm run game` 一样是个能直接跑的脚本，
 * 依赖越少越不容易在半年后烂掉。
 */
import { detectLeak } from './llmAgent'
import type { PlayerView, Role } from './types'

const view = (myRole: Role, seesEvil: number[], seesPair: number[] = []): PlayerView =>
  ({
    me: 0,
    myRole,
    playerCount: 6,
    knowledge: { seesEvil, seesMerlinOrMorgana: seesPair },
    phase: 'proposal',
    leader: 0,
    team: [],
    questResults: [],
    consecutiveRejects: 0,
    lastVotes: null,
    proposals: [],
    quests: [],
    teamSize: 2,
    needsTwoFails: false,
    transcript: [],
    winner: null,
  }) as PlayerView

/**
 * [用例名, 视图, 发言, 应该被拦下吗]
 *
 * **注意两套编号**：view 里的 seesEvil 是引擎的 0 起始 PlayerId，
 * 发言文本里是玩家和模型嘴里的 1 起始座位号。
 * 所以 seesEvil=[2,5] 对应的发言是"3 号""6 号"。
 * 这两个用例组存在的意义就是钉死这条转换 —— 它错了整层会静默偏一位。
 */
const cases: [string, PlayerView, string, boolean][] = [
  ['梅林确定点名坏人', view('merlin', [2, 5]), '我确定 3 号是坏人，因为我看得到坏人是谁。', true],
  ['梅林如实自曝', view('merlin', [2, 5]), '我是梅林，6 号跟我不是一边的，信我。', true],
  ['坏人确定点名同伙', view('assassin', [3]), '我知道 4 号一定是好人，别怀疑他。', true],
  ['坏人一次说出全部同伙', view('morgana', [1, 4]), '2 号和 5 号同时在队里我不放心。', true],

  // 下面这些**必须放行**。拦掉的话游戏就没法玩了
  ['忠臣假称是梅林', view('servant', []), '我是梅林，信我。', false],
  ['梅林不确定地怀疑', view('merlin', [2, 5]), '3 号刚才那票投得很奇怪。', false],
  ['声称手里是失败牌', view('assassin', [3]), '我手里是失败牌，这轮我不上。', false],
  ['普通推理', view('merlin', [2, 5]), '连续否决太多了，再拖下去我们直接输。', false],
  // 偏一位的回归用例：说的是 2 号（=PlayerId 1），不在 seesEvil=[2,5] 里，必须放行。
  // 转换写错时这一条会被误拦
  ['确定语气但点的不是坏人', view('merlin', [2, 5]), '我确定 2 号没问题。', false],
]

let bad = 0
for (const [name, v, text, shouldBlock] of cases) {
  const reason = detectLeak(v, text)
  const blocked = reason !== null
  const ok = blocked === shouldBlock
  if (!ok) bad++
  console.log(
    `${ok ? '✓' : '✗'} ${name.padEnd(22)} ${blocked ? '拦下' : '放行'}  ${reason ?? ''}`,
  )
}
console.log(bad === 0 ? '\n全部符合预期' : `\n${bad} 条不符合预期`)
// 非零退出码，将来接 CI 不用改
if (bad > 0) process.exit(1)
