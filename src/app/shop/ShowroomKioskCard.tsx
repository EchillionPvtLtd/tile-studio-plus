"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Box, ExternalLink, Copy, Check, QrCode as QrIcon, Tv, Tablet, Maximize2 } from "lucide-react";

interface ShowroomKioskCardProps {
  shopName: string;
  userEmail: string;
  userId?: string;
}

export function ShowroomKioskCard({ shopName, userEmail, userId }: ShowroomKioskCardProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [visualizerUrl, setVisualizerUrl] = useState("/visualizer");
  const router = useRouter();

  const handleOpenVisualizer = (e: React.MouseEvent) => {
    e.preventDefault();
    const isFs = !!document.fullscreenElement || (typeof window !== "undefined" && sessionStorage.getItem("tileviz_fullscreen") === "true");
    const target = isFs ? `${visualizerUrl}${visualizerUrl.includes("?") ? "&" : "?"}fullscreen=true` : visualizerUrl;
    if (isFs) {
      sessionStorage.setItem("tileviz_fullscreen", "true");
    }
    if (typeof window !== "undefined") {
      router.push(target);
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const fullUrl = userId 
        ? `${window.location.origin}/visualizer?shopId=${userId}`
        : `${window.location.origin}/visualizer`;
      setVisualizerUrl(fullUrl);
      QRCode.toDataURL(fullUrl, {
        width: 180,
        margin: 1,
        color: {
          dark: "#000000",
          light: "#ffffff",
        },
      })
        .then((url) => setQrDataUrl(url))
        .catch((err) => console.error("QR Code Error:", err));
    }
  }, []);

  const handleCopyLink = () => {
    if (typeof navigator !== "undefined") {
      navigator.clipboard.writeText(visualizerUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Card className="rounded-2xl border-border bg-card p-6 shadow-elevated space-y-6">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 pb-5 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-muted ring-1 ring-border text-foreground flex items-center justify-center font-semibold shadow-sm">
            <Tv className="w-5 h-5 text-foreground" />
          </div>
          <div>
            <h3 className="text-base font-semibold tracking-tight text-foreground">
              In-Store Digital Showroom Kiosk
            </h3>
            <p className="text-xs text-muted-foreground">
              Launch on showroom touch-screens, tablets, or generate QR codes for walk-in clients
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={handleCopyLink}
            variant="outline"
            size="sm"
            type="button"
            className="rounded-xl border-border bg-muted hover:bg-accent text-foreground/80 hover:text-foreground text-xs font-semibold gap-1.5"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? "Link Copied!" : "Copy Visualizer URL"}</span>
          </Button>

          <Button
            type="button"
            onClick={handleOpenVisualizer}
            className="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold shadow-xs gap-2"
          >
            <Maximize2 className="w-4 h-4 text-primary-foreground" />
            <span>Launch & Expand Kiosk</span>
            <ExternalLink className="w-3.5 h-3.5 opacity-70" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
        
        {/* Left 2 Cols: Interactive Kiosk Mockup Frame */}
        <div className="md:col-span-2 rounded-2xl border border-border bg-muted p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-foreground/80">
              <Tablet className="w-4 h-4 text-foreground" />
              <span>In-Store Kiosk Preview</span>
            </div>
            <Badge variant="outline" className="gap-1.5 px-2.5 py-0.5 rounded-full text-2xs font-mono font-bold bg-muted border-border text-success">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
              <span>LIVE READY</span>
            </Badge>
          </div>

          {/* Virtual Display Screen */}
          <div className="aspect-video w-full rounded-xl bg-black border border-zinc-800 overflow-hidden relative group shadow-lg flex flex-col justify-between p-4">
            <div className="flex items-center justify-between text-white text-2xs font-bold z-10">
              <div className="flex items-center gap-2">
                <Box className="w-4 h-4" />
                <span>{shopName || "Showroom Kiosk"}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-mono text-2xs px-2 py-0.5 rounded bg-white/10 border-white/20 text-white">
                  1080p FHD
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={handleOpenVisualizer}
                  className="h-6 px-2 text-2xs font-bold bg-white/10 hover:bg-white/25 text-white border-white/20 gap-1"
                  title="Expand 3D Visualizer Fullscreen"
                >
                  <Maximize2 className="w-3 h-3" />
                  <span>Expand</span>
                </Button>
              </div>
            </div>

            {/* Visualizer Mock Scene Preview */}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-zinc-950/70 to-black/50 flex items-center justify-center pointer-events-none">
              <div className="text-center space-y-1">
                <p className="text-white text-sm font-semibold tracking-tight">3D Architectural Spatial Engine</p>
                <p className="text-2xs text-zinc-400">Interactive Wall & Floor Ceramic Presentation</p>
              </div>
            </div>

            <div className="flex items-center justify-between text-2xs text-zinc-400 z-10">
              <span>Touch or mouse to orbit 360°</span>
              <span className="text-white font-mono">Real-time Quotations Enabled</span>
            </div>
          </div>
        </div>

        {/* Right Col: Instant In-Store QR Code */}
        <div className="md:col-span-1 rounded-2xl border border-border bg-muted p-5 flex flex-col items-center justify-center text-center space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-foreground/80">
            <QrIcon className="w-4 h-4 text-foreground" />
            <span>Walk-in Customer QR</span>
          </div>

          <div className="p-2.5 rounded-2xl bg-white border border-zinc-300 shadow-md">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="Showroom QR Code" className="w-36 h-36 rounded-lg" />
            ) : (
              <div className="w-36 h-36 rounded-lg bg-zinc-100 flex items-center justify-center text-xs text-zinc-400">
                Generating QR...
              </div>
            )}
          </div>

          <p className="text-2xs text-muted-foreground max-w-[200px]">
            Print or display at front desk for customers to view your showroom tiles on their personal phones.
          </p>
        </div>

      </div>
    </Card>
  );
}
