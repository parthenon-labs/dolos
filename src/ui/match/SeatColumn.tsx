import { getAmp } from '../../audio/amplitudes'
import type { PlayerId, PlayerView } from '../../game/types'
import { useEffect, useRef, useState } from 'react'
import { Avatar } from './Avatar'
import type { Seat } from './types'

/**
 * 左侧座位列。
 *
 * 这里是玩家整局都在扫的地方，所以每个座位要一眼给出四件事：
 * 是谁、在不在说话、是不是队长、在不在这支队伍里。
 * 再多就成了仪表盘，反而没人看。
 */
export function SeatColumn({
  seats,
  view,
  tableId,
  onPick,
  pickable,
  picked,
}: {
  seats: Seat[]
  view: PlayerView | null
  tableId: string
  /** 提名/刺杀时点座位选人 */
  onPick?: (seat: PlayerId) => void
  pickable?: boolean
  picked?: PlayerId[]
}) {
  const speaking = useSpeaking(tableId, seats.length)

  return (
    <ul className="seat-col">
      {seats.map((s) => {
        const onTeam = view?.team.includes(s.index) ?? false
        const isLeader = view?.leader === s.index
        const isPicked = picked?.includes(s.index) ?? false
        const known = view?.knowledge.seesEvil.includes(s.index)
        const suspect = view?.knowledge.seesMerlinOrMorgana.includes(s.index)
        return (
          <li
            key={s.index}
            className={
              'seat-row' +
              (s.isMe ? ' me' : '') +
              (onTeam ? ' on-team' : '') +
              (isPicked ? ' picked' : '') +
              (pickable ? ' pickable' : '')
            }
            onClick={pickable && onPick ? () => onPick(s.index) : undefined}
          >
            <span className="seat-no">{s.index + 1}</span>
            <Avatar color={s.color} size={38} speaking={speaking[s.index]} />
            <span className="seat-meta">
              <span className="seat-name">
                {s.name}
                {s.isAI && <em className="ai">AI</em>}
              </span>
              <span className="seat-tags">
                {isLeader && <b className="tag leader">队长</b>}
                {onTeam && <b className="tag team">出任务</b>}
                {/*
                  只有我自己的角色能看到的信息也画在这里。
                  它来自 PlayerView.knowledge —— 界面拿不到别人的身份，
                  想画也画不出来，隐藏信息在类型层面就锁死了。
                */}
                {known && <b className="tag evil">我知道是坏人</b>}
                {suspect && <b className="tag maybe">梅林或莫甘娜</b>}
              </span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * 谁在说话。
 *
 * 音量在 `audio/amplitudes` 那块裸内存里每帧都在变，直接进 React 会
 * 每帧重渲染整列。所以这里降频到 10Hz，而且只在**布尔值翻转时**才 setState。
 * 3D 那边走的是同一份数据、同一个理由，只是它不降频（在 useFrame 里直接读）。
 */
function useSpeaking(tableId: string, n: number): boolean[] {
  const [on, setOn] = useState<boolean[]>(() => Array(n).fill(false))
  const ref = useRef(on)
  useEffect(() => {
    const id = setInterval(() => {
      let changed = false
      const next = Array.from({ length: n }, (_, i) => {
        const v = getAmp(tableId, i) > 0.06
        if (v !== ref.current[i]) changed = true
        return v
      })
      if (changed) {
        ref.current = next
        setOn(next)
      }
    }, 100)
    return () => clearInterval(id)
  }, [tableId, n])
  return on
}
