import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import './globals.css';

export const metadata: Metadata = {
  title: 'Tile Studio Plus+ — 3D Tile Visualizer for Showrooms',
  description:
    'Interactive 3D tile visualizer for tile showrooms. Select a room, enter dimensions, apply tiles to floor and walls, see real-time 3D preview. Calculate quantity and price instantly.',
  keywords: ['tile visualizer', '3D tile viewer', 'tile showroom', 'floor tile', 'wall tile', 'interior design', 'Tile Studio Plus'],
};

// viewport-fit=cover lets the layout use safe-area insets on notched phones and tablets.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

// Applies the saved theme for the current area before first paint (no flash).
// admin -> tv_theme_admin, shop/visualizer -> tv_theme_shop_<shopId> (a browser cache of the account's saved theme), everything else (login) -> dark.
const themeInitScript = `(function(){try{var p=location.pathname,g=function(k){return localStorage.getItem(k)};var a=p.indexOf('/admin')===0?'admin':(p.indexOf('/shop')===0||p.indexOf('/visualizer')===0||p.indexOf('/payment-delay')===0)?'shop':null;var t=null;if(a){var id=a==='shop'&&p.indexOf('/visualizer')===0?new URLSearchParams(location.search).get('shopId'):null;id=id||g('tv_'+a+'_active');t=(id&&g('tv_theme_'+a+'_'+id))||g('tv_theme_'+a)||g('tv_theme')}var ok={dark:1,light:1,navy:1,travertine:1,emerald:1,champagne:1,slate:1,charcoal:1,ocean:1,sage:1};if(!t||!ok[t])t='dark';var l={light:1,travertine:1,ocean:1,sage:1}[t];var e=document.documentElement;e.setAttribute('data-theme',t);e.classList.toggle('dark',!l);e.classList.toggle('light',!!l);}catch(x){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark font-sans" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="transition-colors font-sans min-h-screen">
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeInitScript }}
        />
        {children}
      </body>
    </html>
  );
}

