"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Check, Loader2 } from "lucide-react";

const STAGES = [
  { id: "controller", label: "Controller" },
  { id: "decompose", label: "Decompose" },
  { id: "retrieve", label: "Retrieve" },
  { id: "fuse", label: "RRF Fuse" },
  { id: "rerank", label: "Rerank" },
  { id: "synthesize", label: "Synthesize" },
];

interface PipelineStepperProps {
  activeStage: string;
  completedStages: string[];
  isStreaming: boolean;
  decision?: string;
  isProvisional?: boolean;
  isDelta?: boolean;
}

export function PipelineStepper({
  activeStage,
  completedStages,
  isStreaming,
  decision,
  isProvisional,
  isDelta,
}: PipelineStepperProps) {
  return (
    <div className="py-2 mb-2">
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-xs font-semibold uppercase tracking-widest text-text-muted">
          Pipeline State
        </span>
        <AnimatePresence>
          {decision && (
            <motion.span
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase bg-brand-primary/10 text-brand-primary border border-brand-primary/20"
            >
              {decision}
            </motion.span>
          )}
          {isProvisional && (
            <motion.span
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase bg-brand-soft/10 text-brand-soft border border-brand-soft/20"
            >
              PROVISIONAL
            </motion.span>
          )}
          {isDelta && (
            <motion.span
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase bg-semantic-emerald/10 text-semantic-emerald border border-semantic-emerald/20"
            >
              DELTA
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div className="flex items-center">
        {STAGES.map((stage, index) => {
          const isCompleted = completedStages.includes(stage.id);
          const isActive = activeStage === stage.id;

          return (
            <div key={stage.id} className="flex items-center flex-1">
              <div className="flex flex-col items-center">
                <motion.div
                  animate={{
                    scale: isActive ? [1, 1.1, 1] : 1,
                  }}
                  transition={
                    isActive
                      ? { duration: 1.5, repeat: Infinity, ease: "easeInOut" }
                      : {}
                  }
                  className={`w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300 ${
                    isCompleted
                      ? "bg-semantic-emerald text-white"
                      : isActive
                      ? "bg-brand-primary text-white shadow-soft"
                      : "bg-elevated border border-subtle text-text-muted"
                  }`}
                >
                  {isCompleted ? (
                    <Check className="w-3.5 h-3.5" strokeWidth={3} />
                  ) : isActive ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <span className="text-[10px] font-medium">{index + 1}</span>
                  )}
                </motion.div>
                <span
                  className={`text-[10px] mt-2 font-medium uppercase tracking-wider ${
                    isActive || isCompleted
                      ? "text-text-primary"
                      : "text-text-muted"
                  }`}
                >
                  {stage.label}
                </span>
              </div>
              {index < STAGES.length - 1 && (
                <div className="flex-1 h-px mx-2 transition-colors duration-500 bg-border-subtle overflow-hidden">
                   {isCompleted && (
                     <motion.div 
                        initial={{ x: "-100%" }}
                        animate={{ x: 0 }}
                        className="h-full bg-semantic-emerald"
                     />
                   )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
