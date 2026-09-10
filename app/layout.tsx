import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';

export const viewport: Viewport = {
  themeColor: '#C8782A',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: 'DeepEncode : Cognitive Science Learning Studio',
  description: 'First-principles cognitive encoding, Feynman drills, concept segregation, and RemNote knowledge base exporter.',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'DeepEncode',
  },
  openGraph: {
    title: 'DeepEncode : Cognitive Science Learning Studio',
    description: 'First-principles cognitive encoding, Feynman drills, concept segregation, and RemNote knowledge base exporter.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'DeepEncode : Cognitive Science Learning Studio',
    description: 'First-principles cognitive encoding, Feynman drills, concept segregation, and RemNote knowledge base exporter.',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body className="antialiased text-solder bg-chassis font-mono" suppressHydrationWarning>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
