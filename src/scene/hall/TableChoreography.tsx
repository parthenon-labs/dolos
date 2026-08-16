import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { liveAnim, useTableView } from '../../state/useTableStore'
import { TABLE_HEIGHT, TABLE_RADIUS, seatAngle } from '../hallLayout'

/**
 * 把呈现状态画到桌面上：提名高亮、投票筹码、飞向中央的任务牌、
 * 结果揭晓、刺杀聚焦。
 *
 * 每帧变化的进度值（飞行、翻牌、聚焦）直接从 liveAnim 这块裸内存读，
 * 不走 React —— 走 state 的话整棵树每帧重渲染。
 * React 只订阅"有哪些座位在飞牌"这类低频的结构变化。
 */
export function TableChoreography({ seats }: { seats: number }) {
  const proposedTeam = useTableView((s) => s.proposedTeam)
  const votes = useTableView((s) => s.votes)
  const flight = useTableView((s) => s.questFlight)
  const reveal = useTableView((s) => s.questReveal)
  const assassinTarget = useTableView((s) => s.assassinTarget)
  const assassinResult = useTableView((s) => s.assassinResult)

  return (
    <group>
      {proposedTeam.map((seat) => (
        <ProposeRing key={`p${seat}`} seat={seat} seats={seats} />
      ))}
      {votes.map((v, seat) =>
        v === null ? null : <VoteChip key={`v${seat}`} seat={seat} seats={seats} vote={v} />,
      )}
      {flight.map((f) => (
        <FlyingCard key={`f${f.seat}`} seat={f.seat} seats={seats} />
      ))}
      {reveal && <QuestReveal fails={reveal.fails} success={reveal.success} />}
      {assassinTarget !== null && (
        <AssassinFocus seat={assassinTarget} seats={seats} result={assassinResult} />
      )}
    </group>
  )
}

/** 座位在桌面上的位置 */
function seatSpot(seat: number, seats: number, r: number): [number, number, number] {
  const a = seatAngle(seat, seats)
  return [Math.sin(a) * r, TABLE_HEIGHT + 0.04, Math.cos(a) * r]
}

/* ---------------- 提名高亮 ---------------- */

function ProposeRing({ seat, seats }: { seat: number; seats: number }) {
  const mat = useRef<THREE.MeshBasicMaterial>(null)
  const idx = seat
  useFrame(() => {
    if (!mat.current) return
    // 队员按座位号错开亮起，让人来得及看清是谁
    const stagger = Math.min(1, Math.max(0, liveAnim.proposeReveal * seats - idx * 0.6))
    mat.current.opacity = stagger * 0.9
  })
  return (
    <mesh
      position={seatSpot(seat, seats, TABLE_RADIUS - 0.3)}
      rotation={[-Math.PI / 2, 0, 0]}
      renderOrder={2}
    >
      <ringGeometry args={[0.13, 0.17, 28]} />
      <meshBasicMaterial
        ref={mat}
        color="#5ad6ff"
        transparent
        opacity={0}
        depthWrite={false}
        toneMapped={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

/* ---------------- 投票筹码 ---------------- */

function VoteChip({
  seat,
  seats,
  vote,
}: {
  seat: number
  seats: number
  vote: 'hidden' | boolean
}) {
  const g = useRef<THREE.Group>(null)
  useFrame(() => {
    if (!g.current) return
    // 翻转是绕 X 轴半圈；到 0.5 时正好侧对镜头，切换正反面刚好看不见
    g.current.rotation.x = liveAnim.voteFlip * Math.PI
  })
  const revealed = vote !== 'hidden' && liveAnim.voteFlip > 0.5
  return (
    <group position={seatSpot(seat, seats, TABLE_RADIUS - 0.62)}>
      <group ref={g}>
        <mesh>
          <cylinderGeometry args={[0.062, 0.062, 0.012, 20]} />
          <meshStandardMaterial color="#2b1c14" roughness={0.7} />
        </mesh>
        {/* 正面：同意绿 / 否决红。盖着时朝下，看不见 */}
        <mesh position={[0, 0.0075, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.052, 20]} />
          <meshBasicMaterial
            color={revealed ? (vote === true ? '#3fbf6a' : '#d0402e') : '#3a2618'}
            toneMapped={false}
          />
        </mesh>
      </group>
    </group>
  )
}

/* ---------------- 飞向中央的任务牌 ---------------- */

function FlyingCard({ seat, seats }: { seat: number; seats: number }) {
  const g = useRef<THREE.Group>(null)
  const from = seatSpot(seat, seats, TABLE_RADIUS - 0.42)
  useFrame(() => {
    if (!g.current) return
    const t = liveAnim.flight.get(seat) ?? 0
    // 抛物线：中途抬起再落下，比直线平移有重量感
    const lift = Math.sin(t * Math.PI) * 0.14
    g.current.position.set(from[0] * (1 - t), from[1] + lift, from[2] * (1 - t))
    g.current.rotation.y = t * Math.PI * 0.7
  })
  return (
    <group ref={g} position={from}>
      <mesh castShadow>
        <boxGeometry args={[0.09, 0.004, 0.13]} />
        <meshStandardMaterial color="#7a1f22" roughness={0.55} />
      </mesh>
    </group>
  )
}

/* ---------------- 任务结果揭晓 ---------------- */

function QuestReveal({ fails, success }: { fails: number; success: boolean }) {
  const g = useRef<THREE.Group>(null)
  const mat = useRef<THREE.MeshBasicMaterial>(null)
  useFrame(() => {
    const k = liveAnim.questFlip
    if (g.current) {
      g.current.rotation.x = (1 - k) * Math.PI * 0.5
      g.current.scale.setScalar(0.6 + k * 0.4)
    }
    if (mat.current) mat.current.opacity = k
  })
  return (
    <group ref={g} position={[0, TABLE_HEIGHT + 0.09, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.22, 32]} />
        <meshBasicMaterial
          ref={mat}
          color={success ? '#3fbf6a' : '#d0402e'}
          transparent
          opacity={0}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* 失败牌数量用一圈小点表示，比数字更适合远看 */}
      {Array.from({ length: fails }, (_, i) => {
        const a = (i / Math.max(1, fails)) * Math.PI * 2
        return (
          <mesh key={i} position={[Math.sin(a) * 0.13, 0.006, Math.cos(a) * 0.13]}>
            <sphereGeometry args={[0.022, 10, 8]} />
            <meshBasicMaterial color="#2b0a06" toneMapped={false} />
          </mesh>
        )
      })}
    </group>
  )
}

/* ---------------- 刺杀聚焦 ---------------- */

function AssassinFocus({
  seat,
  seats,
  result,
}: {
  seat: number
  seats: number
  result: 'hit' | 'miss' | null
}) {
  const beam = useRef<THREE.Mesh>(null)
  const mat = useRef<THREE.MeshBasicMaterial>(null)
  const a = seatAngle(seat, seats)
  const pos: [number, number, number] = [Math.sin(a) * 1.62, 0, Math.cos(a) * 1.62]

  useFrame(() => {
    const k = liveAnim.assassinFocus
    if (beam.current) beam.current.scale.set(1, k, 1)
    if (mat.current) {
      mat.current.opacity = k * 0.5
      // 揭晓后换色：命中血红，落空转冷
      mat.current.color.set(
        result === 'hit' ? '#ff2d1a' : result === 'miss' ? '#4a9fd8' : '#ffb257',
      )
    }
  })

  return (
    <group position={pos}>
      <mesh ref={beam} position={[0, 1.1, 0]}>
        <cylinderGeometry args={[0.42, 0.52, 2.2, 20, 1, true]} />
        <meshBasicMaterial
          ref={mat}
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  )
}
