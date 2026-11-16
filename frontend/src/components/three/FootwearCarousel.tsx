'use client';

import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { MeshReflectorMaterial, useTexture } from '@react-three/drei';
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

/** The desktop camera: the Canvas starts here, and phones are re-framed by PhoneFit. */
const DESKTOP_CAM = { y: 0.55, z: 8.4 };
const FOG_COLOR = '#0c0a09';

/** Phones: a tighter drum, framed so the front pair fills most of the width and its neighbours peek in at the sides. */
const PHONE_FILL_W = 0.6;
const PHONE_FILL_H = 0.62;
const PHONE_CAM_Y = 0.5;
const phoneRadius = (count: number) => Math.max(2.1, (W + 0.06) / 2 / Math.tan(Math.PI / Math.max(count, 3)) + 0.3);

/** A touch must travel this far (px) before it counts as a swipe rather than a tap. */
const TAP_SLOP = 8;
/** Slightly above 1 so a comfortable swipe moves a pair or two. */
const TOUCH_GAIN = 1.2;
/** After a flick the ring keeps this share of the finger's speed (rad/s, capped) and coasts to a stop in about FLING_TAU seconds. */
const FLING_CARRY = 0.5;
const FLING_MAX = 3;
const FLING_TAU = 0.45;

type Drag = { x: number; startX: number; t: number; id: number; direct: boolean };

function Panel({ item, angle, radius, onHover, hovered, onOpen, dragging }: { item: CarouselItem; angle: number; radius: number; onHover: (id: string | null) => void; hovered: boolean; onOpen: (slug: string) => void; dragging: React.MutableRefObject<boolean> }) {
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
    <group position={[Math.sin(angle) * radius, 0, Math.cos(angle) * radius]} rotation={[0, angle, 0]}>
      <group ref={group}>
        <mesh position={[0, 0, -0.01]}>
          <planeGeometry args={[W + 0.06, H + 0.06]} />
          <meshBasicMaterial color={hovered ? '#b08d57' : '#e9dcc4'} />
        </mesh>
        <mesh
          onPointerOver={(e: ThreeEvent<PointerEvent>) => {
            e.stopPropagation();
            if (e.pointerType === 'touch') return; // a finger does not hover; it would leave the pair lit after a tap
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

function Ring({ items, onOpen, reflect, radius }: { items: CarouselItem[]; onOpen: (slug: string) => void; reflect: boolean; radius: number }) {
  const ring = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const velocity = useRef(0.12);
  const drag = useRef<Drag | null>(null);
  const dragging = useRef(false);
  const fling = useRef(0); // smoothed swipe speed (rad/s) while a finger is down
  const touchMode = useRef(false); // the last pointer was a finger or pen
  const gl = useThree((s) => s.gl);
  const get = useThree((s) => s.get);

  useEffect(() => {
    const canvas = gl.domElement;

    // Finger or pen: the whole canvas is a drag surface (not only the pairs) and the ring follows the finger.
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' || !e.isPrimary) return;
      touchMode.current = true;
      dragging.current = false;
      fling.current = 0;
      velocity.current = 0;
      drag.current = { x: e.clientX, startX: e.clientX, t: e.timeStamp, id: e.pointerId, direct: true };
    };

    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = e.clientX - d.x;
      if (!d.direct) {
        // Mouse (unchanged): the drag sets the spin speed.
        d.x = e.clientX;
        if (Math.abs(dx) > 1) dragging.current = true;
        velocity.current = dx * 0.25;
        return;
      }
      if (e.pointerId !== d.id || !ring.current) return;
      d.x = e.clientX;
      if (Math.abs(e.clientX - d.startX) > TAP_SLOP) dragging.current = true;
      // Turn the ring so the front pair moves as far as the finger does (scaled by TOUCH_GAIN).
      const { camera, size } = get();
      const cam = camera as THREE.PerspectiveCamera;
      const dist = Math.max(0.5, cam.position.z - radius);
      const worldPerPx = (2 * dist * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))) / size.height;
      const turn = ((dx * worldPerPx) / radius) * TOUCH_GAIN;
      ring.current.rotation.y += turn;
      const dt = Math.max(1, e.timeStamp - d.t) / 1000;
      d.t = e.timeStamp;
      fling.current = THREE.MathUtils.lerp(fling.current, turn / dt, 0.35);
    };

    // pointercancel fires when the browser takes the gesture over (a vertical swipe scrolls the page).
    const up = (e: PointerEvent) => {
      const d = drag.current;
      if (d?.direct) {
        if (e.pointerId !== d.id) return;
        // Lifted while still moving: carry the speed on, then settle back to the idle spin.
        const flicked = e.type === 'pointerup' && e.timeStamp - d.t < 90;
        velocity.current = flicked ? THREE.MathUtils.clamp(fling.current * FLING_CARRY, -FLING_MAX, FLING_MAX) : 0;
      }
      drag.current = null;
      setTimeout(() => (dragging.current = false), 30);
    };

    canvas.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('pointermove', move);
    return () => {
      canvas.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('pointermove', move);
    };
  }, [gl, get, radius]);

  useFrame((_, delta) => {
    if (!ring.current) return;
    const d = drag.current;
    if (d?.direct) return; // a finger is turning the ring
    const idle = hovered ? 0 : 0.12;
    if (!d) velocity.current = THREE.MathUtils.lerp(velocity.current, idle, touchMode.current ? 1 - Math.exp(-delta / FLING_TAU) : 0.03);
    ring.current.rotation.y += velocity.current * delta;
  });

  return (
    <>
      <group
        ref={ring}
        onPointerDown={(e: ThreeEvent<PointerEvent>) => {
          if (e.pointerType !== 'mouse') return; // fingers are handled on the canvas above
          touchMode.current = false;
          drag.current = { x: e.clientX, startX: e.clientX, t: e.timeStamp, id: e.pointerId, direct: false };
        }}
      >
        {items.map((item, i) => (
          <Panel key={item.id} item={item} angle={(i / items.length) * Math.PI * 2} radius={radius} onHover={setHovered} hovered={hovered === item.id} onOpen={onOpen} dragging={dragging} />
        ))}
      </group>
      {reflect ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -H / 2 - 0.08, 0]}>
          <planeGeometry args={[30, 30]} />
          <MeshReflectorMaterial blur={[300, 80]} resolution={512} mixBlur={1} mixStrength={18} roughness={0.85} depthScale={1} minDepthThreshold={0.4} maxDepthThreshold={1.4} color="#141210" metalness={0.4} mirror={0.5} />
        </mesh>
      ) : null}
    </>
  );
}

/** Frames the ring for a portrait phone canvas; the cleanup restores the desktop framing. */
function PhoneFit({ radius }: { radius: number }) {
  const get = useThree((s) => s.get);
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);

  useLayoutEffect(() => {
    if (!width || !height) return;
    const { camera, scene } = get();
    const cam = camera as THREE.PerspectiveCamera;
    const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    // Distance from the camera to the front pair: far enough to fit its width and its height.
    const dist = Math.max(W / PHONE_FILL_W / (2 * tanV * (width / height)), H / PHONE_FILL_H / (2 * tanV));
    cam.position.set(0, PHONE_CAM_Y, radius + dist);
    cam.lookAt(0, -0.1, radius);
    cam.updateProjectionMatrix();
    scene.fog = new THREE.Fog(FOG_COLOR, dist + 1.6, dist + 8.5);
    return () => {
      cam.position.set(0, DESKTOP_CAM.y, DESKTOP_CAM.z);
      cam.lookAt(0, 0, 0);
      cam.updateProjectionMatrix();
      scene.fog = new THREE.Fog(FOG_COLOR, 7, 14);
    };
  }, [get, width, height, radius]);

  return null;
}

export default function FootwearCarousel({ items, active, mobile, onOpen }: { items: CarouselItem[]; active: boolean; mobile: boolean; onOpen: (slug: string) => void }) {
  const radius = mobile ? phoneRadius(items.length) : RADIUS;
  return (
    <Canvas
      className="!absolute inset-0 touch-pan-y touch-pinch-zoom"
      dpr={mobile ? [1, 2] : [1, 1.6]}
      frameloop={active ? 'always' : 'never'}
      camera={{ position: [0, DESKTOP_CAM.y, DESKTOP_CAM.z], fov: 36 }}
      gl={{ antialias: true, alpha: false }}
      onCreated={({ gl, scene }) => {
        gl.setClearColor(FOG_COLOR);
        scene.fog = new THREE.Fog(FOG_COLOR, 7, 14);
      }}
      aria-hidden
    >
      <ambientLight intensity={1} />
      {mobile && <PhoneFit radius={radius} />}
      <Suspense fallback={null}>
        <Ring items={items} onOpen={onOpen} reflect={!mobile} radius={radius} />
      </Suspense>
    </Canvas>
  );
}
