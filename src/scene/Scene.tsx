import { useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { NUM_SEATS, loudestSeat } from '../audio/amplitudes'
import { startFakeDriver } from '../audio/fakeDriver'
import { useGameStore } from '../state/useGameStore'
import { CameraRig } from './CameraRig'
import { Character } from './Character'
import { Effects } from './Effects'
import { Lighting } from './Lighting'
import { Room } from './Room'

export function Scene() {
  const players = useGameStore((s) => s.players)

  // 接真 WebRTC 时，把这一段换成：
  //   import { startWebRTCDriver } from '../audio/webrtcDriver'
  //   useEffect(() => startWebRTCDriver(), [])
  // 场景代码一行都不用改。
  useEffect(() => startFakeDriver(), [])

  return (
    <>
      <CameraRig />
      <Lighting />
      <Room />
      {players.map((p) => (
        <Character key={p.seat} player={p} seatCount={NUM_SEATS} />
      ))}
      <SpeakerTracker />
      <Effects />
    </>
  )
}

/**
 * 把"谁在说话"从每帧的音量数据降频写进 React store，给 HUD 用。
 *
 * 每帧写 store 会让 UI 每帧重渲染，所以这里只在**说话人变了**的时候写
 * （zustand 的 setSpeaking 内部也做了同值短路）。
 * 3D 那边不走这条路，它直接读 amplitudes 内存。
 */
function SpeakerTracker() {
  const setSpeaking = useGameStore((s) => s.setSpeaking)
  useFrame(() => setSpeaking(loudestSeat(0.12)))
  return null
}
