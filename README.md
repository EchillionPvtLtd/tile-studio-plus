# Tile Studio Plus — 3D Tile Visualizer

A browser-based interactive 3D tile visualizer built for tile showrooms. Customers select a room, enter dimensions, pick tiles and instantly see them applied to floor and walls in real-time 3D.

## Stack
- **Next.js 15** + TypeScript
- **React Three Fiber** + Three.js + Drei
- **Zustand** state management
- **Tailwind CSS** (dark theme)
- **PostgreSQL** via Prisma ORM

## Setup

### 1. Configure Database
Edit `.env.local` and set your PostgreSQL connection string:

```
DATABASE_URL="postgresql://user:password@localhost:5432/tile_visualizer"
```

### 2. Run DB Migration + Seed
```bash
npx prisma generate
npx prisma db push
npm run db:seed
```

### 3. Start Dev Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Checks
```bash
npm run lint        # ESLint (errors fail; existing warnings are being cleaned up gradually)
npm run typecheck   # tsc --noEmit
npm test            # Vitest: auth, payments, uploads, URL safety, login rate limit, the 2D visualizer
```

### Environment variables
| Variable | Purpose |
|---|---|
| `JWT_SECRET` | Signs session cookies. Required in production, at least 32 random characters. Put it in `.env.local`. |
| `REDIS_URL` | Optional. Shares the sign-in rate limit between server instances. Without it the limit is kept in memory. |
| `TRUSTED_PROXY_HEADER` | Optional. The header your proxy/CDN sets with the visitor's IP (`cf-connecting-ip`, `x-real-ip`, `x-forwarded-for`). Without it the sign-in limit counts per email only, because other headers can be forged. |
| `TRUSTED_PROXY_HOPS` | Only for `x-forwarded-for`: how many trusted proxies append to it (default `1`). |

## Features (Phase 1)
- 🏠 7 room types with default dimensions
- 📐 Parametric room (floor, 4 walls, ceiling, door, window)
- 🎨 12 built-in sample tiles + custom tiles added by image link (direct image URL or Google Drive sharing link)
- 🔲 5 tile layout patterns (Straight, Brick, Offset, Herringbone, Diagonal)
- 🪣 Grout width + color picker
- 🧮 Tile quantity & LKR price calculator
- 💾 Save design to DB
- 📱 QR code for mobile sharing
- 💬 WhatsApp share with design summary

## 2D Visualizer (room photographs)

Shop dashboard → **2D Visualizer** → **Launch & Expand 2D Visualizer** (or **Launch 2D** in the header) opens it full screen at `/visualizer-2d?shopId=…`, the same way the 3D visualizer opens at `/visualizer`; that link and its QR code are what customers use in the showroom. A customer picks a real room photograph, clicks its floor or a wall, picks a tile and sees it laid on that surface with the room's perspective, light and shadows. The furniture, doors, windows and everything else in the photo stay exactly as photographed.

**Using it**
- **Labels on the photo:** each kind of surface that can be tiled has a floating label (**Floor**, **Wall 0/2** with how many walls have a tile). Click one and every surface it stands for shows a tick; a tick that is on takes the next tile, an empty circle leaves that wall out. A tiled label turns dark; a click beside the surfaces brings the labels back. Clicking a surface in the photo (Shift or Ctrl for several) still works.
- **Room** tab: the photographs, by category (living room, dining room, kitchen, bedroom, bathroom, balcony, office). A showroom can also add its own photo and mark its floor and walls (**Add your own room photo**).
- **Only surfaces that can be identified accurately are tileable.** A floor or wall that is mostly hidden, cut to pieces by furniture, not clearly separated from what is around it, or whose perspective cannot be trusted is left exactly as photographed, and clicking it says so. Each photo offers its own set (some the floor and several walls, some only the floor, a top-down photo nothing). `scripts/photo-rooms/review.json` records, for every photo, what was kept and why anything was left out.
- Click a surface in the photo (hold Shift or Ctrl to select several), or choose it in the **Design** tab. Floors and each wall are independent, so a floor and its walls can each get a different tile.
- **Design** tab: tile catalogue with search and filters, size, laying pattern (straight, brick, ⅓ offset, herringbone, diagonal), rotation, grout width and colour, pattern position, how much of the photo's light to keep, tile-to-tile variation. "Use this tile elsewhere" copies a finish to other surfaces.
- **Zoom** with the + / − buttons, Ctrl + scroll or a pinch; drag to move around a zoomed photo; the fit button shows the whole room again. **Compare** drags a divider between the original photo and the design. **Undo / Redo** (Ctrl+Z / Ctrl+Y) and **Reset** (takes every tile off; undoable).
- **Download** (toolbar) saves the finished picture as JPG or PNG; the **Save** tab also saves the design, prices it and produces the quotation PDF. The Download button (and the picture buttons of the Save tab) only show when the showroom has switched on **Settings → Visualizer → 2D Visualizer download button**. The 3D visualizer has its own switch there (**3D Visualizer download button**), which adds a Download button saving a picture of the current 3D view, drawn at up to twice the screen's sharpness. Both are off until switched on, are kept per showroom in its `details` JSON (`visualizerDownloads`), and apply to that showroom's visualizer link and QR code only.

**How it works**
- Each surface has a mask (where it is in the photo) and a perspective: four points of the photo and where they lie on the surface in millimetres. From them the browser computes, for every pixel, the position on the real surface, so tiles shrink with distance, grout lines stay straight and a 600 × 600 mm tile really is that size.
- One WebGL 2 pass draws the photo and the tiles (`src/components/Viewer2D/shaders.ts`). The tile is filtered as softly as a small photo is, takes on the photo's light and shadows (an edge-preserving light map of the original surface, never its old colour or texture) and the colour of the room's light, and stays behind furniture because the masks leave it out.
- Everything is stored in normalised photo coordinates, so a room looks the same at any screen size and export size.

**Where things are**
| What | Where |
|---|---|
| Original photographs (pipeline input only; git-ignored, not deployed) | `public/rooms2d/Rooms/<category>/` (add a photo here, then run the room pipeline) |
| What the app shows: the web-sized photo, masks and thumbnail | `public/rooms2d/photos/<room id>/` (about 25 MB for 70 rooms) |
| Room data (surfaces, perspective) | `src/data/rooms2d/photos.json` (generated; do not edit by hand) |
| The pipeline that makes the two above | `scripts/photo-rooms/` (Python, development only; see its README) |
| UI and rendering | `src/components/Viewer2D/` |
| Maths (perspective, patterns, lighting, history) | `src/lib/viz2d/` |
| Saving designs and rooms | `src/actions/viz2d.ts`, `src/actions/rooms2d.ts`, `src/app/api/upload/room/route.ts` |

The app never runs a model: it only loads the masks the pipeline made. Rooms a showroom adds itself use outlines it draws (with a smart-select tool that follows colour and edges); nothing is sent to an AI service.

**Database** – saved designs use `SavedDesign`; a showroom's own rooms use `RoomScene` (additive). After pulling, run `npx prisma generate` and `npm run db:push`.

**Tests** – `tests/viz2d-*.test.ts` cover the perspective maths, tile patterns, masks and lighting, editing, the saved-room and design server actions, and `viz2d-rooms-data.test.ts` checks that every shipped room has its photo, masks and a valid perspective, and that every surface it ships passed the accuracy checks recorded in `review.json`.

## Subscription packages and durations

Main admin → **Subscriptions → Plans** saves the packages (`data/subscriptionPlans.json`). That one list feeds the admin's package pickers (edit subscription, add showroom, showroom details), the package breakdown and the shop dashboard's **Subscription** tab, so a package made or changed there shows everywhere without a code change. The original packages keep the names the database already stores (`Starter`, `Professional` for Pro Studio, `Custom` for the Custom Plan); a package made later is stored under its own name.

Choosing a package applies it as saved: its price (the Custom Plan's amount is agreed per showroom) and its tile allowance, on the server.

A paid package runs for **1 to 12 months**. The expiry date is always start date + duration, on the same day of the month, or the last day of a shorter month (31 Jan + 1 month = 28 Feb). The duration is saved with the showroom (`durationMonths` in its `details` JSON) next to the start and expiry dates; showrooms saved before this get it worked out from their dates, and an expiry that is not a whole number of months stays as it is until a duration is chosen. A Free Trial is 14 days.

## Visualizer access (plans and the main administrator)

Main admin → **Visualizer Access** lists every showroom with its plan, one switch for the **2D** and one for the **3D** visualizer, and what it can use now (search by name or email; filter by plan and by access). A switch saves for that one showroom only.

| Plan | 2D | 3D |
|---|---|---|
| Starter | on | not included (shown locked, cannot be switched on) |
| Professional | on | on |
| Custom Plan | on (set to the agreement) | on (set to the agreement) |
| Free Trial | on | on |

The Custom Plan replaces the former Enterprise plan. Showrooms saved as "Enterprise" are read as the Custom Plan, so nothing in the database has to change.

A showroom can use a visualizer only when **its plan includes it and the administrator's switch is on**. The switches live in the showroom's `details` JSON under `visualizerAccess`, stamped with the plan they were set under, so a plan change (new showroom, **Subscriptions**, or the showroom's details screen) gives the new plan's defaults and an old switch can never carry a feature to a plan without it. A showroom with nothing stored (every showroom that existed before this feature) simply gets what its plan includes; nothing is written on login or refresh. No database migration is needed. Existing Starter showrooms therefore have no 3D from now on.

Enforced on the server, not just hidden in the UI (`src/lib/visualizerAccess.ts` holds the rules, `src/lib/visualizerGuard.ts` asks them of the database):
- `src/proxy.ts` answers **403** (locked page `/visualizer-locked`) for `/visualizer` and `/visualizer-2d`, and the pages check again;
- `/api/tiles` (the visualizers pass `viz=2d` / `viz=3d`), `/api/upload/room` and the 2D save actions answer 403 / the restriction message;
- a signed-in showroom can only use its own visualizer (another showroom's is 403); the main administrator can open any; with no showroom named it is the public demo, which holds no showroom's data;
- only the main administrator can change the switches (`setVisualizerAccess`), and a showroom's own profile save keeps them as stored.

A restricted visualizer shows a lock and "Visualizer access is currently restricted. Please contact your administrator." in the showroom's dashboard (the dashboard refreshes when its tab is focused again).

## Project Structure
```
src/
├── app/            ← Next.js App Router pages + API routes
├── components/     ← UI components
│   ├── Sidebar/    ← Room, Dimensions, Surface, Tiles, Layout, Grout, Calculator
│   ├── Viewer/     ← 3D SceneCanvas, Room, Floor, Wall, Lighting
│   └── Viewer2D/   ← 2D room-photo visualizer (WebGL stage, panels, surface editor)
├── stores/         ← Zustand roomStore
├── three/          ← Three.js hooks and material utilities
├── lib/            ← Prisma, API helpers, calculations (lib/viz2d: the 2D visualizer's maths)
├── types/          ← TypeScript interfaces
└── data/           ← Sample tile catalog
```
