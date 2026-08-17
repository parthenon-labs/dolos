import type { PlayerView } from '../../game/types'
import { MAX_REJECTS } from '../../game/rules'

/**
 * 顶部状态条：五轮任务的进度、本轮队伍规模、连续否决次数。
 *
 * 否决计数必须显眼 —— 连续 5 次否决坏人直接获胜，这是新手最常忽略、
 * 也是坏人最常用的赢法。埋在角落里等于没写。
 */
export function QuestTrack({
  view,
  teamSizes,
}: {
  view: PlayerView | null
  teamSizes: number[]
}) {
  const results = view?.questResults ?? []
  const rejects = view?.consecutiveRejects ?? 0
  const danger = rejects >= MAX_REJECTS - 2

  return (
    <div className="quest-track">
      <div className="quests">
        {teamSizes.map((size, i) => {
          const r = results[i]
          const state = !r ? (i === results.length ? 'now' : 'todo') : r.success ? 'ok' : 'bad'
          return (
            <div key={i} className={'q ' + state}>
              <span className="size">{size}</span>
              {r && r.fails > 0 && <span className="fails">{r.fails}</span>}
            </div>
          )
        })}
      </div>

      <div className={'rejects' + (danger ? ' danger' : '')}>
        连续否决
        <span className="dots">
          {Array.from({ length: MAX_REJECTS }, (_, i) => (
            <i key={i} className={i < rejects ? 'on' : ''} />
          ))}
        </span>
        <span className="n">
          {rejects}/{MAX_REJECTS}
        </span>
        {danger && <em>再否决就是坏人赢</em>}
      </div>
    </div>
  )
}
