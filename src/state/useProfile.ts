import { create } from 'zustand'

/**
 * 你是谁。
 *
 * 之前这是硬编码的 `{ name: '你', color: '#e2743a' }` —— 每次刷新都是同一个
 * 没有名字的橙色圆点。**那是整个东西里最像 demo 的一处**：房间列表、聊天、
 * 牌桌上全是"你"，没有任何一处说明这是同一个人。
 *
 * 存在 localStorage 里。**没有账号系统，也不打算有** ——
 * 这是个本地跑的东西，昵称属于这台浏览器，不属于任何服务器。
 * 读写都包 try/catch：无痕模式下 localStorage 直接抛异常，
 * 而"记不住昵称"不该让整个应用起不来。
 */

const KEY = 'dolos.profile'

export const AVATAR_COLORS = [
  '#e2743a', '#3f9ad6', '#8f5fd6', '#4fb56a',
  '#e0b13a', '#d95a7e', '#3aa8a0', '#6b7fd6',
]

export type Profile = { name: string; color: string }

const DEFAULT: Profile = { name: '你', color: AVATAR_COLORS[0] }

function load(): Profile {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT
    const p = JSON.parse(raw) as Partial<Profile>
    return {
      name: typeof p.name === 'string' && p.name.trim() ? p.name.slice(0, 12) : DEFAULT.name,
      color: typeof p.color === 'string' ? p.color : DEFAULT.color,
    }
  } catch {
    return DEFAULT
  }
}

type ProfileState = Profile & { set: (p: Partial<Profile>) => void }

export const useProfile = create<ProfileState>((set, get) => ({
  ...load(),
  set: (patch) => {
    const next = { name: get().name, color: get().color, ...patch }
    next.name = next.name.trim().slice(0, 12) || DEFAULT.name
    set(next)
    try {
      localStorage.setItem(KEY, JSON.stringify({ name: next.name, color: next.color }))
    } catch {
      // 无痕模式。记不住就记不住，不影响这一次玩
    }
  },
}))

/** 给非组件代码用（store、session）。它们读的是当下的值，不需要订阅 */
export const me = (): Profile => ({ name: useProfile.getState().name, color: useProfile.getState().color })
