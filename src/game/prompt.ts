import { type PlayerView, type Role, isEvil } from './types'
import { MAX_REJECTS } from './rules'

/**
 * 把 PlayerView 翻成给模型看的简报。
 *
 * 这一层是纯函数、不碰网络，所以**它可以被单独测**：
 * 简报里出现了不该出现的信息，等于隐藏信息泄漏，
 * 而这种 bug 隔着一个语言模型是查不出来的。
 * project() 已经在类型层面挡住了越界，这里只负责把该给的说清楚。
 */

const ROLE_CN: Record<Role, string> = {
  merlin: '梅林', percival: '派西维尔', servant: '忠臣',
  assassin: '刺客', morgana: '莫甘娜', mordred: '莫德雷德',
  oberon: '奥伯伦', minion: '爪牙',
}

/** 每个角色只知道自己那点事，说明也要按角色裁剪 */
function roleBrief(v: PlayerView): string {
  const r = v.myRole
  const lines = [`你是 ${v.me} 号，身份是**${ROLE_CN[r]}**（${isEvil(r) ? '坏人阵营' : '好人阵营'}）。`]

  switch (r) {
    case 'merlin':
      lines.push(
        `你能看到坏人是谁，但**莫德雷德对你隐身**，所以你看到的可能不全。`,
        `你已知的坏人：${v.knowledge.seesEvil.join('、') || '（无）'}。`,
        `**最大的风险不是任务失败，是被刺客认出来。** 好人就算过了三轮，`,
        `刺客只要指认对你，坏人照样赢。所以你必须故意打得不那么"精准"——`,
        `一个每次都完美避开坏人的玩家，投票记录就是一张写着"我是梅林"的名片。`,
      )
      break
    case 'percival':
      lines.push(
        `你看到两个人，其中一个是梅林、另一个是莫甘娜，但**你分不清谁是谁**：`,
        `${v.knowledge.seesMerlinOrMorgana.join(' 和 ') || '（无）'}。`,
        `你的价值在于保护真梅林、并识破莫甘娜的伪装。`,
      )
      break
    case 'servant':
      lines.push(`你没有任何特殊信息，只能靠任务结果和发言推理。`)
      break
    case 'oberon':
      lines.push(
        `你是坏人，但**你看不到任何同伙，同伙也看不到你**。你只能独自行动。`,
      )
      break
    default:
      lines.push(
        `你的同伙：${v.knowledge.seesEvil.join('、') || '（无）'}。`,
        r === 'assassin'
          ? `如果好人过了三轮任务，**你有一次刺杀机会**：指认梅林就能翻盘。所以从现在起就要留意谁的判断"太准了"。`
          : `如果好人过了三轮，刺客会有一次刺杀梅林的机会，你要帮他找出梅林。`,
      )
      if (r === 'morgana') {
        lines.push(`派西维尔会把你和梅林混在一起看，你可以假装自己是梅林来误导他。`)
      }
      if (r === 'mordred') {
        lines.push(`**梅林看不到你**，这是你最大的优势，别轻易浪费。`)
      }
      break
  }
  return lines.join('\n')
}

/** 公开的历史。所有人看到的是同一份 */
function history(v: PlayerView): string {
  if (v.proposals.length === 0) return '（还没有任何提名）'
  const out: string[] = []
  for (const p of v.proposals) {
    const yes = p.votes.map((x, i) => (x ? i : -1)).filter((i) => i >= 0)
    out.push(
      `第 ${p.questIndex + 1} 轮 · ${p.leader} 号提名 [${p.team.join(', ')}]` +
        ` → 同意 ${yes.length}/${p.votes.length}（${yes.join(',') || '无'}）` +
        ` → ${p.approved ? '通过' : '否决'}`,
    )
    if (p.approved) {
      const q = v.quests.find((x) => x.questIndex === p.questIndex)
      if (q) {
        out.push(
          `    任务结果：失败牌 ${q.fails} 张 → ${q.success ? '成功' : '**失败**'}`,
        )
      }
    }
  }
  return out.join('\n')
}

function scoreboard(v: PlayerView): string {
  const good = v.quests.filter((q) => q.success).length
  const evil = v.quests.length - good
  return `任务战况：好人 ${good} 胜 / 坏人 ${evil} 胜（先到 3 胜）`
}

function transcript(v: PlayerView): string {
  if (v.transcript.length === 0) return '（本局还没有人发言）'
  return v.transcript.map((t) => `${t.player} 号：${t.text}`).join('\n')
}

/** 所有决策共用的背景。放在 system 里，便于命中提示缓存 */
export function systemPrompt(v: PlayerView): string {
  return [
    `你正在玩阿瓦隆（The Resistance: Avalon），${v.playerCount} 人局。`,
    ``,
    `规则要点：`,
    `- 五轮任务，好人要让 3 轮成功，坏人要让 3 轮失败。`,
    `- 每轮由队长提名一支队伍，全体表决；过半同意才能出发。`,
    `- 连续 ${MAX_REJECTS} 次否决，坏人直接获胜。`,
    `- 上了任务的人秘密出成功/失败牌，**只有坏人能出失败牌**，只公布失败张数。`,
    `- 好人赢下三轮后，刺客有一次机会指认梅林；指认正确则坏人翻盘。`,
    ``,
    roleBrief(v),
    ``,
    `你说的话所有人都听得见。**不要说出只有你的身份才知道的信息** ——`,
    `坏人自曝同伙、梅林精确点名坏人，都会直接输掉这局。`,
    `你可以撒谎、可以伪装成别的身份，这是这个游戏的一部分。`,
  ].join('\n')
}

/** 每次决策都会变的部分。放在 user 里 */
export function situation(v: PlayerView): string {
  return [
    scoreboard(v),
    ``,
    `历史记录：`,
    history(v),
    ``,
    `本局发言：`,
    transcript(v),
    ``,
    `当前：第 ${v.quests.length + 1} 轮，${v.leader} 号是队长，本轮任务需要 ${v.teamSize} 人` +
      (v.needsTwoFails ? '，**本轮需要两张失败牌才算失败**' : '') +
      `。已连续否决 ${v.consecutiveRejects} 次。`,
  ].join('\n')
}

/* ---------------- 各动作的提问与输出 schema ---------------- */

export const ASK = {
  propose: (v: PlayerView) => ({
    user: `${situation(v)}\n\n轮到你提名队伍。选出 ${v.teamSize} 个玩家编号（可以包含你自己）。`,
    schema: {
      type: 'object',
      properties: {
        reasoning: { type: 'string', description: '你的推理，不会公开' },
        team: {
          type: 'array',
          items: { type: 'integer' },
          description: `${v.teamSize} 个不重复的玩家编号，范围 0-${v.playerCount - 1}`,
        },
      },
      required: ['reasoning', 'team'],
      additionalProperties: false,
    },
  }),

  vote: (v: PlayerView) => ({
    user:
      `${situation(v)}\n\n${v.leader} 号提名的队伍是 [${v.team.join(', ')}]。` +
      `你同意让这支队伍出发吗？\n` +
      (v.consecutiveRejects >= MAX_REJECTS - 1
        ? `注意：这是第 ${v.consecutiveRejects + 1} 次表决，再否决一次坏人直接获胜。`
        : ''),
    schema: {
      type: 'object',
      properties: {
        reasoning: { type: 'string' },
        approve: { type: 'boolean', description: 'true = 同意，false = 否决' },
      },
      required: ['reasoning', 'approve'],
      additionalProperties: false,
    },
  }),

  quest: (v: PlayerView) => ({
    user:
      `${situation(v)}\n\n你在本轮任务队伍里。要出成功牌还是失败牌？\n` +
      (isEvil(v.myRole)
        ? `你是坏人，可以出失败牌破坏任务。但要考虑：失败牌会暴露这支队伍里有坏人，` +
          `而队伍名单是公开的 —— 有时忍一轮更划算。`
        : `你是好人，只能出成功牌。`),
    schema: {
      type: 'object',
      properties: {
        reasoning: { type: 'string' },
        success: { type: 'boolean', description: 'true = 成功牌，false = 失败牌' },
      },
      required: ['reasoning', 'success'],
      additionalProperties: false,
    },
  }),

  assassinate: (v: PlayerView) => ({
    user:
      `${situation(v)}\n\n好人已经赢下三轮任务。你是刺客，现在指认谁是梅林？\n` +
      `想想谁的投票和发言"太准了" —— 梅林知道坏人是谁，会不自觉地避开他们。`,
    schema: {
      type: 'object',
      properties: {
        reasoning: { type: 'string' },
        target: { type: 'integer', description: `玩家编号，0-${v.playerCount - 1}` },
      },
      required: ['reasoning', 'target'],
      additionalProperties: false,
    },
  }),

  speak: (v: PlayerView) => ({
    user:
      `${situation(v)}\n\n轮到你发言。一到三句话，像真人在牌桌上说话那样。\n` +
      `**再提醒一次：所有人都听得见。别说漏只有你知道的东西。**`,
    schema: {
      type: 'object',
      properties: {
        speech: { type: 'string', description: '公开发言，一到三句' },
      },
      required: ['speech'],
      additionalProperties: false,
    },
  }),

  /**
   * 发言竞价。抄自 Google Research 的 Werewolf Arena：
   * 自由讨论里"何时插话"是语音 AI 最难的一环，这是现成答案。
   */
  bid: (v: PlayerView) => ({
    user:
      `${situation(v)}\n\n你现在有多想发言？\n` +
      `0 = 旁听就行\n1 = 有点想说\n2 = 有关键且具体的内容\n3 = 非常急，必须下一个说\n4 = 被人点名了，必须回应`,
    schema: {
      type: 'object',
      properties: {
        bid: { type: 'integer', description: '0 到 4' },
      },
      required: ['bid'],
      additionalProperties: false,
    },
  }),
}
