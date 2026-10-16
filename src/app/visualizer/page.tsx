import { VisualizerLocked } from '@/components/Visualizer/VisualizerLocked';
import { checkVisualizer } from '@/lib/visualizerGuard';
import { Visualizer3DPage } from './Visualizer3DPage';

/**
 * The 3D visualizer. The proxy already answers 403 for a showroom without it; this checks again on the server, so the page is
 * never built for someone who may not have it, whatever happens in front.
 */
export default async function VisualizerPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const { shopId } = await searchParams;
  const gate = await checkVisualizer('viz3d', typeof shopId === 'string' ? shopId : null);
  if (!gate.ok) return <VisualizerLocked kind="viz3d" />;
  return <Visualizer3DPage />;
}
