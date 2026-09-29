"use client";

import { motion } from "framer-motion";
import { CheckCircle, Target } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const benchmarks = [
  { gate: "G2", name: "Early Retrieval", target: "≥ 80%", achieved: "100%" },
  { gate: "G3", name: "Multi-Intent", target: "≥ 70%", achieved: "100%" },
  { gate: "G4", name: "Factual Grounding", target: "≥ 85%", achieved: "100%" },
  { gate: "G5", name: "Session Refinement", target: "verified", achieved: "2/2" },
  { gate: "G6", name: "Telemetry", target: "100%", achieved: "100%" },
];

function AnimatedCounter({ value }: { value: string }) {
  const [display, setDisplay] = useState("0");
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.5 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) return;

    if (value === "100%") {
      let count = 0;
      const interval = setInterval(() => {
        count += 5;
        if (count >= 100) {
          setDisplay("100%");
          clearInterval(interval);
        } else {
          setDisplay(`${count}%`);
        }
      }, 30);
      return () => clearInterval(interval);
    } else {
      setDisplay(value);
    }
  }, [isVisible, value]);

  return (
    <div ref={ref} className="font-mono text-2xl font-semibold text-semantic-emerald">
      {display}
    </div>
  );
}

export function Benchmarks() {
  return (
    <section id="benchmarks" className="py-24 border-t border-subtle">
      <div className="max-w-[1200px] mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-4xl font-semibold mb-4">
            Benchmark <span className="bg-gradient-brand bg-clip-text text-transparent">Results</span>
          </h2>
          <p className="text-secondary max-w-2xl mx-auto">
            Samsung PRISM Theme 4 G2-G6 gate verification.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
          {benchmarks.map((benchmark, index) => (
            <motion.div
              key={benchmark.gate}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="p-6 rounded-xl bg-surface border border-subtle inner-highlight text-center"
            >
              <div className="flex items-center justify-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-full bg-semantic-emerald/10 text-semantic-emerald flex items-center justify-center">
                  <CheckCircle className="w-5 h-5" />
                </div>
                <span className="text-sm font-mono text-muted">{benchmark.gate}</span>
              </div>
              
              <h3 className="text-sm font-medium mb-2">{benchmark.name}</h3>
              
              <div className="mb-4">
                <AnimatedCounter value={benchmark.achieved} />
              </div>

              <div className="flex items-center justify-center gap-2 text-xs text-muted">
                <Target className="w-3 h-3" />
                <span>Target: {benchmark.target}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
