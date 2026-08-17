import type { Agent } from './agent'
import type { PlayerId, PlayerView } from './types'
import { type Pending, useMatch } from '../match/useMatchStore'

/**
 * 人类玩家的 Agent 实现。
 *
 * 关键在于它**和 bot、LLM 实现同一个接口** —— 引擎完全不知道
 * 3 号座位后面坐的是人还是模型。所以「AI 补位」不需要任何特判：
 * 换个 Agent 实现就行了。
 *
 * 每个动作返回一个 Promise，挂在界面上，等玩家点了才 resolve。
 * 引擎那边只是普通的 await，不需要为"人比较慢"做任何改动。
 */
export class HumanAgent implements Agent {
  constructor(readonly name: string) {}

  proposeTeam(view: PlayerView) {
    return this.ask<PlayerId[]>(view, (resolve) => ({ kind: 'propose', view, resolve }))
  }
  vote(view: PlayerView) {
    return this.ask<boolean>(view, (resolve) => ({ kind: 'vote', view, resolve }))
  }
  questCard(view: PlayerView) {
    return this.ask<boolean>(view, (resolve) => ({ kind: 'quest', view, resolve }))
  }
  assassinate(view: PlayerView) {
    return this.ask<PlayerId>(view, (resolve) => ({
      kind: 'assassinate',
      view,
      resolve,
    }))
  }

  /**
   * 挂起，等界面回答。
   *
   * **先等揭示队列放完再弹操作区。** 事件是一瞬间全产生的，
   * 不等的话玩家会在还没读到讨论内容时就被要求投票 ——
   * 拿到的信息和该做的决定对不上。
   */
  private async ask<T>(
    view: PlayerView,
    build: (resolve: (v: T) => void) => Pending,
  ): Promise<T> {
    await waitForDrain()
    useMatch.getState().setView(view)
    return new Promise<T>((resolve) => {
      useMatch.getState().setPending(
        build((v) => {
          useMatch.getState().setPending(null)
          resolve(v)
        }),
      )
    })
  }
}

/** 等揭示队列清空。轮询比订阅简单，而且这里对延迟不敏感 */
function waitForDrain(): Promise<void> {
  return new Promise((resolve) => {
    const tick = () => {
      if (useMatch.getState().isDrained()) resolve()
      else setTimeout(tick, 80)
    }
    tick()
  })
}
