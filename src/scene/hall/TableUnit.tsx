import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getAmp } from '../../audio/amplitudes'
import { useGameStore } from '../../state/useGameStore'
import { usePlayerStore } from '../../state/usePlayerStore'
import {
  TABLE_HEIGHT,
  TABLE_RADIUS,
  seatAngle,
  seatRingLocal,
  tableFloorY,
  type TableDef,
} from '../hallLayout'
import { Character } from '../Character'
import { LightShaft } from './LightShaft'
import { Seat } from './Seat'

/**
 * 一张桌子的全部：桌体、吊灯、光锥、椅子、坐着的人、牌。
 *
 * 每张桌子自成一个局部坐标系，内部所有位置都用桌子局部坐标，
 * 整组再被 position/rotation 摆到大厅里。这样加一张桌子就是
 * 往 TABLES 数组里加一行，不用碰任何渲染代码。
 */
export function TableUnit({ table, castShadows }: { table: TableDef; castShadows: boolean }) {
  const occupancy = useGameStore((s) => s.occupancy[table.id]) ?? []
  const seatedAt = usePlayerStore((s) => s.seatedAt)

  return (
    <group
      position={[table.pos[0], tableFloorY(table), table.pos[1]]}
      rotation={[0, table.rot, 0]}
    >
      <TableBody />
      <Lamp castShadows={castShadows} />
      <LightShaft position={[0, TABLE_HEIGHT + 0.78, 0]} height={1.5} radius={1.4} />
      <Cards seats={table.seats} />
      <SpeakerRings tableId={table.id} seats={table.seats} />

      {Array.from({ length: table.seats }, (_, i) => {
        const occ = occupancy[i] ?? null
        // 玩家自己坐的位置不渲染角色 —— 相机就在他脑袋里
        const isMe =
          !!seatedAt && seatedAt.tableId === table.id && seatedAt.seat === i
        return (
          <group key={i}>
            <Seat
              tableId={table.id}
              index={i}
              seatCount={table.seats}
              empty={occ === null}
            />
            {occ && !isMe && (
              <Character
                tableId={table.id}
                seat={i}
                seatCount={table.seats}
                occupant={occ}
              />
            )}
          </group>
        )
      })}
    </group>
  )
}

function TableBody() {
  return (
    <group>
      <mesh position={[0, TABLE_HEIGHT, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[TABLE_RADIUS, TABLE_RADIUS, 0.07, 48]} />
        <meshStandardMaterial color="#3d2a1c" roughness={0.5} metalness={0.1} />
      </mesh>
      <mesh position={[0, TABLE_HEIGHT - 0.045, 0]}>
        <cylinderGeometry args={[TABLE_RADIUS + 0.02, TABLE_RADIUS + 0.02, 0.03, 48]} />
        <meshStandardMaterial color="#1d1410" roughness={0.8} />
      </mesh>
      <mesh position={[0, TABLE_HEIGHT / 2 - 0.05, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.18, TABLE_HEIGHT - 0.1, 16]} />
        <meshStandardMaterial color="#221812" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.03, 0]} castShadow>
        <cylinderGeometry args={[0.42, 0.46, 0.06, 24]} />
        <meshStandardMaterial color="#1a120e" roughness={0.9} />
      </mesh>
    </group>
  )
}

/**
 * 吊灯 + 主光源。
 *
 * castShadows 由外部决定：只有离玩家最近的一两张桌子开实时阴影。
 * 每盏聚光灯的阴影贴图都是一次额外渲染，四张桌子全开会明显掉帧，
 * 而远处桌子的阴影根本看不清。
 */
function Lamp({ castShadows }: { castShadows: boolean }) {
  const spot = useRef<THREE.SpotLight>(null)
  const target = useRef<THREE.Object3D>(null)

  useFrame(() => {
    if (spot.current && target.current) {
      spot.current.target = target.current
      spot.current.target.updateMatrixWorld()
    }
    // 廉价酒吧的灯泡不该是稳定的。极轻微的闪烁 = 大量的"活着"的感觉
    if (spot.current) {
      const t = performance.now() / 1000
      const n =
        Math.sin(t * 7.3) * 0.5 + Math.sin(t * 17.1) * 0.3 + Math.sin(t * 31.7) * 0.2
      spot.current.intensity = 24 * (1 + n * 0.06)
    }
  })

  return (
    <group>
      <group position={[0, 2.28, 0]}>
        <mesh position={[0, 0.6, 0]}>
          <cylinderGeometry args={[0.008, 0.008, 1.2, 6]} />
          <meshStandardMaterial color="#0d0a08" />
        </mesh>
        <mesh castShadow>
          <coneGeometry args={[0.32, 0.26, 24, 1, true]} />
          <meshStandardMaterial color="#241a12" roughness={0.7} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, -0.11, 0]}>
          <sphereGeometry args={[0.055, 16, 12]} />
          <meshBasicMaterial color="#ffd9a0" toneMapped={false} />
        </mesh>
      </group>

      <object3D ref={target} position={[0, TABLE_HEIGHT, 0]} />
      <spotLight
        ref={spot}
        userData={{ budget: 'spot' }}
        position={[0, 2.22, 0]}
        angle={1.15}
        penumbra={0.8}
        distance={7}
        decay={1.9}
        intensity={24}
        color="#ffb257"
        castShadow={castShadows}
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0012}
        shadow-normalBias={0.02}
      />
      {/*
        桌下反弹光，补下半身的死黑。八张桌子就是八盏，一度因为性能全删了，
        后来发现是删错了对象 —— 挂上预算标记之后，远处那些自动熄灭，
        真正花钱的只有你面前这一两张桌子。
      */}
      <pointLight
        userData={{ budget: 'point' }}
        position={[0, 0.25, 0]}
        intensity={1.1}
        color="#8a5a2e"
        distance={3.4}
        decay={2}
      />
    </group>
  )
}

/**
 * 说话指示环 —— 桌沿每个座位前一圈发光的环，音量驱动亮度。
 * meshBasicMaterial 不受光照影响，配合 Bloom 得到干净的辉光。
 * 这是"谁在说话"最直接的视觉线索，也是语音和画面绑在一起的地方。
 */
function SpeakerRings({ tableId, seats }: { tableId: string; seats: number }) {
  return (
    <group>
      {Array.from({ length: seats }, (_, i) => (
        <SpeakerRing key={i} tableId={tableId} seat={i} seats={seats} />
      ))}
    </group>
  )
}

function SpeakerRing({
  tableId,
  seat,
  seats,
}: {
  tableId: string
  seat: number
  seats: number
}) {
  const mat = useRef<THREE.MeshBasicMaterial>(null)
  useFrame((_, dt) => {
    if (!mat.current) return
    const amp = getAmp(tableId, seat)
    mat.current.opacity = THREE.MathUtils.damp(
      mat.current.opacity,
      0.05 + amp * 0.9,
      12,
      dt,
    )
  })
  return (
    <mesh position={seatRingLocal(seat, seats)} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.17, 0.205, 32]} />
      <meshBasicMaterial
        ref={mat}
        color="#ffb257"
        transparent
        opacity={0.05}
        depthWrite={false}
        toneMapped={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

/**
 * 每个座位面前一小叠盖着的牌 + 中央弃牌堆。
 * 现在是静态的；真做起来时，出牌就是把这些 mesh 沿曲线移到中央 ——
 * 全是位置动画，不需要任何骨骼。
 */
function Cards({ seats }: { seats: number }) {
  return (
    <group>
      {Array.from({ length: seats }, (_, i) => {
        const a = seatAngle(i, seats)
        const r = TABLE_RADIUS - 0.42
        return (
          <group
            key={i}
            position={[Math.sin(a) * r, TABLE_HEIGHT + 0.038, Math.cos(a) * r]}
            rotation={[0, a, 0]}
          >
            {[0, 1, 2].map((k) => (
              <mesh
                key={k}
                position={[(k - 1) * 0.075, k * 0.003, 0]}
                rotation={[0, (k - 1) * 0.14, 0]}
                castShadow
              >
                <boxGeometry args={[0.09, 0.004, 0.13]} />
                <meshStandardMaterial color="#7a1f22" roughness={0.55} />
              </mesh>
            ))}
          </group>
        )
      })}
      <group position={[0.06, TABLE_HEIGHT + 0.038, -0.02]}>
        {[0, 1, 2, 3].map((k) => (
          <mesh
            key={k}
            position={[Math.sin(k * 2.1) * 0.02, k * 0.004, Math.cos(k * 1.7) * 0.02]}
            rotation={[0, k * 0.5, 0]}
            castShadow
          >
            <boxGeometry args={[0.09, 0.004, 0.13]} />
            <meshStandardMaterial color="#6d1a1d" roughness={0.6} />
          </mesh>
        ))}
      </group>
      {/* 桌上的杯子，接光用 */}
      <mesh position={[0.42, TABLE_HEIGHT + 0.09, 0.3]} castShadow>
        <cylinderGeometry args={[0.055, 0.04, 0.14, 16]} />
        <meshStandardMaterial
          color="#c98b3a"
          roughness={0.08}
          metalness={0.1}
          transparent
          opacity={0.75}
        />
      </mesh>
    </group>
  )
}
