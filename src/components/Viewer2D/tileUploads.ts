/**
 * Keeps track of the tile pictures a design needs: which are on the graphics card, which are still being fetched and
 * which could not be loaded.
 *
 * This lives outside any React effect on purpose. The design changes while pictures are still arriving (a second tile is
 * picked, a slider is dragged, an undo is pressed), and a picture that finishes loading after such a change must still
 * be used. Tracking "already asked for" here, rather than in the effect that asked, is what makes that so.
 */
export class TileUploads {
  private wanted = new Set<string>();
  private ready = new Set<string>();
  private loading = new Set<string>();
  private failed = new Set<string>();

  /**
   * The design now uses exactly these tiles. Forgets those it no longer uses (so one that is picked again later is
   * loaded again, and tried again if it failed) and returns the ones that must be fetched now: not on the card, not
   * already on their way, not known to be broken.
   */
  want(keys: string[]): string[] {
    this.wanted = new Set(keys);
    for (const set of [this.ready, this.failed]) for (const k of [...set]) if (!this.wanted.has(k)) set.delete(k);
    const todo = [...this.wanted].filter((k) => !this.ready.has(k) && !this.loading.has(k) && !this.failed.has(k));
    todo.forEach((k) => this.loading.add(k));
    return todo;
  }

  /**
   * A fetch has ended. Returns true when the caller should act on it: put the picture on the card (it arrived and the
   * design still uses it) or tell the person it could not be loaded (it failed and the design still uses it). A picture
   * for a tile the design has dropped meanwhile is simply let go; it is loaded again if the tile comes back, which is
   * quick because fetched pictures are cached.
   */
  finish(key: string, outcome: 'arrived' | 'failed'): boolean {
    this.loading.delete(key);
    if (!this.wanted.has(key)) return false;
    if (outcome === 'failed') this.failed.add(key);
    else this.ready.add(key);
    return true;
  }

  isReady(key: string): boolean {
    return this.ready.has(key);
  }

  /** Everything on the graphics card is gone (a new projector): start again. */
  clear() {
    this.wanted.clear();
    this.ready.clear();
    this.loading.clear();
    this.failed.clear();
  }
}
