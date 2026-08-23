import { useEffect } from 'react'
import { create } from 'zustand'
import { isMuted, setMuted, sfx } from './sfx'

type SoundState = { muted: boolean; toggle: () => void }

export const useSound = create<SoundState>((set, get) => ({
  muted: isMuted(),
  toggle: () => {
    const next = !get().muted
    setMuted(next)
    set({ muted: next })
    // 打开的时候响一下，作为"开了"的确认。关的时候当然不响
    if (!next) sfx('click')
  },
}))

/**
 * 全局的按钮点击声。
 *
 * 用一个委托监听器，而不是给每个按钮挂 onClick ——
 * 这个项目里有上百个按钮，分散着挂迟早会漏，而漏掉的那几个
 * 会让人觉得"这里点了没反应"，比全都没声音更糟。
 *
 * 有意义的时刻（发牌、下注、建造、胜负）另外单独发声，
 * 那些是内容，不是操作确认。
 */
export function useClickSound() {
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const el = (e.target as HTMLElement | null)?.closest('button, [data-clicky]')
      if (!el) return
      if (el instanceof HTMLButtonElement && el.disabled) return sfx('error')
      sfx('click')
    }
    // pointerdown 而不是 click：声音要跟着**按下去**那一刻，
    // 等到 click（抬起时）才响会明显觉得慢半拍
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [])
}
