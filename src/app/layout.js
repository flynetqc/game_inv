import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Header from "../components/Header/Header";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "GeekShelf - Ma Collection BGG",
  description: "Votre bibliothèque locale de jeux de société BoardGameGeek.",
  referrer: "no-referrer",
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <head>
        <meta name="referrer" content="no-referrer" />
      </head>
      <body>
        <Header />
        {children}
      </body>
    </html>
  );
}
