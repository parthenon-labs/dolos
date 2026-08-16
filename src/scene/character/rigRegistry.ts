import type { Gesture, RigHandle } from './rig'

/**
 * 座位 → 角色 rig 的登记表。
 *
 * 动画 cue 需要让"3 号指向 1 号"，但 cue 是纯函数、活在 React 树之外，
 * 拿不到组件 ref。所以走一张模块级的表 —— 和 liveAnim 同一个理由：
 * 高频的、命令式的东西不该硬塞进 React 的数据流。
 *
 * **key 必须带桌号。** 只用座位号的话，大厅里六张桌子的 0 号座位会互相覆盖，
 * `gestureAt(0, …)` 打到的是最后挂载的那一张，且随机 —— 这个 bug 表现为
 * "偶尔有个不相干的人在远处做动作"，几乎不可能靠看画面发现。
 *
 * cue 层只知道座位号（一局游戏只发生在一张桌子上），所以这里维护一个
 * "当前活跃桌"，由玩家落座时设定。
 */
const rigs = new Map<string, RigHandle>()
let activeTable: string | null = null

const key = (tableId: string, seat: number) => `${tableId}:${seat}`

/** 玩家坐在哪张桌子。cue 发出的手势都作用在这张桌上 */
export function setActiveTable(tableId: string | null) {
  activeTable = tableId
}

export function registerRig(tableId: string, seat: number, rig: RigHandle) {
  rigs.set(key(tableId, seat), rig)
}

export function unregisterRig(tableId: string, seat: number) {
  rigs.delete(key(tableId, seat))
}

/**
 * 让活跃桌上的某个座位做个动作。
 *
 * 座位不存在就静默跳过：动画早于角色挂载完成是正常时序（LOD 切换、
 * 模型还在下载），不是错误。为一个手势报错或抛异常得不偿失。
 */
export function gestureAt(seat: number, g: Gesture) {
  if (!activeTable) return
  rigs.get(key(activeTable, seat))?.play(g)
}

/** 让一组座位同时做同一个动作 —— 出牌、集体摊手 */
export function gestureAll(seats: number[], g: Gesture) {
  for (const s of seats) gestureAt(s, g)
}

/** 仅供调试：绕过活跃桌直接指定 */
export function gestureAtTable(tableId: string, seat: number, g: Gesture) {
  rigs.get(key(tableId, seat))?.play(g)
}

export function registeredSeats(): string[] {
  return [...rigs.keys()].sort()
}
