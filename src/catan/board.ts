/**
 * 卡坦岛的棋盘。
 *
 * **几何和图结构是同一份数据**：把每块地的六个角按坐标算出来、去重，
 * 得到的既是画 SVG 要的点，也是"哪个路口挨着哪个路口"的邻接表。
 * 分成两套迟早会对不上 —— 界面上看着挨着，规则判定说不挨着，
 * 这种 bug 找起来要命。
 *
 * 标准盘：19 块地，边长 2 的六边形排列。
 */

export type Resource = 'brick' | 'lumber' | 'wool' | 'grain' | 'ore'
export type Terrain = Resource | 'desert'

export const RESOURCES: Resource[] = ['brick', 'lumber', 'wool', 'grain', 'ore']

export const TERRAIN_NAMES: Record<Terrain, string> = {
  brick: '丘陵',
  lumber: '森林',
  wool: '牧场',
  grain: '农田',
  ore: '山地',
  desert: '沙漠',
}
export const RESOURCE_NAMES: Record<Resource, string> = {
  brick: '砖',
  lumber: '木',
  wool: '羊',
  grain: '麦',
  ore: '矿',
}
export const TERRAIN_COLORS: Record<Terrain, string> = {
  brick: '#a4572f',
  lumber: '#28583a',
  wool: '#9dbb5c',
  grain: '#c9a227',
  ore: '#6b6f78',
  desert: '#a89570',
}

export type Hex = {
  id: number
  q: number
  r: number
  terrain: Terrain
  /** 沙漠没有数字 */
  number: number | null
  cx: number
  cy: number
}

export type Vertex = {
  id: number
  x: number
  y: number
  /** 挨着的地块。产出就看这几块 */
  hexes: number[]
  /** 相邻路口 */
  adj: number[]
  /** 连出去的路 */
  edges: number[]
  /** 挨着的港口，null 表示不是码头 */
  port: Port | null
}

export type Edge = {
  id: number
  a: number
  b: number
}

/** 港口。generic 是三换一，指定资源的是二换一 */
export type Port = { kind: 'generic' | Resource }

export type Board = {
  hexes: Hex[]
  vertices: Vertex[]
  edges: Edge[]
  /** 强盗在哪块地上 */
  robber: number
}

/** 尖顶六边形。边长取 1，界面再统一缩放 */
const SIZE = 1
const SQRT3 = Math.sqrt(3)

const hexCenter = (q: number, r: number) => ({
  cx: SIZE * SQRT3 * (q + r / 2),
  cy: SIZE * 1.5 * r,
})

const corner = (cx: number, cy: number, i: number) => {
  const a = ((60 * i - 30) * Math.PI) / 180
  return { x: cx + SIZE * Math.cos(a), y: cy + SIZE * Math.sin(a) }
}

/**
 * 浮点坐标当 key 用，必须先量化成整数。
 *
 * **不能用 toFixed**：`(-1e-16).toFixed(3)` 是 `"-0.000"`，而 `(0).toFixed(3)` 是 `"0.000"` ——
 * 同一个点算出来的两个坐标只差一个符号位，就变成了两个不同的路口。
 * 第一版正是这么写的，54 个路口变成 56 个、72 条路变成 76 条，
 * 还冒出四个度数为 4 的路口 —— 六边形网格里根本不存在这种点。
 * `| 0` 顺手把 -0 归成 0。
 */
const key = (x: number, y: number) => `${Math.round(x * 1000) | 0}:${Math.round(y * 1000) | 0}`

/** 标准盘的地形配比。19 块 = 4 森林 4 牧场 4 农田 3 丘陵 3 山地 1 沙漠 */
const TERRAIN_BAG: Terrain[] = [
  ...Array(4).fill('lumber'),
  ...Array(4).fill('wool'),
  ...Array(4).fill('grain'),
  ...Array(3).fill('brick'),
  ...Array(3).fill('ore'),
  'desert',
]
/** 18 个数字标记。没有 7 —— 7 是强盗 */
const NUMBER_BAG = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12]

const shuffle = <T,>(xs: T[], rng: () => number): T[] => {
  const a = xs.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** 港口配比：4 个三换一 + 5 种资源各一个二换一 */
const PORT_BAG: Port[] = [
  { kind: 'generic' },
  { kind: 'generic' },
  { kind: 'generic' },
  { kind: 'generic' },
  { kind: 'brick' },
  { kind: 'lumber' },
  { kind: 'wool' },
  { kind: 'grain' },
  { kind: 'ore' },
]

export function makeBoard(rng: () => number): Board {
  // 轴坐标半径 2 的六边形
  const coords: { q: number; r: number }[] = []
  for (let q = -2; q <= 2; q++)
    for (let r = -2; r <= 2; r++) if (Math.abs(q + r) <= 2) coords.push({ q, r })

  /**
   * 地形和数字都洗牌，但有一条官方约束：**两个红字（6 和 8）不能相邻**。
   * 不管它的话偶尔会开出一局某个路口同时吃 6 和 8，那个位置强到没得玩。
   * 做法是洗到满足为止 —— 冲突的概率不高，几次就出来了。
   */
  let hexes: Hex[] = []
  for (let attempt = 0; attempt < 200; attempt++) {
    const terrains = shuffle(TERRAIN_BAG, rng)
    const numbers = shuffle(NUMBER_BAG, rng)
    let ni = 0
    hexes = coords.map(({ q, r }, id) => {
      const terrain = terrains[id]
      const { cx, cy } = hexCenter(q, r)
      return {
        id,
        q,
        r,
        terrain,
        number: terrain === 'desert' ? null : numbers[ni++],
        cx,
        cy,
      }
    })
    if (!hasAdjacentReds(hexes)) break
  }

  // 顶点：所有地块的角，按坐标去重
  const vmap = new Map<string, Vertex>()
  const hexCorners: number[][] = []
  for (const h of hexes) {
    const ids: number[] = []
    for (let i = 0; i < 6; i++) {
      const { x, y } = corner(h.cx, h.cy, i)
      const k = key(x, y)
      let v = vmap.get(k)
      if (!v) {
        v = { id: vmap.size, x, y, hexes: [], adj: [], edges: [], port: null }
        vmap.set(k, v)
      }
      v.hexes.push(h.id)
      ids.push(v.id)
    }
    hexCorners.push(ids)
  }
  const vertices = [...vmap.values()].sort((a, b) => a.id - b.id)

  // 边：每块地的六条棱，按端点对去重
  const emap = new Map<string, Edge>()
  for (const ids of hexCorners) {
    for (let i = 0; i < 6; i++) {
      const a = ids[i]
      const b = ids[(i + 1) % 6]
      const k = a < b ? `${a}-${b}` : `${b}-${a}`
      if (emap.has(k)) continue
      const e: Edge = { id: emap.size, a, b }
      emap.set(k, e)
    }
  }
  const edges = [...emap.values()].sort((a, b) => a.id - b.id)
  for (const e of edges) {
    vertices[e.a].adj.push(e.b)
    vertices[e.b].adj.push(e.a)
    vertices[e.a].edges.push(e.id)
    vertices[e.b].edges.push(e.id)
  }

  placePorts(vertices, shuffle(PORT_BAG, rng))

  return { hexes, vertices, edges, robber: hexes.findIndex((h) => h.terrain === 'desert') }
}

/** 6 和 8 是出现频率最高的两个数字，官方规则禁止它们相邻 */
function hasAdjacentReds(hexes: Hex[]): boolean {
  const red = (h: Hex) => h.number === 6 || h.number === 8
  for (const a of hexes) {
    if (!red(a)) continue
    for (const b of hexes) {
      if (a.id >= b.id || !red(b)) continue
      const dq = a.q - b.q
      const dr = a.r - b.r
      // 轴坐标的六个邻居方向
      if (Math.abs(dq) <= 1 && Math.abs(dr) <= 1 && Math.abs(dq + dr) <= 1) return true
    }
  }
  return false
}

/**
 * 沿海岸放九个港口。
 *
 * **和官方盘面的港口位置不完全一致**：官方是印死在板子上的，
 * 而这里的盘面每局重开都不一样，硬套那套坐标没有意义。
 * 做法是把外圈路口排成一个环，等距取九对相邻的点。
 * 数量、种类、二换一/三换一的配比都按官方，只有位置是这局自己的。
 */
function placePorts(vertices: Vertex[], ports: Port[]) {
  // 外圈：只挨着一两块地的路口
  const coast = vertices.filter((v) => v.hexes.length <= 2)
  // 按极角排成一圈，才能"等距取"
  const cx = coast.reduce((a, v) => a + v.x, 0) / coast.length
  const cy = coast.reduce((a, v) => a + v.y, 0) / coast.length
  const ring = coast
    .slice()
    .sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx))

  const step = ring.length / ports.length
  for (let i = 0; i < ports.length; i++) {
    const a = ring[Math.floor(i * step) % ring.length]
    if (a.port) continue
    // 一个港口占两个**相邻**的岸边路口。环上的下一个不一定真挨着
    // （外圈拐角处会跳过一个），所以按邻接表找，找不到就只占一个
    const b = ring.find((v) => !v.port && v.id !== a.id && a.adj.includes(v.id))
    a.port = ports[i]
    if (b) b.port = ports[i]
  }
}

/** 某个路口能拿到哪些港口汇率 */
export function portRates(v: Vertex): { generic: boolean; resources: Resource[] } {
  if (!v.port) return { generic: false, resources: [] }
  return v.port.kind === 'generic'
    ? { generic: true, resources: [] }
    : { generic: false, resources: [v.port.kind] }
}
