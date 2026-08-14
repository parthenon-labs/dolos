/**
 * 音量寄存器 —— 整个项目里"声音"和"画面"之间唯一的接缝。
 *
 * 写入方：fakeDriver（本地假数据）或 webrtcDriver（真实音轨）
 * 读取方：Character 组件在 useFrame 里读
 *
 * 刻意用模块级的 Float32Array 而不是 React state：
 * 音量每帧都在变，走 state 会导致每帧重渲染整棵组件树。
 * 画面靠 useFrame 直接读这块内存，React 完全不参与。
 */

export const NUM_SEATS = 5

/** 0..1 的平滑音量，索引 = 座位号 */
const amps = new Float32Array(NUM_SEATS)

export function getAmp(seat: number): number {
  return amps[seat] ?? 0
}

export function setAmp(seat: number, v: number): void {
  if (seat < 0 || seat >= NUM_SEATS) return
  amps[seat] = v < 0 ? 0 : v > 1 ? 1 : v
}

/** 当前音量最大的座位；低于阈值认为没人在说话，返回 -1 */
export function loudestSeat(threshold = 0.08): number {
  let best = -1
  let bestVal = threshold
  for (let i = 0; i < NUM_SEATS; i++) {
    if (amps[i] > bestVal) {
      bestVal = amps[i]
      best = i
    }
  }
  return best
}
