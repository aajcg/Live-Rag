"use client";

import { motion } from "framer-motion";
import { Check, Clock, Zap } from "lucide-react";

const stages = [
  { id: "controller", name: "Controller", icon: Clock },
  { id: "decompose", name: "Decompose", icon: Zap },
  { id: "retrieve", name: "Retrieve", icon: Zap },
  { id: "fuse", name: "Fuse", icon: Zap },
  { id: "rerank", name: "Rerank", icon: Zap },
  { id: "synthesize", name: "Synthesize", icon: Check },
];

interface PipelineStepperProps {
  activeStage: string;
  completedStages: string[];
}

export function PipelineStepper({ activeStage, completedStages }: PipelineStepperProps) {
  return (
    <div className="flex items-center justify-between gap-2 p-4 rounded-xl bg-surface border border-subtle mb-6">
      {stages.map((stage, index) => {
        const isCompleted = completedStages.includes(stage.id);
        const isActive = activeStage === stage.id;
        const Icon = stage.icon;

        return (
          <div key={stage.id} className="flex items-center flex-1">
            <div className="flex flex-col items-center flex-1">
              <motion.div
                initial={{ scale: 0.8, opacity: 0.5 }}
                animate={{
                  scale: isActive ? 1.1 : isCompleted ? 1 : 0.9,
                  opacity: isActive ? 1 : isCompleted ? 0.8 : 0.4,
                }}
                className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
                  isCompleted
                    ? "bg-semantic-emerald/20 text-semantic-emerald"
                    : isActive
                    ? "bg-brand-indigo/20 text-brand-indigo"
                    : "bg-elevated text-muted"
                }`}
              >
                {isCompleted ? (
                  <Check className="w-5 h-5" />
                ) : (
                  <Icon className="w-5 h-5" />
                )}
              </motion.div>
              <span
                className={`text-xs mt-2 font-medium ${
                  isActive ? "text-primary" : isCompleted ? "text-semantic-emerald" : "text-muted"
                }`}
              >
                {stage.name}
              </span>
            </div>
            {index < stages.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-2 transition-colors ${
                  isCompleted ? "bg-semantic-emerald" : "bg-border"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
