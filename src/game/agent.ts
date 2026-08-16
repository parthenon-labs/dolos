import type { PlayerId, PlayerView } from './types'

/**
 * 一个玩家（人 / 规则 bot / LLM）需要实现的全部接口。
 *
 * 刻意只吃 PlayerView：agent 拿不到完整状态，
 * 所以"AI 作弊"在类型层面就是不可能的 —— 它想偷看也没有东西可偷。
 * 这一点在多个 AI 跑在同一个进程里时尤其重要。
 */
export interface Agent {
  readonly name: string
  /** 提名一支队伍 */
  proposeTeam(view: PlayerView): Promise<PlayerId[]>
  /** 表决是否接受这支队伍 */
  vote(view: PlayerView): Promise<boolean>
  /** 出任务牌，true = 成功。好人只能出成功，引擎会强制 */
  questCard(view: PlayerView): Promise<boolean>
  /** 刺客指认梅林 */
  assassinate(view: PlayerView): Promise<PlayerId>
  /** 发言。返回空串表示这轮不说话 */
  speak?(view: PlayerView): Promise<string>
  /**
   * 想不想发言，0-4。抄自 Google 的 Werewolf Arena：
   *   0 旁听 · 1 有点想说 · 2 有关键内容 · 3 很急 · 4 被点名必须回应
   * 出价最高的下一个说，平手时上一轮被提到的人优先。
   * 自由讨论里"何时插话"是语音 AI 最难的一环，这套是现成答案。
   */
  bid?(view: PlayerView): Promise<number>
}
