import { useGameStore } from '../state/useGameStore'

/**
 * 最小 HUD。存在的意义是证明一件事：
 * 2D UI 和 3D 场景吃的是同一个 store，以后 WebSocket 推来的
 * 游戏状态会同时驱动这两边。
 */
export function Hud() {
  const players = useGameStore((s) => s.players)
  const speaking = useGameStore((s) => s.speaking)

  return (
    <div className="hud">
      <div className="hud-top">
        <div className="hud-title">LIAR&apos;S TABLE</div>
        <div className="hud-sub">R3F 骨架 · 按住拖拽环视</div>
      </div>

      <div className="hud-bottom">
        {players.map((p) => (
          <div
            key={p.seat}
            className={`chip${speaking === p.seat ? ' chip-speaking' : ''}`}
          >
            <span className="chip-dot" style={{ background: p.color }} />
            {p.name}
            {p.isAI && <span className="ai-badge">AI</span>}
          </div>
        ))}
      </div>
    </div>
  )
}
