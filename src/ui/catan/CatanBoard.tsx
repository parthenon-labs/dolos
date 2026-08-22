import { useMemo } from 'react'
import { RESOURCE_NAMES, TERRAIN_COLORS, TERRAIN_NAMES, type Board } from '../../catan/board'
import type { Building, Seat } from '../../catan/types'

/**
 * 棋盘。
 *
 * **几何全部来自引擎那份 board**：六边形的角就是引擎里的路口，
 * 路就是引擎里的边。界面这边一个坐标都不自己算 ——
 * 画出来挨着但规则说不挨着，是这类游戏最难查的一种 bug。
 *
 * 尺寸用 viewBox 交给 SVG 缩放，所以这里的数字都是"棋盘单位"，
 * 和屏幕像素无关。
 */

const K = 100 // 棋盘单位 → SVG 单位

export function CatanBoard({
  board,
  buildings,
  roads,
  colors,
  legalVertices,
  legalEdges,
  legalHexes,
  onVertex,
  onEdge,
  onHex,
}: {
  board: Board
  buildings: (Building | null)[]
  roads: (Seat | null)[]
  colors: Record<Seat, string>
  legalVertices?: Set<number>
  legalEdges?: Set<number>
  legalHexes?: Set<number>
  onVertex?: (v: number) => void
  onEdge?: (e: number) => void
  onHex?: (h: number) => void
}) {
  /** 每块地的六个角，按绕中心的角度排好，才能连成多边形 */
  const hexPolys = useMemo(
    () =>
      board.hexes.map((h) => {
        const corners = board.vertices
          .filter((v) => v.hexes.includes(h.id))
          .slice()
          .sort((a, b) => Math.atan2(a.y - h.cy, a.x - h.cx) - Math.atan2(b.y - h.cy, b.x - h.cx))
        return corners.map((v) => `${(v.x * K).toFixed(1)},${(v.y * K).toFixed(1)}`).join(' ')
      }),
    [board],
  )

  /** 港口按对象归组：同一个港口的两个路口共享同一个 Port 对象 */
  const ports = useMemo(() => {
    const groups = new Map<object, typeof board.vertices>()
    for (const v of board.vertices)
      if (v.port) groups.set(v.port, [...(groups.get(v.port) ?? []), v])
    const cx = board.vertices.reduce((a, v) => a + v.x, 0) / board.vertices.length
    const cy = board.vertices.reduce((a, v) => a + v.y, 0) / board.vertices.length
    return [...groups.entries()].map(([port, vs]) => {
      const mx = vs.reduce((a, v) => a + v.x, 0) / vs.length
      const my = vs.reduce((a, v) => a + v.y, 0) / vs.length
      const d = Math.hypot(mx - cx, my - cy) || 1
      // 朝外推。推的距离固定，不按比例 —— 按比例的话角上的港口会飞出画布
      const out = 0.42
      const p = port as { kind: string }
      return {
        label: p.kind === 'generic' ? '3:1' : `2:1 ${RESOURCE_NAMES[p.kind as never]}`,
        ax: vs[0].x * K,
        ay: vs[0].y * K,
        bx: vs[vs.length - 1].x * K,
        by: vs[vs.length - 1].y * K,
        lx: (mx + ((mx - cx) / d) * out) * K,
        ly: (my + ((my - cy) / d) * out) * K,
      }
    })
  }, [board])

  const xs = board.vertices.map((v) => v.x * K)
  const ys = board.vertices.map((v) => v.y * K)
  // 留出港口标签的位置。第一版留 34，角上的港口被裁掉半个
  const pad = 60
  const minX = Math.min(...xs) - pad
  const minY = Math.min(...ys) - pad
  const w = Math.max(...xs) - minX + pad
  const h = Math.max(...ys) - minY + pad

  return (
    <svg className="catan-board" viewBox={`${minX} ${minY} ${w} ${h}`}>
      <defs>
        {/* 海。整块底色比逐块画水便宜得多，也更像一张桌上的板子 */}
        <radialGradient id="sea" cx="50%" cy="42%">
          <stop offset="0%" stopColor="#1d3038" />
          <stop offset="100%" stopColor="#0e181d" />
        </radialGradient>
      </defs>
      <rect x={minX} y={minY} width={w} height={h} fill="url(#sea)" rx="18" />

      {/*
        港口。
        一个港口占两个路口，**标签只能画一次** —— 第一版每个路口画一个，
        两个字重叠在一起谁也看不清。这里按港口对象归组，
        画在两点连线的中点、并朝棋盘外侧推出去，免得压在地块上。
      */}
      {ports.map((p, i) => (
        <g key={`port${i}`} className="catan-portmark">
          <line x1={p.ax} y1={p.ay} x2={p.lx} y2={p.ly} />
          <line x1={p.bx} y1={p.by} x2={p.lx} y2={p.ly} />
          <text x={p.lx} y={p.ly + 3.5} textAnchor="middle">
            {p.label}
          </text>
        </g>
      ))}

      {board.hexes.map((hex, i) => (
        <g
          key={hex.id}
          className={`catan-hex${legalHexes?.has(hex.id) ? ' pickable' : ''}`}
          onClick={legalHexes?.has(hex.id) ? () => onHex?.(hex.id) : undefined}
        >
          <polygon points={hexPolys[i]} fill={TERRAIN_COLORS[hex.terrain]} />
          {hex.number !== null && (
            <>
              <circle cx={hex.cx * K} cy={hex.cy * K} r="17" className="numtoken" />
              <text
                x={hex.cx * K}
                y={hex.cy * K + 6}
                textAnchor="middle"
                className={`numlabel${hex.number === 6 || hex.number === 8 ? ' red' : ''}`}
              >
                {hex.number}
              </text>
              {/* 点数：6 和 8 五个点，2 和 12 一个点。真板子上就是这么印的 */}
              <text x={hex.cx * K} y={hex.cy * K + 16} textAnchor="middle" className="pips">
                {'·'.repeat(6 - Math.abs(7 - hex.number))}
              </text>
            </>
          )}
          {hex.terrain === 'desert' && (
            <text x={hex.cx * K} y={hex.cy * K + 5} textAnchor="middle" className="desert-label">
              {TERRAIN_NAMES.desert}
            </text>
          )}
          {board.robber === hex.id && (
            <g className="robber" transform={`translate(${hex.cx * K},${hex.cy * K - 4})`}>
              <ellipse cx="0" cy="16" rx="12" ry="4" />
              <path d="M-9 14 Q-9 -6 0 -14 Q9 -6 9 14 Z" />
            </g>
          )}
        </g>
      ))}

      {/*
        路。已建的画两层：先一条深色底衬，再压玩家颜色。
        单层的话，四种玩家色都会沉进地块里 —— 森林的深绿上一条深蓝的路，
        眯着眼才找得到。底衬解决的是"在任何底色上都能看见"，
        这比把玩家色调亮更可靠，也不用牺牲配色。
      */}
      {board.edges.map((e) => {
        const a = board.vertices[e.a]
        const b = board.vertices[e.b]
        const owner = roads[e.id]
        const pick = legalEdges?.has(e.id)
        if (owner === null && !pick) return null
        const geom = { x1: a.x * K, y1: a.y * K, x2: b.x * K, y2: b.y * K }
        return (
          <g key={`e${e.id}`}>
            {owner !== null && <line className="catan-road casing" {...geom} />}
            <line
              className={`catan-road${owner === null ? ' ghost' : ''}${pick ? ' pickable' : ''}`}
              {...geom}
              stroke={owner === null ? undefined : colors[owner]}
              onClick={pick ? () => onEdge?.(e.id) : undefined}
            />
          </g>
        )
      })}

      {board.vertices.map((v) => {
        const b = buildings[v.id]
        const pick = legalVertices?.has(v.id)
        if (!b && !pick) return null
        return (
          <g
            key={`v${v.id}`}
            className={`catan-vertex${pick ? ' pickable' : ''}`}
            transform={`translate(${v.x * K},${v.y * K})`}
            onClick={pick ? () => onVertex?.(v.id) : undefined}
          >
            {b ? (
              b.kind === 'city' ? (
                // 城市画成两截的房子，和村庄一眼分得开
                <path
                  d="M-15 10 L-15 -4 L-5 -13 L4 -4 L4 -1 L15 -1 L15 10 Z"
                  fill={colors[b.owner]}
                  className="bldg"
                />
              ) : (
                <path
                  d="M-11 9 L-11 -3 L0 -12 L11 -3 L11 9 Z"
                  fill={colors[b.owner]}
                  className="bldg"
                />
              )
            ) : (
              <circle r="7" className="spot" />
            )}
          </g>
        )
      })}
    </svg>
  )
}
