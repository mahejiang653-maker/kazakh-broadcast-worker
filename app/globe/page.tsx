export const metadata = {
  title: "2026-09-15 全球新闻 · 十三条新闻地球仪 V52",
  description: "2026年9月15日每日十三条新闻三维地球仪 V52",
};

export default function GlobePage() {
  return (
    <main
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        margin: 0,
        padding: 0,
        overflow: "hidden",
        background: "#020711",
        zIndex: 9999,
      }}
    >
      <iframe
        src="/news-globe-run-20260915-v52-r1.html?v=20260915-52r1"
        title="2026年9月15日全球新闻十三条新闻地球仪 V52"
        style={{
          display: "block",
          width: "100%",
          minHeight: "100%",
          height: "100%",
          border: 0,
          background: "#020711",
        }}
        allow="fullscreen"
      />
    </main>
  );
}
