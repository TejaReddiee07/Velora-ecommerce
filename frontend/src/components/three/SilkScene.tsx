'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer, Sparkles } from '@react-three/drei';
import * as THREE from 'three';

/**
 * Procedural silk: a high-resolution plane displaced in the vertex shader by
 * layered waves, shaded with a physical material (sheen + clearcoat). Normals
 * are derived analytically so lighting follows the folds. No external assets.
 */
const WAVE_GLSL = /* glsl */ `
  uniform float uTime;
  uniform float uAmp;
  uniform vec2 uPointer;
  uniform float uRipple;
  float silkWave(vec2 p) {
    float t = uTime;
    // Long diagonal folds (silk drapes in broad, soft waves) + a gentle cursor ripple.
    float z = 0.34 * sin(p.x * 1.05 + p.y * 0.5 + t * 0.55);
    z += 0.15 * sin(p.x * 2.0 - p.y * 1.2 + t * 0.8) * cos(p.y * 0.8 - t * 0.3);
    z += 0.035 * sin(p.x * 3.4 + p.y * 2.0 + t * 1.1);
    // Twist along the ribbon's length.
    z += 0.32 * p.y * sin(p.x * 0.55 + t * 0.35);
    float d = distance(p, uPointer * vec2(4.0, 1.2));
    z += 0.16 * uRipple * exp(-d * d * 0.5) * sin(d * 2.2 - t * 2.0);
    return z * uAmp;
  }
`;

function Silk({ segments, scrollRef, pointerRef }: { segments: number; scrollRef: React.MutableRefObject<number>; pointerRef: React.MutableRefObject<THREE.Vector2> }) {
  const mesh = useRef<THREE.Mesh>(null);
  const shaderRef = useRef<{ uniforms: Record<string, THREE.IUniform> } | null>(null);
  const { viewport } = useThree();

  const material = useMemo(() => {
    const m = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#9a774a'),
      roughness: 0.3,
      metalness: 0.12,
      sheen: 1,
      sheenRoughness: 0.25,
      sheenColor: new THREE.Color('#fff0d2'),
      clearcoat: 0.5,
      clearcoatRoughness: 0.22,
      side: THREE.DoubleSide,
    });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      shader.uniforms.uAmp = { value: 1 };
      shader.uniforms.uPointer = { value: new THREE.Vector2(0, 0) };
      shader.uniforms.uRipple = { value: 0 };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${WAVE_GLSL}`)
        .replace(
          '#include <beginnormal_vertex>',
          `float e = 0.02;
           float dzdx = (silkWave(position.xy + vec2(e, 0.0)) - silkWave(position.xy - vec2(e, 0.0))) / (2.0 * e);
           float dzdy = (silkWave(position.xy + vec2(0.0, e)) - silkWave(position.xy - vec2(0.0, e))) / (2.0 * e);
           vec3 objectNormal = normalize(vec3(-dzdx, -dzdy, 1.0));
           #ifdef USE_TANGENT
             vec3 objectTangent = vec3(tangent.xyz);
           #endif`,
        )
        .replace('#include <begin_vertex>', 'vec3 transformed = vec3(position.xy, position.z + silkWave(position.xy));');
      shaderRef.current = shader;
    };
    return m;
  }, []);

  const geometry = useMemo(() => new THREE.PlaneGeometry(11, 2.8, segments, Math.round(segments * 0.3)), [segments]);

  useFrame((state, delta) => {
    const s = shaderRef.current;
    if (s) {
      s.uniforms.uTime.value += delta;
      const target = pointerRef.current;
      (s.uniforms.uPointer.value as THREE.Vector2).lerp(target, 0.04);
      const moved = target.x !== 0 || target.y !== 0;
      s.uniforms.uRipple.value = THREE.MathUtils.lerp(s.uniforms.uRipple.value, moved ? 1 : 0, 0.02);
      s.uniforms.uAmp.value = THREE.MathUtils.lerp(s.uniforms.uAmp.value, 1 - scrollRef.current * 0.55, 0.08);
    }
    if (mesh.current) {
      const p = scrollRef.current;
      mesh.current.rotation.x = THREE.MathUtils.lerp(mesh.current.rotation.x, -0.42 + p * 0.4 + pointerRef.current.y * 0.06, 0.06);
      mesh.current.rotation.y = THREE.MathUtils.lerp(mesh.current.rotation.y, -0.3 + pointerRef.current.x * 0.1, 0.05);
      mesh.current.rotation.z = THREE.MathUtils.lerp(mesh.current.rotation.z, 0.5 - p * 0.2, 0.06);
      mesh.current.position.y = THREE.MathUtils.lerp(mesh.current.position.y, 0.15 + p * 1.6, 0.08);
    }
    state.camera.position.x = THREE.MathUtils.lerp(state.camera.position.x, pointerRef.current.x * 0.25, 0.03);
  });

  // Desktop: a ribbon of silk rising across the right; the headline keeps the dark left side.
  const wide = viewport.aspect > 1;
  const scale = wide ? Math.max(0.7, viewport.width / 9.5) : 0.6;
  const x = wide ? viewport.width * 0.2 : 0.6;
  return <mesh ref={mesh} geometry={geometry} material={material} scale={scale} rotation={[-0.42, -0.3, 0.5]} position={[x, 0.15, -1.6]} />;
}

export default function SilkScene({ mobile, active, scrollRef }: { mobile: boolean; active: boolean; scrollRef: React.MutableRefObject<number> }) {
  const pointer = useRef(new THREE.Vector2(0, 0));
  useEffect(() => {
    const onMove = (e: PointerEvent) => pointer.current.set((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, []);
  return (
    <Canvas
      className="!absolute inset-0"
      dpr={mobile ? [1, 1.25] : [1, 1.75]}
      frameloop={active ? 'always' : 'never'}
      camera={{ position: [0, 0, 6], fov: 38 }}
      gl={{ antialias: !mobile, alpha: true, powerPreference: 'high-performance' }}
      aria-hidden
    >
      <ambientLight intensity={0.15} />
      <directionalLight position={[4, 5, 6]} intensity={3} color="#fff4e2" />
      <directionalLight position={[-6, -2, 3]} intensity={0.9} color="#8fa6c9" />
      <Silk segments={mobile ? 90 : 180} scrollRef={scrollRef} pointerRef={pointer} />
      <Sparkles count={mobile ? 30 : 70} scale={[10, 6, 3]} size={mobile ? 2 : 2.6} speed={0.25} opacity={0.55} color="#e9dcc4" />
      <Environment resolution={128}>
        <Lightformer form="rect" intensity={2.5} position={[0, 4, 4]} scale={[8, 2, 1]} color="#fff3dd" />
        <Lightformer form="rect" intensity={1.2} position={[-5, 0, 2]} rotation-y={Math.PI / 2} scale={[6, 2, 1]} color="#c9d6ea" />
        <Lightformer form="ring" intensity={1.6} position={[4, -1, 3]} scale={2} color="#ffe2b8" />
      </Environment>
    </Canvas>
  );
}
