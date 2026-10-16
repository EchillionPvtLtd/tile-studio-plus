import { Suspense } from "react";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sceneFromRow } from "@/lib/viz2d/roomSchema";
import type { RoomScene } from "@/lib/viz2d/types";
import { VisualizerLocked } from "@/components/Visualizer/VisualizerLocked";
import { checkVisualizer } from "@/lib/visualizerGuard";
import { Visualizer2DPageView } from "./Visualizer2DPageView";

/**
 * The showroom's 2D visualizer, opened full screen like the 3D one. It is public (customers reach it through the showroom's
 * link or QR code): `?shopId=` picks the showroom, and the signed-in owner of that showroom may also add rooms.
 */
export default async function Visualizer2DPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const { shopId: asked } = await searchParams;
  // The proxy already answers 403 for a showroom without the 2D visualizer; this checks again, so the page is never built for it
  const gate = await checkVisualizer("viz2d", typeof asked === "string" ? asked : null);
  if (!gate.ok) return <VisualizerLocked kind="viz2d" />;
  const session = await getSession();
  const signedIn = session?.role === "SHOP" ? session.userId : "";
  const shopId = (typeof asked === "string" && asked) || signedIn;
  const isOwner = !!signedIn && signedIn === shopId;

  // The rooms the showroom added itself; one that no longer validates is left out rather than breaking the page
  const rows = shopId ? await prisma.roomScene.findMany({ where: { userId: shopId }, orderBy: { createdAt: "desc" } }) : [];
  const customRooms = rows.map(sceneFromRow).filter((r): r is RoomScene => !!r);

  return (
    <Suspense fallback={<div className="h-dvh w-screen bg-background" />}>
      <Visualizer2DPageView shopId={shopId} customRooms={customRooms} isOwner={isOwner} />
    </Suspense>
  );
}
