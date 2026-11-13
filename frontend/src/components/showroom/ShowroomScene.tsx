'use client';

import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Html, SoftShadows, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { motion } from 'framer-motion';
import { imageUrl } from '@/lib/api';
import { cn } from '@/lib/format';
import { cutoutPath, type Rack } from './groups';

/* ── Layout constants (metres) ─────────────────────────────────────────── */
export const RACK_GAP = 7; // distance between racks along the gallery
const BAR_Y = 2.05; // height of the hanging rail
const SPACING = 0.86; // distance between hangers
const CARD_W = 0.6; // placeholder card (used until a PNG cut-out exists)
const CARD_H = 0.82;
const CUTOUT_H = 1.05; // height of a cut-out garment
const ROOM = { floor: '#efebe5', wall: '#fbfaf7', fog: '#f7f5f1' };

export interface HoverRef {
  rack: number;
  item: number;
}

export interface SceneProps {
  racks: Rack[];
  active: number;
  focus: number | null;
  hover: HoverRef | null;
  cutouts: Set<string>;
  mobile: boolean;
  reduced: boolean;
  /** Increments whenever a rack is entered; replays the slide-in. */
  activation: number;
  panRef: React.MutableRefObject<number>;
  onHover: (h: HoverRef | null) => void;
  onSelect: (rack: number, item: number) => void;
  onReady: () => void;
}

export function rackWidth(n: number) {
  return Math.max(2.4, (n - 1) * SPACING + 1.3);
}

export function itemX(rack: number, n: number, j: number) {
  return rack * RACK_GAP - ((n - 1) * SPACING) / 2 + j * SPACING;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/* ── Metal rod between two points ──────────────────────────────────────── */
function Rod({ a, b, r = 0.012, material }: { a: [number, number, number]; b: [number, number, number]; r?: number; material: THREE.Material }) {
  const { position, quaternion, length } = useMemo(() => {
    const va = new THREE.Vector3(...a);
    const vb = new THREE.Vector3(...b);
    const dir = vb.clone().sub(va);
    return {
      length: dir.length(),
      position: va.clone().add(vb).multiplyScalar(0.5),
      quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.join(','), b.join(',')]);
  return (
    <mesh position={position} quaternion={quaternion} material={material} castShadow>
      <cylinderGeometry args={[r, r, length, 12]} />
    </mesh>
  );
}

/* ── Thin black clothing rack ──────────────────────────────────────────── */
function RackFrame({ x, width, material }: { x: number; width: number; material: THREE.Material }) {
  const h = BAR_Y + 0.035;
  const half = width / 2;
  return (
    <group position={[x, 0, 0]}>
      <Rod a={[-half, h, 0]} b={[half, h, 0]} r={0.014} material={material} />
      <Rod a={[-half, 0.03, 0]} b={[-half, h, 0]} r={0.016} material={material} />
      <Rod a={[half, 0.03, 0]} b={[half, h, 0]} r={0.016} material={material} />
      <Rod a={[-half, 0.025, -0.3]} b={[-half, 0.025, 0.3]} r={0.016} material={material} />
      <Rod a={[half, 0.025, -0.3]} b={[half, 0.025, 0.3]} r={0.016} material={material} />
      {[-half, half].map((px) => (
        <mesh key={px} position={[px, h, 0]} material={material} castShadow>
          <sphereGeometry args={[0.022, 16, 12]} />
        </mesh>
      ))}
    </group>
  );
}

/* ── Wire hanger (pivot = the hook on the rail) ───────────────────────── */
function Hanger({ material }: { material: THREE.Material }) {
  return (
    <group>
      {/* Hook curls over the rail from the back and drops into the neck at the front. */}
      <mesh position={[0, 0.02, 0]} rotation={[0, Math.PI / 2, 0]} material={material} castShadow>
        <torusGeometry args={[0.034, 0.0055, 8, 28, Math.PI * 1.45]} />
      </mesh>
      <Rod a={[0, -0.012, 0.004]} b={[0, -0.095, 0]} r={0.0055} material={material} />
      <Rod a={[0, -0.095, 0]} b={[-0.25, -0.235, 0]} r={0.0055} material={material} />
      <Rod a={[0, -0.095, 0]} b={[0.25, -0.235, 0]} r={0.0055} material={material} />
      <Rod a={[-0.25, -0.235, 0]} b={[0.25, -0.235, 0]} r={0.0055} material={material} />
    </group>
  );
}

/* ── One hanging product ───────────────────────────────────────────────── */
interface ItemProps {
  texture: THREE.Texture;
  cutout: boolean;
  label: string;
  rack: number;
  j: number;
  n: number;
  active: boolean;
  focused: boolean;
  dimmed: boolean;
  hovered: boolean;
  reduced: boolean;
  activation: number;
  metal: THREE.Material;
  onHover: SceneProps['onHover'];
  onSelect: SceneProps['onSelect'];
}

function HangingItem({ texture, cutout, label, rack, j, n, active, focused, dimmed, hovered, reduced, activation, metal, onHover, onSelect }: ItemProps) {
  const group = useRef<THREE.Group>(null);
  const x = itemX(rack, n, j);
  const slideFrom = rack * RACK_GAP - rackWidth(n) / 2 + 0.1 - x; // enters from the rack's left end
  const anim = useRef({ slide: 1, start: -1, hover: 0, opacity: 1, armed: false });

  // Each item gets its own materials so it can fade independently.
  const mats = useMemo(() => {
    const hanger = (metal as THREE.MeshStandardMaterial).clone();
    hanger.transparent = true;
    if (cutout) {
      const img = texture.image as { width: number; height: number };
      const garment = new THREE.MeshStandardMaterial({ map: texture, transparent: true, alphaTest: 0.1, roughness: 0.92, side: THREE.DoubleSide });
      return { hanger, garment, mat: null as THREE.MeshStandardMaterial | null, width: CUTOUT_H * (img.width / img.height) };
    }
    // Placeholder card: product photo cover-fitted into a white lookbook card.
    const photo = texture.clone();
    photo.needsUpdate = true;
    const img = texture.image as { width: number; height: number };
    const pw = CARD_W - 0.07;
    const ph = CARD_H - 0.14;
    const planeAspect = pw / ph;
    const imgAspect = img.width / img.height;
    if (imgAspect > planeAspect) {
      photo.repeat.set(planeAspect / imgAspect, 1);
      photo.offset.set((1 - planeAspect / imgAspect) / 2, 0);
    } else {
      photo.repeat.set(1, imgAspect / planeAspect);
      photo.offset.set(0, (1 - imgAspect / planeAspect) / 2);
    }
    const garment = new THREE.MeshStandardMaterial({ map: photo, roughness: 0.85, transparent: true });
    const mat = new THREE.MeshStandardMaterial({ color: '#fdfcf9', roughness: 0.95, side: THREE.DoubleSide, transparent: true });
    return { hanger, garment, mat, width: CARD_W };
  }, [texture, cutout, metal]);

  useEffect(
    () => () => {
      mats.hanger.dispose();
      mats.garment.dispose();
      mats.mat?.dispose();
    },
    [mats],
  );

  // Arm the slide-in whenever this rack is (re)entered.
  useEffect(() => {
    if (active) anim.current.armed = true;
  }, [activation, active]);

  useFrame(({ clock }, delta) => {
    const g = group.current;
    if (!g) return;
    const s = anim.current;
    const t = clock.elapsedTime;
    if (s.armed) {
      s.armed = false;
      s.start = t + 0.35 + j * 0.12;
      s.slide = reduced ? 1 : 0;
    }
    if (s.slide < 1 && t >= s.start) s.slide = Math.min(1, s.slide + delta / 0.8);
    const e = easeOutCubic(s.slide);
    g.position.x = x + (1 - e) * slideFrom;

    s.hover = THREE.MathUtils.lerp(s.hover, hovered && !focused ? 1 : 0, 1 - Math.exp(-delta * 5));
    if (reduced) {
      g.rotation.set(0, 0, 0);
    } else {
      const amp = focused ? 0.035 : 0.006 + s.hover * 0.055;
      const speed = focused ? 0.55 : 1.15;
      g.rotation.z = Math.sin(t * speed + j * 1.7) * amp + (1 - e) * 0.18;
      g.rotation.y = Math.sin(t * speed * 0.7 + j) * amp * 0.8;
    }

    const target = (dimmed ? 0.14 : 1) * (0.25 + 0.75 * e);
    s.opacity = reduced ? target : THREE.MathUtils.lerp(s.opacity, target, 1 - Math.exp(-delta * 6));
    for (const m of [mats.hanger, mats.garment, mats.mat]) {
      if (!m) continue;
      m.opacity = s.opacity;
      m.depthWrite = s.opacity > 0.6;
    }
  });

  const over = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    onHover({ rack, item: j });
    document.body.style.cursor = 'pointer';
  };
  const out = () => {
    onHover(null);
    document.body.style.cursor = '';
  };
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 8) return; // it was a drag, not a tap
    onSelect(rack, j);
  };

  return (
    <group ref={group} position={[x, BAR_Y, 0]} onPointerOver={over} onPointerOut={out} onClick={click} name={label}>
      <Hanger material={mats.hanger} />
      {cutout ? (
        <mesh position={[0, -0.11 - CUTOUT_H / 2, 0.012]} material={mats.garment} castShadow>
          <planeGeometry args={[mats.width, CUTOUT_H]} />
        </mesh>
      ) : (
        <group position={[0, -0.3, 0]}>
          {/* clips holding the card on the hanger bar */}
          {[-0.17, 0.17].map((cx) => (
            <mesh key={cx} position={[cx, 0.035, 0]} material={mats.hanger} castShadow>
              <boxGeometry args={[0.026, 0.07, 0.014]} />
            </mesh>
          ))}
          <mesh position={[0, -CARD_H / 2, 0]} material={mats.mat!} castShadow receiveShadow>
            <boxGeometry args={[CARD_W, CARD_H, 0.006]} />
          </mesh>
          <mesh position={[0, -CARD_H / 2 + 0.035, 0.0042]} material={mats.garment}>
            <planeGeometry args={[CARD_W - 0.07, CARD_H - 0.14]} />
          </mesh>
        </group>
      )}
    </group>
  );
}

/* ── Floating sticker title ────────────────────────────────────────────── */
function StickerTitle({ x, label, visible, reduced }: { x: number; label: string; visible: boolean; reduced: boolean }) {
  return (
    <Html position={[x, BAR_Y + 0.5, 0]} transform distanceFactor={1.6} center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
      <div className={cn('transition-opacity duration-700', visible ? 'opacity-100' : 'opacity-0')} aria-hidden>
        <motion.div
          className="relative select-none whitespace-nowrap rounded-[20px] border-[5px] border-white bg-champagne px-8 pb-3 pt-2 text-center shadow-[0_14px_30px_-10px_rgba(12,10,9,0.45)]"
          initial={false}
          animate={reduced ? { rotate: -4 } : { rotate: [-5, -3, -5], y: [0, -7, 0] }}
          transition={{ duration: 4.5, repeat: reduced ? 0 : Infinity, ease: 'easeInOut' }}
        >
          <span className="eyebrow block text-[0.62rem] text-gold-deep">The showroom</span>
          <span className="font-display text-[3.4rem] italic leading-none text-ink">{label}</span>
          <span className="absolute -right-4 -top-4 flex h-12 w-12 rotate-12 items-center justify-center rounded-full border-[3px] border-white bg-ink font-sans text-[13px] font-semibold tracking-wide text-ivory">3D</span>
        </motion.div>
      </div>
    </Html>
  );
}

/* ── Camera: glides between racks and into the focused item ───────────── */
function CameraRig({ racks, active, focus, mobile, reduced, panRef }: Pick<SceneProps, 'racks' | 'active' | 'focus' | 'mobile' | 'reduced' | 'panRef'>) {
  const { camera, size } = useThree();
  const pointer = useRef(new THREE.Vector2());
  const look = useRef(new THREE.Vector3(active * RACK_GAP, 1.25, 0));
  const pos = useRef(new THREE.Vector3());
  const tgt = useRef(new THREE.Vector3());
  const first = useRef(true);

  useEffect(() => {
    const onMove = (e: PointerEvent) => pointer.current.set((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  useFrame((_, delta) => {
    const cam = camera as THREE.PerspectiveCamera;
    const aspect = size.width / Math.max(1, size.height);
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    const rack = racks[active];
    if (!rack) return;
    const n = rack.items.length;
    const rx = active * RACK_GAP;

    if (focus != null && rack.items[focus]) {
      const dist = mobile ? 3.7 : 1.95;
      const visH = 2 * dist * tanHalf;
      const visW = visH * aspect;
      const cx = itemX(active, n, focus) + (mobile ? 0 : visW * 0.17); // card on the right → item sits left of centre
      const cy = BAR_Y - 0.6 + (mobile ? -visH * 0.2 : 0); // bottom sheet → item sits higher
      tgt.current.set(cx, cy, 0);
      pos.current.set(cx, cy + 0.04, dist);
    } else {
      const W = rackWidth(n) + (mobile ? 0.5 : 2.6); // desktop leaves room for the rail index
      const fit = W / 2 / (tanHalf * aspect);
      const minDist = mobile ? 4.3 : 5.3;
      const dist = THREE.MathUtils.clamp(fit, minDist, mobile ? 5.6 : 9);
      const visW = 2 * dist * tanHalf * aspect;
      const maxPan = Math.max(0, (rackWidth(n) + 0.5 - visW) / 2);
      panRef.current = THREE.MathUtils.clamp(panRef.current, -maxPan, maxPan);
      const shift = mobile ? 0 : -visW * 0.07; // rack sits right of the index list
      const px = mobile ? panRef.current : reduced ? 0 : pointer.current.x * 0.22;
      const py = mobile || reduced ? 0 : pointer.current.y * 0.07;
      tgt.current.set(rx + shift + (mobile ? px : px * 0.5), 1.42, 0);
      pos.current.set(rx + shift + px, 1.62 + py, dist);
    }

    const k = reduced || first.current ? 1 : 1 - Math.exp(-delta * 2.4);
    first.current = false;
    cam.position.lerp(pos.current, k);
    look.current.lerp(tgt.current, k);
    cam.lookAt(look.current);
  });
  return null;
}

/* ── Gallery spotlight that follows the active rack ───────────────────── */
function GalleryLight({ active, mobile }: { active: number; mobile: boolean }) {
  const light = useRef<THREE.SpotLight>(null);
  const target = useMemo(() => new THREE.Object3D(), []);
  useFrame((_, delta) => {
    const l = light.current;
    if (!l) return;
    const x = active * RACK_GAP;
    const k = 1 - Math.exp(-delta * 2.4);
    l.position.x = THREE.MathUtils.lerp(l.position.x, x + 1.6, k);
    target.position.x = THREE.MathUtils.lerp(target.position.x, x, k);
    target.updateMatrixWorld();
  });
  return (
    <>
      <primitive object={target} position={[0, 1, 0]} />
      <spotLight
        ref={light}
        position={[1.6, 6.4, 4.6]}
        target={target}
        angle={0.62}
        penumbra={0.95}
        intensity={95}
        decay={2}
        color="#fff8ee"
        castShadow
        shadow-mapSize-width={mobile ? 1024 : 2048}
        shadow-mapSize-height={mobile ? 1024 : 2048}
        shadow-bias={-0.0003}
        shadow-normalBias={0.02}
      />
    </>
  );
}

/* ── Everything that needs textures (suspends until loaded) ───────────── */
function Gallery(props: SceneProps) {
  const { racks, active, focus, hover, cutouts, reduced, activation, onHover, onSelect, onReady } = props;
  const entries = useMemo(
    () =>
      racks.flatMap((rack, ri) =>
        rack.items.map((p, j) => {
          const cutout = cutouts.has(p.slug);
          return { ri, j, n: rack.items.length, p, cutout, url: cutout ? cutoutPath(p.slug) : imageUrl(p.images[0].md) };
        }),
      ),
    [racks, cutouts],
  );
  const textures = useTexture(entries.map((e) => e.url));
  useMemo(() => {
    for (const t of textures) {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
    }
  }, [textures]);

  const metal = useMemo(() => new THREE.MeshStandardMaterial({ color: '#191614', metalness: 0.7, roughness: 0.32 }), []);
  useEffect(() => () => metal.dispose(), [metal]);
  useEffect(() => {
    onReady();
  }, [onReady]);

  return (
    <>
      {racks.map((rack, ri) => (
        <group key={rack.key}>
          <RackFrame x={ri * RACK_GAP} width={rackWidth(rack.items.length)} material={metal} />
          <StickerTitle x={ri * RACK_GAP} label={rack.label} visible={ri === active && focus == null} reduced={reduced} />
        </group>
      ))}
      {entries.map((e, k) => (
        <HangingItem
          key={`${e.ri}-${e.p._id}`}
          texture={textures[k]}
          cutout={e.cutout}
          label={e.p.name}
          rack={e.ri}
          j={e.j}
          n={e.n}
          active={e.ri === active}
          focused={e.ri === active && focus === e.j}
          dimmed={e.ri === active && focus != null && focus !== e.j}
          hovered={hover?.rack === e.ri && hover.item === e.j}
          reduced={reduced}
          activation={activation}
          metal={metal}
          onHover={onHover}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

export default function ShowroomScene(props: SceneProps) {
  const { mobile, active } = props;
  return (
    <Canvas
      className="!absolute inset-0"
      shadows
      dpr={mobile ? [1, 1.5] : [1, 1.75]}
      camera={{ position: [active * RACK_GAP, 1.5, 6], fov: mobile ? 50 : 38, near: 0.1, far: 60 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.NeutralToneMapping;
      }}
      aria-hidden
    >
      <color attach="background" args={[ROOM.fog]} />
      <fog attach="fog" args={[ROOM.fog, 9, 24]} />
      {!mobile && <SoftShadows size={22} samples={12} focus={0.55} />}

      <ambientLight intensity={0.8} />
      <hemisphereLight args={['#ffffff', '#ece6dc', 0.85]} />
      <directionalLight position={[-4, 5, 3]} intensity={0.55} color="#ffffff" />
      <GalleryLight active={active} mobile={mobile} />

      {/* White gallery room: unlit white surfaces + shadow-only layers for soft shadows */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[120, 40]} />
        <meshBasicMaterial color={ROOM.floor} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]} receiveShadow>
        <planeGeometry args={[120, 40]} />
        <shadowMaterial opacity={0.2} />
      </mesh>
      <mesh position={[0, 6, -3.2]}>
        <planeGeometry args={[120, 12]} />
        <meshBasicMaterial color={ROOM.wall} />
      </mesh>
      <mesh position={[0, 6, -3.19]} receiveShadow>
        <planeGeometry args={[120, 12]} />
        <shadowMaterial opacity={0.1} />
      </mesh>

      <CameraRig {...props} />
      <Suspense fallback={null}>
        <Gallery {...props} />
      </Suspense>
    </Canvas>
  );
}
