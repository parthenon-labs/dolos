import type { Agent } from './agent'
import { type PlayerId, type PlayerView, isEvil } from './types'
import { makeRng } from './rules'

/**
 * 规则 bot，作为基线对手。
 *
 * 存在的意义是给 LLM 一把尺子。AvalonBench 里最刺眼的一条结论就是
 * GPT-3.5 当好人的胜率（22%）**低于**规则 bot（38%）——
 * 没有基线的话，"LLM 会玩阿瓦隆"这种话根本无法证伪。
 *
 * 策略刻意保持简单直白：
 *   好人 —— 相信没上过失败任务的人，永远出成功牌
 *   坏人 —— 优先带自己和同伙，在任务里择机破坏
 * 不追求强，追求**可解释**，这样 LLM 输了能看出输在哪。
 */
export class RuleBot implements Agent {
  readonly name: string
  private rng: () => number

  constructor(name: string, seed: number) {
    this.name = name
    this.rng = makeRng(seed)
  }

  /**
   * 嫌疑度。好人唯一的硬信息是：**失败牌一定来自队伍里的某个坏人**。
   *
   * 所以失败任务的队员按 1/队伍人数 分摊嫌疑（队伍越小，嫌疑越集中），
   * 成功任务的队员减一点嫌疑，把失败队伍推上去的人也连带受累。
   * 这套推理很粗糙，但它是"会玩"和"闭着眼睛玩"的分水岭 ——
   * 之前 view 里没有历史，好人胜率只有 2.2%。
   */
  private suspicion(view: PlayerView): number[] {
    const s = new Array(view.playerCount).fill(0)

    for (const q of view.quests) {
      if (q.success) {
        for (const p of q.team) s[p] -= 0.3
      } else {
        const share = q.fails / q.team.length
        for (const p of q.team) s[p] += share * 2
        // 把失败队伍提出来的队长也吃一点嫌疑
        s[q.leader] += 0.3
      }
    }

    // 谁投票支持过后来失败的队伍
    for (const pr of view.proposals) {
      if (!pr.approved) continue
      const q = view.quests.find((x) => x.questIndex === pr.questIndex)
      if (!q || q.success) continue
      pr.votes.forEach((v, i) => {
        if (v) s[i] += 0.25
      })
    }

    // 角色能力给的确定信息压过一切推理
    for (const e of view.knowledge.seesEvil) s[e] += 100
    // 自己当然不怀疑自己
    s[view.me] -= 1000
    for (let i = 0; i < s.length; i++) s[i] += this.rng() * 0.05
    return s
  }

  async proposeTeam(view: PlayerView): Promise<PlayerId[]> {
    const evilMe = isEvil(view.myRole)
    const ids = Array.from({ length: view.playerCount }, (_, i) => i)
    const s = this.suspicion(view)

    // 队长永远把自己算进去：好人是为了保证有一张成功牌，
    // 坏人是为了拿到破坏的机会。动机相反，做法一致。
    const team: PlayerId[] = [view.me]
    const rest = ids.filter((i) => i !== view.me)

    if (evilMe) {
      // 坏人：带一个同伙（够破坏就行，带太多容易被投票否掉），其余带好人凑数
      const allies = view.knowledge.seesEvil
      const wanted = view.needsTwoFails ? 2 : 1
      for (const a of allies.slice(0, wanted)) {
        if (team.length < view.teamSize) team.push(a)
      }
      for (const i of rest) {
        if (team.length >= view.teamSize) break
        if (!team.includes(i) && !allies.includes(i)) team.push(i)
      }
    } else {
      // 好人：按嫌疑度从低到高挑。
      // 梅林同理要收敛 —— 一支完美避开所有坏人的队伍，本身就是在自曝。
      const sorted = rest.sort((a, b) => s[a] - s[b])
      const hide = view.myRole === 'merlin' && view.quests.length === 0
      const pool = hide ? sorted.slice(0, Math.max(2, sorted.length - 1)) : sorted
      for (const i of pool) {
        if (team.length >= view.teamSize) break
        team.push(i)
      }
      for (const i of sorted) {
        if (team.length >= view.teamSize) break
        if (!team.includes(i)) team.push(i)
      }
    }
    return team.slice(0, view.teamSize)
  }

  async vote(view: PlayerView): Promise<boolean> {
    // 第五次提名必须通过，否则坏人不劳而获
    if (view.consecutiveRejects >= 4) return true

    const evilMe = isEvil(view.myRole)
    if (evilMe) {
      // 坏人：队伍里有自己人就同意
      const allies = new Set([view.me, ...view.knowledge.seesEvil])
      const mine = view.team.filter((p) => allies.has(p)).length
      const need = view.needsTwoFails ? 2 : 1
      return mine >= need
    }

    /*
      梅林必须**故意打得不那么优**。

      如果他每次都精确否掉含坏人的队伍，投票记录就是一张写着"我是梅林"的
      名片 —— 实测这样刺客的命中率高达 96%，好人过了三轮任务也照样输。
      所以局势还不紧张的时候，他要放一些有坏人的队伍过去，
      用一点任务失败的风险去换刺杀阶段的存活。
      这是这个游戏最有意思的一层，也是最能拉开 agent 水平的一层。
    */
    const known = new Set(view.knowledge.seesEvil)
    const evilOnTeam = view.team.filter((p) => known.has(p)).length
    if (evilOnTeam > 0) {
      if (view.myRole !== 'merlin') return false
      const failed = view.quests.filter((q) => !q.success).length
      const passed = view.quests.filter((q) => q.success).length
      // 坏人已经拿到两轮、或这是决胜轮，就不再演了，必须否
      if (failed >= 2 || passed >= 2) return false
      // 否则按概率放行，且只放"只混进一个坏人"的队伍
      return evilOnTeam === 1 && this.rng() < 0.55
    }

    const s = this.suspicion(view)
    // 只算别人的嫌疑，自己那 -1000 会把总和拉爆
    const total = view.team.filter((p) => p !== view.me).reduce((a, p) => a + s[p], 0)
    // 阈值取得比较宽松：好人过度否决会把局面推向"五次否决坏人直接赢"
    return total < 1.2
  }

  async questCard(view: PlayerView): Promise<boolean> {
    if (!isEvil(view.myRole)) return true
    // 坏人：能破坏就破坏。第四轮需要两张失败时也照出 ——
    // 基线不做协调，正好把"要不要协调"留给 LLM 去体现差距。
    return false
  }

  /**
   * 刺杀：在非同伙里**均匀随机**挑一个。
   *
   * 一度写成"挑那个最常否决己方队伍的人"，命中率高达 95% —— 但那是假的：
   * 它利用的是**我自己写的梅林**才有的破绽（毫无隐藏地精确否决），
   * 两边都是我的代码，等于基线对自己过拟合，测出来的数字没有意义。
   *
   * 基线的职责是当尺子，不是自己赢。所以这里明确**不建模欺骗**，
   * 随机猜的命中率是 1/好人数，是一条干净的参照线；
   * "梅林藏没藏住"和"刺客推没推出来"因此变成两个独立可测的维度，
   * 整个欺骗博弈的空间都留给 LLM 去证明自己。
   */
  async assassinate(view: PlayerView): Promise<PlayerId> {
    const allies = new Set([view.me, ...view.knowledge.seesEvil])
    const candidates = Array.from({ length: view.playerCount }, (_, i) => i).filter(
      (i) => !allies.has(i),
    )
    if (candidates.length === 0) return 0
    return candidates[Math.floor(this.rng() * candidates.length)]
  }
}
