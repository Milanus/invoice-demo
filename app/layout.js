import "./globals.css";

export const metadata = {
  title: "Demo extrakce faktur",
  description: "Interní demo agregace GLM a Qwen endpointů přes RunPod.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
