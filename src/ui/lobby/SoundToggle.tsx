import { useSound } from '../../audio/useSound'

/** 静音开关。音效默认开着，所以这个开关必须一直看得见 */
export function SoundToggle() {
  const muted = useSound((s) => s.muted)
  const toggle = useSound((s) => s.toggle)
  return (
    <button
      className="lb-btn lb-btn-ghost lb-sound"
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
