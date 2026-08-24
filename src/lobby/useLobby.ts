import { create } from 'zustand'
import { GAMES, gameById, type GameId } from '../games/registry'
import { me } from '../state/useProfile'

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

export type ChatLine = { id: number; who: string; text: string; system?: boolean }

/** 房间里的累计战绩。一个名字一行 */
export type RecordRow = { name: string; games: number; wins: number; score: number }

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
  chat: ChatLine[]
  /**
   * 刚打完一局。
   *
   * 这个标记只做一件事：**打完之后不要再自动开局**。
   * 少了它，在别人的房里点"回房间"，AI 房主立刻又倒数三秒开下一局，
   * 于是回不去大厅 —— 唯一的出路是在牌桌里点"离开"，
   * 而那时玩家已经以为自己按错了。
   *
   * 顺带它也让"再来一局"对所有人可点，不用等房主。
   */
  finished?: boolean
  /**
   * 这间房打到现在的累计战绩。
   *
   * 每个游戏自己的分数只活在一次"开局"里 —— 回房间再来一局就归零。
   * 但**人对"今天在这桌是赢是输"是有记忆的**，界面没有的话，
   * 连打三局会觉得每一局都是孤立的，房间就只是个开局按钮。
   */
  record: RecordRow[]
  /**
   * 这间房是我开的。
   *
   * 有了它，离开时就能把自己的房拆掉。不然会留下一间**孤儿房**：
   * 房主走了、里面全是我开局时补进来的 AI，而如果它还带着密码，
   * 我自己都再也进不去 —— 一间谁也进不去的房挂在列表上，纯粹是垃圾。
   */
  mine?: boolean
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
    chat: [],
    record: [],
  }
}

/** 补位 AI 在房间里会说的话。少而杂，多了会露馅 */
const AI_LINES = [
  '来了来了', '等等我', '开吧开吧', '这把稳了', '手气不行啊',
  '刚输一把', '有人吗', '快点快点', '我准备好了', '摸鱼中',
  '这局我先看看', '上一把太惨了', '再来一局', '走一个',
]
let chatId = 0

const makeRooms = (n: number) => Array.from({ length: n }, mockRoom)

type LobbyState = {
  rooms: Room[]
  myRoomId: string | null
  /** 我这一局已经开打了。开打之后大厅让位给游戏界面 */
  playing: boolean
  filter: Filter
  query: string
  page: number

  /** 大厅自己动起来：有人进有人出、有房间开了又散了 */
  tick: () => void
  /** 一键开玩。返回失败原因，成功返回 null */
  quickPlay: () => string | null
  say: (text: string) => void
  /** 一局打完，把结果并进房间战绩 */
  recordResult: (rows: { name: string; delta: number; won: boolean }[]) => void
  /** 房里的 AI 随口说一句 */
  aiChatter: () => void
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

/**
 * 上次看的是哪一类。
 *
 * 只想打斗地主的人，每次进来都要先点一下"斗地主" —— 一次不烦，
 * 第五次就烦了。这种"上次怎么样"的小记忆，是"顺手"和"能用"之间的差别。
 */
const FILTER_KEY = 'dolos.filter'
const loadFilter = (): Filter => {
  try {
    const v = localStorage.getItem(FILTER_KEY)
    return v === 'poker' || v === 'ddz' || v === 'catan' ? v : 'all'
  } catch {
    return 'all'
  }
}

export const useLobby = create<LobbyState>((set, get) => ({
  rooms: makeRooms(23),
  myRoomId: null,
  playing: false,
  filter: loadFilter(),
  query: '',
  page: 0,

  /**
   * 让大厅活着。
   *
   * 一个**一动不动的房间列表看起来像张截图** —— 玩家会觉得这里没人。
   * 所以每隔几秒动一处：有人进房、有人退、某局开了、某局散了、
   * 偶尔冒出一间新的或者少一间。我自己那间永远不碰。
   */
  tick: () =>
    set((s) => {
      const others = s.rooms.filter((r) => r.id !== s.myRoomId)
      if (others.length === 0) return {}
      const i = Math.floor(Math.random() * others.length)
      const target = others[i]
      const roll = Math.random()

      let next: Room | null = { ...target }
      if (roll < 0.12 && s.rooms.length > 14) {
        next = null // 散了
      } else if (roll < 0.2 && s.rooms.length < 34) {
        // 新开一间，插在最前面
        return { rooms: [mockRoom(), ...s.rooms] }
      } else if (target.status === 'playing') {
        if (roll < 0.55) next.status = 'waiting'
      } else if (next.players.length < next.max && roll < 0.6) {
        const taken = new Set(next.players.map((p) => p.name))
        const add = mockPlayers(next.max).find((p) => !taken.has(p.name))
        if (add) next.players = [...next.players, { ...add, host: false }]
        if (next.players.length >= next.max) next.status = 'playing'
      } else if (next.players.length > 1) {
        next.players = next.players.slice(0, -1)
      }

      return {
        rooms: next
          ? s.rooms.map((r) => (r.id === target.id ? next! : r))
          : s.rooms.filter((r) => r.id !== target.id),
      }
    }),

  /**
   * 一键开玩。
   *
   * **能玩之前不该点五下。** 先在当前筛选下找一间进得去的（优先挑人最多的
   * ——最快能开局），找不到就直接开一间。这是这个大厅里最常用的按钮，
   * 也是"丝滑"这件事上性价比最高的一处。
   */
  quickPlay: () => {
    const s = get()
    const want = s.filter === 'all' ? null : s.filter
    const open = s.rooms
      .filter(
        (r) => r.status === 'waiting' && !r.locked && r.players.length < r.max && (!want || r.game === want),
      )
      .sort((a, b) => b.players.length - a.players.length)
    if (open.length > 0) return s.join(open[0].id)
    s.createRoom({ name: '快速开始', game: want ?? 'ddz', password: null })
    return null
  },

  say: (text) =>
    set((s) => {
      const t = text.trim()
      if (!t) return {}
      return {
        rooms: s.rooms.map((r) =>
          r.id === s.myRoomId
            ? { ...r, chat: [...r.chat, { id: chatId++, who: me().name, text: t }].slice(-40) }
            : r,
        ),
      }
    }),

  /**
   * 记一局。
   *
   * 按**名字**归并而不是座位号：座位每局都在轮转，
   * 而"今天赢了老孙三把"这件事记的是人。
   */
  recordResult: (rows) =>
    set((s) => {
      if (!s.myRoomId) return {}
      return {
        rooms: s.rooms.map((r) => {
          if (r.id !== s.myRoomId) return r
          const rec = r.record.map((x) => ({ ...x }))
          for (const row of rows) {
            let cur = rec.find((x) => x.name === row.name)
            if (!cur) {
              cur = { name: row.name, games: 0, wins: 0, score: 0 }
              rec.push(cur)
            }
            cur.games++
            if (row.won) cur.wins++
            cur.score += row.delta
          }
          return { ...r, record: rec }
        }),
      }
    }),

  aiChatter: () =>
    set((s) => {
      const room = s.rooms.find((r) => r.id === s.myRoomId)
      if (!room || room.status === 'playing') return {}
      const ais = room.players.filter((p) => p.isAI)
      if (ais.length === 0) return {}
      const who = pick(ais).name
      return {
        rooms: s.rooms.map((r) =>
          r.id === room.id
            ? { ...r, chat: [...r.chat, { id: chatId++, who, text: pick(AI_LINES) }].slice(-40) }
            : r,
        ),
      }
    }),

  setFilter: (filter) => {
    try {
      localStorage.setItem(FILTER_KEY, filter)
    } catch {
      // 无痕模式。记不住就算了
    }
    set({ filter, page: 0 })
  },
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
      name: name.trim() || `${me().name}的房间`,
      game,
      max: g.players.max,
      players: [{ ...me(), isAI: false, host: true }],
      locked: !!password,
      password,
      status: 'waiting',
      chat: [{ id: chatId++, who: '', text: '房间开好了，等人齐就能开始', system: true }],
      record: [],
      mine: true,
    }
    set((s) => ({ rooms: [room, ...s.rooms], myRoomId: room.id, page: 0 }))
    return room.id
  },

  join: (id, password) => {
    const room = get().rooms.find((r) => r.id === id)
    if (!room) return '房间不见了'
    if (room.status === 'playing') return '这一局已经开始了'
    if (room.players.length >= room.max) return '房间满了'
    /**
     * 别人的带锁房间进不去，而且**界面上就该看得出来**。
     *
     * 这些房间是本地造出来的，密码只有代码知道 —— 玩家点进去只能吃一句
     * "密码不对"，而他没有任何办法知道正确答案。
     * 那不是一道门，是一堵装了门铃的墙。
     *
     * 所以列表里把它们和"满员""游戏中"归成一类：看得见、进不去、
     * 一眼知道为什么。建房时仍然可以设密码 —— 那是接了服务端之后
     * 真正会用到的东西，而且设的人自己就在房里。
     */
    if (room.locked && password !== room.password) return '这间房要密码'
    set((s) => ({
      myRoomId: id,
      rooms: s.rooms.map((r) =>
        r.id === id
          ? {
              ...r,
              players: [...r.players, { ...me(), isAI: false, host: false }],
              chat: [
                ...r.chat,
                { id: chatId++, who: '', text: `${me().name}进来了`, system: true },
                // 进门有人搭话，房间才像有人。全静默的房间比空房间更冷
                { id: chatId++, who: r.players[0].name, text: pick(AI_LINES) },
              ].slice(-40),
            }
          : r,
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
          room.mine || rest.length === 0
            ? s.rooms.filter((r) => r.id !== room.id)
            : s.rooms.map((r) =>
                r.id === room.id
                  ? {
                      ...r,
                      status: 'waiting' as const,
                      // 战绩跟着"这一桌人"走。我走了，这桌就散了
                      record: [],
                      finished: false,
                      players: rest.map((p, i) => ({ ...p, host: i === 0 })),
                    }
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
            ? { ...r, status: 'playing' as const, finished: false, players: [...r.players, ...fillers] }
            : r,
        ),
      }
    }),

  endGame: () =>
    set((s) => ({
      playing: false,
      rooms: s.rooms.map((r) =>
        r.id === s.myRoomId
          ? {
              ...r,
              status: 'waiting' as const,
              finished: true,
              chat: [...r.chat, { id: chatId++, who: '', text: '这一局结束了', system: true }].slice(-40),
            }
          : r,
      ),
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
