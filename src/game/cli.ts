/**
 * 无头跑阿瓦隆。
 *
 *   npm run game            批量自我对弈，出统计
 *   npm run game -- --trace 跑一局并打印完整过程
 *
 * 存在的意义是**在任何 3D、服务端、语音之前**先回答一个问题：
 * 这个游戏的规则实现对不对，以及 agent 到底会不会玩。
 */
import { RuleBot } from './bots'
import { runGame } from './runner'
import { evilCount } from './rules'
import { type GameConfig, type GameEvent, type Role, isEvil } from './types'

const args = process.argv.slice(2)
const flag = (n: string) => args.includes(`--${n}`)
const opt = (n: string, d: number) => {
  const i = args.indexOf(`--${n}`)
  return i >= 0 ? Number(args[i + 1]) : d
}

const PLAYERS = opt('players', 5)
const GAMES = opt('games', 2000)

const config = (seed: number): GameConfig => ({
  playerCount: PLAYERS,
  optionalRoles: PLAYERS >= 7 ? ['percival', 'morgana'] : ['percival', 'morgana'],
  seed,
})

const ROLE_CN: Record<Role, string> = {
  merlin: '梅林', percival: '派西维尔', servant: '忠臣',
  assassin: '刺客', morgana: '莫甘娜', mordred: '莫德雷德',
  oberon: '奥伯伦', minion: '爪牙',
}

function describe(e: GameEvent, roles: Role[]): string {
  switch (e.t) {
    case 'started':
      return `开局，角色：${roles.map((r, i) => `${i}=${ROLE_CN[r]}`).join(' ')}；${e.firstLeader} 号先当队长`
    case 'proposed':
      return `  ${e.leader} 号提名队伍 [${e.team.join(', ')}]`
    case 'voted': {
      const yes = e.votes.map((v, i) => (v ? i : -1)).filter((i) => i >= 0)
      const passed = yes.length * 2 > e.votes.length
      return `  表决：同意 ${yes.length}/${e.votes.length}（${yes.join(',')}）→ ${passed ? '通过' : '否决'}`
    }
    case 'vote_failed':
      return `  连续否决 ${e.consecutiveRejects} 次`
    case 'quest_played':
      return `  任务 ${e.questIndex + 1}：失败牌 ${e.fails} 张 → ${e.success ? '成功' : '失败'}`
    case 'speech':
      return `  ${e.player} 号：${e.text}`
    case 'assassinated':
      return `刺杀 ${e.target} 号 → ${e.wasMerlin ? '正是梅林！' : '不是梅林'}`
    case 'ended':
      return `结束：${e.winner === 'good' ? '好人胜' : '坏人胜'}（${e.reason}）`
  }
}

async function main() {
  const agents = (roles: Role[]) => roles.map((_, i) => new RuleBot(`P${i}`, 1000 + i))

  if (flag('trace')) {
    const r = await runGame(config(opt('seed', 42)), agents)
    console.log(`\n=== ${PLAYERS} 人局 · 种子 ${opt('seed', 42)} ===\n`)
    for (const e of r.events) console.log(describe(e, r.roles))
    console.log(`\n非法动作次数：${r.illegalActions}\n`)
    return
  }

  console.log(`\n跑 ${GAMES} 局 ${PLAYERS} 人自我对弈（规则 bot 互打）…\n`)
  let good = 0
  let illegal = 0
  let reachedAssassination = 0
  let assassinHit = 0
  const reasons: Record<string, number> = {}
  const t0 = Date.now()

  for (let i = 0; i < GAMES; i++) {
    const r = await runGame(config(i), agents)
    if (r.winner === 'good') good++
    illegal += r.illegalActions
    reasons[r.reason] = (reasons[r.reason] ?? 0) + 1
    // 刺杀是**和任务阶段独立的一个能力维度**，必须分开统计：
    // 一个 agent 可能很会打任务却藏不住梅林，反过来也一样。
    const shot = r.events.find((e) => e.t === 'assassinated')
    if (shot && shot.t === 'assassinated') {
      reachedAssassination++
      if (shot.wasMerlin) assassinHit++
    }
  }

  const ms = Date.now() - t0
  console.log(`好人胜率  ${((good / GAMES) * 100).toFixed(1)}%  (${good}/${GAMES})`)
  console.log(`坏人胜率  ${(((GAMES - good) / GAMES) * 100).toFixed(1)}%`)
  console.log(`\n结束原因：`)
  for (const [k, v] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(24)} ${((v / GAMES) * 100).toFixed(1)}%`)
  }
  if (reachedAssassination > 0) {
    const goodCount = PLAYERS - evilCount(PLAYERS)
    const chance = (1 / goodCount) * 100
    console.log(`\n好人过三轮  ${((reachedAssassination / GAMES) * 100).toFixed(1)}%  （打进刺杀阶段）`)
    console.log(
      `刺客命中率  ${((assassinHit / reachedAssassination) * 100).toFixed(1)}%` +
        `  （随机基准 ${chance.toFixed(1)}% = 1/${goodCount}）`,
    )
  }
  console.log(`\n非法动作总数 ${illegal}（规则 bot 应为 0）`)
  console.log(`耗时 ${ms}ms，${(GAMES / (ms / 1000)).toFixed(0)} 局/秒\n`)

  // 自检：坏人数量、角色分布必须符合规则
  const r = await runGame(config(7), agents)
  const evil = r.roles.filter(isEvil).length
  const expect = evilCount(PLAYERS)
  console.log(
    `自检 · 坏人数量 ${evil}/${expect} ${evil === expect ? '✓' : '✗'}` +
      ` · 梅林 ${r.roles.filter((x) => x === 'merlin').length} ${r.roles.filter((x) => x === 'merlin').length === 1 ? '✓' : '✗'}` +
      ` · 刺客 ${r.roles.filter((x) => x === 'assassin').length} ${r.roles.filter((x) => x === 'assassin').length === 1 ? '✓' : '✗'}\n`,
  )
}

main()
