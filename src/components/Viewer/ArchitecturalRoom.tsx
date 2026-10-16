'use client';

import React, { useEffect, useMemo, useRef, Suspense } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useRoomStore } from '@/stores/roomStore';
import { useTileMaterial } from '@/three/useTileMaterial';
import { getWoodGrainMap, getWoodNormalMap, getMarbleMap } from '@/three/proceduralPBR';
import { FurnitureSystem } from './Furniture/FurnitureSystem';
import { useInteriorMaterials, PALETTE } from './Furniture/interiorMaterials';
import { getRoomOpenings, getBathroomLayout, wallTransform, Opening, WallSide, FEATURE_WALL_DEPTH } from './roomLayout';
import { COUNTER_TOP } from './Furniture/KitchenFurniture';
import { FRIDGE_HOUSING_WIDTH } from './Furniture/ModernLuxuryRefrigerator';
import { LightGlow } from './Furniture/DecorPieces';
import { buildCurtainGeometry } from './curtainGeometry';
import { useFloorReflection } from './useFloorReflection';

const FT2M = 0.3048;
const SKIRTING_HEIGHT = 0.1;
const TRIM_COLOR = '#ece6dc';
const CEILING_COLOR = '#f5f2ec';
/** Bare floor before a tile is chosen: a light greige that still shows light and shadow instead of clipping to white. */
const FLOOR_PLACEHOLDER = '#e2ddd3';

/**
 * Walls are single-sided, so orbiting outside a wall makes it vanish. Openings
 * mounted on that wall (frames, curtains, door hardware) hide with it instead
 * of floating in front of the cut-away view.
 */
function WallMounted({ wall, halfL, halfW, children }: { wall: WallSide; halfL: number; halfW: number; children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  const shown = useRef(true);
  useFrame(({ camera }) => {
    const root = ref.current;
    if (!root) return;
    const p = camera.position;
    const show =
      wall === 'north' ? p.z > -halfW : wall === 'south' ? p.z < halfW : wall === 'east' ? p.x < halfL : p.x > -halfL;
    // Settled and in view: nothing to do. While cut away it is re-applied each frame so late-mounting parts hide too.
    if (show && shown.current) return;
    shown.current = show;
    root.traverse((o) => {
      const light = o as THREE.Light;
      if (light.isLight) {
        // Lights are dimmed rather than hidden: changing the number of lights in the scene
        // recompiles every material's shader, which freezes the page for seconds.
        if (show) light.intensity = (light.userData.baseIntensity as number | undefined) ?? light.intensity;
        else {
          if (light.intensity > 0) light.userData.baseIntensity = light.intensity;
          light.intensity = 0;
        }
      } else if ((o as THREE.Mesh).isMesh || (o as THREE.Sprite).isSprite || (o as THREE.Line).isLine || (o as THREE.Points).isPoints) {
        o.visible = show;
      }
    });
  });
  return <group ref={ref}>{children}</group>;
}

/** Flush walnut door with a warm-white architrave and brushed brass lever. Local +Z faces the room. */
function InteriorDoor({ width, height }: { width: number; height: number }) {
  const m = useInteriorMaterials();
  const trim = 0.07;
  // Built from room-facing planes so, like the walls, the door disappears when orbiting outside the room.
  return (
    <group>
      {/* Architrave (head + two legs) */}
      {[
        { x: 0, y: height + trim / 2, w: width + trim * 2, h: trim },
        { x: -(width + trim) / 2, y: height / 2, w: trim, h: height },
        { x: (width + trim) / 2, y: height / 2, w: trim, h: height },
      ].map((p, i) => (
        <mesh key={i} position={[p.x, p.y, 0.02]} receiveShadow>
          <planeGeometry args={[p.w, p.h]} />
          <meshStandardMaterial color={TRIM_COLOR} roughness={0.5} />
        </mesh>
      ))}
      {/* Leaf */}
      <mesh position={[0, height / 2, 0.012]} material={m.walnut} receiveShadow>
        <planeGeometry args={[width, height]} />
      </mesh>
      {/* Lever on a round rose */}
      <group position={[width / 2 - 0.08, 1.02, 0.05]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} material={m.brushedBrass}>
          <cylinderGeometry args={[0.026, 0.026, 0.01, 24]} />
        </mesh>
        <mesh position={[0, 0, 0.03]} rotation={[Math.PI / 2, 0, 0]} material={m.brushedBrass}>
          <cylinderGeometry args={[0.008, 0.008, 0.06, 12]} />
        </mesh>
        <mesh position={[-0.06, 0, 0.058]} rotation={[0, 0, Math.PI / 2]} material={m.brushedBrass} castShadow>
          <cylinderGeometry args={[0.009, 0.009, 0.13, 12]} />
        </mesh>
      </group>
    </group>
  );
}

let skyTexture: THREE.CanvasTexture | null = null;

/** Hazy daylight beyond the glass: pale sky at the top, a warm horizon, and the soft suggestion of distant trees and roofs. */
function getSkyTexture(): THREE.CanvasTexture | null {
  if (skyTexture) return skyTexture;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, '#d9e8f3');
  g.addColorStop(0.45, '#eef5f9');
  g.addColorStop(0.75, '#f7f3ea');
  g.addColorStop(1, '#efe7d8');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  // Distant treeline and rooftops, kept very soft so the window still reads as bright
  ctx.filter = 'blur(5px)';
  ctx.fillStyle = 'rgba(150,164,150,0.55)';
  for (let x = -10; x < 140; x += 14) {
    const h = 20 + ((x * 37) % 17);
    ctx.beginPath();
    ctx.ellipse(x + 7, 118, 12, h, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(190,186,176,0.5)';
  ctx.fillRect(10, 96, 34, 40);
  ctx.fillRect(78, 88, 30, 48);
  skyTexture = new THREE.CanvasTexture(c);
  skyTexture.colorSpace = THREE.SRGBColorSpace;
  return skyTexture;
}

/** Slim black steel window with daylight inflow. Local origin at the bottom-centre of the opening, +Z into the room. */
function SteelWindow({ width, height, frosted = false, light = 2.6 }: { width: number; height: number; frosted?: boolean; light?: number }) {
  const m = useInteriorMaterials();
  const sky = useMemo(() => getSkyTexture(), []);
  const f = 0.035;
  return (
    <group>
      {/* Sky aperture */}
      <mesh position={[0, height / 2, 0.003]}>
        <planeGeometry args={[width, height]} />
        {frosted ? <meshBasicMaterial color="#eef1f2" toneMapped={false} /> : <meshBasicMaterial map={sky} color="#ffffff" toneMapped={false} />}
      </mesh>
      <rectAreaLight position={[0, height / 2, 0.05]} width={width} height={height} intensity={light} color="#f6f4ef" />
      {/* Frame + mullions */}
      {[-1, 1].map((s) => (
        <mesh key={`v${s}`} position={[s * (width / 2 + f / 2), height / 2, 0.02]} material={m.matteBlack} castShadow>
          <boxGeometry args={[f, height + f * 2, 0.04]} />
        </mesh>
      ))}
      {[0, height].map((y) => (
        <mesh key={`h${y}`} position={[0, y, 0.02]} material={m.matteBlack} castShadow>
          <boxGeometry args={[width, f, 0.04]} />
        </mesh>
      ))}
      <mesh position={[0, height / 2, 0.02]} material={m.matteBlack}>
        <boxGeometry args={[0.022, height, 0.03]} />
      </mesh>
      {!frosted && (
        <mesh position={[0, height * 0.72, 0.02]} material={m.matteBlack}>
          <boxGeometry args={[width, 0.022, 0.03]} />
        </mesh>
      )}
      {/* Glass */}
      <mesh position={[0, height / 2, 0.012]}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={frosted ? 0.6 : 0.12} roughness={frosted ? 0.6 : 0.05} depthWrite={false} />
      </mesh>
      {/* Stone sill */}
      {!frosted && (
        <mesh position={[0, -0.015, 0.06]} material={m.travertine} castShadow receiveShadow>
          <boxGeometry args={[width + 0.12, 0.03, 0.12]} />
        </mesh>
      )}
    </group>
  );
}

/**
 * Floor-to-ceiling linen drapes drawn to either side of an opening, hung from black rings on a slim rod
 * with ball finials. Origin at floor level, +Z into the room.
 */
function Curtains({ openingWidth, roomHeight }: { openingWidth: number; roomHeight: number }) {
  const m = useInteriorMaterials();
  const timeOfDay = useRoomStore((st) => st.timeOfDay);
  const panelW = 0.66;
  const rodY = roomHeight - 0.07;
  const ringR = 0.022;
  // The head of the cloth is clipped at the lowest point of the rings
  const hang = rodY - ringR + 0.008 - 0.014;
  const panelX = openingWidth / 2 + panelW / 2 + 0.04;
  const rodLen = (panelX + panelW / 2 + 0.12) * 2;
  const geos = useMemo(
    () => [buildCurtainGeometry(panelW, hang, { seed: 1 }), buildCurtainGeometry(panelW, hang, { seed: 4 })],
    [hang],
  );
  useEffect(() => () => geos.forEach((g) => g.dispose()), [geos]);

  // Light passes through linen, so the drapes glow faintly by day and go dull after dark
  const cloth = useMemo(() => {
    const c = m.curtainLinen.clone();
    c.emissive = c.color.clone();
    c.emissiveIntensity = { morning: 0.2, afternoon: 0.24, evening: 0.14, night: 0.02 }[timeOfDay];
    return c;
  }, [m, timeOfDay]);
  useEffect(() => () => cloth.dispose(), [cloth]);

  const ringXs = (cx: number) => Array.from({ length: 8 }, (_, i) => cx - panelW / 2 + 0.05 + (i * (panelW - 0.1)) / 7);

  return (
    <group>
      {/* Rod, brackets and finials */}
      <mesh position={[0, rodY, 0.15]} rotation={[0, 0, Math.PI / 2]} material={m.matteBlack} castShadow>
        <cylinderGeometry args={[0.011, 0.011, rodLen, 16]} />
      </mesh>
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[s * (rodLen / 2 + 0.012), rodY, 0.15]} material={m.matteBlack} castShadow>
            <sphereGeometry args={[0.025, 20, 14]} />
          </mesh>
          <mesh position={[s * (rodLen / 2 - 0.08), rodY, 0.075]} rotation={[Math.PI / 2, 0, 0]} material={m.matteBlack}>
            <cylinderGeometry args={[0.006, 0.006, 0.15, 8]} />
          </mesh>
        </group>
      ))}
      {[-1, 1].map((s, k) => (
        <group key={s} position={[s * panelX, 0, 0.15]}>
          <mesh geometry={geos[k]} material={cloth} position={[0, 0.014, 0]} castShadow receiveShadow />
          {ringXs(0).map((x, i) => (
            <mesh key={i} position={[x, rodY, 0]} material={m.matteBlack} rotation={[0, Math.PI / 2, 0]} castShadow>
              <torusGeometry args={[ringR, 0.0032, 8, 20]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

/** Pair of full-height black-framed glass sliders (terrace facade), glowing softly from the interior. */
function GlassSliders({ width, height }: { width: number; height: number }) {
  const m = useInteriorMaterials();
  const f = 0.045;
  return (
    <group>
      <mesh position={[0, height / 2, 0.004]}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial color="#d9cfc1" emissive="#f3e3cc" emissiveIntensity={0.35} roughness={0.9} />
      </mesh>
      {[-1, 0, 1].map((s) => (
        <mesh key={`v${s}`} position={[s * (width / 2), height / 2, 0.03]} material={m.matteBlack} castShadow>
          <boxGeometry args={[s === 0 ? 0.06 : f, height + f, 0.06]} />
        </mesh>
      ))}
      {[0, height].map((y) => (
        <mesh key={`h${y}`} position={[0, y, 0.03]} material={m.matteBlack} castShadow>
          <boxGeometry args={[width + f, f, 0.06]} />
        </mesh>
      ))}
      <mesh position={[0, height / 2, 0.035]}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={0.18} roughness={0.04} metalness={0.2} depthWrite={false} />
      </mesh>
      <mesh position={[0.08, 1.05, 0.07]} material={m.matteBlack}>
        <boxGeometry args={[0.02, 0.4, 0.02]} />
      </mesh>
    </group>
  );
}

export function ArchitecturalRoom() {
  const {
    roomType,
    lengthFt,
    widthFt,
    heightFt,
    layout,
    groutWidthMm,
    groutColor,
    floorTile,
    wallNTile,
    wallSTile,
    wallETile,
    wallWTile,
    featureWallTile,
    backsplashTile,
    showerWallTile,
    doorWidthFt,
    doorHeightFt,
    windowWidthFt,
    windowHeightFt,
    activeTemplate,
    wallColor,
    wallPaints,
    featureWallTreatment,
    featureWallColor,
    featureWallBacklight,
  } = useRoomStore();

  const lengthM = lengthFt * FT2M;
  const widthM  = widthFt * FT2M;
  const heightM = heightFt * FT2M;

  const halfL = lengthM / 2;
  const halfW = widthM / 2;

  const wallDefaultColor = wallColor || activeTemplate?.recommendedPalette?.wallColor || PALETTE.warmWhite;

  const openings = getRoomOpenings(
    roomType,
    lengthM,
    widthM,
    heightM,
    doorWidthFt * FT2M,
    doorHeightFt * FT2M,
    windowWidthFt * FT2M,
    windowHeightFt * FT2M,
  );
  const bath = getBathroomLayout(lengthM, widthM);

  // Kitchen backsplash spans the base run (west wall → tall fridge column), worktop to just under the ceiling hood line
  const splashX0 = -halfL;
  const splashX1 = halfL - FRIDGE_HOUSING_WIDTH - 0.01;
  const splashLen = splashX1 - splashX0;
  const splashH = 0.72;

  // 1. Tile Materials for Each Surface
  const floorMat = useTileMaterial({
    textureUrl:      floorTile?.textureUrl ?? null,
    surfaceLengthFt: lengthFt,
    surfaceWidthFt:  widthFt,
    tileWidthMm:     floorTile?.widthMm  ?? 600,
    tileHeightMm:    floorTile?.heightMm ?? 600,
    finish:          floorTile?.finish,
    layout,
    groutWidthMm,
    groutColor,
    defaultColor:    floorTile?.color ?? FLOOR_PLACEHOLDER,
  });

  const wallNMat = useTileMaterial({
    surface:         'wall',
    textureUrl:      (featureWallTile || wallNTile)?.textureUrl ?? null,
    surfaceLengthFt: lengthFt,
    surfaceWidthFt:  heightFt,
    tileWidthMm:     (featureWallTile || wallNTile)?.widthMm  ?? 300,
    tileHeightMm:    (featureWallTile || wallNTile)?.heightMm ?? 600,
    finish:          (featureWallTile || wallNTile)?.finish,
    layout,
    groutWidthMm,
    groutColor,
    defaultColor:    wallPaints['wall-n'] || wallDefaultColor,
  });

  const wallSMat = useTileMaterial({
    surface:         'wall',
    textureUrl:      wallSTile?.textureUrl ?? null,
    surfaceLengthFt: lengthFt,
    surfaceWidthFt:  heightFt,
    tileWidthMm:     wallSTile?.widthMm  ?? 300,
    tileHeightMm:    wallSTile?.heightMm ?? 600,
    finish:          wallSTile?.finish,
    layout,
    groutWidthMm,
    groutColor,
    defaultColor:    wallPaints['wall-s'] || wallDefaultColor,
  });

  const wallEMat = useTileMaterial({
    surface:         'wall',
    textureUrl:      wallETile?.textureUrl ?? null,
    surfaceLengthFt: widthFt,
    surfaceWidthFt:  heightFt,
    tileWidthMm:     wallETile?.widthMm  ?? 300,
    tileHeightMm:    wallETile?.heightMm ?? 600,
    finish:          wallETile?.finish,
    layout,
    groutWidthMm,
    groutColor,
    defaultColor:    wallPaints['wall-e'] || wallDefaultColor,
  });

  const wallWMat = useTileMaterial({
    surface:         'wall',
    textureUrl:      wallWTile?.textureUrl ?? null,
    surfaceLengthFt: widthFt,
    surfaceWidthFt:  heightFt,
    tileWidthMm:     wallWTile?.widthMm  ?? 300,
    tileHeightMm:    wallWTile?.heightMm ?? 600,
    finish:          wallWTile?.finish,
    layout,
    groutWidthMm,
    groutColor,
    defaultColor:    wallPaints['wall-w'] || wallDefaultColor,
  });

  const backsplashMat = useTileMaterial({
    textureUrl:      backsplashTile?.textureUrl ?? null,
    surfaceLengthFt: splashLen / FT2M,
    surfaceWidthFt:  splashH / FT2M,
    tileWidthMm:     backsplashTile?.widthMm  ?? 200,
    tileHeightMm:    backsplashTile?.heightMm ?? 200,
    finish:          backsplashTile?.finish,
    layout,
    groutWidthMm,
    groutColor,
  });

  const showerNMat = useTileMaterial({
    textureUrl:      showerWallTile?.textureUrl ?? null,
    surfaceLengthFt: bath.showerW / FT2M,
    surfaceWidthFt:  heightFt,
    tileWidthMm:     showerWallTile?.widthMm  ?? 600,
    tileHeightMm:    showerWallTile?.heightMm ?? 1200,
    finish:          showerWallTile?.finish,
    layout,
    groutWidthMm,
    groutColor,
  });

  const showerEMat = useTileMaterial({
    textureUrl:      showerWallTile?.textureUrl ?? null,
    surfaceLengthFt: bath.showerD / FT2M,
    surfaceWidthFt:  heightFt,
    tileWidthMm:     showerWallTile?.widthMm  ?? 600,
    tileHeightMm:    showerWallTile?.heightMm ?? 1200,
    finish:          showerWallTile?.finish,
    layout,
    groutWidthMm,
    groutColor,
  });

  // Glazed and polished floors mirror the room; honed and matt ones do not
  const floorRef = useRef<THREE.Mesh>(null);
  const reflection = useMemo(() => {
    switch (floorTile?.finish) {
      case 'Polished':
        return { strength: 1, blur: 0.6 };
      case 'Gloss':
        return { strength: 0.75, blur: 1.4 };
      case 'Satin':
        return { strength: 0.28, blur: 2.6 };
      default:
        return { strength: 0, blur: 1 };
    }
  }, [floorTile?.finish]);
  useFloorReflection(floorRef, floorMat, reflection);

  // Feature wall finishes take the chosen tone and add real grain / veining
  const slatMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: featureWallColor || PALETTE.walnut,
        map: getWoodGrainMap(1, 1),
        normalMap: getWoodNormalMap(1, 1),
        normalScale: new THREE.Vector2(0.1, 0.1),
        roughness: 0.6,
      }),
    [featureWallColor],
  );
  const slabMat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: featureWallColor || PALETTE.travertine,
        map: getMarbleMap(1, 1),
        roughness: 0.25,
        clearcoat: 0.3,
        clearcoatRoughness: 0.25,
      }),
    [featureWallColor],
  );
  useEffect(() => () => slatMat.dispose(), [slatMat]);
  useEffect(() => () => slabMat.dispose(), [slabMat]);
  const m = useInteriorMaterials();

  const slatCount = Math.round((lengthM * 0.92) / 0.06);
  const doorTf = openings.door && wallTransform(openings.door.wall, openings.door.offset, 0, halfL, halfW, 0.005);
  const curtained = roomType !== 'bathroom';

  const renderWindow = (o: Opening) => {
    const sill = wallTransform(o.wall, o.offset, o.sill, halfL, halfW, 0.006);
    const base = wallTransform(o.wall, o.offset, 0, halfL, halfW, 0.006);
    return (
      <WallMounted wall={o.wall} halfL={halfL} halfW={halfW}>
        <group position={sill.position} rotation={sill.rotation}>
          <SteelWindow width={o.width} height={o.height} frosted={!curtained} light={curtained ? 2.6 : 1.8} />
        </group>
        {curtained && (
          <group position={base.position} rotation={base.rotation}>
            <Curtains openingWidth={o.width} roomHeight={heightM} />
          </group>
        )}
      </WallMounted>
    );
  };

  return (
    <group position={[0, 0, 0]}>

      {/* Floor */}
      <mesh ref={floorRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[lengthM, widthM]} />
        <primitive object={floorMat} attach="material" />
      </mesh>

      {/* North Wall (Feature Wall) */}
      <mesh position={[0, heightM / 2, -halfW + 0.005]} rotation={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[lengthM, heightM]} />
        <primitive object={wallNMat} attach="material" />
      </mesh>

      {/* Feature wall: walnut acoustic slat panel on a dark felt backing */}
      {featureWallTreatment === 'wood-slats' && (
        <group position={[0, SKIRTING_HEIGHT + (heightM - SKIRTING_HEIGHT) / 2, -halfW + 0.012]}>
          <mesh receiveShadow>
            <boxGeometry args={[lengthM * 0.92 + 0.03, heightM - SKIRTING_HEIGHT, 0.012]} />
            <meshStandardMaterial color="#2b2622" roughness={1} />
          </mesh>
          {Array.from({ length: slatCount }).map((_, i) => {
            const x = -lengthM * 0.46 + (i + 0.5) * ((lengthM * 0.92) / slatCount);
            return (
              <mesh key={i} position={[x, 0, 0.018]} material={slatMat} castShadow receiveShadow>
                <boxGeometry args={[0.036, heightM - SKIRTING_HEIGHT, 0.024]} />
              </mesh>
            );
          })}
        </group>
      )}

      {/* Feature wall: book-matched stone slabs with a fine shadow-gap joint */}
      {featureWallTreatment === 'marble-slab' && (
        <group position={[0, heightM / 2, -halfW + 0.015]}>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * lengthM / 4, 0, 0]} material={slabMat} receiveShadow scale={[s, 1, 1]}>
              <planeGeometry args={[lengthM / 2, heightM]} />
            </mesh>
          ))}
        </group>
      )}

      {/* Feature wall cove wash */}
      {featureWallBacklight && (
        <group position={[0, heightM - 0.06, -halfW + 0.12]}>
          <mesh position={[0, 0.03, -0.08]} material={m.ledWarm}>
            <boxGeometry args={[lengthM * 0.94, 0.006, 0.01]} />
          </mesh>
          {[-lengthM * 0.28, lengthM * 0.28].map((x) => (
            <pointLight key={x} position={[x, 0, 0]} color={PALETTE.lightWarm} intensity={1.6} distance={heightM * 1.1} decay={2} />
          ))}
        </group>
      )}

      {/* South Wall (Omitted for outdoor balcony to keep open panoramic view) */}
      {roomType !== 'outdoor' && (
        <mesh position={[0, heightM / 2, halfW - 0.005]} rotation={[0, Math.PI, 0]} receiveShadow>
          <planeGeometry args={[lengthM, heightM]} />
          <primitive object={wallSMat} attach="material" />
        </mesh>
      )}

      {/* East Wall */}
      <mesh position={[halfL - 0.005, heightM / 2, 0]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[widthM, heightM]} />
        <primitive object={wallEMat} attach="material" />
      </mesh>

      {/* West Wall */}
      <mesh position={[-halfL + 0.005, heightM / 2, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[widthM, heightM]} />
        <primitive object={wallWMat} attach="material" />
      </mesh>

      {/* Backsplash Tile Surface (Kitchen) — worktop to shelf/hood line along the base run */}
      {roomType === 'kitchen' && (
        <mesh position={[(splashX0 + splashX1) / 2, COUNTER_TOP + splashH / 2, -halfW + FEATURE_WALL_DEPTH + 0.002]} receiveShadow>
          <planeGeometry args={[splashLen, splashH]} />
          <primitive object={backsplashMat} attach="material" />
        </mesh>
      )}

      {/* Shower Wall Tile Surfaces (Bathroom — north-east walk-in shower) */}
      {roomType === 'bathroom' && (
        <group>
          <mesh position={[halfL - 0.008, heightM / 2, -halfW + bath.showerD / 2]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
            <planeGeometry args={[bath.showerD, heightM]} />
            <primitive object={showerEMat} attach="material" />
          </mesh>
          <mesh position={[halfL - bath.showerW / 2, heightM / 2, -halfW + FEATURE_WALL_DEPTH + 0.002]} receiveShadow>
            <planeGeometry args={[bath.showerW, heightM]} />
            <primitive object={showerNMat} attach="material" />
          </mesh>
        </group>
      )}

      {/* Slim warm-white skirting */}
      <group position={[0, SKIRTING_HEIGHT / 2, 0]}>
        <mesh position={[0, 0, -halfW + 0.01]} receiveShadow>
          <boxGeometry args={[lengthM, SKIRTING_HEIGHT, 0.018]} />
          <meshStandardMaterial color={TRIM_COLOR} roughness={0.45} />
        </mesh>
        {roomType !== 'outdoor' && (
          <mesh position={[0, 0, halfW - 0.01]} receiveShadow>
            <boxGeometry args={[lengthM, SKIRTING_HEIGHT, 0.018]} />
            <meshStandardMaterial color={TRIM_COLOR} roughness={0.45} />
          </mesh>
        )}
        <mesh position={[halfL - 0.01, 0, 0]} receiveShadow>
          <boxGeometry args={[0.018, SKIRTING_HEIGHT, widthM]} />
          <meshStandardMaterial color={TRIM_COLOR} roughness={0.45} />
        </mesh>
        <mesh position={[-halfL + 0.01, 0, 0]} receiveShadow>
          <boxGeometry args={[0.018, SKIRTING_HEIGHT, widthM]} />
          <meshStandardMaterial color={TRIM_COLOR} roughness={0.45} />
        </mesh>
      </group>

      {/* Ceiling with recessed downlights */}
      <group position={[0, heightM, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[lengthM, widthM]} />
          <meshStandardMaterial color={CEILING_COLOR} roughness={0.95} />
        </mesh>
        {[-1, 1].flatMap((sx) =>
          [-1, 1].map((sz) => {
            // The north row sits close to the feature wall, matching the wall-washer lights
            const z = sz < 0 ? -halfW + 0.42 : sz * widthM * 0.28;
            return (
              <group key={`${sx}${sz}`} position={[sx * lengthM * 0.3, -0.002, z]}>
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                  <ringGeometry args={[0.04, 0.055, 24]} />
                  <meshStandardMaterial color="#d9d4cc" roughness={0.4} />
                </mesh>
                <mesh rotation={[Math.PI / 2, 0, 0]} material={m.ledWarm}>
                  <circleGeometry args={[0.04, 24]} />
                </mesh>
                <LightGlow position={[0, -0.05, 0]} size={0.42} strength={0.7} />
              </group>
            );
          }),
        )}
      </group>

      {/* Door */}
      {openings.door && doorTf && (
        <WallMounted wall={openings.door.wall} halfL={halfL} halfW={halfW}>
          <group position={doorTf.position} rotation={doorTf.rotation}>
            <InteriorDoor width={openings.door.width} height={openings.door.height} />
          </group>
        </WallMounted>
      )}

      {/* Upper-landing door (staircase) */}
      {openings.upperDoor && (() => {
        const tf = wallTransform(openings.upperDoor.wall, openings.upperDoor.offset, openings.upperDoor.sill, halfL, halfW, 0.005);
        return (
          <WallMounted wall={openings.upperDoor.wall} halfL={halfL} halfW={halfW}>
            <group position={tf.position} rotation={tf.rotation}>
              <InteriorDoor width={openings.upperDoor.width} height={openings.upperDoor.height} />
            </group>
          </WallMounted>
        );
      })()}

      {/* Window (+ curtains) */}
      {openings.window && renderWindow(openings.window)}

      {/* Terrace glass sliders */}
      {openings.slider && (() => {
        const tf = wallTransform(openings.slider.wall, openings.slider.offset, 0, halfL, halfW, 0.006);
        return (
          <WallMounted wall={openings.slider.wall} halfL={halfL} halfW={halfW}>
            <group position={tf.position} rotation={tf.rotation}>
              <GlassSliders width={openings.slider.width} height={openings.slider.height} />
            </group>
          </WallMounted>
        );
      })()}

      {/* 3D Furniture System with Isolated Suspense Boundary (Room walls & tiles never vanish) */}
      <Suspense fallback={null}>
        <FurnitureSystem />
      </Suspense>

    </group>
  );
}
