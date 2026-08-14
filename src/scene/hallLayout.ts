/**
 * 大厅布局 —— 场景里所有位置的唯一真相来源。
 * 碰撞、渲染、坐下判定全部从这里推导，不允许各自硬编码坐标。
 */

export const HALL = {
  width: 19,
  depth: 15,
  height: 3.7,
}

export const TABLE_RADIUS = 1.05
export const TABLE_HEIGHT = 0.76
export const SEAT_RADIUS = 1.62
/** 坐姿视线高度（相对地面） */
export const EYE_HEIGHT = 1.34
/** 站立视线高度 */
export const STAND_HEIGHT = 1.68
/**
 * 相机比座位再往后一点 —— 相当于"靠在椅背上"。
 * 纯粹是构图需要：贴着桌沿的话桌面会吃掉半个画面。
 */
export const CAMERA_PULLBACK = 1.3

export type TableDef = {
  id: string
  /** 大厅坐标系里的 [x, z] */
  pos: [number, number]
  /** 绕 Y 轴旋转，让每张桌子朝向不同，避免整齐得像考场 */
  rot: number
  seats: number
}

export const TABLES: TableDef[] = [
  { id: 't1', pos: [-4.6, -2.8], rot: 0.34, seats: 5 },
  { id: 't2', pos: [4.3, -3.2], rot: -0.52, seats: 5 },
  { id: 't3', pos: [-4.1, 3.4], rot: 0.95, seats: 5 },
  { id: 't4', pos: [4.8, 3.0], rot: -0.18, seats: 4 },
]

/* ---------------- 座位（桌子局部坐标系） ---------------- */

export function seatAngle(i: number, n: number): number {
  return (i / n) * Math.PI * 2
}

/** 座位在**桌子局部**坐标系里的位置 */
export function seatLocal(i: number, n: number): [number, number, number] {
  const a = seatAngle(i, n)
  return [Math.sin(a) * SEAT_RADIUS, 0, Math.cos(a) * SEAT_RADIUS]
}

/**
 * 让角色面朝桌心。
 * three 默认朝向 -Z；rotation.y = a 时 -Z 正好指向原点。
 */
export function seatFacing(i: number, n: number): number {
  return seatAngle(i, n)
}

/** 桌沿的发光环位置（说话指示器），桌子局部坐标系 */
export function seatRingLocal(i: number, n: number): [number, number, number] {
  const a = seatAngle(i, n)
  const r = TABLE_RADIUS - 0.16
  return [Math.sin(a) * r, TABLE_HEIGHT + 0.011, Math.cos(a) * r]
}

/* ---------------- 局部 → 世界 ---------------- */

export function tableById(id: string): TableDef | undefined {
  return TABLES.find((t) => t.id === id)
}

/** 把桌子局部坐标转成世界坐标 */
export function toWorld(
  table: TableDef,
  local: [number, number, number],
): [number, number, number] {
  const c = Math.cos(table.rot)
  const s = Math.sin(table.rot)
  return [
    table.pos[0] + local[0] * c + local[2] * s,
    local[1],
    table.pos[1] + local[2] * c - local[0] * s,
  ]
}

/** 座位的世界坐标 */
export function seatWorld(table: TableDef, i: number): [number, number, number] {
  return toWorld(table, seatLocal(i, table.seats))
}

/** 坐在该座位时相机的世界坐标（含后拉）和朝向桌心的 yaw */
export function seatedCamera(
  table: TableDef,
  i: number,
): { position: [number, number, number]; yaw: number } {
  const local = seatLocal(i, table.seats)
  const pulled: [number, number, number] = [
    local[0] * CAMERA_PULLBACK,
    EYE_HEIGHT,
    local[2] * CAMERA_PULLBACK,
  ]
  const w = toWorld(table, pulled)
  // 座位朝向桌心是 seatFacing，叠加桌子自身旋转
  return { position: w, yaw: seatFacing(i, table.seats) + table.rot }
}

/** 站起来之后站在哪 —— 座位再往外挪一点，免得站在椅子里 */
export function standingSpot(table: TableDef, i: number): [number, number] {
  const local = seatLocal(i, table.seats)
  const w = toWorld(table, [local[0] * 1.55, 0, local[2] * 1.55])
  return [w[0], w[2]]
}

/* ---------------- 吧台 ---------------- */

/** 吧台的尺寸也放这里 —— 渲染和碰撞必须读同一份数字，否则迟早对不上 */
export const BAR = {
  /** 沿后墙铺开的 x 范围 */
  x0: -9.2,
  x1: -4.6,
  /** 台面中心 z / 酒柜中心 z */
  counterZ: -5.9,
  backZ: -7.18,
  counterH: 1.12,
  /** 吧凳中心线相对台面的偏移 */
  stoolOffset: 0.95,
}

export const BAR_STOOL_X = [BAR.x0 + 1.0, BAR.x0 + 2.3, BAR.x0 + 3.6]

/* ---------------- 碰撞 ---------------- */

export const PLAYER_RADIUS = 0.32

/** 圆形障碍物：桌子（含椅子占地）+ 吧凳 */
export const CIRCLE_OBSTACLES = [
  ...TABLES.map((t) => ({
    x: t.pos[0],
    z: t.pos[1],
    r: SEAT_RADIUS + 0.42,
  })),
  ...BAR_STOOL_X.map((x, i) => ({
    x,
    z: BAR.counterZ + BAR.stoolOffset + (i === 1 ? 0.12 : 0),
    r: 0.3,
  })),
]

/** 方形障碍物。[minX, minZ, maxX, maxZ] */
export const BOX_OBSTACLES: [number, number, number, number][] = [
  // 吧台台身（含台面外沿）
  [BAR.x0 - 0.1, BAR.counterZ - 0.5, BAR.x1 + 0.1, BAR.counterZ + 0.5],
  // 酒柜
  [BAR.x0 - 0.2, -7.5, BAR.x1 + 0.2, BAR.backZ + 0.16],
]
