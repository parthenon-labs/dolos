import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * 极简 .env 读取。
 *
 * 不用 Node 的 --env-file：文件不存在时它会直接报错，
 * 而 `npm run game`（规则 bot、不联网）本来就不需要任何 key，
 * 不该因为没建 .env 就跑不起来。
 * 也不用 dotenv：为读十几行文本引一个依赖不划算。
 *
 * 已经存在的环境变量优先 —— 命令行里临时 export 的值不该被文件覆盖。
 */
export function loadEnv(file = '.env'): void {
  const path = resolve(process.cwd(), file)
  if (!existsSync(path)) return

  for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 0) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    // 去掉成对的引号，保留值里面的等号
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (key && process.env[key] === undefined) process.env[key] = value
  }
}

/** 拿一个必填的环境变量，缺了就给一句能照做的错误 */
export function requireEnv(key: string, hint: string): string {
  const v = process.env[key]
  if (!v) {
    throw new Error(
      `缺少环境变量 ${key}。\n  ${hint}\n  把它写进项目根目录的 .env（可以从 .env.example 复制）。`,
    )
  }
  return v
}
