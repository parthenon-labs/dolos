import { useEntered } from '../../state/useEntered'

/**
 * 进场页。
 *
 * 以前它同时干两件事：申请指针锁定、以及给 AudioContext 那次必需的手势。
 * 大厅改成 2D 之后**指针锁定不需要了**，但手势这一下还得留着 ——
 * 浏览器不允许没有用户操作就 resume 音频，接真语音时就是靠这一下。
 */
export function StartScreen() {
  const setEntered = useEntered((s) => s.setEntered)
  return (
    <div className="lb-start">
      <div className="lb-start-card">
        <div className="lb-logo">
          <span className="lb-logo-main">DOLOS</span>
          <span className="lb-logo-sub">酒馆棋牌室</span>
        </div>
        <p className="lb-start-desc">
          挑一个房间坐下，人不够 AI 补位。
          <br />
          德州扑克 · 斗地主 · 卡坦岛
        </p>
        <button className="lb-btn lb-btn-xl" onClick={() => setEntered(true)}>
          进入大厅
        </button>
        <div className="lb-start-note">虚拟积分 · 不可充值提现</div>
      </div>
    </div>
  )
}
