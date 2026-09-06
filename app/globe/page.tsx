export const metadata = {
  title: "全球新闻 · 十三地新闻地球仪",
  description: "可旋转的每日十三条新闻三维地球仪",
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
        overflow: "auto",
        background: "#020711",
        zIndex: 9999,
      }}
    >
      <iframe
        src="/news-globe-v52.html?v=52"
        title="全球新闻十三地新闻地球仪"
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
