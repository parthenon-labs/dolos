import { create } from 'zustand'

/**
 * **呈现状态** —— 桌面上此刻正在显示什么。
 *
 * 和 `game/` 里的逻辑状态刻意分开：逻辑状态是真相，事件一到就更新；
 * 呈现状态由动画队列一步步推进，**允许落后于真相，但不允许和真相冲突**。
 *
 * 这里的字段只描述"画面上看得见的东西"，不参与任何规则判定。
 * 任何需要它来做游戏判定的地方都是设计错了 —— 判定只看逻辑状态。
 */

/** 一枚票：还没投 / 已投但盖着 / 已揭开 */
export type VoteChip = null | 'hidden' | boolean

export type TableView = {
  /** 提名高亮 */
  proposedBy: number | null
  proposedTeam: number[]
  /** 逐个亮起用的进度，0→1 */
  proposeReveal: number

  /** 每个座位一枚票 */
  votes: VoteChip[]
  /** 票面翻开的进度，0=全盖着 1=全翻开 */
  voteFlip: number

  /** 飞向中央的任务牌：from 是座位号，t 是飞行进度 */
  questFlight: { seat: number; t: number }[]
  /** 揭晓的任务结果 */
  questReveal: { fails: number; success: boolean } | null
  /** 结果牌的翻开进度 */
  questFlip: number

  /** 刺杀 */
  assassinTarget: number | null
  /** 0→1：聚焦目标的强度 */
  assassinFocus: number
  assassinResult: 'hit' | 'miss' | null

  /** 压暗除焦点外的一切，0→1。刺杀阶段的戏剧性全靠它 */
  dim: number

  set: (patch: Partial<Omit<TableView, 'set' | 'reset'>>) => void
  reset: () => void
}

const EMPTY = {
  proposedBy: null,
  proposedTeam: [] as number[],
  proposeReveal: 0,
  votes: [] as VoteChip[],
  voteFlip: 0,
  questFlight: [] as { seat: number; t: number }[],
  questReveal: null,
  questFlip: 0,
  assassinTarget: null,
  assassinFocus: 0,
  assassinResult: null,
  dim: 0,
} satisfies Omit<TableView, 'set' | 'reset'>

export const useTableView = create<TableView>((set) => ({
  ...EMPTY,
  set: (patch) => set(patch),
  reset: () => set({ ...EMPTY }),
}))

/**
 * 每帧被动画队列写入的字段用裸对象存，不走 React。
 *
 * 和音量寄存器同一个理由：飞行进度、翻牌进度这类值每帧都在变，
 * 走 zustand 会让整棵树每帧重渲染。
 * React 只订阅"哪些座位在飞牌"这种低频的结构变化，
 * 具体的 t 值由渲染组件在 useFrame 里直接读这里。
 */
export const liveAnim = {
  proposeReveal: 0,
  voteFlip: 0,
  questFlip: 0,
  assassinFocus: 0,
  dim: 0,
  /** seat → 0..1 */
  flight: new Map<number, number>(),
}

export function resetLiveAnim() {
  liveAnim.proposeReveal = 0
  liveAnim.voteFlip = 0
  liveAnim.questFlip = 0
  liveAnim.assassinFocus = 0
  liveAnim.dim = 0
  liveAnim.flight.clear()
}
