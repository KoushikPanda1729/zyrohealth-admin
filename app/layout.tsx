import type { Metadata } from 'next';
import './globals.css';
import Providers from './providers';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
const title = 'ZyroHealth Admin';
const description = 'Multi-tenant clinic & pharmacy admin panel for ZyroHealth.';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  applicationName: 'ZyroHealth Admin',
  // Internal, authenticated tool — never meant to be discoverable via
  // search. Open Graph tags are kept (for clean link previews when a
  // teammate shares a link internally) but indexing itself is blocked here
  // and again in robots.ts.
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    url: siteUrl,
    siteName: 'ZyroHealth Admin',
    title,
    description,
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'ZyroHealth Admin' }],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: ['/og-image.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
