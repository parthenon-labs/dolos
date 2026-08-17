import { useEffect, useMemo, useState } from 'react'
import { teamSize } from '../../game/rules'
import type { PlayerId } from '../../game/types'
import { useMatch } from '../../match/useMatchStore'
import { startMatch } from '../../match/runMatch'
import { useGameStore } from '../../state/useGameStore'
import { usePlayerStore } from '../../state/usePlayerStore'
import { tableById } from '../../scene/hallLayout'
import { ActionBar } from './ActionBar'
import { QuestTrack } from './QuestTrack'
import { SeatColumn } from './SeatColumn'
import { Transcript } from './Transcript'
import { RoleCard } from './RoleCard'
import type { Seat } from './types'

/**
 * 全屏对局界面。坐下之后盖住 3D 场景。
 *
 * 为什么对局不在 3D 里跑：AI 玩家实际产出的是**文字**。
 * 在 3D 桌上它是个套着头套的胶囊做预设手势 —— 你得假装它有身体语言；
 * 在这里它和人一样只是一条发言，读起来分不出来。
 * 媒介和内容对齐了，"AI 补位"才成立。
 *
 * 3D 大厅没有被废掉：它是进门时建立"这是个有人的地方"的那一下，
 * 以及将来刺杀揭晓时切回去的那一下。
 */
export function MatchView() {
  const seatedAt = usePlayerStore((s) => s.seatedAt)
  const mode = usePlayerStore((s) => s.mode)
  const stand = usePlayerStore((s) => s.beginStand)
  const occupancy = useGameStore((s) => s.occupancy)

  const messages = useMatch((s) => s.messages)
  const view = useMatch((s) => s.view)
  const pending = useMatch((s) => s.pending)
  const queued = useMatch((s) => s.queue.length)
  const finished = useMatch((s) => s.finished)
  const rush = useMatch((s) => s.rush)

  const [picked, setPicked] = useState<PlayerId[]>([])

  const table = seatedAt ? tableById(seatedAt.tableId) : undefined
  const seatCount = table?.seats ?? 5

  const seats: Seat[] = useMemo(() => {
    if (!seatedAt || !table) return []
    const occ = occupancy[table.id] ?? []
    return Array.from({ length: table.seats }, (_, i) => ({
      index: i,
      name: occ[i]?.name ?? `空位 ${i + 1}`,
      color: occ[i]?.color ?? '#4a4a4a',
      isAI: occ[i]?.isAI ?? true,
      isMe: i === seatedAt.seat,
    }))
  }, [seatedAt, table, occupancy])

  // 坐下就开一局，起身就停。清理函数必须真的停掉 ——
  // 不停的话切换桌子会有两局同时往同一个 store 里写
  useEffect(() => {
    if (mode !== 'seated' || !seatedAt || !table) return
    return startMatch({
      seatCount: table.seats,
      mySeat: seatedAt.seat,
      // 竞价机制每轮只让出价最高的一个人说话。2 轮在 3D 桌上够用
      // （那边有肢体语言补足），但在以文字为主的界面里太安静 ——
      // 一轮提名只有两条发言，记录区几乎是空的。
      // **这个数字将来要按真人语音的密度重新定**，不是最终值。
      discussion: 4,
    })
  }, [mode, seatedAt, table])

  if (mode !== 'seated' || !seatedAt) return null

  const sizes = Array.from({ length: 5 }, (_, i) => teamSize(seatCount, i))
  // 选人只在需要选人的阶段开放，其余时候点座位不该有反应
  const pickable = pending?.kind === 'propose' || pending?.kind === 'assassinate'
  const pickLimit = pending?.kind === 'assassinate' ? 1 : (pending?.view.teamSize ?? 0)

  const onPick = (seat: PlayerId) => {
    setPicked((p) => {
      if (p.includes(seat)) return p.filter((x) => x !== seat)
      if (pickLimit === 1) return [seat]
      if (p.length >= pickLimit) return p
      return [...p, seat]
    })
  }

  return (
    <div className="match">
      <header className="match-top">
        <div className="brand">DOLOS</div>
        <QuestTrack view={view} teamSizes={sizes} />
        <div className="top-right">
          {/* 队列还有积压时给一个快进 —— 已经知道结果了还被迫等动画最烦人 */}
          {queued > 0 && (
            <button className="ghost-btn" onClick={rush}>
              快进 ({queued})
            </button>
          )}
          <button className="ghost-btn" onClick={stand}>
            离席
          </button>
        </div>
      </header>

      <div className="match-body">
        <aside>
          <SeatColumn
            seats={seats}
            view={view}
            tableId={seatedAt.tableId}
            pickable={pickable}
            picked={picked}
            onPick={onPick}
          />
          <RoleCard view={view} seats={seats} />
        </aside>

        <main>
          <Transcript messages={messages} seats={seats} />
          {finished && (
            <div className={'verdict ' + finished.winner}>
              <b>{finished.winner === 'good' ? '好人阵营获胜' : '坏人阵营获胜'}</b>
              <span>{REASON[finished.reason] ?? finished.reason}</span>
            </div>
          )}
        </main>
      </div>

      <footer>
        <ActionBar
          pending={pending}
          seats={seats}
          picked={picked}
          setPicked={setPicked}
        />
      </footer>
    </div>
  )
}

const REASON: Record<string, string> = {
  three_quests_good: '好人过了三轮，且刺客没认出梅林',
  three_quests_evil: '坏人破坏了三轮任务',
  assassin_found_merlin: '刺客认出了梅林',
  five_rejects: '连续五次否决',
}
