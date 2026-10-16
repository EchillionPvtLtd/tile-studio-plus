import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { BUILTIN_ROOMS } from "@/data/rooms2d";
import { buildGroups, summarizeSurfaces, tileablePhrase } from "@/lib/viz2d/design";
import { imageToPlanePoint, isConvexQuad, planeMapping } from "@/lib/viz2d/geometry";
import { axisHandedness } from "@/lib/viz2d/renderState";
import { ROOM_KINDS } from "@/lib/viz2d/roomKinds";
import { MAX_TILED_SURFACES, SURFACE_KINDS } from "@/lib/viz2d/types";

/**
 * The rooms the 2D visualizer ships with are real photographs plus data that scripts/photo-rooms produced: masks, thumbnails
 * and a perspective for every surface. Nothing checks them while the app runs, so this does: a missing file, a mask that
 * covers nothing or a perspective that is not a flat surface would otherwise only show up as a broken room.
 */

const PUBLIC = path.join(process.cwd(), "public");
const onDisk = (url: string) => path.join(PUBLIC, decodeURIComponent(url.replace(/^\//, "")));
const PHOTO_FOLDER = path.join(PUBLIC, "rooms2d", "Rooms");

/** Pixel size of the picture as a browser shows it (EXIF orientation applied). */
async function shownSize(file: string) {
  const m = await sharp(file).metadata();
  const turned = (m.orientation ?? 1) >= 5;
  return { width: turned ? m.height! : m.width!, height: turned ? m.width! : m.height! };
}

/** A mask at a small size, with the share of the photo it covers and which rows (0..1) it reaches. */
async function readMask(url: string) {
  const SIZE = 160;
  const { data } = await sharp(onDisk(url)).resize({ width: SIZE, height: SIZE, fit: "fill" }).greyscale().raw().toBuffer({ resolveWithObject: true });
  let covered = 0;
  const rowHas = new Array<boolean>(SIZE).fill(false);
  for (let i = 0; i < data.length; i++) {
    if (data[i] > 127) {
      covered++;
      rowHas[Math.floor(i / SIZE)] = true;
    }
  }
  return {
    data,
    covered,
    rowsCovered: () => rowHas.flatMap((has, y) => (has ? [(y + 0.5) / SIZE] : [])),
  };
}

describe("the rooms the app ships with", () => {
  it("has rooms, with unique ids and names a person can read", () => {
    expect(BUILTIN_ROOMS.length).toBeGreaterThan(0);
    const ids = BUILTIN_ROOMS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of BUILTIN_ROOMS) {
      expect(r.id, r.id).toMatch(/^[a-z0-9][a-z0-9-]{1,40}$/);
      expect(r.name.trim().length, r.id).toBeGreaterThan(0);
      expect(r.name.length, r.id).toBeLessThanOrEqual(80);
      expect(r.source, r.id).toBe("builtin");
      expect(ROOM_KINDS.map((k) => k.type), r.id).toContain(r.roomType);
    }
  });

  it("shows each room from its own web-sized photograph (not the original), whose size is the one stored", async () => {
    for (const r of BUILTIN_ROOMS) {
      expect(r.image.src, r.id).toBe(`/rooms2d/photos/${r.id}/photo.webp`);
      const file = onDisk(r.image.src);
      expect(fs.existsSync(file), `${r.id}: ${r.image.src}`).toBe(true);
      const size = await shownSize(file);
      expect({ id: r.id, width: r.image.width, height: r.image.height }).toEqual({ id: r.id, ...size });
      expect(r.image.thumb, r.id).toBeTruthy();
      expect(fs.existsSync(onDisk(r.image.thumb!)), `${r.id}: thumbnail`).toBe(true);
    }
  });

  it("marks surfaces the renderer can use", () => {
    for (const r of BUILTIN_ROOMS) {
      expect(r.surfaces.length, r.id).toBeLessThanOrEqual(MAX_TILED_SURFACES);
      const ids = r.surfaces.map((s) => s.id);
      expect(new Set(ids).size, `${r.id}: surface ids`).toBe(ids.length);
      for (const s of r.surfaces) {
        const where = `${r.id}/${s.id}`;
        expect(SURFACE_KINDS.map((k) => k.id), where).toContain(s.kind);
        expect(Number.isInteger(s.priority), where).toBe(true);
        expect(s.name.trim().length, where).toBeGreaterThan(0);
        expect(s.mask.kind, where).toBe("raster");
        // The perspective must be a real flat surface, in front of the camera, with a measurable size
        expect(isConvexQuad(s.calibration.image), `${where}: the four perspective points`).toBe(true);
        expect(planeMapping(s.calibration), `${where}: the perspective is a plane`).not.toBeNull();
        expect(axisHandedness(s), where).not.toBeNull();
        if (s.areaSqFt !== undefined) expect(s.areaSqFt, where).toBeGreaterThanOrEqual(0);
      }
      // Every surface can be picked in the room: the summary names what can be tiled, and a photo that offers nothing says so
      expect(buildGroups(r).length > 0, r.id).toBe(r.surfaces.length > 0);
      expect(summarizeSurfaces(r) === "Nothing to tile", r.id).toBe(r.surfaces.length === 0);
      // The hint in the photo says what can be clicked: something for every room that offers a surface, nothing for one that does not
      expect(tileablePhrase(r) !== "", r.id).toBe(r.surfaces.length > 0);
    }
  });

  it("has a mask file for every surface that covers part of the photo, and only part of it", async () => {
    for (const r of BUILTIN_ROOMS) {
      for (const s of r.surfaces) {
        if (s.mask.kind !== "raster") continue;
        const file = onDisk(s.mask.src);
        expect(fs.existsSync(file), `${r.id}/${s.id}: ${s.mask.src}`).toBe(true);
        const { data, info } = await sharp(file).resize({ width: 160, height: 160, fit: "inside" }).greyscale().raw().toBuffer({ resolveWithObject: true });
        let covered = 0;
        for (let i = 0; i < data.length; i++) if (data[i] > 127) covered++;
        const share = covered / (info.width * info.height);
        expect(share, `${r.id}/${s.id}: share of the photo it covers`).toBeGreaterThan(0.003);
        expect(share, `${r.id}/${s.id}: share of the photo it covers`).toBeLessThan(0.97);
      }
    }
  });

  it("keeps the surfaces of a room apart, so a click never has two answers", async () => {
    const problems: string[] = [];
    for (const r of BUILTIN_ROOMS) {
      const masks = await Promise.all(r.surfaces.map((s) => readMask(s.mask.kind === "raster" ? s.mask.src : "")));
      for (let i = 0; i < masks.length; i++) {
        for (let j = i + 1; j < masks.length; j++) {
          let both = 0;
          for (let k = 0; k < masks[i].data.length; k++) if (masks[i].data[k] > 127 && masks[j].data[k] > 127) both++;
          const smaller = Math.min(masks[i].covered, masks[j].covered);
          // Edges that touch share a few soft pixels; more than that means two surfaces claim the same part of the photo
          if (smaller > 0 && both / smaller > 0.08) problems.push(`${r.id}: ${r.surfaces[i].id} and ${r.surfaces[j].id} share ${(100 * both / smaller).toFixed(0)}% of the smaller one`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("measures areas that are plausible for a room", () => {
    const problems: string[] = [];
    for (const r of BUILTIN_ROOMS) {
      for (const s of r.surfaces) {
        const a = s.areaSqFt ?? 0;
        // From a postage stamp of a balcony to a hall; anything outside points at a camera or scale that is wrong
        const [lo, hi] = s.kind === "floor" ? [4, 1500] : [3, 1200];
        if (a < lo || a > hi) problems.push(`${r.id}/${s.id}: ${a} sq.ft`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("gives every floor a perspective that recedes: farther rows cover more of the floor than nearer ones", async () => {
    const problems: string[] = [];
    for (const r of BUILTIN_ROOMS) {
      for (const s of r.surfaces.filter((x) => x.kind === "floor")) {
        const m = await readMask(s.mask.kind === "raster" ? s.mask.src : "");
        const rows = m.rowsCovered();
        if (rows.length < 12) continue; // too small a sliver to judge
        const top = rows[Math.floor(rows.length * 0.12)];
        const bottom = rows[Math.floor(rows.length * 0.88)];
        const map = planeMapping(s.calibration)!;
        const across = (y: number) => {
          const a = imageToPlanePoint(map, [0.4, y]);
          const b = imageToPlanePoint(map, [0.6, y]);
          return a && b ? Math.hypot(a[0] - b[0], a[1] - b[1]) : NaN;
        };
        const ratio = across(top) / across(bottom);
        if (!(ratio > 1.08 && ratio < 200)) problems.push(`${r.id}/${s.id}: far/near scale ${ratio.toFixed(2)}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("uses only files that exist, and no photo, mask or thumbnail is left without a room", () => {
    const folder = path.join(PUBLIC, "rooms2d", "photos");
    if (!fs.existsSync(folder)) return;
    const used = new Set<string>();
    for (const r of BUILTIN_ROOMS) {
      used.add(path.normalize(onDisk(r.image.src)));
      used.add(path.normalize(onDisk(r.image.thumb!)));
      for (const s of r.surfaces) if (s.mask.kind === "raster") used.add(path.normalize(onDisk(s.mask.src)));
    }
    const leftovers: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (/\.(webp|png|jpe?g)$/i.test(e.name) && !used.has(path.normalize(full))) leftovers.push(path.relative(PUBLIC, full));
      }
    };
    walk(folder);
    expect(leftovers).toEqual([]);
  });

  // The originals are source material for scripts/photo-rooms and are not deployed; the check runs wherever they are present
  it.skipIf(!fs.existsSync(PHOTO_FOLDER))("has a room for every photograph in the Rooms folder", () => {
    const photos: string[] = [];
    for (const dir of fs.readdirSync(PHOTO_FOLDER, { withFileTypes: true })) {
      if (!dir.isDirectory()) continue;
      for (const f of fs.readdirSync(path.join(PHOTO_FOLDER, dir.name))) if (/\.(jpe?g|png|webp)$/i.test(f)) photos.push(`/rooms2d/Rooms/${dir.name}/${f}`);
    }
    const codes = new Set(BUILTIN_ROOMS.map((r) => r.id));
    const idOf = (p: string) => path.basename(p).replace(/\.\w+$/, "").toLowerCase().replace(/_/g, "-");
    expect(photos.filter((p) => !codes.has(idOf(p)))).toEqual([]);
  });
});

/**
 * Only surfaces that can be identified accurately are tileable; the rest of a photo stays as photographed. scripts/photo-rooms
 * decides which (quality.py) and writes down what it kept, the measures it judged by, and what it left out with the reason.
 * These tests hold every shipped room to that record, so a surface cannot be shipped that the review rejected (or that was
 * added by hand), and a surface that was left out cannot be clicked.
 */
type Metrics = Record<string, number>;
interface Review {
  limits: { surface: { floor: Metrics; wall: Metrics } };
  rooms: Record<string, { surfaces: Record<string, Metrics>; skipped: { surface: string; reasons: string[] }[]; notes: string[] }>;
}
const REVIEW_FILE = path.join(process.cwd(), "scripts", "photo-rooms", "review.json");
const MAXIMA = new Set(["unsure", "flips", "gaps"]); // limits that are ceilings; every other one is a floor

describe("the review of what each room offers to tile", () => {
  const review = JSON.parse(fs.readFileSync(REVIEW_FILE, "utf8")) as Review;

  it("covers every room, and no room that is gone", () => {
    expect(Object.keys(review.rooms).sort()).toEqual(BUILTIN_ROOMS.map((r) => r.id).sort());
  });

  it.each(BUILTIN_ROOMS.map((r) => [r.id, r] as const))("%s: only the surfaces that passed are editable, the rest stays as photographed", (id, room) => {
    const rec = review.rooms[id];
    // Exactly what passed is shipped: nothing that was left out can be clicked, and nothing was added by hand
    expect(room.surfaces.map((s) => s.id).sort()).toEqual(Object.keys(rec.surfaces).sort());
    for (const s of room.surfaces) {
      const m = rec.surfaces[s.id];
      const limits = review.limits.surface[s.kind === "floor" ? "floor" : "wall"];
      for (const [key, limit] of Object.entries(limits)) {
        expect(m[key], `${id}/${s.id}: ${key} was measured`).toBeTypeOf("number");
        if (MAXIMA.has(key)) expect(m[key], `${id}/${s.id}: ${key}`).toBeLessThanOrEqual(limit);
        else expect(m[key], `${id}/${s.id}: ${key}`).toBeGreaterThanOrEqual(limit);
      }
    }
    // The note shown to the person names exactly what the review left out, nothing more and nothing less
    expect([...(room.leftOut ?? [])].sort(), `${id}: the note of what was left out`).toEqual([...new Set(rec.skipped.map((x) => x.surface))].sort());
    // What was left out has its reason in words
    for (const x of rec.skipped) {
      expect(x.surface.trim().length, id).toBeGreaterThan(0);
      expect(x.reasons.length, `${id}/${x.surface}`).toBeGreaterThan(0);
      for (const why of x.reasons) expect(why.trim().length, `${id}/${x.surface}`).toBeGreaterThan(15);
    }
    // A photo with nothing to tile says why
    if (room.surfaces.length === 0) expect(rec.skipped.length + rec.notes.length, `${id}: why nothing can be tiled`).toBeGreaterThan(0);
  });
});
