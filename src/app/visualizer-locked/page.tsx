import { VisualizerLocked } from "@/components/Visualizer/VisualizerLocked";
import type { VisualizerKind } from "@/lib/visualizerAccess";

export const metadata = { title: "Visualizer access restricted", robots: { index: false } };

/**
 * What the proxy shows (with a 403 status) when a visualizer address is refused. It tells nothing about why: whether the
 * showroom does not exist, belongs to someone else or simply has no access looks the same from outside.
 */
export default async function VisualizerLockedPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const { viz } = await searchParams;
  const kind: VisualizerKind | null = viz === "2d" ? "viz2d" : viz === "3d" ? "viz3d" : null;
  return <VisualizerLocked kind={kind} />;
}
