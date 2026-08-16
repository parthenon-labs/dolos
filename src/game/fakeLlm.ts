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
        // 故意包含一句可能泄漏的话，用来验证防泄漏层真的在工作
        out[key] =
          rng() < 0.25
            ? '我确定 1 号是坏人，因为我看得到坏人是谁。'
            : '我觉得上一轮那支队伍有问题，先观望。'
      } else if (key === 'team') {
        // 从 user 文案里抠出人数和玩家范围，凑一支合法队伍
        const size = Number(/选出 (\d+) 个玩家编号/.exec(user)?.[1] ?? 2)
        const max = Number(/范围 0-(\d+)/.exec(JSON.stringify(schema))?.[1] ?? 4)
        const pool = Array.from({ length: max + 1 }, (_, i) => i)
        for (let i = pool.length - 1; i > 0; i--) {
          const j = Math.floor(rng() * (i + 1))
          ;[pool[i], pool[j]] = [pool[j], pool[i]]
        }
        out[key] = pool.slice(0, size)
      } else if (key === 'target') {
        const max = Number(/0-(\d+)/.exec(def.description ?? '')?.[1] ?? 4)
        out[key] = Math.floor(rng() * (max + 1))
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
