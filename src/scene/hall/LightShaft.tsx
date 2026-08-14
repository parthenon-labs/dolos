import { useMemo } from 'react'
import * as THREE from 'three'

/**
 * 假体积光 —— 吊灯下那个看得见的光锥。
 *
 * 真体积光要做 raymarching，太贵。这里用一个加性混合的空心圆锥壳，
 * 靠两件事骗过眼睛：
 *   1. 沿高度淡出（灯口最亮，落到桌面前散掉）
 *   2. 正对视线的部分更亮（模拟视线穿过的介质更厚）
 * 关掉深度写入，否则它会挡住后面的东西。
 */
export function LightShaft({
  position,
  color = '#ffb257',
  height = 1.5,
  radius = 1.35,
  opacity = 0.05,
}: {
  position: [number, number, number]
  color?: string
  height?: number
  radius?: number
  opacity?: number
}) {
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uOpacity: { value: opacity },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vNormalW;
        varying vec3 vViewW;
        varying vec3 vWorldPos;
        void main() {
          vUv = uv;
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorldPos = world.xyz;
          vNormalW = normalize(mat3(modelMatrix) * normal);
          vViewW = cameraPosition - world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying vec2 vUv;
        varying vec3 vNormalW;
        varying vec3 vViewW;
        varying vec3 vWorldPos;

        // 安全归一化。圆锥顶点处四周的法线在插值中会相互抵消，
        // 长度趋近于 0，normalize() 直接产出 NaN。
        //
        // 而 NaN 在 HDR 管线里是会传染的：Bloom 的 mipmap 降采样会把
        // 这一个像素的 NaN 抹遍整张图，最后整个画面全黑 —— 且因为
        // NaN * 0 仍是 NaN，把 Bloom 强度调成 0 也救不回来。
        // 这类 bug 看起来像"后处理坏了"，其实是某个着色器吐了 NaN。
        vec3 safeNormalize(vec3 v, vec3 fallback) {
          float len = length(v);
          return len > 1e-5 ? v / len : fallback;
        }

        void main() {
          // 圆锥的 uv.y：0 在底部，1 在顶部（灯口）。
          // 用 pow 把亮度压向灯口那一端并一路衰减到桌面 —— smoothstep
          // 会造出一段完全不透明的腰身，看起来像帐篷而不像光。
          float fade = pow(clamp(vUv.y, 0.0, 1.0), 1.7)
                     * (1.0 - smoothstep(0.90, 1.0, vUv.y));
          // 正对视线的壳面 = 视线穿过的"介质"更厚 → 更亮
          vec3 N = safeNormalize(vNormalW, vec3(0.0, 1.0, 0.0));
          vec3 V = safeNormalize(vViewW, vec3(0.0, 0.0, 1.0));
          float facing = abs(dot(N, V));

          // 靠得越近越淡。你坐在自己这桌时灯就在头顶，若还画出一个
          // 完整的光锥，正前方会杵着一个发亮的三角形挡住整张桌子。
          // 现实里你也看不见自己正身处其中的那束光。
          float dist = length(cameraPosition - vWorldPos);
          float nearFade = smoothstep(1.6, 5.2, dist);

          float a = uOpacity * fade * mix(0.18, 1.0, facing) * nearFade;
          gl_FragColor = vec4(uColor, clamp(a, 0.0, 1.0));
        }
      `,
    })
  }, [color, opacity])

  return (
    <mesh position={position} renderOrder={2}>
      {/* openEnded = true：只要侧壁，不要顶底两个盖 */}
      <coneGeometry args={[radius, height, 32, 1, true]} />
      <primitive object={material} attach="material" />
    </mesh>
  )
}
