import { describe, expect, it } from "vitest";
import { ROOM_KIND_IDS, ROOM_KINDS, roomKindLabel } from "@/lib/viz2d/roomKinds";
import { ROOM_CONFIGS } from "@/types/room";

describe("the room kinds of the 2D visualizer", () => {
  it("are the 3D visualizer's rooms plus offices, in the same order, with names that fit a filter button", () => {
    expect(ROOM_KINDS.map((k) => k.type)).toEqual([...ROOM_CONFIGS.map((c) => c.type), "office"]);
    expect(ROOM_KIND_IDS).toEqual(ROOM_KINDS.map((k) => k.type));
    for (const k of ROOM_KINDS) {
      expect(k.label.trim().length, k.type).toBeGreaterThan(0);
      expect(k.shortLabel.length, k.type).toBeLessThanOrEqual(10);
    }
    expect(new Set(ROOM_KIND_IDS).size).toBe(ROOM_KIND_IDS.length);
  });

  it("leave the 3D visualizer alone: it has no office to show", () => {
    expect(ROOM_CONFIGS.map((c) => c.type as string)).not.toContain("office");
  });

  it("name a kind for people, and nothing for a value that is not one", () => {
    expect(roomKindLabel("office")).toBe("Office");
    expect(roomKindLabel("bathroom")).toBe("Bathroom");
    expect(roomKindLabel("dungeon")).toBeUndefined();
  });
});
