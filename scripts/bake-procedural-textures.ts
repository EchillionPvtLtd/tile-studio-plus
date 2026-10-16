/**
 * Bakes the procedural albedo textures (marble, wood grain, travertine, ...) to images in
 * public/textures/procedural, so the browser loads them instead of computing several million
 * noise samples on the main thread at startup (about 7 seconds).
 *
 * Run `npm run bake:textures` after changing a pattern in src/three/proceduralPBR.ts.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { ALBEDO_NAMES, albedoSize, renderAlbedoBytes } from '../src/three/proceduralPBR';

const outDir = path.join(process.cwd(), 'public', 'textures', 'procedural');
fs.mkdirSync(outDir, { recursive: true });

async function main() {
  for (const name of ALBEDO_NAMES) {
    const size = albedoSize(name);
    const started = performance.now();
    const bytes = renderAlbedoBytes(name);
    const file = path.join(outDir, `${name}.webp`);
    await sharp(Buffer.from(bytes), { raw: { width: size, height: size, channels: 1 } })
      .webp({ lossless: true, effort: 6 })
      .toFile(file);
    const kb = (fs.statSync(file).size / 1024).toFixed(0);
    console.log(`${name.padEnd(14)} ${size}px  ${kb} KB  (${((performance.now() - started) / 1000).toFixed(1)}s)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
