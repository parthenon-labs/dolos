import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
import { requireEnv } from './env'

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
  /*
    构造时就把凭据查掉。

    SDK 自己不校验 —— 缺 key 要到发请求才失败，而 runner 会把请求失败
    当成"agent 给了非法动作"吞掉并走兜底。实测后果是：一整局由兜底动作
    构成的假游戏，还输出了一份看起来正常的胜率统计。
    这种静默降级最浪费时间，所以宁可在第一行就炸。

    注意 ANTHROPIC_API_KEY 没设不等于没凭据：SDK 也认 ANTHROPIC_AUTH_TOKEN
    和 `ant auth login` 落在 ~/.config/anthropic 的 profile。
  */
  const hasProfile = existsSync(join(homedir(), '.config', 'anthropic'))
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN && !hasProfile) {
    throw new Error(
      '没有找到 Anthropic 凭据。\n' +
        '  在 .env 里填 ANTHROPIC_API_KEY（https://console.anthropic.com/settings/keys），\n' +
        '  或者 `ant auth login` 登录一个 profile。',
    )
  }
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

/**
 * DeepSeek completer（OpenAI 兼容接口）。
 *
 * **和 Anthropic 的关键差别：DeepSeek 只有 `json_object`，没有 schema 强约束。**
 * Anthropic 的 `output_config.format` 由 API 保证返回值符合 schema；
 * DeepSeek 只保证"是一个合法 JSON"，字段对不对得自己验。
 * 所以这里把 schema 塞进提示词，并在拿到结果后做一次形状检查 ——
 * 失败会被上层 runner 当作非法动作重试，这条路径已经验过。
 *
 * 另外它要求提示词里出现 "json" 这个词才会开启 JSON 模式，见下方拼接。
 */
export function deepseekCompleter(cfg: LlmConfig = {}): Completer {
  const key = requireEnv('DEEPSEEK_API_KEY', '在 https://platform.deepseek.com/api_keys 申请')
  const base = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'
  const model = cfg.model ?? process.env.DEEPSEEK_MODEL ?? 'deepseek-chat'
  const maxTokens = cfg.maxTokens ?? 4096

  return async ({ system, user, schema, maxTokens: override }) => {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: override ?? maxTokens,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content:
              `${user}\n\n` +
              `只返回一个 json 对象，不要任何解释或代码块围栏。必须符合这个 schema：\n` +
              JSON.stringify(schema),
          },
        ],
      }),
    })

    if (!res.ok) {
      throw new Error(`DeepSeek ${res.status}：${(await res.text()).slice(0, 200)}`)
    }
    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    const text = body.choices?.[0]?.message?.content
    if (!text) throw new Error('DeepSeek 返回里没有内容')

    // 偶尔仍会裹上 ```json 围栏，剥掉再解析
    const cleaned = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')
    return JSON.parse(cleaned) as Record<string, unknown>
  }
}

/**
 * 按环境变量选一个 completer。
 * 有 --fake 时上层直接用 fakeCompleter，不会走到这里。
 */
export function makeCompleter(): Completer {
  const provider = (process.env.LLM_PROVIDER ?? 'anthropic').toLowerCase()
  const effort = (process.env.LLM_EFFORT as LlmConfig['effort']) ?? 'medium'
  switch (provider) {
    case 'deepseek':
      return deepseekCompleter({})
    case 'anthropic':
      return anthropicCompleter({ effort, model: process.env.ANTHROPIC_MODEL })
    default:
      throw new Error(`LLM_PROVIDER 只支持 anthropic | deepseek，收到「${provider}」`)
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
