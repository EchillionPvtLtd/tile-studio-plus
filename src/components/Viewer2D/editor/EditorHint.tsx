'use client';

import React from 'react';
import { MousePointerClick } from 'lucide-react';
import { selectActiveSurface, useRoomEditor } from './editorStore';

/** One line over the photo that says what the pointer does right now, so the next click is never a guess. */
export function EditorHint() {
  const tool = useRoomEditor((s) => s.tool);
  const drawing = useRoomEditor((s) => s.drawing.length);
  const active = useRoomEditor(selectActiveSurface);
  const name = active?.name ?? 'the surface';

  let text: string;
  switch (tool) {
    case 'draw':
      text = drawing === 0 ? `Click along the edge of “${name}” to outline it` : drawing < 3 ? 'Keep clicking around the surface' : 'Click the first point, press Enter or double-click to finish';
      break;
    case 'wand':
      text = `Click inside “${name}” to select the area of similar colour`;
      break;
    case 'points':
      text = 'Drag a point to move it, or click a line to add one';
      break;
    case 'cutout':
      text = drawing === 0 ? 'Outline a window or door inside the surface to cut it out' : 'Click the first point, press Enter or double-click to finish';
      break;
    case 'object':
      text = drawing === 0 ? 'Outline furniture that stands in front of the surfaces' : 'Click the first point, press Enter or double-click to finish';
      break;
    case 'perspective':
      text = 'Drag the numbered corners onto the corners of a real rectangle';
      break;
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center px-4">
      <div className="flex items-center gap-2 rounded-full border border-border bg-card/95 px-4 py-2 text-xs font-medium text-foreground shadow-sm backdrop-blur">
        <MousePointerClick className="h-4 w-4 shrink-0 text-muted-foreground" />
        {text}
      </div>
    </div>
  );
}
