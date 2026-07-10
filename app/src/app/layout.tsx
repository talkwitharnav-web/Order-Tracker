import type { Metadata } from "next";
import { Fraunces, Nunito_Sans, Geist_Mono } from "next/font/google";
import { BackgroundArt } from "@/components/ui/BackgroundArt";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

const nunitoSans = Nunito_Sans({
  variable: "--font-nunito-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Restaurant Order Tracker",
  description: "A simple, modern solution for kitchens and customers.",
};

// Applies the persisted theme/contrast/UI-size before paint to avoid a flash
// of the wrong settings (localStorage isn't available during server render).
const themeInitScript = `
(function () {
  try {
    var theme = localStorage.getItem("theme");
    if (theme === "dark" || theme === "light") {
      document.documentElement.setAttribute("data-theme", theme);
    }
    var contrast = localStorage.getItem("contrast");
    if (contrast === "high") {
      document.documentElement.setAttribute("data-contrast", "high");
    }
    var uiSize = localStorage.getItem("uiSize");
    if (uiSize === "small" || uiSize === "big") {
      document.documentElement.setAttribute("data-ui-size", uiSize);
    }
    var motion = localStorage.getItem("motion");
    if (motion === "reduced") {
      document.documentElement.setAttribute("data-motion", "reduced");
    }
    var focus = localStorage.getItem("focus");
    if (focus === "enhanced") {
      document.documentElement.setAttribute("data-focus", "enhanced");
    }
    var cvd = localStorage.getItem("cvd");
    if (cvd === "deuteranopia" || cvd === "protanopia" || cvd === "tritanopia") {
      document.documentElement.setAttribute("data-cvd", cvd);
    }
    var mascot = localStorage.getItem("mascotStyle");
    document.documentElement.setAttribute("data-mascot", mascot === "2d" ? "2d" : "3d");
    var funnyChef = localStorage.getItem("funnyChef");
    if (funnyChef === "on") {
      document.documentElement.setAttribute("data-funny-chef", "on");
    }
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${nunitoSans.variable} ${geistMono.variable} min-h-dvh antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="font-sans min-h-dvh flex flex-col">
        <BackgroundArt />
        {children}
      </body>
    </html>
  );
}
