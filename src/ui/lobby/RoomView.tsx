import { useEffect, useRef, useState } from 'react'
import { sfx } from '../../audio/sfx'
import { gameById } from '../../games/registry'
import { useLobby, useMyRoom } from '../../lobby/useLobby'
import { Glyph } from './Glyph'
import { SoundToggle } from './SoundToggle'
import { useKeys } from './useKeys'

/**
 * 房间里。
 *
 * 大厅和牌桌之间的这一屏必须存在：玩家要看清楚**跟谁打、打什么、
 * 还差几个人**，然后自己按下开始。少了它，点一行就直接掉进牌局，
 * 心里是没底的。
 *
 * 空位画成虚线的座位而不是隐藏 —— "还差两个人"是这一屏最重要的信息，
 * 而它只有在空位看得见的时候才成立。开始的时候空位由 AI 补上。
 */
export function RoomView() {
  const roomId = useLobby((s) => s.myRoomId)
  if (!roomId) return null
  // key 换掉整棵子树：换个房间时，上一间的倒数计时不该留下来
  return <RoomBody key={roomId} />
}

/**
 * 房间正文。拆出来是为了拿 `key={room.id}` 把倒数计时的状态一起换掉 ——
 * 换个房间还留着上一间的倒数，是这类界面最常见的一种脏状态。
 */
function RoomBody() {
  const room = useMyRoom()
  const leave = useLobby((s) => s.leave)
  const start = useLobby((s) => s.start)
  const [countdown, setCountdown] = useState<number | null>(null)

  const g = room ? gameById(room.game) : null
  const iAmHost = !!room?.players.some((p) => !p.isAI && p.host)
  const empty = room ? room.max - room.players.length : 0
  const roomId = room?.id

  /**
   * 房主是 AI 的时候，得让它自己开。
   *
   * 不然进别人的房就是死路：按钮写着"等房主开始"，
   * 而那个房主是个 bot，永远不会按。**这不是拟真度问题，是走不通**。
   * 顺带这也更像真的大厅 —— 你进去，坐一会儿，局就开了。
   */
  useKeys({ Escape: leave })

  // 房里时不时有人说话。间隔拉长而且加随机，等距的发言一眼就是脚本
  const aiChatter = useLobby((x) => x.aiChatter)
  useEffect(() => {
    if (!roomId) return
    let t: ReturnType<typeof setTimeout>
    const loop = () => {
      t = setTimeout(() => {
        aiChatter()
        loop()
      }, 5000 + Math.random() * 7000)
    }
    loop()
    return () => clearTimeout(t)
  }, [roomId, aiChatter])

  useEffect(() => {
    if (iAmHost || !roomId) return
    setCountdown(3)
    const tick = setInterval(() => setCountdown((c) => (c === null ? null : c - 1)), 1000)
    const go = setTimeout(() => start(), 3300)
    return () => {
      clearInterval(tick)
      clearTimeout(go)
      setCountdown(null)
    }
  }, [iAmHost, roomId, start])

  if (!room || !g) return null

  return (
    <div className="lb lb-room" style={{ '--accent': g.accent } as React.CSSProperties}>
      <header className="lb-top">
        <button className="lb-btn lb-btn-ghost" onClick={leave}>
          ← 回大厅
        </button>
        <SoundToggle />
        <div className="lb-roomtitle">
          <span className="lb-roomno">{room.no}</span>
          {room.name}
          {room.locked && <span className="lb-lock">🔒</span>}
        </div>
        <div className="lb-roomgame">
          <Glyph id={room.game} size={20} />
          {g.name}
        </div>
      </header>

      <div className="lb-board">
        <div className="lb-roommain">
        <div className="lb-seatgrid">
          {Array.from({ length: room.max }, (_, i) => {
            const p = room.players[i]
            if (!p)
              return (
                <div key={i} className="lb-seat empty">
                  <span className="lb-seat-av" />
                  <b>空位</b>
                  <em>开始时 AI 补上</em>
                </div>
              )
            return (
              <div key={i} className={`lb-seat${p.isAI ? '' : ' me'}`}>
                <span className="lb-seat-av" style={{ background: p.color }} />
                <b>
                  {p.name}
                  {p.host && <span className="lb-hostbadge">房主</span>}
                </b>
                <em>{p.isAI ? 'AI 补位' : '你'}</em>
              </div>
            )
          })}
        </div>
        </div>

        <Chat />

        <div className="lb-roomfoot">
          <p className="lb-tagline">{g.tagline}</p>
          <div className="lb-roomactions">
            <span className="lb-roomhint">
              {empty > 0 ? `还差 ${empty} 个人，开始时由 AI 补上` : '人齐了'}
            </span>
            <button className="lb-btn lb-btn-xl lb-btn-go" disabled={!iAmHost} onClick={start}>
              {iAmHost
                ? '开始游戏'
                : countdown !== null && countdown > 0
                  ? `房主 ${countdown} 秒后开始`
                  : '开始中…'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * 房间聊天。
 *
 * 功能上它什么也不影响，但**一个不能说话的等待室是死的** ——
 * 你看着三个名字，不知道他们在不在。补位 AI 会时不时说一句，
 * 少而杂，多了会露馅。
 */
function Chat() {
  const room = useMyRoom()
  const say = useLobby((s) => s.say)
  const [text, setText] = useState('')
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight
  }, [room?.chat.length])

  if (!room) return null

  const send = () => {
    if (!text.trim()) return
    say(text)
    setText('')
    sfx('click')
  }

  return (
    <aside className="lb-chat">
      <div className="lb-chat-lines" ref={box}>
        {room.chat.length === 0 && <div className="lb-chat-empty">说点什么</div>}
        {room.chat.map((c) =>
          c.system ? (
            <div key={c.id} className="lb-chat-sys">
              {c.text}
            </div>
          ) : (
            <div key={c.id} className="lb-chat-line">
              <b>{c.who}</b>
              {c.text}
            </div>
          ),
        )}
      </div>
      <div className="lb-chat-input">
        <input
          className="lb-input"
          maxLength={40}
          value={text}
          placeholder="说两句"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
        />
        <button className="lb-btn lb-btn-ghost tiny" onClick={send}>
          发送
        </button>
      </div>
    </aside>
  )
}
