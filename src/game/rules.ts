import { type PlayerId, type Role, isEvil } from './types'

/**
 * 规则表和可见性拓扑。
 *
 * 可见性是阿瓦隆最容易写错的地方，因为它有一堆例外的例外：
 * 莫德雷德对梅林隐身、奥伯伦对同伙也隐身、派西维尔看到两个人但分不清谁是谁。
 * 所以这里把它写成**数据驱动的一张表**而不是一串 if —— 加角色时改表，不改逻辑。
 */

/** 各人数下的坏人数量（官方规则） */
const EVIL_COUNT: Record<number, number> = {
  5: 2, 6: 2, 7: 3, 8: 3, 9: 3, 10: 4,
}

/** 各人数下五轮任务的队伍规模 */
const TEAM_SIZES: Record<number, number[]> = {
  5: [2, 3, 2, 3, 3],
  6: [2, 3, 4, 3, 4],
  7: [2, 3, 3, 4, 4],
  8: [3, 4, 4, 5, 5],
  9: [3, 4, 4, 5, 5],
  10: [3, 4, 4, 5, 5],
}

export const MIN_PLAYERS = 5
export const MAX_PLAYERS = 10
export const QUESTS = 5
export const MAX_REJECTS = 5

export function evilCount(playerCount: number): number {
  const n = EVIL_COUNT[playerCount]
  if (n === undefined) throw new Error(`不支持 ${playerCount} 人局`)
  return n
}

export function teamSize(playerCount: number, questIndex: number): number {
  const sizes = TEAM_SIZES[playerCount]
  if (!sizes) throw new Error(`不支持 ${playerCount} 人局`)
  return sizes[questIndex]
}

/**
 * 第四轮在 7 人以上需要**两张**失败牌才算失败。
 * 这条特例经常被漏掉，而它直接改变坏人的策略。
 */
export function needsTwoFails(playerCount: number, questIndex: number): boolean {
  return playerCount >= 7 && questIndex === 3
}

/* ---------------- 角色分配 ---------------- */

/**
 * 按人数和启用的特殊角色凑出角色表。
 * 梅林和刺客是必选的 —— 没有他们就没有刺杀环节，游戏结构会塌掉。
 */
export function buildRoles(playerCount: number, optional: Role[]): Role[] {
  const evil = evilCount(playerCount)
  const good = playerCount - evil

  const goodRoles: Role[] = ['merlin']
  const evilRoles: Role[] = ['assassin']

  for (const r of optional) {
    if (r === 'percival') goodRoles.push(r)
    else if (isEvil(r)) evilRoles.push(r)
  }

  if (evilRoles.length > evil) {
    throw new Error(`${playerCount} 人局最多 ${evil} 个坏人，给了 ${evilRoles.length} 个`)
  }
  while (goodRoles.length < good) goodRoles.push('servant')
  while (evilRoles.length < evil) evilRoles.push('minion')

  return [...goodRoles, ...evilRoles]
}

/* ---------------- 可见性 ---------------- */

/**
 * 谁能被谁看见，一张表说清楚。
 *
 * `hiddenFrom` 表示"这个角色对某一类观察者隐身"：
 *   mordred 对梅林隐身 —— 这是梅林最大的软肋
 *   oberon  对坏人同伙隐身 —— 他自己也看不见任何人
 */
const VISIBILITY = {
  /** 梅林能看到的坏人：除了莫德雷德 */
  merlinSees: (r: Role) => isEvil(r) && r !== 'mordred',
  /** 坏人之间互相能看到的：除了奥伯伦 */
  evilSees: (r: Role) => isEvil(r) && r !== 'oberon',
  /** 派西维尔看到的两个人：梅林和莫甘娜，但分不清 */
  percivalSees: (r: Role) => r === 'merlin' || r === 'morgana',
}

export function knowledgeFor(
  me: PlayerId,
  roles: Role[],
): { seesEvil: PlayerId[]; seesMerlinOrMorgana: PlayerId[] } {
  const myRole = roles[me]
  const ids = roles.map((_, i) => i)

  let seesEvil: PlayerId[] = []
  if (myRole === 'merlin') {
    seesEvil = ids.filter((i) => i !== me && VISIBILITY.merlinSees(roles[i]))
  } else if (isEvil(myRole) && myRole !== 'oberon') {
    // 奥伯伦谁也看不见，也没人看得见他
    seesEvil = ids.filter((i) => i !== me && VISIBILITY.evilSees(roles[i]))
  }

  const seesMerlinOrMorgana =
    myRole === 'percival'
      ? ids.filter((i) => i !== me && VISIBILITY.percivalSees(roles[i]))
      : []

  return {
    seesEvil: seesEvil.sort((a, b) => a - b),
    // 顺序必须打乱到无信息量 —— 否则派西维尔能靠编号顺序推出谁是梅林。
    // 这里用固定升序，调用方负责按种子洗牌。
    seesMerlinOrMorgana: seesMerlinOrMorgana.sort((a, b) => a - b),
  }
}

/* ---------------- 可复现的随机数 ---------------- */

/** mulberry32：小、快、够用，最重要的是同一个种子能复现整局 */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
