import { useEffect, useState } from 'react'
import { coachFor } from '../../poker/coach'
import type { Action, PlayerView } from '../../poker/types'
import { Chips } from './Chips'

/**
 * 下注操作区。
 *
 * 上一版的问题不是按钮不好看，是**按钮只说了"能做什么"，没说"现在是什么情况"**。
 * 新手盯着「弃牌 / 过牌 / 加注」三个词，没有任何依据去选。
 *
 * 所以这一版每个按钮都带一句解释，上面还有一条局面提示（`coachFor`）。
 * 老手会自动忽略它们，新手不会卡住 —— 这个不对称正是它值得占屏幕空间的理由。
 *
 * 三条不变的纪律：
 *  1. **金额边界全部来自 `view.legal`**，界面一个都不自己算
 *  2. 不能做的动作**禁用而不是隐藏** —— 按钮位置跳动比按钮变灰难受得多
 *  3. 常用尺度给快捷按钮，不逼玩家拖滑块
 */
export function PokerActionBar({
  pending,
  onAct,
}: {
  pending: { view: PlayerView } | null
  onAct: (a: Action) => void
}) {
  const v = pending?.view ?? null
  const l = v?.legal ?? null
  const [to, setTo] = useState(0)

  // 轮到自己时把滑块重置到最小加注 —— 保留上一手的数字会让人误加注
  useEffect(() => {
    if (l) setTo(l.minRaiseTo)
  }, [l?.minRaiseTo, l?.maxRaiseTo])

  // 键盘快捷键。打到第五十手时没人还想用鼠标点
  useEffect(() => {
    if (!l) return
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (k === 'f' && l.canFold) onAct({ kind: 'fold' })
      else if (k === 'c') onAct({ kind: l.canCheck ? 'check' : 'call' })
      else if (k === 'r' && (l.canBet || l.canRaise)) {
        onAct({ kind: l.canBet ? 'bet' : 'raise', to })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [l, to, onAct])

  if (!v || !l) {
    return (
      <div className="pbar idle">
        <span className="dots">等待其他玩家</span>
      </div>
    )
  }

  const c = coachFor(v)
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
      {c && (
        <div className="coach">
          <div className="coach-main">
            <span className="street">{c.street}</span>
            <span className="hand">{c.hand}</span>
          </div>
          <div className="coach-sub">
            <span>{c.situation}</span>
            {c.odds && <span className="odds">{c.odds}</span>}
            {c.warning && <span className="warn">{c.warning}</span>}
          </div>
        </div>
      )}

      <div className="buttons">
        <button
          className="fold"
          disabled={!l.canFold}
          onClick={() => onAct({ kind: 'fold' })}
        >
          <span className="lab">
            弃牌 <kbd>F</kbd>
          </span>
          <span className="why">{c?.hints.fold}</span>
        </button>

        {l.canCheck ? (
          <button className="check" onClick={() => onAct({ kind: 'check' })}>
            <span className="lab">
              过牌 <kbd>C</kbd>
            </span>
            <span className="why">{c?.hints.check}</span>
          </button>
        ) : (
          <button
            className="call"
            disabled={!l.canCall}
            onClick={() => onAct({ kind: 'call' })}
          >
            <span className="lab">
              跟注 {l.callAmount} <kbd>C</kbd>
              {l.callAmount >= me.stack && <em>全下</em>}
            </span>
            <span className="why">{c?.hints.call}</span>
          </button>
        )}

        {canAggress ? (
          <div className="raise-box">
            <div className="quick">
              <button onClick={() => quick(0.5)}>½ 底池</button>
              <button onClick={() => quick(0.75)}>¾ 底池</button>
              <button onClick={() => quick(1)}>1 倍底池</button>
              <button onClick={() => setTo(l.maxRaiseTo)}>全下</button>
            </div>
            <div className="raise-row">
              <input
                type="range"
                min={l.minRaiseTo}
                max={l.maxRaiseTo}
                step={1}
                value={to}
                onChange={(e) => setTo(Number(e.target.value))}
                disabled={l.minRaiseTo >= l.maxRaiseTo}
              />
              <button
                className="raise"
                onClick={() => onAct({ kind: aggressKind, to })}
              >
                <span className="lab">
                  {l.canBet ? '下注' : '加注到'} {to} <kbd>R</kbd>
                  {to >= l.maxRaiseTo && <em>全下</em>}
                </span>
                <Chips amount={to - me.committed} size={13} showAmount={false} />
              </button>
            </div>
          </div>
        ) : (
          <div className="raise-box disabled">
            <span className="why">
              {l.canCall ? '你的筹码不够加注，只能跟注或弃牌' : '这一轮不能加注'}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
