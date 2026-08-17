import { useEffect, useState } from 'react'
import type { Action, PlayerView } from '../../poker/types'

/**
 * 下注操作区。
 *
 * 三条纪律：
 *  1. **金额边界全部来自 `view.legal`**，界面一个都不自己算。
 *     两处实现必然分叉，分叉的表现是玩家点了按钮却被引擎拒绝
 *  2. 不能做的动作**禁用而不是隐藏** —— 按钮位置跳动比按钮变灰难受得多
 *  3. 常用尺度给快捷键（半池/满池/全下），不逼玩家拖滑块
 */
export function PokerActionBar({
  pending,
  onAct,
}: {
  pending: { view: PlayerView } | null
  onAct: (a: Action) => void
}) {
  const l = pending?.view.legal ?? null
  const [to, setTo] = useState(0)

  // 轮到自己时把滑块重置到最小加注 —— 保留上一手的数字会让人误加注
  useEffect(() => {
    if (l) setTo(l.minRaiseTo)
  }, [l?.minRaiseTo, l?.maxRaiseTo])

  if (!pending || !l) {
    return <div className="pbar idle">等待其他玩家…</div>
  }

  const v = pending.view
  const me = v.players.find((p) => p.seat === v.me)!
  const pot =
    v.pots.reduce((a, p) => a + p.amount, 0) +
    v.players.reduce((a, p) => a + p.committed, 0)
  const canAggress = l.canBet || l.canRaise
  const aggressKind: Action['kind'] = l.canBet ? 'bet' : 'raise'

  const quick = (frac: number) => {
    const target = me.committed + Math.round(pot * frac)
    setTo(Math.max(l.minRaiseTo, Math.min(target, l.maxRaiseTo)))
  }

  return (
    <div className="pbar">
      <div className="pbar-left">
        <button
          className="fold"
          disabled={!l.canFold}
          onClick={() => onAct({ kind: 'fold' })}
        >
          弃牌
        </button>

        {l.canCheck ? (
          <button className="check" onClick={() => onAct({ kind: 'check' })}>
            过牌
          </button>
        ) : (
          <button
            className="call"
            disabled={!l.canCall}
            onClick={() => onAct({ kind: 'call' })}
          >
            跟注 <b>{l.callAmount}</b>
            {/* 筹码不够跟就是全下，先说清楚，别让玩家点完才发现 */}
            {l.callAmount >= me.stack && <em>全下</em>}
          </button>
        )}
      </div>

      <div className="pbar-right">
        {canAggress && (
          <>
            <div className="quick">
              <button onClick={() => quick(0.5)}>½ 池</button>
              <button onClick={() => quick(0.75)}>¾ 池</button>
              <button onClick={() => quick(1)}>底池</button>
              <button onClick={() => setTo(l.maxRaiseTo)}>全下</button>
            </div>
            <input
              type="range"
              min={l.minRaiseTo}
              max={l.maxRaiseTo}
              step={1}
              value={to}
              onChange={(e) => setTo(Number(e.target.value))}
              disabled={l.minRaiseTo >= l.maxRaiseTo}
            />
            <button className="raise" onClick={() => onAct({ kind: aggressKind, to })}>
              {l.canBet ? '下注' : '加注到'} <b>{to}</b>
              {to >= l.maxRaiseTo && <em>全下</em>}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
