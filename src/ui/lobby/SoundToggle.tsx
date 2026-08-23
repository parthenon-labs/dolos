import { useSound } from '../../audio/useSound'

/**
 * 静音开关。
 *
 * 音效默认开着，所以这个开关**必须一直看得见** —— 包括牌桌里。
 * 只在大厅放一个的话，打到一半想关就得先离席，那等于没有。
 * 牌桌那边是暗色调，所以给一个 ghost 变体，不能把大厅的奶油色按钮搬过去。
 */
export function SoundToggle({ variant = 'lobby' }: { variant?: 'lobby' | 'dark' }) {
  const muted = useSound((s) => s.muted)
  const toggle = useSound((s) => s.toggle)
  return (
    <button
      className={variant === 'dark' ? 'ghost-btn lb-sound dark' : 'lb-btn lb-btn-ghost lb-sound'}
      title={muted ? '声音已关' : '声音已开'}
      aria-label={muted ? '打开声音' : '关闭声音'}
      onClick={toggle}
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z" fill="currentColor" />
        {muted ? (
          <>
            <path d="M16.5 9.5l4 5" />
            <path d="M20.5 9.5l-4 5" />
          </>
        ) : (
          <>
            <path d="M15.6 9.2a4 4 0 0 1 0 5.6" />
            <path d="M18.2 6.8a7.5 7.5 0 0 1 0 10.4" />
          </>
        )}
      </svg>
    </button>
  )
}
