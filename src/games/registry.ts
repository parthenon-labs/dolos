/**
 * 桌上能开哪些游戏。
 *
 * 大厅是"地方"，桌子是"地方里的一张桌子" —— 桌子本身不该知道在打什么。
 * 所以落座之后先出一块选择面板，选完了才由对应游戏的 2D 层接管。
 * 这也是当初把牌桌做成盖在 3D 上的一层、而不是替换掉 3D 的原因：
 * 换游戏、离席都只是换这一层，场景一直在那儿。
 *
 * **人数和椅子数是两回事**。斗地主永远三个人，卡坦最多四个，
 * 六人桌开斗地主就是坐三个人打，剩下的椅子空着 —— 这比"椅子有几把就几个人"更接近真实。
 */

export type GameId = 'poker' | 'ddz' | 'catan'

export type GameDef = {
  id: GameId
  name: string
  /** 选择面板上的一句话 */
  tagline: string
  /** 参与人数区间 */
  players: { min: number; max: number }
  /**
   * 这个游戏的主色。
   *
   * 大厅里一屏有七八行房间，**玩家是靠颜色扫的，不是靠读字的** ——
   * 三种游戏必须在余光里就能分开。所以颜色定义在这里而不是散在 CSS，
   * 房间行、标签页、创建面板用的是同一个值。
   */
  accent: string
}

export const GAMES: GameDef[] = [
  {
    id: 'poker',
    name: '德州扑克',
    tagline: '两到六人。盲注、四条街、边池、摊牌，规则是完整的。',
    players: { min: 2, max: 6 },
    accent: '#d9483f',
  },
  {
    id: 'ddz',
    name: '斗地主',
    tagline: '三人。叫地主、抢地主，炸弹翻倍，春天再翻。',
    players: { min: 3, max: 3 },
    accent: '#e8952f',
  },
  {
    id: 'catan',
    name: '卡坦岛',
    tagline: '三到四人。掷骰、造路建村、强盗、发展卡，十分获胜。',
    players: { min: 3, max: 4 },
    accent: '#3f9c62',
  },
]

export const gameById = (id: GameId): GameDef =>
  GAMES.find((g) => g.id === id) ?? GAMES[0]

/**
 * 这张桌子开这个游戏，实际坐几个人。
 *
 * 椅子不够就返回 0（面板上置灰）。现在大厅最小的桌子是四把椅子，
 * 三个游戏都开得起来，但这个判断得留着 —— 以后加两人的小圆桌就会用上。
 */
export function playersFor(game: GameDef, tableSeats: number): number {
  if (tableSeats < game.players.min) return 0
  return Math.min(tableSeats, game.players.max)
}
