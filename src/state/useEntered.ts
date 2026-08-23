import { create } from 'zustand'

/**
 * 进没进过场。
 *
 * 这个 store 原来叫 usePlayerStore，装的是第一人称那一整套：
 * 走动 / 落座 / 起身的模式机、坐在哪把椅子上、光标指着哪把、指针锁定状态。
 * 大厅改成 2D 之后那些全没了 —— 现在只剩一个布尔值。
 *
 * 它还留着，是因为**那一次点击本身有用**：
 * 浏览器不允许没有用户手势就 resume AudioContext，
 * 而这个项目现在有音效。进场页就是为这一下留的。
 */
type EnteredState = {
  entered: boolean
  setEntered: (v: boolean) => void
}

export const useEntered = create<EnteredState>((set) => ({
  entered: false,
  setEntered: (v) => set((p) => (p.entered === v ? p : { entered: v })),
}))
