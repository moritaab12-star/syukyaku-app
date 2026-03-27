'use client';

import React from 'react';
import './globals.css';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}

