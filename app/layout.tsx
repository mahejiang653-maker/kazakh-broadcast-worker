import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "哈萨克语广播站",
  description: "粘贴哈萨克语文本，生成可试听、可下载的 MP3 播音音频。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
