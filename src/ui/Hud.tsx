import { useGameStore, seatKey } from '../state/useGameStore'
import { usePlayerStore } from '../state/usePlayerStore'
import { TABLES } from '../scene/hallLayout'

/**
 * HUD。存在的意义是证明一件事：2D UI 和 3D 场景吃的是同一个 store，
 * 以后 WebSocket 推来的游戏状态会同时驱动这两边。
 *
 * 三种模式三套 UI：走动（准心 + 提示）、转场（全清空）、落座（玩家列表）。
 */
export function Hud() {
  const mode = usePlayerStore((s) => s.mode)
  const hovered = usePlayerStore((s) => s.hovered)
  const seatedAt = usePlayerStore((s) => s.seatedAt)
  const locked = usePlayerStore((s) => s.locked)

  const occupancy = useGameStore((s) => s.occupancy)
  const speakingKey = useGameStore((s) => s.speakingKey)

  const seatedTable = seatedAt ? TABLES.find((t) => t.id === seatedAt.tableId) : null

  return (
    <div className="hud">
      <div className="hud-top">
        <div className="hud-title">DOLOS</div>
        <div className="hud-sub">
          {mode === 'walking'
            ? locked
              ? 'WASD 移动 · 鼠标环视 · 看向空位按 E 坐下'
              : '点击画面开始'
            : mode === 'seated'
              ? '按住拖拽环视 · Q 起身'
              : ''}
        </div>
      </div>

      {/* 走动模式的准心 */}
      {mode === 'walking' && locked && (
        <div className={`crosshair${hovered ? ' crosshair-active' : ''}`} />
      )}

      {/* 未锁定时的启动遮罩 */}
      {mode === 'walking' && !locked && <ClickToStart />}

      {/* 瞄准空位时的坐下提示 */}
      {mode === 'walking' && locked && hovered && (
        <div className="prompt">
          <kbd>E</kbd> 坐下
        </div>
      )}

      {/* 落座后的同桌玩家列表 */}
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
 * PointerLock 必须由用户手势触发，浏览器不允许自动锁定。
 * 所以需要这么一个点击层 —— 顺便也是个进入游戏的仪式感。
 */
function ClickToStart() {
  const request = () => {
    const canvas = document.querySelector('canvas')
    canvas?.requestPointerLock()
  }
  return (
    <div className="start-overlay" onClick={request}>
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
