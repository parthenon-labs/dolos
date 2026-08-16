import { useGameStore, seatKey } from '../state/useGameStore'
import { usePlayerStore } from '../state/usePlayerStore'
import { TABLES } from '../scene/hallLayout'

/**
 * HUD。存在的意义是证明一件事：2D UI 和 3D 场景吃的是同一个 store，
 * 以后 WebSocket 推来的游戏状态会同时驱动这两边。
 *
 * 走动时指针是锁定的（标准 FPS），所以有一个很轻的准心；
 * 它不用来瞄椅子 —— 选座是按距离自动选的 —— 只是给视线一个中心参考。
 */
export function Hud() {
  const mode = usePlayerStore((s) => s.mode)
  const seatedAt = usePlayerStore((s) => s.seatedAt)
  const entered = usePlayerStore((s) => s.entered)
  const locked = usePlayerStore((s) => s.locked)

  const occupancy = useGameStore((s) => s.occupancy)
  const speakingKey = useGameStore((s) => s.speakingKey)

  const seatedTable = seatedAt ? TABLES.find((t) => t.id === seatedAt.tableId) : null
  const walking = mode === 'walking'

  return (
    <div className="hud">
      <div className="hud-top">
        <div className="hud-title">DOLOS</div>
        <div className="hud-sub">
          {walking
            ? 'WASD 移动 · 鼠标转视角 · Shift 跑 · 走到空椅子旁按 E 坐下'
            : mode === 'seated'
              ? '按住拖拽环视 · Q 起身'
              : ''}
        </div>
      </div>

      {walking && locked && <div className="crosshair" />}

      {!entered && <StartOverlay />}
      {entered && walking && !locked && <ResumeOverlay />}

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

function lockPointer() {
  document.querySelector('canvas')?.requestPointerLock()
}

/**
 * 进场页。两个作用都必须有：
 * PointerLock 只能由用户手势触发，浏览器不允许自动锁定；
 * 而 AudioContext 同样要求一次手势才能 resume —— 接真语音时就是这一下。
 */
function StartOverlay() {
  const setEntered = usePlayerStore((s) => s.setEntered)
  return (
    <div
      className="start-overlay"
      onClick={() => {
        setEntered(true)
        lockPointer()
      }}
    >
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
          <span>鼠标 转视角</span>
          <span>
            <kbd>Shift</kbd> 跑
          </span>
          <span>
            <kbd>E</kbd> 坐下
          </span>
        </div>
      </div>
    </div>
  )
}

/** 按 Esc 会被浏览器强制解锁指针，得给一个显眼的回去的路 */
function ResumeOverlay() {
  return (
    <div className="start-overlay resume-overlay" onClick={lockPointer}>
      <div className="start-card">
        <div className="start-desc">点击继续</div>
      </div>
    </div>
  )
}
