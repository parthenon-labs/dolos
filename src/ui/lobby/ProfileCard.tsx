import { useState } from 'react'
import { AVATAR_COLORS, useProfile } from '../../state/useProfile'
import { useKeys } from './useKeys'

/**
 * 右上角那个"你"。点开可以改昵称和颜色。
 *
 * 做成点开而不是一个显眼的"设置"入口：**改名不是常用操作**，
 * 但当你想改的时候，第一个会去点的就是自己的名字。
 */
export function ProfileCard() {
  const name = useProfile((s) => s.name)
  const color = useProfile((s) => s.color)
  const [open, setOpen] = useState(false)

  return (
    <>
      <button className="lb-me" onClick={() => setOpen(true)} title="改名字和颜色">
        <span className="lb-me-av" style={{ background: color }} />
        <span className="lb-me-name">{name}</span>
      </button>
      {open && <Editor onClose={() => setOpen(false)} />}
    </>
  )
}

function Editor({ onClose }: { onClose: () => void }) {
  const name = useProfile((s) => s.name)
  const color = useProfile((s) => s.color)
  const set = useProfile((s) => s.set)
  const [draft, setDraft] = useState(name)
  const [pick, setPick] = useState(color)

  const save = () => {
    set({ name: draft, color: pick })
    onClose()
  }
  useKeys({ Escape: onClose })

  return (
    <div className="lb-modal-back" onClick={onClose}>
      <div className="lb-modal small" onClick={(e) => e.stopPropagation()}>
        <h3>你叫什么</h3>
        <div className="lb-field">
          <div className="lb-profile-row">
            <span className="lb-me-av big" style={{ background: pick }} />
            <input
              className="lb-input"
              autoFocus
              maxLength={12}
              value={draft}
              placeholder="你"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
            />
          </div>
        </div>
        <div className="lb-field">
          <label>颜色</label>
          <div className="lb-swatches">
            {AVATAR_COLORS.map((c) => (
              <button
                key={c}
                className={`lb-swatch${c === pick ? ' on' : ''}`}
                style={{ background: c }}
                aria-label={c}
                onClick={() => setPick(c)}
              />
            ))}
          </div>
        </div>
        {/* 名字只存在这台浏览器里，说清楚比含糊好 */}
        <p className="lb-tagline">只存在这台浏览器上，没有账号，也不上传。</p>
        <div className="lb-modal-foot">
          <button className="lb-btn lb-btn-ghost" onClick={onClose}>
            算了
          </button>
          <button className="lb-btn lb-btn-go" onClick={save}>
            就这个
          </button>
        </div>
      </div>
    </div>
  )
}
