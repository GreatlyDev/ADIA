import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ADIA - Automated Deployment Insight Assistant",
  description:
    "Deployment visibility, Terraform risk analysis, CI/CD anomalies, and evidence-grounded AI insights.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
