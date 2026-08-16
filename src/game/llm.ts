import Anthropic from '@anthropic-ai/sdk'

/**
 * 模型调用的最小接口。
 *
 * 真 Anthropic 客户端和确定性的假 LLM 都实现它，
 * 所以**整条管线（prompt 构造 → 解析 → 重试 → 防泄漏 → 竞价发言）
 * 不需要 API key 就能端到端验证**。
 * 没有这层的话，"管线对不对"和"模型行不行"两个问题会纠缠在一起，
 * 而前者本该是确定性可测的。
 */
export type Completer = (req: {
  system: string
  user: string
  schema: object
  maxTokens?: number
}) => Promise<Record<string, unknown>>

export type LlmConfig = {
  model?: string
  /** low | medium | high | xhigh | max */
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  maxTokens?: number
}

/**
 * 真实的 Anthropic completer。
 *
 * 用结构化输出（output_config.format）而不是"请返回 JSON"式的提示词 ——
 * 后者需要正则抽取 + 解析失败重试一整套脚手架，而结构化输出直接由 API 保证
 * 返回值符合 schema。agent 给非法动作的概率因此大幅下降，
 * 剩下的非法动作（比如队伍人数不对）才是真正的能力问题。
 */
export function anthropicCompleter(cfg: LlmConfig = {}): Completer {
  const client = new Anthropic()
  const model = cfg.model ?? 'claude-opus-5'
  const effort = cfg.effort ?? 'medium'
  // max_tokens 同时盖住思考和输出。Opus 5 默认开启自适应思考，
  // 留得太紧会在思考中途被截断，返回半个 JSON。
  const maxTokens = cfg.maxTokens ?? 4096

  return async ({ system, user, schema, maxTokens: override }) => {
    const res = await client.messages.create({
      model,
      max_tokens: override ?? maxTokens,
      system,
      output_config: {
        effort,
        format: { type: 'json_schema', schema } as never,
      } as never,
      messages: [{ role: 'user', content: user }],
    })

    if (res.stop_reason === 'refusal') {
      throw new Error(`模型拒绝了这次请求：${JSON.stringify(res.stop_details)}`)
    }
    const text = res.content.find((b) => b.type === 'text')
    if (!text || text.type !== 'text') {
      throw new Error(`响应里没有文本块（stop_reason=${res.stop_reason}）`)
    }
    return JSON.parse(text.text) as Record<string, unknown>
  }
}

/** 累计用量，跑 benchmark 时用来算成本 */
export type Usage = { calls: number; inputTokens: number; outputTokens: number }

/** 包一层统计。成本是这类实验最容易失控的东西，默认就该量 */
export function counted(inner: Completer, usage: Usage): Completer {
  return async (req) => {
    usage.calls++
    return inner(req)
  }
}
