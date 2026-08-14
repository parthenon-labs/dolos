/**
 * 音量寄存器 —— 整个项目里"声音"和"画面"之间唯一的接缝。
 *
 * 写入方：fakeDriver（本地假数据）或 webrtcDriver（真实音轨）
 * 读取方：Character 组件在 useFrame 里读
 *
 * 刻意用模块级的 Map 而不是 React state：
 * 音量每帧都在变，走 state 会导致每帧重渲染整棵组件树。
 * 画面靠 useFrame 直接读这块内存，React 完全不参与。
 *
 * 键是 "tableId:seat" —— 大厅里同时有好几桌在说话。
 */

const amps = new Map<string, number>()

export const ampKey = (tableId: string, seat: number) => `${tableId}:${seat}`

export function getAmp(tableId: string, seat: number): number {
  return amps.get(ampKey(tableId, seat)) ?? 0
}

export function setAmpByKey(key: string, v: number): void {
  amps.set(key, v < 0 ? 0 : v > 1 ? 1 : v)
}

export function clearAmp(key: string): void {
  amps.delete(key)
}

/** 某张桌子上音量最大的座位键；低于阈值认为无人说话 */
export function loudestAt(
  tableId: string,
  seatCount: number,
  threshold = 0.12,
): string | null {
  let best: string | null = null
  let bestVal = threshold
  for (let i = 0; i < seatCount; i++) {
    const k = ampKey(tableId, i)
    const v = amps.get(k) ?? 0
    if (v > bestVal) {
      bestVal = v
      best = k
    }
  }
  return best
}
