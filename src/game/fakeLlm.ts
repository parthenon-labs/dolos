import type { Completer } from './llm'
import { makeRng } from './rules'

/**
 * 确定性的假 LLM。
 *
 * 它读 schema 猜要什么字段，然后按种子给出合法但随意的答案。
 * **它不"会玩"，也不需要会玩** —— 它的职责是让整条管线（prompt 构造、
 * 结构化输出解析、非法动作重试、防泄漏审查、发言竞价）在没有 API key
 * 的情况下也能端到端跑通并被验证。
 *
 * 分清"管线坏了"和"模型不行"，是这类项目里最省时间的一件事。
 */
export function fakeCompleter(seed = 7): Completer {
  const rng = makeRng(seed)
  return async ({ schema, user }) => {
    const s = schema as {
      properties?: Record<string, { type?: string; description?: string }>
    }
    const props = s.properties ?? {}
    const out: Record<string, unknown> = {}

    for (const [key, def] of Object.entries(props)) {
      if (key === 'reasoning') {
        out[key] = '（假 LLM：这里本该是模型的推理）'
      } else if (key === 'speech') {
        out[key] = fakeSpeech(rng, user)
      } else if (key === 'team') {
        // 从 user 文案里抠出人数和玩家范围，凑一支合法队伍。
        // **座位号是 1 起始的**，和真模型看到的完全一致 ——
        // 假模型一旦和真模型说不同的协议，它就不再能验证管线了
        const size = Number(/选出 (\d+) 个玩家编号/.exec(user)?.[1] ?? 2)
        const max = Number(/范围 1-(\d+)/.exec(JSON.stringify(schema))?.[1] ?? 5)
        const pool = Array.from({ length: max }, (_, i) => i + 1)
        for (let i = pool.length - 1; i > 0; i--) {
          const j = Math.floor(rng() * (i + 1))
          ;[pool[i], pool[j]] = [pool[j], pool[i]]
        }
        out[key] = pool.slice(0, size)
      } else if (key === 'target') {
        const max = Number(/1-(\d+)/.exec(def.description ?? '')?.[1] ?? 5)
        out[key] = 1 + Math.floor(rng() * max)
      } else if (key === 'bid') {
        out[key] = Math.floor(rng() * 5)
      } else if (def.type === 'boolean') {
        // approve 偏向同意（否则连续否决会让局面草草结束）；success 偏向成功
        out[key] = key === 'approve' ? rng() < 0.75 : rng() < 0.7
      } else if (def.type === 'integer') {
        out[key] = 0
      } else {
        out[key] = ''
      }
    }
    return out
  }
}

/**
 * 假发言。
 *
 * 语料铺得比"跑通管线"所需的多，是**为了能评判界面**：
 * 两条一模一样的发言会让人以为记录区坏了，判断不出真实观感。
 * 内容不需要聪明，只需要**长短不一、指涉具体编号、语气有差别** ——
 * 记录区的排版压力全部来自这三点。
 *
 * 那句"我看得到坏人是谁"是故意留的：它必须被防泄漏层拦下来。
 * 删掉它就失去了这条防线的唯一活体测试。
 */
function fakeSpeech(rng: () => number, user: string): string {
  // 从提示词里抠几个真实存在的玩家编号，让发言指涉具体的人而不是占位符
  const ids = [...new Set([...user.matchAll(/\b(\d)\s*号/g)].map((m) => m[1]))]
  const who = () => ids[Math.floor(rng() * ids.length)] ?? String(Math.floor(rng() * 5))

  // 25% 概率吐一句会泄漏身份的话，用来验证防泄漏层真的在工作
  if (rng() < 0.25) {
    return LEAKS[Math.floor(rng() * LEAKS.length)].replace('{a}', who())
  }
  const t = LINES[Math.floor(rng() * LINES.length)]
  return t.replace('{a}', who()).replace('{b}', who())
}

// 这几句必须被 detectLeak 拦下。**不要往这里放"假称身份"的句子** ——
// 那是合法战术，防泄漏层放行它是对的，混进来会让人误以为有洞。
const LEAKS = [
  '我确定 {a} 号是坏人，因为我看得到坏人是谁。',
  '我是梅林，{a} 号跟我不是一边的，信我。',
  '我知道 {a} 号一定是好人，别怀疑他。',
]

const LINES = [
  '我觉得上一轮那支队伍有问题，先观望。',
  '{a} 号刚才那票投得很奇怪，明明没理由否。',
  '带我吧，我这轮肯定出成功。',
  '不太想带 {a} 号，上次有他在就崩了。',
  '这轮很关键，别乱试人，用打过成功的那套。',
  '{a} 号和 {b} 号同时在队里我不放心，至少拆一个。',
  '我同意这支队伍，但如果失败了，责任在提名的人。',
  '先别急着定，听听 {a} 号怎么说。',
  '我一直被跳过，是不是有人在故意压我。',
  '连续否决太多了，再拖下去我们直接输。',
  '{a} 号从开局到现在一句实话都没有。',
  '我可以不上，但队伍里必须有 {b} 号。',
  '上一轮出了失败牌的人就在这三个里面。',
  '你们都盯着我，真正有问题的是 {a} 号。',
  '我这票是给提名的人面子，不是相信这支队伍。',
  '如果这轮再失败，剩下的就没得试了。',
  '{a} 号刚才改口了，前后对不上。',
  '我不说话不代表我没看，我在等。',
  '我手里是失败牌，这轮我不上。',
  '我是梅林，信我 —— 爱信不信。',
]
