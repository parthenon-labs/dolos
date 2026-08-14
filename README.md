# Dolos

> Δόλος —— 诡计与欺瞒之灵，普罗米修斯的学徒，造过一尊以假乱真的雕像。

撒谎酒馆风格的第一人称语音牌桌。目标是一个带大厅和房间、可以加 AI 补位的
在线社交推理游戏。

**当前状态：纯前端视觉原型，数据全是 mock。** 没有服务端、没有 WebSocket、
没有真实语音。存在的意义是先摸清前端视觉的上限——质感不好，玩家看完就退出去了。

![大厅](./shot-hall.png)
![落座](./shot-seated.png)

```bash
npm install
npm run dev
```

## 玩法

点击进入 → `WASD` 在酒吧里走动，**按住鼠标拖拽**环视 → 光标移到发光的空椅子上，
椅子上方会浮出提示 → `E` 或直接点击坐下，镜头会推进并收拢到牌桌视角 →
`Q` 起身回到大厅。

## 先做这两件事

**1.** 右上角 leva 面板里把 **后处理 → 总开关** 关掉再打开。同样的几何体，
关掉是一坨灰塑料，打开是一间酒吧。氛围的七成在后处理里，不在建模里。

**2.** 拖 **大厅光照 → 环境光**，往上拖一点点画面立刻垮掉。主光和环境光的
比值才是戏剧性的来源，宁可暗，不要平——暗部该由霓虹的彩色补光去填，
而不是靠白色环境光提亮。

## 骨架里刻意做对的几件事

**音频和画面之间只有一个接缝**

`src/audio/amplitudes.ts` 是一个模块级的 Map，键是 `tableId:seat`。
fakeDriver（本地假说话数据）和 webrtcDriver（真实音轨走 AnalyserNode 算 RMS）
都往里写，3D 场景从里面读。接真语音时只改一行：

```diff
  // src/scene/Scene.tsx
- useEffect(() => startFakeDriver(), [])
+ useEffect(() => startWebRTCDriver(), [])
```

然后在拿到远端音轨时 `attachStream(tableId, seat, stream)`。场景代码一行不动。

**每帧变化的数据不走 React**

音量每帧都在变，走 `useState` 会让整棵树每帧重渲染。角色在 `useFrame` 里直接读
那块内存；只有「谁在说话」这种低频状态才降频写进 zustand 给 HUD 用。
这是 R3F 项目最容易写错、也最容易在多桌多路音频下炸掉的地方。

**相机只有一个所有者**

走动、坐下转场、落座环视三种行为全在 `PlayerRig` 里。多个组件同时写
`camera.position` / `camera.rotation` 会互相打架，而且 bug 极难查。

**不锁指针，全程自由光标**

一度用过 PointerLock + 屏幕中心准心，实际用起来别扭：牌桌游戏的光标要去够椅子、
点牌、点按钮，锁住就什么都做不了，而且"拿准心去瞄"比"把鼠标移过去"多一道心理转换。
现在走动和落座共用同一套**按住拖拽转视角**，光标始终可见，选座直接交给 R3F 的
`onPointerOver`，提示牌贴在那把椅子上方而不是永远悬在屏幕正中。

代价是转视角要按住鼠标，不如 FPS 顺手——对一个牌桌游戏这笔交易是划算的。

坐下时 FOV 从 72 收到 60，那一下镜头收拢是「坐下」这个动作里很关键的一半。

**动物头套是工程决策，不只是风格**

刚性面具 = 不需要面部绑定、不需要 blendshape、不需要口型同步，还绕开了恐怖谷。
所有表达压到肢体语言上：头部点动、身体前倾、面具随音量自发光。

**只给最近的两张桌子开实时阴影**

`ShadowBudget` 每 20 帧按距离重排。每盏 castShadow 的聚光灯都是一次额外的
场景渲染，四桌全开会明显掉帧，而三米开外的阴影根本看不清。

## 踩过的坑（别再踩一遍）

**移动方向绕 Y 轴旋转的符号写错，W/S 整个颠倒。** 正确形式是
`x' = vx*cos + vz*sin`、`z' = -vx*sin + vz*cos`，当时两个 `vz` 项都写成了减号。
阴险的地方在于 **A/D 完全正常**——纯左右平移时 `vz = 0`，那两项被乘没了，
所以一半的输入是对的，掩盖了另一半是反的。改动这类旋转公式时，
四个方向要一个一个代进去验，别只试一个。

**透明命中体不能用 `visible={false}`。** three 的 Raycaster 会跳过
`visible === false` 的对象，R3F 的指针事件因此永远收不到。
要用 `transparent + opacity={0}` 让它保持"可见但看不见"。

**光锥着色器吐 NaN，整个画面全黑。** 圆锥顶点处四周的法线在插值中相互抵消，
长度趋近 0，`normalize()` 产出 NaN。而 NaN 在 HDR 管线里会传染——Bloom 的
mipmap 降采样把这一个像素抹遍全图。最阴的地方是 **`NaN * 0` 仍是 `NaN`**，
所以把所有后处理强度调成 0 也救不回来，看起来就像「后处理坏了」。
修法是 `safeNormalize()` 加长度兜底。见 `src/scene/hall/LightShaft.tsx`。

**`import.meta.env` 需要 `vite/client` 类型。** tsconfig 里显式写了 `types`
数组的话，会覆盖默认行为，必须手动加进去。

**TS 5.7+ 收紧了 TypedArray 泛型**，`getByteTimeDomainData` 不接受
SharedArrayBuffer 背书的数组。用 `ReturnType<typeof makeBuf>` 推导，
新旧 TS 都能编过。见 `src/audio/webrtcDriver.ts`。

## 目录

```
src/
  audio/
    amplitudes.ts     音量寄存器 —— 声音和画面唯一的接缝
    fakeDriver.ts     假说话数据，零配置看效果。上线前删掉
    webrtcDriver.ts   真实音轨 → AnalyserNode → RMS
  player/
    PlayerRig.tsx     相机的唯一所有者：走动 / 转场 / 落座
    SeatPicker.tsx    坐下 / 起身的键盘处理（选座已交给 R3F 指针事件）
  scene/
    hallLayout.ts     大厅与座位布局，所有位置的唯一真相来源
    Scene.tsx         场景装配 + 阴影预算
    Character.tsx     胶囊体角色，音量驱动动作
    Lighting.tsx      大厅级光照与雾
    Effects.tsx       后处理栈
    hall/
      Hall.tsx        地板（反射）、墙、吧台、霓虹、横梁
                      吧台 = 台身竖木条 / 包边台面 / 脚踏铜杆 / 吧凳 /
                      三层带背光的酒柜 / 倒挂玻璃杯架
      TableUnit.tsx   一张桌子的全部：桌体 / 吊灯 / 椅子 / 人 / 牌
      Seat.tsx        椅子 + 命中体 + 空位指示光圈
      LightShaft.tsx  假体积光锥
      DustMotes.tsx   空气浮尘
  state/
    useGameStore.ts   桌子占用情况（mock）
    usePlayerStore.ts 玩家模式状态机
  ui/Hud.tsx          进场页、同桌玩家列表（坐下提示在 Seat.tsx 里，贴在椅子上）
```

开发期控制台里有 `window.__dolos`，可以直接驱动和检查状态：

```js
__dolos.player.getState().beginSit({ tableId: 't4', seat: 1 })
__dolos.game.getState().occupancy
__dolos.scene   // three.js scene
__dolos.camera
```

## 下一步

1. **状态驱动的动画编排**——出牌、翻牌、投票。全是位置动画，不需要骨骼。
   这一步会暴露真正的难点：服务端事件到了，但上一个动画还没播完怎么办。
2. **接 WebSocket**，让 store 由服务端事件驱动而不是 mock。
3. **接 WebRTC**，换掉 fakeDriver。
4. **最后**才换 glTF 模型。倒过来做（先啃模型）是单人项目最常见的死法。

## 已知的偷懒 / 待决策

- **5 人以上圆桌 + 第一人称，侧面玩家必然出画。** 撒谎酒馆只有 4 人所以不明显，
  阿瓦隆最少 5 人。要么减到 4 人一桌，要么把座位排成弧形而不是整圆。**这个越晚改代价越大。**
- 落座后看不到自己的手和牌。
- 静态几何体的光照应该在 Blender 里烤成贴图，现在全是实时的。
- 移动端没测。WebGL + 多路 WebRTC 音频解码在中端手机上会烫，需要一个
  关掉全部后处理的低画质档。
- 打包 1.27MB（gzip 363KB），没做代码分割。
