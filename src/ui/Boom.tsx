import { Component, type ReactNode } from 'react'

/**
 * 兜底。
 *
 * 现在任何一处渲染抛错都是**整页白屏** —— 玩家看到的是一片空白，
 * 连"刷新试试"都不知道该不该按。对一个跑在浏览器里、
 * 没有服务端可以回滚的东西，这是最糟的失败方式。
 *
 * 引擎那边的异步错误各自 catch 到牌局日志里了（那些是"这一局炸了"），
 * 这里管的是渲染期的错误（"这一屏炸了"）。两种都要有出口。
 *
 * 出口只给一个：**回大厅**。不提供"重试"——同样的状态重挂一次
 * 多半还是同样的错，按两遍之后玩家只会更确信这东西坏了。
 */
export class Boom extends Component<
  { children: ReactNode; onReset: () => void },
  { err: Error | null }
> {
  state = { err: null as Error | null }

  static getDerivedStateFromError(err: Error) {
    return { err }
  }

  componentDidCatch(err: Error, info: { componentStack?: string | null }) {
    // 控制台里要留全的，页面上只给人话
    console.error('[dolos] 界面崩了', err, info.componentStack)
  }

  render() {
    if (!this.state.err) return this.props.children
    return (
      <div className="boom">
        <div className="boom-card">
          <h2>这一屏出错了</h2>
          <p className="dim">牌局没了，但大厅还在。</p>
          <pre className="boom-msg">{this.state.err.message}</pre>
          <button
            className="lb-btn lb-btn-go lb-btn-xl"
            onClick={() => {
              this.setState({ err: null })
              this.props.onReset()
            }}
          >
            回大厅
          </button>
        </div>
      </div>
    )
  }
}
