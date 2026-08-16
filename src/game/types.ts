/**
 * 阿瓦隆的类型定义。
 *
 * 这一层是整个项目里唯一不能出错的地方 —— 隐藏信息一旦泄漏，游戏就不成立了。
 * 所以刻意把"完整状态"和"某个玩家能看到的状态"分成两个类型：
 * GameState 只存在于服务端，任何发给玩家的东西都必须是 PlayerView。
 * 靠类型把这条规则钉死，比靠自觉可靠。
 */

export type Role =
  | 'merlin'
  | 'percival'
  | 'servant'
  | 'assassin'
  | 'morgana'
  | 'mordred'
  | 'oberon'
  | 'minion'

export const EVIL_ROLES: Role[] = ['assassin', 'morgana', 'mordred', 'oberon', 'minion']
export const isEvil = (r: Role) => EVIL_ROLES.includes(r)

export type PlayerId = number

/** 五轮任务的阶段 */
export type Phase =
  | 'proposal' // 队长提名
  | 'vote' // 全体表决是否接受这支队伍
  | 'quest' // 队员出成功/失败
  | 'assassination' // 好人赢了三轮后，刺客指认梅林
  | 'ended'

export type GameConfig = {
  playerCount: number
  /** 除梅林/刺客外还启用哪些特殊角色 */
  optionalRoles: Role[]
  /** 随机种子，用来复现整局 */
  seed: number
}

/* ---------------- 事件 ---------------- */

/**
 * 只追加的事件流。状态 = fold(events)。
 *
 * 这样做同时解决四件事：断线重连（重放到当前 + 投影）、对局回放、
 * AI 的上下文来源、纠纷复盘。不做的话重连逻辑会变成噩梦。
 */
export type GameEvent =
  | { t: 'started'; roles: Role[]; firstLeader: PlayerId }
  | { t: 'proposed'; leader: PlayerId; team: PlayerId[] }
  /** 表决在阿瓦隆里是**公开**的，全部投完一起亮 */
  | { t: 'voted'; votes: boolean[] }
  | { t: 'vote_failed'; consecutiveRejects: number }
  /** 任务牌**永远保密**，只公布失败张数 */
  | { t: 'quest_played'; questIndex: number; fails: number; success: boolean }
  | { t: 'speech'; player: PlayerId; text: string }
  | { t: 'assassinated'; target: PlayerId; wasMerlin: boolean }
  | { t: 'ended'; winner: 'good' | 'evil'; reason: EndReason }

export type EndReason =
  | 'three_quests_good' // 好人过三轮且刺杀失败
  | 'three_quests_evil' // 坏人破坏三轮
  | 'assassin_found_merlin'
  | 'five_rejects' // 连续五次否决

/* ---------------- 服务端完整状态 ---------------- */

/** 一次提名的完整记录。**公开信息** —— 谁提的、带了谁、谁投了什么 */
export type ProposalRecord = {
  questIndex: number
  leader: PlayerId
  team: PlayerId[]
  votes: boolean[]
  approved: boolean
}

/** 一轮任务的记录。队伍和失败张数公开，谁出的失败牌永远保密 */
export type QuestRecord = {
  questIndex: number
  leader: PlayerId
  team: PlayerId[]
  fails: number
  success: boolean
}

export type GameState = {
  config: GameConfig
  /** 只在服务端存在 */
  roles: Role[]
  phase: Phase
  leader: PlayerId
  /** 当前提名的队伍 */
  team: PlayerId[]
  /** 已完成的任务结果，按轮次 */
  questResults: { fails: number; success: boolean }[]
  /** 本轮连续被否决的次数，到 5 坏人直接赢 */
  consecutiveRejects: number
  /** 最近一次表决，公开信息 */
  lastVotes: boolean[] | null
  winner: 'good' | 'evil' | null
  endReason: EndReason | null
  /** 完整发言记录 */
  transcript: { player: PlayerId; text: string }[]
  /** 所有提名，含被否决的。被否决的提名同样有信息量 —— 谁挺谁一目了然 */
  proposals: ProposalRecord[]
  /** 已完成的任务，带队伍构成 */
  quests: QuestRecord[]
  /** 当前待表决提名的队长，用来把票数归到正确的提名上 */
  pendingLeader: PlayerId | null
}

/* ---------------- 发给单个玩家的视图 ---------------- */

/**
 * 玩家能看到的一切。**服务端发出去的只能是这个类型。**
 * 注意这里没有 roles 字段 —— 只有 knowledge 里那点该知道的。
 */
export type PlayerView = {
  me: PlayerId
  myRole: Role
  playerCount: number
  /** 我通过角色能力得知的信息，用自然语言描述给 agent */
  knowledge: Knowledge
  phase: Phase
  leader: PlayerId
  team: PlayerId[]
  questResults: { fails: number; success: boolean }[]
  consecutiveRejects: number
  lastVotes: boolean[] | null
  /**
   * 历史记录。**这是好人唯一的硬信息来源** ——
   * 失败牌一定来自队伍里的某个坏人，不给历史等于让好人闭着眼睛玩。
   * 实测漏掉它时规则 bot 的好人胜率只有 2.2%，补上后回到正常区间。
   */
  proposals: ProposalRecord[]
  quests: QuestRecord[]
  /** 本轮任务需要几个人 */
  teamSize: number
  /** 本轮任务是否需要两张失败牌才算失败 */
  needsTwoFails: boolean
  transcript: { player: PlayerId; text: string }[]
  winner: 'good' | 'evil' | null
}

export type Knowledge = {
  /** 梅林看到的坏人（不含莫德雷德）；坏人看到的同伙（不含奥伯伦） */
  seesEvil: PlayerId[]
  /** 派西维尔看到的两个人，但分不清谁是梅林谁是莫甘娜 */
  seesMerlinOrMorgana: PlayerId[]
}
