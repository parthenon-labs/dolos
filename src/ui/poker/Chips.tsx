/**
 * 筹码。
 *
 * 把数字换成实体是这一版视觉改动里感知最强的一步：
 * "底池 340" 要读、要换算；一摞筹码**一眼就知道多**。
 * 扑克桌上的信息密度本来就靠筹码堆传达，去掉它等于把游戏抽象成了表格。
 *
 * 面额配色刻意避开赌场那套高饱和红蓝绿 —— 这是家昏暗的酒馆，
 * 颜色要能和暖木、烛光待在同一个画面里。
 */

export type Denom = { value: number; color: string; edge: string }

/** 从大到小。分解筹码时按这个顺序贪心 */
export const DENOMS: Denom[] = [
  { value: 500, color: '#5a3a6b', edge: '#8f6ea8' },
  { value: 100, color: '#22303f', edge: '#5d7d9c' },
  { value: 25, color: '#2f6b4a', edge: '#63b189' },
  { value: 5, color: '#a8342a', edge: '#e0796c' },
  { value: 1, color: '#e0d5c4', edge: '#8d7f6c' },
]

/** 把金额拆成若干摞。贪心即可 —— 这是展示，不是找零 */
export function breakIntoStacks(amount: number): { denom: Denom; count: number }[] {
  const out: { denom: Denom; count: number }[] = []
  let left = amount
  for (const d of DENOMS) {
    const n = Math.floor(left / d.value)
    if (n > 0) {
      out.push({ denom: d, count: n })
      left -= n * d.value
    }
  }
  return out
}

/**
 * 一摞筹码。
 *
 * 真画 N 枚会在 all-in 时堆到屏幕外，所以最多画 5 枚，
 * 数量用角标写出来 —— **高度传达"多"，数字传达"多少"**，两者分工。
 */
function Stack({ denom, count, size }: { denom: Denom; count: number; size: number }) {
  const shown = Math.min(count, 5)
  const step = Math.max(2, size * 0.17)
  return (
    <div
      className="chip-stack"
      style={{ width: size, height: size * 0.62 + (shown - 1) * step }}
      title={`${denom.value} × ${count}`}
    >
      {Array.from({ length: shown }, (_, i) => (
        <span
          key={i}
          className="chip"
          style={{
            width: size,
            height: size * 0.62,
            bottom: i * step,
            background: denom.color,
            borderColor: denom.edge,
          }}
        />
      ))}
      {count > 1 && (
        <b className="chip-count" style={{ bottom: (shown - 1) * step + size * 0.62 - 2 }}>
          {count}
        </b>
      )}
    </div>
  )
}

/**
 * 一堆筹码 + 金额。
 *
 * `amount` 为 0 时什么都不画 —— 空的筹码位比没有更碍眼。
 */
export function Chips({
  amount,
  size = 22,
  showAmount = true,
  className = '',
}: {
  amount: number
  size?: number
  showAmount?: boolean
  className?: string
}) {
  if (amount <= 0) return null
  const stacks = breakIntoStacks(amount)
  return (
    <div className={`chips ${className}`}>
      <div className="chip-row">
        {stacks.map((s, i) => (
          <Stack key={i} denom={s.denom} count={s.count} size={size} />
        ))}
      </div>
      {showAmount && <span className="chip-amount">{amount}</span>}
    </div>
  )
}

/** 只画一枚，用作图例 */
export function ChipDot({ denom, size = 18 }: { denom: Denom; size?: number }) {
  return (
    <span
      className="chip solo"
      style={{
        width: size,
        height: size * 0.62,
        background: denom.color,
        borderColor: denom.edge,
      }}
    />
  )
}
