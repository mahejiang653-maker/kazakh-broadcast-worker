export const metadata = {
  title: "全球新闻地球仪 Y1",
  description: "基于 V52 稳定化版本的全球新闻地球仪 Y1",
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
        src="/news-globe-y1.html?v=Y1"
        title="全球新闻地球仪 Y1"
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
