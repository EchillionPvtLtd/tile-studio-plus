import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSession } from "./lib/auth";
import { checkVisualizer } from "./lib/visualizerGuard";

export async function proxy(request: NextRequest) {
  const session = await getSession();

  // Protect /admin routes
  if (request.nextUrl.pathname.startsWith("/admin")) {
    if (!session || session.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  // Protect /shop routes
  if (request.nextUrl.pathname.startsWith("/shop")) {
    if (!session || session.role !== "SHOP") {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  // The visualizers are public pages for a showroom's customers, but only for a showroom that has them: the database decides
  // (plan and the main administrator's switches), and an address that is not allowed gets a real 403.
  const path = request.nextUrl.pathname;
  const kind = path === "/visualizer" ? "viz3d" : path === "/visualizer-2d" ? "viz2d" : null;
  if (kind) {
    const gate = await checkVisualizer(kind, request.nextUrl.searchParams.get("shopId"));
    if (!gate.ok) {
      const locked = new URL("/visualizer-locked", request.url);
      locked.searchParams.set("viz", kind === "viz2d" ? "2d" : "3d");
      return NextResponse.rewrite(locked, { status: 403 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/shop/:path*", "/visualizer", "/visualizer-2d"],
};

export default proxy;
