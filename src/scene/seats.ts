/**
 * 座位布局 —— 场景里所有位置的唯一真相来源。
 * 桌子在原点，座位 0 是本地玩家（相机就架在这里）。
 */

export const TABLE_RADIUS = 1.05
export const TABLE_HEIGHT = 0.76
export const SEAT_RADIUS = 1.62
/** 坐姿视线高度（相对地面） */
export const EYE_HEIGHT = 1.34
/**
 * 相机比座位再往后一点 —— 相当于"靠在椅背上"。
 * 纯粹是构图需要：贴着桌沿的话，桌面会吃掉半个画面，
 * 而且两侧的玩家会被 FOV 裁掉。5 人桌必须一眼看全所有人。
 */
export const CAMERA_PULLBACK = 1.3

/** 座位 i 绕桌一周的角度，0 号在 +Z（靠近观众） */
export function seatAngle(i: number, n: number): number {
  return (i / n) * Math.PI * 2
}

export function seatPosition(i: number, n: number): [number, number, number] {
  const a = seatAngle(i, n)
  return [Math.sin(a) * SEAT_RADIUS, 0, Math.cos(a) * SEAT_RADIUS]
}

/**
 * 让角色面朝桌心。
 * three 的默认朝向是 -Z；rotation.y = a 时 -Z 正好指向原点。
 */
export function seatFacing(i: number, n: number): number {
  return seatAngle(i, n)
}

/** 每个座位在桌沿的发光环位置（说话指示器） */
export function seatRingPosition(i: number, n: number): [number, number, number] {
  const a = seatAngle(i, n)
  const r = TABLE_RADIUS - 0.16
  return [Math.sin(a) * r, TABLE_HEIGHT + 0.011, Math.cos(a) * r]
}
