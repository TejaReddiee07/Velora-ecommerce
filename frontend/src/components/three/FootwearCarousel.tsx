'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import { ContactShadows, MeshReflectorMaterial, useTexture } from '@react-three/drei';
import * as THREE from 'three';

export interface CarouselItem {
  id: string;
  slug: string;
  name: string;
  image: string;
}

const RADIUS = 3.5;
const W = 1.55;
const H = 1.94;

function Panel({ item, angle, onHover, hovered, onOpen, dragging }: { item: CarouselItem; angle: number; onHover: (id: string | null) => void; hovered: boolean; onOpen: (slug: string) => void; dragging: React.MutableRefObject<boolean> }) {
  const tex = useTexture(item.image);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const group = useRef<THREE.Group>(null);
  // Cover-fit the photo on a 4:5 panel.
  useMemo(() => {
    const img = tex.image as { width: number; height: number } | undefined;
    if (!img) return;
    const panel = W / H;
    const ratio = img.width / img.height;
    if (ratio > panel) {
      tex.repeat.set(panel / ratio, 1);
      tex.offset.set((1 - panel / ratio) / 2, 0);
    } else {
      tex.repeat.set(1, ratio / panel);
      tex.offset.set(0, (1 - ratio / panel) / 2);
    }
  }, [tex]);

  useFrame(() => {
    if (!group.current) return;
    const s = hovered ? 1.08 : 1;
    group.current.scale.lerp(new THREE.Vector3(s, s, s), 0.12);
    group.current.position.y = THREE.MathUtils.lerp(group.current.position.y, hovered ? 0.12 : 0, 0.12);
  });

  return (
    <group position={[Math.sin(angle) * RADIUS, 0, Math.cos(angle) * RADIUS]} rotation={[0, angle, 0]}>
      <group ref={group}>
        <mesh position={[0, 0, -0.01]}>
          <planeGeometry args={[W + 0.06, H + 0.06]} />
          <meshBasicMaterial color={hovered ? '#b08d57' : '#e9dcc4'} />
        </mesh>
        <mesh
          onPointerOver={(e: ThreeEvent<PointerEvent>) => {
            e.stopPropagation();
            onHover(item.id);
            document.body.style.cursor = 'pointer';
          }}
          onPointerOut={() => {
            onHover(null);
            document.body.style.cursor = '';
          }}
          onClick={(e: ThreeEvent<MouseEvent>) => {
            e.stopPropagation();
            if (!dragging.current) onOpen(item.slug);
          }}
        >
          <planeGeometry args={[W, H]} />
          <meshBasicMaterial map={tex} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  );
}

function Ring({ items, onOpen, reflect }: { items: CarouselItem[]; onOpen: (slug: string) => void; reflect: boolean }) {
  const ring = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const velocity = useRef(0.12);
  const drag = useRef<{ x: number; active: boolean } | null>(null);
  const dragging = useRef(false);

  useEffect(() => {
    const up = () => {
      drag.current = null;
      setTimeout(() => (dragging.current = false), 30);
    };
    const move = (e: PointerEvent) => {
      if (!drag.current?.active) return;
      const dx = e.clientX - drag.current.x;
      drag.current.x = e.clientX;
      if (Math.abs(dx) > 1) dragging.current = true;
      velocity.current = dx * 0.25;
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointermove', move);
    return () => {
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointermove', move);
    };
  }, []);

  useFrame((_, delta) => {
    if (!ring.current) return;
    const idle = hovered ? 0 : 0.12;
    if (!drag.current) velocity.current = THREE.MathUtils.lerp(velocity.current, idle, 0.03);
    ring.current.rotation.y += velocity.current * delta;
  });

  return (
    <>
      <group ref={ring} onPointerDown={(e: ThreeEvent<PointerEvent>) => (drag.current = { x: e.clientX, active: true })}>
        {items.map((item, i) => (
          <Panel key={item.id} item={item} angle={(i / items.length) * Math.PI * 2} onHover={setHovered} hovered={hovered === item.id} onOpen={onOpen} dragging={dragging} />
        ))}
      </group>
      {reflect ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -H / 2 - 0.08, 0]}>
          <planeGeometry args={[30, 30]} />
          <MeshReflectorMaterial blur={[300, 80]} resolution={512} mixBlur={1} mixStrength={18} roughness={0.85} depthScale={1} minDepthThreshold={0.4} maxDepthThreshold={1.4} color="#141210" metalness={0.4} mirror={0.5} />
        </mesh>
      ) : (
        <ContactShadows position={[0, -H / 2 - 0.08, 0]} opacity={0.5} scale={12} blur={2.5} far={3} />
      )}
    </>
  );
}

export default function FootwearCarousel({ items, active, mobile, onOpen }: { items: CarouselItem[]; active: boolean; mobile: boolean; onOpen: (slug: string) => void }) {
  return (
    <Canvas
      className="!absolute inset-0 touch-pan-y"
      dpr={mobile ? [1, 1.25] : [1, 1.6]}
      frameloop={active ? 'always' : 'never'}
      camera={{ position: [0, 0.55, 8.4], fov: 36 }}
      gl={{ antialias: true, alpha: false }}
      onCreated={({ gl, scene }) => {
        gl.setClearColor('#0c0a09');
        scene.fog = new THREE.Fog('#0c0a09', 7, 14);
      }}
      aria-hidden
    >
      <ambientLight intensity={1} />
      <Suspense fallback={null}>
        <Ring items={items} onOpen={onOpen} reflect={!mobile} />
      </Suspense>
    </Canvas>
  );
}
