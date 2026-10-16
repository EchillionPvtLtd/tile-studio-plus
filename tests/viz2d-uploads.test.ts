import { describe, expect, it } from "vitest";
import { TileUploads } from "@/components/Viewer2D/tileUploads";

describe("tile pictures on their way to the graphics card", () => {
  it("asks for a picture once, however often the design changes while it loads", () => {
    const u = new TileUploads();
    expect(u.want(["a"])).toEqual(["a"]);
    // a second tile is picked before a has arrived: only the new one is fetched, a is already on its way
    expect(u.want(["a", "b"])).toEqual(["b"]);
    expect(u.want(["a", "b"])).toEqual([]);
  });

  it("still uses a picture that arrives after the design has changed", () => {
    const u = new TileUploads();
    u.want(["a"]);
    u.want(["a", "b"]);
    u.want(["a", "b"]); // a slider was dragged meanwhile
    expect(u.finish("a", "arrived")).toBe(true);
    expect(u.finish("b", "arrived")).toBe(true);
    expect(u.isReady("a")).toBe(true);
    expect(u.isReady("b")).toBe(true);
    expect(u.want(["a", "b"])).toEqual([]); // nothing more to fetch
  });

  it("lets go of a picture for a tile the design dropped, and fetches it again if the tile returns", () => {
    const u = new TileUploads();
    u.want(["a"]);
    u.want(["b"]); // a was replaced before it arrived
    expect(u.finish("a", "arrived")).toBe(false);
    expect(u.isReady("a")).toBe(false);
    expect(u.want(["a", "b"])).toEqual(["a"]);
  });

  it("forgets what is no longer used, so a tile picked again is loaded again", () => {
    const u = new TileUploads();
    u.want(["a", "b"]);
    u.finish("a", "arrived");
    u.finish("b", "arrived");
    expect(u.want(["b"])).toEqual([]);
    expect(u.isReady("a")).toBe(false);
    expect(u.isReady("b")).toBe(true);
    expect(u.want(["a", "b"])).toEqual(["a"]);
  });

  it("reports a failure once, does not retry it while the tile stays in the design, and retries when it is picked again", () => {
    const u = new TileUploads();
    u.want(["a"]);
    expect(u.finish("a", "failed")).toBe(true); // tell the person
    expect(u.want(["a"])).toEqual([]);
    expect(u.want([])).toEqual([]); // removed from the design...
    expect(u.want(["a"])).toEqual(["a"]); // ...and picked again: a fresh try
    u.want([]);
    expect(u.finish("a", "failed")).toBe(false); // nobody is waiting for it any more: no message
  });

  it("starts again from nothing when the canvas is replaced", () => {
    const u = new TileUploads();
    u.want(["a"]);
    u.finish("a", "arrived");
    u.clear();
    expect(u.isReady("a")).toBe(false);
    expect(u.want(["a"])).toEqual(["a"]);
  });
});
