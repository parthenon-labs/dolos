import { useEffect, useRef } from 'react'
import type { Msg } from '../../match/useMatchStore'
import { Avatar } from './Avatar'
import type { Seat } from './types'

/**
 * 中央发言记录。**这是整个界面的主角。**
 *
 * 它比线下面对面强的地方就在于可以往回翻：阿瓦隆一半的博弈是
 * "第二轮他到底怎么说的"，线下靠记忆，这里能滚回去看原文。
 *
 * 所以有一条硬规则：**发言逐字显示，永远不改写。**
 * 摘要会把"我*觉得*可以带 3 号"和"我*确定*可以带 3 号"抹平，
 * 而指控往往就挂在这种措辞上。要摘要可以另开一栏，但原文必须是这一条。
 */
export function Transcript({ messages, seats }: { messages: Msg[]; seats: Seat[] }) {
  const box = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)

  // 只在玩家本来就贴着底部时才自动滚 —— 正在往回翻记录时被拽回来最恼人
  useEffect(() => {
    const el = box.current
    if (el && pinned.current) el.scrollTop = el.scrollHeight
  }, [messages])

  const onScroll = () => {
    const el = box.current
    if (!el) return
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }

  let lastRound = -1
  return (
    <div className="transcript" ref={box} onScroll={onScroll}>
      {messages.map((m, i) => {
        const divider = m.round !== lastRound && m.round > 0
        lastRound = m.round
        return (
          <div key={i}>
            {divider && <div className="round-divider">第 {m.round} 轮提名</div>}
            <Row m={m} seats={seats} />
          </div>
        )
      })}
      {messages.length === 0 && <div className="empty">等待对局开始…</div>}
    </div>
  )
}

function Row({ m, seats }: { m: Msg; seats: Seat[] }) {
  const who = (i: number) => seats[i]
  const nameOf = (i: number) => `${i + 1} 号 ${seats[i]?.name ?? ''}`

  switch (m.kind) {
    case 'speech': {
      const s = who(m.seat)
      return (
        <div className={'msg speech' + (s?.isMe ? ' mine' : '')}>
          <Avatar color={s?.color ?? '#666'} size={34} />
          <div className="bubble">
            <div className="who">
              <span className="no">{m.seat + 1}</span>
              {s?.name}
              {s?.isAI && <em className="ai">AI</em>}
            </div>
            {/* 逐字原文。不做任何改写 */}
            <p>{m.text}</p>
          </div>
        </div>
      )
    }
    case 'proposal':
      return (
        <div className="msg event proposal">
          <b>{nameOf(m.seat)}</b> 提名队伍
          <span className="chips">
            {m.team.map((t) => (
              <span key={t} className="chip" style={{ borderColor: who(t)?.color }}>
                {t + 1} {who(t)?.name}
              </span>
            ))}
          </span>
        </div>
      )
    case 'vote':
      return (
        <div className={'msg event vote ' + (m.passed ? 'pass' : 'fail')}>
          <span className="votes">
            {m.votes.map((v, i) => (
              <span key={i} className={'v ' + (v ? 'yes' : 'no')} title={nameOf(i)}>
                {i + 1}
              </span>
            ))}
          </span>
          <b>{m.passed ? '表决通过' : '表决否决'}</b>
          <span className="count">
            同意 {m.votes.filter(Boolean).length}/{m.votes.length}
          </span>
        </div>
      )
    case 'quest':
      return (
        <div className={'msg event quest ' + (m.success ? 'ok' : 'bad')}>
          <b>任务 {m.questIndex + 1} {m.success ? '成功' : '失败'}</b>
          {m.fails > 0 && <span className="count">失败牌 {m.fails} 张</span>}
        </div>
      )
    case 'assassination':
      return (
        <div className={'msg event assassin ' + (m.wasMerlin ? 'hit' : 'miss')}>
          <b>刺客指认 {nameOf(m.target)}</b>
          <span className="count">{m.wasMerlin ? '正是梅林' : '不是梅林'}</span>
        </div>
      )
    case 'system':
      return <div className="msg system">{m.text}</div>
  }
}
