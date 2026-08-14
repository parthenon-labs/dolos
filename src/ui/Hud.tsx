import { useGameStore, seatKey } from '../state/useGameStore'
import { usePlayerStore } from '../state/usePlayerStore'
import { TABLES } from '../scene/hallLayout'

/**
 * HUD。存在的意义是证明一件事：2D UI 和 3D 场景吃的是同一个 store，
 * 以后 WebSocket 推来的游戏状态会同时驱动这两边。
 *
 * 注意这里**没有准心**了 —— 选座改成了光标 hover，提示牌直接贴在
 * 那把椅子上方（见 Seat.tsx），而不是永远悬在屏幕正中。
 */
export function Hud() {
  const mode = usePlayerStore((s) => s.mode)
  const seatedAt = usePlayerStore((s) => s.seatedAt)
  const entered = usePlayerStore((s) => s.entered)

  const occupancy = useGameStore((s) => s.occupancy)
  const speakingKey = useGameStore((s) => s.speakingKey)

  const seatedTable = seatedAt ? TABLES.find((t) => t.id === seatedAt.tableId) : null

  return (
    <div className="hud">
      <div className="hud-top">
        <div className="hud-title">DOLOS</div>
        <div className="hud-sub">
          {mode === 'walking'
            ? 'WASD 移动 · 按住拖拽环视 · 指向空位按 E 或点击坐下'
            : mode === 'seated'
              ? '按住拖拽环视 · Q 起身'
              : ''}
        </div>
      </div>

      {!entered && <ClickToStart />}

      {mode === 'seated' && seatedTable && (
        <div className="hud-bottom">
          {(occupancy[seatedTable.id] ?? []).map((occ, i) => {
            const isMe = seatedAt?.seat === i
            const speaking = speakingKey === seatKey(seatedTable.id, i)
            if (!occ) {
              return (
                <div key={i} className="chip chip-empty">
                  空位
                </div>
              )
            }
            return (
              <div
                key={i}
                className={`chip${speaking ? ' chip-speaking' : ''}${isMe ? ' chip-me' : ''}`}
              >
                <span className="chip-dot" style={{ background: occ.color }} />
                {occ.name}
                {occ.isAI && <span className="ai-badge">AI</span>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * 进场页。已经不再需要它去申请指针锁定了，留着是因为：
 * 浏览器要求 AudioContext 必须在用户手势之后才能启动，接真语音时
 * 这一下点击就是那个手势。顺带也是个进入酒吧的仪式感。
 */
function ClickToStart() {
  const setEntered = usePlayerStore((s) => s.setEntered)
  return (
    <div className="start-overlay" onClick={() => setEntered(true)}>
      <div className="start-card">
        <div className="start-title">DOLOS</div>
        <div className="start-desc">点击进入酒吧</div>
        <div className="start-keys">
          <span>
            <kbd>W</kbd>
            <kbd>A</kbd>
            <kbd>S</kbd>
            <kbd>D</kbd> 移动
          </span>
          <span>按住拖拽 环视</span>
          <span>
            <kbd>E</kbd> 坐下
          </span>
          <span>
            <kbd>Q</kbd> 起身
          </span>
        </div>
      </div>
    </div>
  )
}
