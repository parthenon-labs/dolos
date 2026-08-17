import { canFail } from '../../game/engine'
import type { PlayerId } from '../../game/types'
import type { Pending } from '../../match/useMatchStore'
import type { Seat } from './types'

/**
 * 底部操作区。只在轮到你时出现。
 *
 * 设计上守两条：
 *  1. **一次只问一件事。** 提名和投票不同时出现，哪怕引擎允许
 *  2. **禁用比隐藏好。** 人数没选够时"确认"是灰的，而不是消失 ——
 *     按钮消失会让人以为界面坏了
 */
export function ActionBar({
  pending,
  seats,
  picked,
  setPicked,
}: {
  pending: Pending | null
  seats: Seat[]
  picked: PlayerId[]
  setPicked: (p: PlayerId[]) => void
}) {
  if (!pending) return <div className="action-bar idle">等待其他玩家…</div>

  switch (pending.kind) {
    case 'propose': {
      const need = pending.view.teamSize
      const ok = picked.length === need
      return (
        <div className="action-bar">
          <div className="prompt">
            你是队长，从左侧点选 <b>{need}</b> 人出任务
            {pending.view.needsTwoFails && (
              <em className="hint">本轮需要两张失败牌才算失败</em>
            )}
          </div>
          <div className="picks">
            {picked.map((p) => (
              <span key={p} className="chip" style={{ borderColor: seats[p]?.color }}>
                {p + 1} {seats[p]?.name}
              </span>
            ))}
            {picked.length < need && <span className="chip ghost">还差 {need - picked.length} 人</span>}
          </div>
          <button
            className="primary"
            disabled={!ok}
            onClick={() => {
              const team = picked.slice()
              setPicked([])
              pending.resolve(team)
            }}
          >
            确认提名
          </button>
        </div>
      )
    }

    case 'vote': {
      const team = pending.view.team
      return (
        <div className="action-bar">
          <div className="prompt">
            表决 <b>{pending.view.leader + 1} 号</b> 提名的队伍
            <span className="picks">
              {team.map((t) => (
                <span key={t} className="chip" style={{ borderColor: seats[t]?.color }}>
                  {t + 1} {seats[t]?.name}
                </span>
              ))}
            </span>
          </div>
          <div className="btns">
            <button className="approve" onClick={() => pending.resolve(true)}>
              同意
            </button>
            <button className="reject" onClick={() => pending.resolve(false)}>
              否决
            </button>
          </div>
        </div>
      )
    }

    case 'quest': {
      // 好人这里只有一个选项。引擎也会强制，但界面**先一步说清楚原因**，
      // 否则玩家会以为按钮坏了。
      // 用引擎的 canFail 而不是在这儿再列一遍坏人角色 —— 两份名单迟早会对不上
      const mayFail = canFail(pending.view.myRole)
      return (
        <div className="action-bar">
          <div className="prompt">
            你在这次任务里，出牌
            {!mayFail && <em className="hint">你是好人，只能出成功</em>}
          </div>
          <div className="btns">
            <button className="approve" onClick={() => pending.resolve(true)}>
              成功
            </button>
            <button
              className="reject"
              disabled={!mayFail}
              onClick={() => pending.resolve(false)}
            >
              失败
            </button>
          </div>
        </div>
      )
    }

    case 'assassinate':
      return (
        <div className="action-bar assassin">
          <div className="prompt">
            好人过了三轮。<b>你是刺客</b> —— 指认梅林，认对了坏人翻盘
          </div>
          <div className="picks">
            {picked.length > 0 ? (
              <span className="chip" style={{ borderColor: seats[picked[0]]?.color }}>
                {picked[0] + 1} {seats[picked[0]]?.name}
              </span>
            ) : (
              <span className="chip ghost">从左侧点选一人</span>
            )}
          </div>
          <button
            className="primary danger"
            disabled={picked.length !== 1}
            onClick={() => {
              const t = picked[0]
              setPicked([])
              pending.resolve(t)
            }}
          >
            指认
          </button>
        </div>
      )
  }
}
