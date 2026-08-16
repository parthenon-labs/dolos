/**
 * 大厅布局 —— 场景里所有位置的唯一真相来源。
 * 碰撞、渲染、坐下判定、楼层高度全部从这里推导，不允许各自硬编码坐标。
 *
 * 空间结构：一个长条形两层酒馆。
 *   一层：南端入口 → 中间散台 → 北端壁炉；吧台贴西墙，藏在二楼挑台底下
 *   二层：沿东、西、北三面的 U 形挑台，中间是通高中庭
 *   楼梯：东侧一跑直梯，从南边上到东挑台
 * 中庭是"小世界感"的来源 —— 站在二楼能俯瞰楼下整桌人。
 */

export const HALL = {
  width: 20, // x ∈ [-10, 10]
  depth: 30, // z ∈ [-15, 15]
  height: 7.4,
}

/** 二楼地面标高 */
export const FLOOR2_Y = 3.5
/** 挑台楼板厚度 */
export const SLAB = 0.25

export const TABLE_RADIUS = 1.05
export const TABLE_HEIGHT = 0.76
export const SEAT_RADIUS = 1.62
/** 坐姿视线高度（相对所在楼层地面） */
export const EYE_HEIGHT = 1.34
/** 站立视线高度 */
export const STAND_HEIGHT = 1.68
/** 角色躯干半宽，算出画判定时要把它算进去，不能只看座位中心点 */
const SHOULDER = 0.3
/** 视锥边缘再留一点，别让人贴着画框 */
const FRAME_MARGIN_DEG = 2.5

/**
 * 坐下时相机沿径向后拉多少（相对座位半径的倍数）。
 *
 * **为什么要后拉**：座位均分整圈、人人朝桌心时，最边上那个人的偏轴角
 * 是 `90° − 180°/n`。n=6 就是 60°，远超任何合理的视角 —— 邻座直接出画。
 * 相机往后退能把整桌人压进视锥。
 *
 * 试过、不行的方案：把座位排成弧形。
 * 偏轴角只取决于**角间距**，弧形把 n 个人压进更小的张角，间距反而变小：
 * 6 人排成 180° 弧，邻座从 47° 恶化到 73.8°。而 300° 的弧和整圈是
 * 同一个几何（都是 60° 间距），改了等于没改。
 * 弧形唯一的实际效果是让各座位视野不再等价 —— 在社交推理游戏里
 * 那是把座位变成信息优势，比构图问题严重得多。
 */
function pullbackBySeats(seats: number): number {
  if (seats <= 4) return 1.45
  if (seats === 5) return 1.65
  return 1.8
}

/**
 * 实际用的后拉，受桌子所在位置的净空限制。
 *
 * m3 在挑台北端那条 4.4 米深的连接段上，相机半径超过 2.1 米就会穿出栏杆
 * 悬在中庭上方。**这是宽度不够，不是参数没调好** —— 所以让桌子自己声明上限，
 * 视角那边按实际拿到的后拉去算需要多大 fov。
 */
export function seatedPullback(table: TableDef): number {
  return Math.min(pullbackBySeats(table.seats), table.maxPullback ?? Infinity)
}

/** 最边上那个人（含肩宽和余量）需要多大的**水平半视角**，单位度 */
export function requiredHalfFov(seats: number, pullback: number): number {
  let mx = 0
  for (let j = 1; j < seats; j++) {
    const d = (j / seats) * Math.PI * 2
    const dx = Math.sin(d) * SEAT_RADIUS
    const dz = Math.cos(d) * SEAT_RADIUS - SEAT_RADIUS * pullback
    const dist = Math.hypot(dx, dz)
    const cos = (SEAT_RADIUS * pullback - Math.cos(d) * SEAT_RADIUS) / dist
    const ang = Math.acos(Math.max(-1, Math.min(1, cos))) * (180 / Math.PI)
    mx = Math.max(mx, ang + Math.atan(SHOULDER / dist) * (180 / Math.PI))
  }
  return mx + FRAME_MARGIN_DEG
}

/** 坐下时的垂直 fov 下限 */
export const FOV_SEATED_MIN = 58
/** 上限。再大边缘畸变就明显了 —— 与其硬塞，不如把一桌人数卡在 6 */
export const FOV_SEATED_MAX = 74

/**
 * 坐下时该用多大的垂直 fov。
 *
 * **必须按画面比例实时算，不能写死。** 同一个 63° 在 16:9 下水平半视角
 * 47.5°、在 3:2 下只有 42.6° —— 写死的话换台笔记本或者把窗口拖窄，
 * 边上的人就被切掉了，而这种问题在自己机器上永远复现不出来。
 */
export function seatedFov(seats: number, pullback: number, aspect: number): number {
  const halfH = requiredHalfFov(seats, pullback) * (Math.PI / 180)
  const v = 2 * Math.atan(Math.tan(halfH) / aspect) * (180 / Math.PI)
  return Math.max(FOV_SEATED_MIN, Math.min(FOV_SEATED_MAX, v))
}

/**
 * 一桌最多几个人。
 *
 * **这是呈现层的限制，不是规则限制** —— `game/rules.ts` 支持到 10 人，
 * 那份表是对的，别去动它（7 人基线还要靠它跑）。
 * 卡在 6 是因为再多就得把 fov 推到畸变明显的区间。
 */
export const MAX_SEATS = 6

/* ---------------- 二楼挑台 ---------------- */

/** [minX, minZ, maxX, maxZ]，联合起来是个朝南开口的 U 形 */
export const MEZZ_RECTS: [number, number, number, number][] = [
  [-10, -15, -5.0, 4.0], // 西挑台
  [5.0, -15, 10, 4.0], // 东挑台
  [-5.0, -15, 5.0, -10.6], // 北端连接
]

/** 中庭（通高）在平面上的范围，仅用于渲染判断 */
export const ATRIUM: [number, number, number, number] = [-5.0, -10.6, 5.0, 15]

export function inMezzanine(x: number, z: number): boolean {
  return MEZZ_RECTS.some(([x0, z0, x1, z1]) => x >= x0 && x <= x1 && z >= z0 && z <= z1)
}

/* ---------------- 楼梯 ---------------- */

/** 一跑直梯，沿东墙由南（低）向北（高） */
export const STAIRS = {
  x0: 6.2,
  x1: 9.2,
  zBottom: 12.0,
  zTop: 4.0,
  steps: 20,
}

export function inStairs(x: number, z: number): boolean {
  return x >= STAIRS.x0 && x <= STAIRS.x1 && z >= STAIRS.zTop && z <= STAIRS.zBottom
}

export function stairHeightAt(z: number): number {
  const t = (STAIRS.zBottom - z) / (STAIRS.zBottom - STAIRS.zTop)
  return Math.min(1, Math.max(0, t)) * FLOOR2_Y
}

/* ---------------- 高度场 ---------------- */

/**
 * 给定平面位置和玩家当前所在楼层，返回脚下的地面高度。
 *
 * 一层是"哪儿都能走"，二层只有挑台能走 —— 站在二楼却不在挑台范围内时
 * 这里返回 0，于是和当前高度差出 3.5 米，被下面的台阶限制拦住。
 * **越界、掉下中庭、从楼下直接窜上楼梯顶，全都由这一条规则挡掉**，
 * 不需要给每种情况单独写碰撞体。
 */
export function floorHeightAt(x: number, z: number, level: 0 | 1): number {
  if (inStairs(x, z)) return stairHeightAt(z)
  if (level === 1 && inMezzanine(x, z)) return FLOOR2_Y
  return 0
}

/** 一步能迈多高。比单级台阶高、比任何落差低 */
export const STEP_LIMIT = 0.45

/** 由高度反推楼层，楼梯中段算哪层不重要，过半就算上去了 */
export const levelFromHeight = (y: number): 0 | 1 => (y > FLOOR2_Y * 0.5 ? 1 : 0)

/* ---------------- 桌子 ---------------- */

export type TableDef = {
  id: string
  /** 大厅坐标系里的 [x, z] */
  pos: [number, number]
  /** 绕 Y 轴旋转，让每张桌子朝向不同，避免整齐得像考场 */
  rot: number
  seats: number
  /** 0 = 一层，1 = 二层挑台 */
  floor: 0 | 1
  /** 净空不够时给相机后拉设个上限，见 seatedPullback */
  maxPullback?: number
}

/**
 * 桌子人数是混的，不是全都顶格 —— 大厅里一眼能看出"那桌是满编局"。
 *
 * 挑台上全是 4 人桌：挑台净宽 5 米，6 人桌相机要 2.51 米半径，
 * 会穿到栏杆外面悬在中庭上。这不是可以调参数解决的，是宽度不够。
 */
export const TABLES: TableDef[] = [
  // 一层
  { id: 't1', pos: [-3.0, 8.6], rot: 0.34, seats: 6, floor: 0 },
  { id: 't2', pos: [3.2, 7.0], rot: -0.52, seats: 5, floor: 0 },
  { id: 't3', pos: [-2.6, 0.6], rot: 0.95, seats: 6, floor: 0 },
  { id: 't4', pos: [2.9, -2.4], rot: -0.18, seats: 4, floor: 0 },
  { id: 't5', pos: [-1.2, -7.6], rot: 0.6, seats: 6, floor: 0 },
  // 二层挑台
  { id: 'm1', pos: [-7.4, -1.2], rot: 0.25, seats: 4, floor: 1 },
  { id: 'm2', pos: [7.4, -1.2], rot: -0.3, seats: 4, floor: 1 },
  { id: 'm3', pos: [0, -12.8], rot: 0.1, seats: 4, floor: 1, maxPullback: 1.3 },
]

export const tableFloorY = (t: TableDef) => (t.floor === 1 ? FLOOR2_Y : 0)

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

/** 绕 Y 轴把局部平面坐标转成世界平面坐标 */
export function rotateY(
  lx: number,
  lz: number,
  rot: number,
): [number, number] {
  const c = Math.cos(rot)
  const s = Math.sin(rot)
  return [lx * c + lz * s, -lx * s + lz * c]
}

/** 把桌子局部坐标转成世界坐标（含所在楼层的标高） */
export function toWorld(
  table: TableDef,
  local: [number, number, number],
): [number, number, number] {
  const [wx, wz] = rotateY(local[0], local[2], table.rot)
  return [table.pos[0] + wx, local[1] + tableFloorY(table), table.pos[1] + wz]
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
  const p = seatedPullback(table)
  const pulled: [number, number, number] = [local[0] * p, EYE_HEIGHT, local[2] * p]
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

/**
 * 吧台的尺寸也放这里 —— 渲染和碰撞必须读同一份数字，否则迟早对不上。
 *
 * 几何体按"沿局部 X 铺开、正面朝局部 +Z"来建，再整体旋转摆位。
 * rot 取 90° 的整数倍，这样它的包围盒仍然是轴对齐的，碰撞可以直接用 AABB。
 */
export const BAR = {
  /** 沿西墙纵向铺开，正面朝东（+X） */
  center: [-8.6, 0.5] as [number, number],
  rot: Math.PI / 2,
  length: 8,
  counterH: 1.12,
  /** 局部坐标：台面中心 z / 酒柜中心 z */
  counterZ: 0,
  backZ: -1.28,
  /** 吧凳中心线相对台面的偏移（局部 +Z 方向） */
  stoolOffset: 0.95,
}

export const BAR_STOOL_LOCAL_X = [-2.6, -0.6, 1.4]

/** 吧凳的世界平面坐标 */
export const BAR_STOOLS = BAR_STOOL_LOCAL_X.map((lx, i) => {
  const [wx, wz] = rotateY(lx, BAR.counterZ + BAR.stoolOffset + (i === 1 ? 0.12 : 0), BAR.rot)
  return { x: BAR.center[0] + wx, z: BAR.center[1] + wz }
})

/* ---------------- 碰撞 ---------------- */

export const PLAYER_RADIUS = 0.32

export type CircleObstacle = { x: number; z: number; r: number; level: 0 | 1 }

/** 圆形障碍物：桌子（含椅子占地）+ 吧凳 */
export const CIRCLE_OBSTACLES: CircleObstacle[] = [
  ...TABLES.map((t) => ({
    x: t.pos[0],
    z: t.pos[1],
    r: SEAT_RADIUS + 0.42,
    level: t.floor,
  })),
  ...BAR_STOOLS.map((s) => ({ x: s.x, z: s.z, r: 0.3, level: 0 as const })),
]

export type BoxObstacle = {
  min: [number, number]
  max: [number, number]
  /** 不填 = 两层都挡 */
  level?: 0 | 1
}

/**
 * 把一个点推到所有障碍物之外。
 *
 * 点击寻路时用：直接点在桌子上是很自然的操作，但桌心是走不到的，
 * 不处理的话玩家会顶着桌子一直推。推到最近的可站位置，
 * 语义就变成了"走到那张桌子旁边"，反而更符合预期。
 */
export function nudgeOutOfObstacles(
  x: number,
  z: number,
  level: 0 | 1,
): [number, number] {
  for (const o of CIRCLE_OBSTACLES) {
    if (o.level !== level) continue
    const dx = x - o.x
    const dz = z - o.z
    const d = Math.hypot(dx, dz)
    const min = o.r + PLAYER_RADIUS + 0.08
    if (d < min) {
      if (d < 1e-4) {
        x = o.x + min
        z = o.z
      } else {
        x = o.x + (dx / d) * min
        z = o.z + (dz / d) * min
      }
    }
  }
  for (const box of BOX_OBSTACLES) {
    if (box.level !== undefined && box.level !== level) continue
    const [minX, minZ] = box.min
    const [maxX, maxZ] = box.max
    if (x < minX || x > maxX || z < minZ || z > maxZ) continue
    // 点落在盒子里：往最近的一条边推出去
    const cand: [number, number, number][] = [
      [Math.abs(x - minX), minX - PLAYER_RADIUS - 0.08, z],
      [Math.abs(maxX - x), maxX + PLAYER_RADIUS + 0.08, z],
      [Math.abs(z - minZ), x, minZ - PLAYER_RADIUS - 0.08],
      [Math.abs(maxZ - z), x, maxZ + PLAYER_RADIUS + 0.08],
    ]
    cand.sort((a, b) => a[0] - b[0])
    x = cand[0][1]
    z = cand[0][2]
  }
  return [x, z]
}

export const BOX_OBSTACLES: BoxObstacle[] = [
  // 吧台台身（含台面外沿）与酒柜，整体贴西墙
  { min: [-10, -4.2], max: [-8.0, 5.2], level: 0 },
  // 楼梯两侧的梯帮：只能从上下两端进出，不能从侧面跨上去
  { min: [STAIRS.x0 - 0.22, STAIRS.zTop], max: [STAIRS.x0, STAIRS.zBottom] },
  { min: [STAIRS.x1, STAIRS.zTop], max: [STAIRS.x1 + 0.22, STAIRS.zBottom] },
  // 北端壁炉
  { min: [-1.6, -14.9], max: [1.6, -14.0], level: 0 },
]
