import { create } from 'zustand'
import { GAMES, gameById, type GameId } from '../games/registry'

/**
 * 大厅。
 *
 * **房间是客户端造出来的**：现在没有服务端，所以列表里那些房间是本地
 * mock，进去之后同房的都是 bot。这一层的意义不在"联机"，
 * 而在**把游戏的入口从"走过去坐下"换成"挑一行进去"** ——
 * 后者才是棋牌室该有的样子，也是接了 WebSocket 之后唯一要换掉的一层：
 * `rooms` 换成服务端推来的列表，下面的界面一行都不用改。
 */

export type RoomPlayer = {
  name: string
  color: string
  isAI: boolean
  /** 房主。房主才能开始 */
  host: boolean
}

export type Room = {
  id: string
  /** 四位房号。玩家之间报房号比报名字快 */
  no: number
  name: string
  game: GameId
  max: number
  players: RoomPlayer[]
  locked: boolean
  password: string | null
  status: 'waiting' | 'playing'
}

export type Filter = GameId | 'all'

const ADJ = ['萌新', '手速', '欧皇', '通宵', '摸鱼', '下班', '午休', '快乐', '硬核', '佛系', '爆牌', '躺赢']
const NOUN = ['求带', '专场', '三缺一', '来个人', '不带喷子', '随便玩', '菜鸟局', '大佬勿入', '只打一局', '陪练']
const NICKS = [
  'Ultimo', 'Broadway', 'Haymarket', 'Dysart', 'Gehry', 'Alumni',
  'Foxy', 'Bristle', 'Toar', 'Scubby', 'Marlow', 'Pella',
  'Vex', 'Gundy', 'Ossa', 'Rook', 'Wren', 'Bram',
]
const COLORS = [
  '#e2743a', '#3f9ad6', '#8f5fd6', '#4fb56a', '#e0b13a', '#d95a7e',
  '#3aa8a0', '#c2603a', '#6b7fd6', '#9bb03a',
]

const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]

function mockPlayers(n: number): RoomPlayer[] {
  const used = new Set<string>()
  const out: RoomPlayer[] = []
  for (let i = 0; i < n; i++) {
    let name = pick(NICKS)
    while (used.has(name)) name = pick(NICKS)
    used.add(name)
    out.push({ name, color: COLORS[(NICKS.indexOf(name) * 3) % COLORS.length], isAI: true, host: i === 0 })
  }
  return out
}

let nextNo = 1000

function mockRoom(): Room {
  const g = pick(GAMES)
  const max = g.players.max
  // 刻意留出空位，而且空的数量不一样 —— 扫一眼要能看出"哪间进得去"
  const filled = 1 + Math.floor(Math.random() * max)
  const locked = Math.random() < 0.15
  return {
    id: `r${nextNo}`,
    no: nextNo++,
    name: `${pick(ADJ)}${pick(NOUN)}`,
    game: g.id,
    max,
    players: mockPlayers(Math.min(filled, max)),
    locked,
    password: locked ? '1234' : null,
    status: filled >= max || Math.random() < 0.25 ? 'playing' : 'waiting',
  }
}

const makeRooms = (n: number) => Array.from({ length: n }, mockRoom)

export const ME = { name: '你', color: '#e2743a' }

type LobbyState = {
  rooms: Room[]
  myRoomId: string | null
  /** 我这一局已经开打了。开打之后大厅让位给游戏界面 */
  playing: boolean
  filter: Filter
  query: string
  page: number

  setFilter: (f: Filter) => void
  setQuery: (q: string) => void
  setPage: (p: number) => void
  refresh: () => void

  createRoom: (opts: { name: string; game: GameId; password: string | null }) => string
  /** 返回失败原因，成功返回 null */
  join: (id: string, password?: string) => string | null
  leave: () => void
  start: () => void
  endGame: () => void
}

/**
 * 一页几间。
 *
 * 挑这个数不是随便定的：**面板要被行填满**。
 * 第一版一页 7 间，1440×900 下面板底下空出一大片奶油色，
 * 看着像没加载完 —— 大厅的密度本身就是"这里有人"的信号。
 */
export const PAGE_SIZE = 10

export const useLobby = create<LobbyState>((set, get) => ({
  rooms: makeRooms(23),
  myRoomId: null,
  playing: false,
  filter: 'all',
  query: '',
  page: 0,

  setFilter: (filter) => set({ filter, page: 0 }),
  setQuery: (query) => set({ query, page: 0 }),
  setPage: (page) => set({ page }),
  // 刷新只换掉别人的房间，我自己那间留着 —— 刷新的时候被踢出房是很烦的
  refresh: () =>
    set((s) => {
      const mine = s.rooms.find((r) => r.id === s.myRoomId)
      return { rooms: mine ? [mine, ...makeRooms(22)] : makeRooms(23), page: 0 }
    }),

  createRoom: ({ name, game, password }) => {
    const g = gameById(game)
    const room: Room = {
      id: `r${nextNo}`,
      no: nextNo++,
      name: name.trim() || `${ME.name}的房间`,
      game,
      max: g.players.max,
      players: [{ ...ME, isAI: false, host: true }],
      locked: !!password,
      password,
      status: 'waiting',
    }
    set((s) => ({ rooms: [room, ...s.rooms], myRoomId: room.id, page: 0 }))
    return room.id
  },

  join: (id, password) => {
    const room = get().rooms.find((r) => r.id === id)
    if (!room) return '房间不见了'
    if (room.status === 'playing') return '这一局已经开始了'
    if (room.players.length >= room.max) return '房间满了'
    if (room.locked && password !== room.password) return '密码不对'
    set((s) => ({
      myRoomId: id,
      rooms: s.rooms.map((r) =>
        r.id === id ? { ...r, players: [...r.players, { ...ME, isAI: false, host: false }] } : r,
      ),
    }))
    return null
  },

  leave: () =>
    set((s) => {
      const room = s.rooms.find((r) => r.id === s.myRoomId)
      if (!room) return { myRoomId: null, playing: false }
      const rest = room.players.filter((p) => p.isAI)
      return {
        myRoomId: null,
        playing: false,
        // 我建的房，人走了房就没了；别人的房把我摘掉就行
        rooms:
          rest.length === 0
            ? s.rooms.filter((r) => r.id !== room.id)
            : s.rooms.map((r) =>
                r.id === room.id
                  ? { ...r, status: 'waiting' as const, players: rest.map((p, i) => ({ ...p, host: i === 0 })) }
                  : r,
              ),
      }
    }),

  /** 开局。空位当场由 AI 补满 —— 这条从 3D 大厅那时候就是这样 */
  start: () =>
    set((s) => {
      const room = s.rooms.find((r) => r.id === s.myRoomId)
      if (!room) return {}
      const need = room.max - room.players.length
      const fillers = mockPlayers(need + room.players.length)
        .filter((f) => !room.players.some((p) => p.name === f.name))
        .slice(0, need)
        .map((f) => ({ ...f, host: false }))
      return {
        playing: true,
        rooms: s.rooms.map((r) =>
          r.id === room.id
            ? { ...r, status: 'playing' as const, players: [...r.players, ...fillers] }
            : r,
        ),
      }
    }),

  endGame: () =>
    set((s) => ({
      playing: false,
      rooms: s.rooms.map((r) => (r.id === s.myRoomId ? { ...r, status: 'waiting' as const } : r)),
    })),
}))

/** 当前所在的房间 */
export const useMyRoom = (): Room | null => {
  const id = useLobby((s) => s.myRoomId)
  const rooms = useLobby((s) => s.rooms)
  return rooms.find((r) => r.id === id) ?? null
}

/** 过滤 + 搜索之后的房间列表 */
export function visibleRooms(rooms: Room[], filter: Filter, query: string): Room[] {
  const q = query.trim()
  return rooms.filter(
    (r) =>
      (filter === 'all' || r.game === filter) &&
      (q === '' || r.name.includes(q) || String(r.no).includes(q)),
  )
}
