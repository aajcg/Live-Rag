import { Hero } from "@/components/landing/Hero";
import { Features } from "@/components/landing/Features";
import { Architecture } from "@/components/landing/Architecture";
import { Benchmarks } from "@/components/landing/Benchmarks";
import { MiniDemo } from "@/components/landing/MiniDemo";
import { APITeaser } from "@/components/landing/APITeaser";

export default function Home() {
  return (
    <main className="min-h-screen">
      <Hero />
      <Features />
      <Architecture />
      <Benchmarks />
      <MiniDemo />
      <APITeaser />
    </main>
  );
}
