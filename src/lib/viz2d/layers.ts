/**
 * Hands out the GPU's tile texture layers. Tiles that stay in the design keep their layer (so nothing is re-uploaded
 * when you change a slider), tiles that left free their layer, and new tiles take a free one.
 */
export class LayerAllocator {
  private layerOf = new Map<string, number>();

  constructor(private readonly layers: number) {}

  /**
   * Assigns layers for the tiles now in use. Returns the layer of every key, and which keys are new
   * (their images must be uploaded). Keys beyond the capacity get no layer.
   */
  assign(keys: string[]): { layers: Map<string, number>; added: string[] } {
    const wanted = new Set(keys);
    for (const k of [...this.layerOf.keys()]) if (!wanted.has(k)) this.layerOf.delete(k);
    const used = new Set(this.layerOf.values());
    const added: string[] = [];
    for (const k of keys) {
      if (this.layerOf.has(k)) continue;
      let free = -1;
      for (let i = 0; i < this.layers; i++) {
        if (!used.has(i)) {
          free = i;
          break;
        }
      }
      if (free < 0) continue;
      this.layerOf.set(k, free);
      used.add(free);
      added.push(k);
    }
    return { layers: new Map(this.layerOf), added };
  }

  get(key: string): number {
    return this.layerOf.get(key) ?? -1;
  }

  clear() {
    this.layerOf.clear();
  }
}
