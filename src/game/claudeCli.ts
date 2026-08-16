import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { Completer } from './llm'

const run = promisify(execFile)

/**
 * 用本地的 `claude` CLI 当模型。
 *
 * 走的是 Claude Code 已有的登录，**不需要 API key** —— 本机验证时最省事的一条路。
 *
 * 两个天然的好处：
 *   1. 每次 `claude -p` 都是全新会话，agent 之间不共享任何上下文。
 *      多个 AI 跑在一起时的"串味"在这里是结构上不可能的。
 *   2. 不用管配额和计费口径，直接就能跑。
 *
 * 代价是慢：一次调用约 3 秒（大头是进程启动），所以**只适合跑单局观察**，
 * 批量统计还是得用 API。一局 5 人 + 1 轮讨论大约 60~90 次调用，也就是 3~5 分钟。
 */
export function claudeCliCompleter(): Completer {
  return async ({ system, user, schema }) => {
    const prompt = [
      system,
      '',
      user,
      '',
      '只输出一个 JSON 对象，不要任何解释、前言或代码块围栏。必须符合这个 schema：',
      JSON.stringify(schema),
    ].join('\n')

    const { stdout } = await run('claude', ['-p', prompt], {
      maxBuffer: 4 * 1024 * 1024,
      timeout: 120_000,
    })

    return parseLoose(stdout)
  }
}

/**
 * 宽松解析。
 *
 * CLI 偶尔会裹代码块围栏或在前后带一句话 —— 这不是模型能力问题，
 * 是"没有 schema 强约束"的必然结果（对比 Anthropic API 的
 * output_config.format，那个由服务端保证结构）。
 * 所以这里抠出第一个平衡的花括号块，抠不出来就抛错，
 * 交给 runner 当作一次调用报错去重试。
 */
function parseLoose(raw: string): Record<string, unknown> {
  const text = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    // 括号配平扫描，比正则可靠：JSON 里可能有嵌套对象
    const start = text.indexOf('{')
    if (start < 0) throw new Error(`claude CLI 没返回 JSON：${text.slice(0, 200)}`)
    let depth = 0
    let inStr = false
    let esc = false
    for (let i = start; i < text.length; i++) {
      const c = text[i]
      if (inStr) {
        if (esc) esc = false
        else if (c === '\\') esc = true
        else if (c === '"') inStr = false
        continue
      }
      if (c === '"') inStr = true
      else if (c === '{') depth++
      else if (c === '}' && --depth === 0) {
        return JSON.parse(text.slice(start, i + 1)) as Record<string, unknown>
      }
    }
    throw new Error(`claude CLI 返回的 JSON 不完整：${text.slice(0, 200)}`)
  }
}
