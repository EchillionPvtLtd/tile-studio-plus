'use client';

import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useInteriorMaterials } from './interiorMaterials';
import { useSetup, type BathroomSetup } from './styleThemes';
import { FurnitureProps, FT2M, WallSconce, CeramicVase, PottedPlant, AreaRug, RoundCoffeeTable, Cushion } from './DecorPieces';
import { getBathroomLayout, FEATURE_WALL_DEPTH } from '../roomLayout';
import { WallHungToilet } from './WallHungToilet';

const VANITY_TOP = 0.8;
const VANITY_DEPTH = 0.52;

function roundedRect(w: number, h: number, r: number) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2);
  s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r);
  s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r);
  s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return s;
}

/** Soft-cornered mirror with a fine brushed-brass edge. Hangs on a wall facing +Z. */
function VanityMirror({ position, width = 0.6, height = 0.9 }: { position: [number, number, number]; width?: number; height?: number }) {
  const m = useInteriorMaterials();
  const frameGeo = useMemo(() => new THREE.ExtrudeGeometry(roundedRect(width, height, 0.12), { depth: 0.02, bevelEnabled: false }), [width, height]);
  const glassGeo = useMemo(() => new THREE.ShapeGeometry(roundedRect(width - 0.016, height - 0.016, 0.112), 12), [width, height]);
  return (
    <group position={position}>
      <mesh geometry={frameGeo} material={m.brushedBrass} castShadow />
      <mesh position={[0, 0, 0.0205]} geometry={glassGeo} material={m.mirror} />
    </group>
  );
}

/** Matte black wall-mounted basin spout with a separate lever. Projects along +Z from the wall. */
function WallSpout({ position }: { position: [number, number, number] }) {
  const m = useInteriorMaterials();
  return (
    <group position={position}>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.005]} material={m.matteBlack}>
        <cylinderGeometry args={[0.03, 0.03, 0.01, 24]} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.095]} material={m.matteBlack} castShadow>
        <cylinderGeometry args={[0.011, 0.011, 0.18, 14]} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.12, 0.005]} material={m.matteBlack}>
        <cylinderGeometry args={[0.026, 0.026, 0.01, 24]} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.12, 0.04]} material={m.matteBlack}>
        <cylinderGeometry args={[0.007, 0.007, 0.07, 10]} />
      </mesh>
    </group>
  );
}

/** Freestanding oval soaking tub (lathed shell) with integral rolled rim. */
function FreestandingTub({ position, length, width }: { position: [number, number, number]; length: number; width: number }) {
  const m = useInteriorMaterials();
  const geo = useMemo(() => {
    const pts = [
      [0.001, 0],
      [0.36, 0],
      [0.44, 0.18],
      [0.495, 0.5],
      [0.5, 0.575],
      [0.485, 0.59],
      [0.465, 0.575],
      [0.43, 0.3],
      [0.33, 0.08],
      [0.001, 0.065],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const g = new THREE.LatheGeometry(pts, 64);
    g.computeVertexNormals();
    return g;
  }, []);
  const shell = useMemo(() => {
    const mat = m.ceramicWhite.clone();
    mat.side = THREE.DoubleSide;
    return mat;
  }, [m]);
  useEffect(() => () => shell.dispose(), [shell]);
  return (
    <group position={position}>
      <mesh geometry={geo} material={shell} scale={[width, 1, length]} castShadow receiveShadow />
      {/* Walnut bath bridge with a folded cloth and a candle */}
      <group position={[0, 0.6, length * 0.12]}>
        <mesh material={m.walnut} castShadow>
          <boxGeometry args={[width + 0.06, 0.022, 0.2]} />
        </mesh>
        <Cushion size={[0.16, 0.035, 0.14]} position={[0.14, 0.028, 0]} radius={0.012} material={m.beddingWhite} />
        <mesh position={[-0.15, 0.045, 0]} material={m.ceramicMatte} castShadow>
          <cylinderGeometry args={[0.035, 0.035, 0.07, 20]} />
        </mesh>
      </group>
    </group>
  );
}

/**
 * Bathroom — a calm hotel-suite bathroom in warm stone, walnut and white.
 * North wall: floating walnut double vanity with marble top, vessel basins,
 * wall spouts, mirrors and sconces. North-east: frameless walk-in shower that
 * keeps the floor tile continuous. West: freestanding tub under the window.
 * East: wall-hung WC. All fixtures in matte black; brass only on mirror edges.
 */
export function BathroomFurniture({ lengthFt, widthFt, heightFt }: FurnitureProps) {
  const setup = useSetup<BathroomSetup>('luxury');
  const m = useInteriorMaterials();

  // Vanity cabinet, worktop and fittings per preset
  const finish = {
    luxury: { body: m.walnut, top: m.marble, double: true, ladder: true, plant: true },
    minimal: { body: m.lacquerWarmWhite, top: m.concrete, double: false, ladder: false, plant: false },
    spa: { body: m.walnut, top: m.travertine, double: false, ladder: true, plant: true },
    contemporary: { body: m.ceramicCharcoal, top: m.marble, double: true, ladder: true, plant: false },
  }[setup];
  const lengthM = lengthFt * FT2M;
  const widthM = widthFt * FT2M;
  const roomH = heightFt * FT2M;
  const halfL = lengthM / 2;
  const halfW = widthM / 2;
  const bath = getBathroomLayout(lengthM, widthM);

  const vanityW = Math.min(1.8, bath.showerX0 - 0.35 - (-halfL + 0.2));
  const vanityX = bath.showerX0 - 0.35 - vanityW / 2;
  const basinXs = finish.double && vanityW >= 1.4 ? [-vanityW * 0.24, vanityW * 0.24] : [0];
  const wallZ = -halfW;

  const tubW = 0.78;
  const tubX = -halfL + 0.14 + tubW / 2;
  const tubNorth = bath.tubZ - bath.tubLen / 2;
  const toiletZ = bath.showerZ1 + 0.55;
  const showerCx = halfL - bath.showerW / 2;
  const showerCz = wallZ + bath.showerD / 2;
  const glassLen = bath.showerD * 0.78;

  const basinGeo = useMemo(
    () =>
      new THREE.LatheGeometry(
        [
          [0.001, 0],
          [0.08, 0],
          [0.17, 0.05],
          [0.2, 0.12],
          [0.19, 0.125],
          [0.16, 0.06],
          [0.001, 0.035],
        ].map(([x, y]) => new THREE.Vector2(x, y)),
        48,
      ),
    [],
  );

  return (
    <group>
      {/* ── Floating double vanity ── */}
      <group position={[vanityX, 0, wallZ]}>
        <Cushion size={[vanityW, 0.45, VANITY_DEPTH - 0.02]} position={[0, VANITY_TOP - 0.03 - 0.225, (VANITY_DEPTH - 0.02) / 2]} radius={0.008} material={finish.body} />
        <mesh position={[0, VANITY_TOP - 0.03 - 0.225, VANITY_DEPTH - 0.019]} material={m.walnutDark}>
          <boxGeometry args={[0.004, 0.43, 0.002]} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * vanityW * 0.25, VANITY_TOP - 0.09, VANITY_DEPTH - 0.012]} material={m.brushedBrass}>
            <boxGeometry args={[0.16, 0.01, 0.012]} />
          </mesh>
        ))}
        {/* Under-vanity LED wash */}
        <mesh position={[0, VANITY_TOP - 0.03 - 0.452, VANITY_DEPTH - 0.08]} material={m.ledWarm}>
          <boxGeometry args={[vanityW - 0.1, 0.004, 0.01]} />
        </mesh>
        <mesh position={[0, VANITY_TOP - 0.015, VANITY_DEPTH / 2]} material={finish.top} castShadow receiveShadow>
          <boxGeometry args={[vanityW, 0.03, VANITY_DEPTH]} />
        </mesh>

        {basinXs.map((x) => (
          <group key={x}>
            <mesh geometry={basinGeo} material={m.ceramicWhite} position={[x, VANITY_TOP, 0.29]} castShadow receiveShadow />
            <WallSpout position={[x, VANITY_TOP + 0.22, FEATURE_WALL_DEPTH]} />
            <VanityMirror position={[x, 1.66, FEATURE_WALL_DEPTH]} />
          </group>
        ))}

        {[-vanityW / 2 + 0.04, 0, vanityW / 2 - 0.04].map((x) => (
          <WallSconce key={x} position={[x, 1.72, FEATURE_WALL_DEPTH]} intensity={0.7} />
        ))}

        {/* Countertop styling: stone tray, folded hand towel, soap, one small plant */}
        <mesh position={[0, VANITY_TOP + 0.008, 0.3]} material={m.travertine} castShadow>
          <boxGeometry args={[0.26, 0.016, 0.14]} />
        </mesh>
        <Cushion size={[0.2, 0.05, 0.12]} position={[-0.03, VANITY_TOP + 0.04, 0.3]} radius={0.015} material={m.beddingWhite} />
        <CeramicVase position={[0.08, VANITY_TOP + 0.016, 0.3]} height={0.15} radius={0.035} tone="charcoal" />
        {finish.plant && (
          <PottedPlant position={[-vanityW / 2 + 0.13, VANITY_TOP, 0.3]} scale={0.3} planter="stone" planterHeight={0.13} rotation={1.2} />
        )}
      </group>

      {/* ── Walk-in shower (flush floor, frameless screen) ── */}
      <group>
        <mesh position={[bath.showerX0, 1.01, wallZ + glassLen / 2]} material={m.glass}>
          <boxGeometry args={[0.01, 2.0, glassLen]} />
        </mesh>
        <mesh position={[bath.showerX0, 1.01, wallZ + 0.012]} material={m.matteBlack}>
          <boxGeometry args={[0.03, 2.0, 0.024]} />
        </mesh>
        <mesh position={[bath.showerX0, 0.008, wallZ + glassLen / 2]} material={m.matteBlack}>
          <boxGeometry args={[0.03, 0.016, glassLen]} />
        </mesh>
        <mesh position={[(bath.showerX0 + halfL) / 2, 2.0, wallZ + glassLen * 0.6]} rotation={[0, 0, Math.PI / 2]} material={m.matteBlack}>
          <cylinderGeometry args={[0.008, 0.008, bath.showerW, 10]} />
        </mesh>

        {/* Linear drain */}
        <mesh position={[halfL - 0.1, 0.002, showerCz]} material={m.matteBlack}>
          <boxGeometry args={[0.06, 0.004, bath.showerD * 0.8]} />
        </mesh>

        {/* Ceiling rain head */}
        <mesh position={[showerCx + 0.1, roomH - 0.17, showerCz]} material={m.matteBlack}>
          <cylinderGeometry args={[0.01, 0.01, 0.34, 10]} />
        </mesh>
        <mesh position={[showerCx + 0.1, roomH - 0.345, showerCz]} material={m.matteBlack} castShadow>
          <boxGeometry args={[0.3, 0.012, 0.3]} />
        </mesh>

        {/* Thermostatic mixer + hand shower on the east wall */}
        <group position={[halfL, 1.1, showerCz + 0.1]} rotation={[0, -Math.PI / 2, 0]}>
          <mesh position={[0, 0, 0.006]} material={m.matteBlack}>
            <boxGeometry args={[0.12, 0.26, 0.012]} />
          </mesh>
          {[-0.06, 0.06].map((y) => (
            <mesh key={y} position={[0, y, 0.03]} rotation={[Math.PI / 2, 0, 0]} material={m.matteBlack}>
              <cylinderGeometry args={[0.024, 0.024, 0.035, 20]} />
            </mesh>
          ))}
          <mesh position={[0.32, 0.25, 0.04]} rotation={[0, 0, 0.15]} material={m.matteBlack} castShadow>
            <cylinderGeometry args={[0.014, 0.011, 0.24, 12]} />
          </mesh>
        </group>

        {/* Floating stone ledge with bath products */}
        <group position={[showerCx, 1.2, wallZ + FEATURE_WALL_DEPTH + 0.065]}>
          <mesh material={m.travertine} castShadow receiveShadow>
            <boxGeometry args={[0.6, 0.025, 0.12]} />
          </mesh>
          {[-0.18, -0.08].map((x, i) => (
            <mesh key={x} position={[x, 0.08, 0]} material={i === 0 ? m.ceramicWhite : m.ceramicCharcoal} castShadow>
              <cylinderGeometry args={[0.028, 0.028, 0.14, 18]} />
            </mesh>
          ))}
        </group>
      </group>

      {/* ── Freestanding tub under the window, with floor-standing filler ── */}
      <FreestandingTub position={[tubX, 0, bath.tubZ]} length={bath.tubLen} width={tubW} />
      <group position={[tubX, 0, tubNorth - 0.13]}>
        <mesh position={[0, 0.01, 0]} material={m.matteBlack}>
          <cylinderGeometry args={[0.05, 0.055, 0.02, 24]} />
        </mesh>
        <mesh position={[0, 0.47, 0]} material={m.matteBlack} castShadow>
          <cylinderGeometry args={[0.016, 0.016, 0.94, 14]} />
        </mesh>
        <mesh position={[0, 0.93, 0.11]} rotation={[0, Math.PI / 2, 0]} material={m.matteBlack} castShadow>
          <torusGeometry args={[0.11, 0.013, 10, 24, Math.PI]} />
        </mesh>
        <mesh position={[0.045, 0.75, 0]} rotation={[0, 0, -0.5]} material={m.matteBlack}>
          <cylinderGeometry args={[0.008, 0.008, 0.08, 10]} />
        </mesh>
      </group>
      <AreaRug width={0.9} depth={0.55} position={[tubX + tubW / 2 + 0.38, 0, bath.tubZ]} rotation={Math.PI / 2} />
      {setup === 'spa' && (
        <RoundCoffeeTable position={[tubX + tubW / 2 + 0.55, 0, bath.tubZ + bath.tubLen * 0.28]} radius={0.17} height={0.42} top="walnut" legs="wood" />
      )}

      {/* Heated towel ladder between vanity and tub (west wall) */}
      {finish.ladder && (
      <group position={[-halfL + 0.05, 1.0, (wallZ + VANITY_DEPTH + tubNorth) / 2]}>
        {[-0.24, 0.24].map((z) => (
          <mesh key={z} position={[0, 0, z]} material={m.matteBlack} castShadow>
            <cylinderGeometry args={[0.012, 0.012, 1.1, 12]} />
          </mesh>
        ))}
        {[-0.45, -0.27, -0.09, 0.09, 0.27, 0.45].map((y) => (
          <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} material={m.matteBlack} castShadow>
            <cylinderGeometry args={[0.008, 0.008, 0.48, 10]} />
          </mesh>
        ))}
        <mesh position={[0.035, 0.12, 0]} material={m.beddingWhite} castShadow>
          <boxGeometry args={[0.05, 0.55, 0.42]} />
        </mesh>
      </group>
      )}

      {/* ── Wall-hung WC on a concealed cistern (east wall) ── */}
      <group position={[halfL, 0, toiletZ]}>
        <mesh position={[-0.1, 0.525, 0]} material={m.lacquerWarmWhite} castShadow receiveShadow>
          <boxGeometry args={[0.2, 1.05, 0.62]} />
        </mesh>
        <mesh position={[-0.11, 1.0625, 0]} material={m.travertine} castShadow receiveShadow>
          <boxGeometry args={[0.22, 0.025, 0.66]} />
        </mesh>
        <mesh position={[-0.205, 0.92, 0]} material={m.matteBlack}>
          <boxGeometry args={[0.01, 0.15, 0.24]} />
        </mesh>
        {/* Pan, seat and lid: rim at 0.40 m, seat top about 0.46 m, embedded 5 mm into the panel face */}
        <group position={[-0.195, 0.4, 0]} rotation={[0, Math.PI, 0]}>
          <WallHungToilet />
        </group>
        <group position={[-0.12, 0.7, 0.33]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} material={m.matteBlack}>
            <cylinderGeometry args={[0.022, 0.022, 0.012, 18]} />
          </mesh>
          <mesh position={[0, -0.06, 0.06]} rotation={[0, 0, Math.PI / 2]} material={m.beddingWhite}>
            <cylinderGeometry args={[0.055, 0.055, 0.11, 20]} />
          </mesh>
        </group>
      </group>
    </group>
  );
}
