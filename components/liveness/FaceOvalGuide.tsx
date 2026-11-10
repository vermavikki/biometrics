"use client";

import React from "react";
import type { FaceAlignmentStatus } from "@/lib/liveness/types";

interface FaceOvalGuideProps {
    alignment: FaceAlignmentStatus | null;
    currentStepState: "ALIGNING" | "CHALLENGE" | "ANALYZING" | "VERIFIED" | "ERROR";
    progressPercentage: number;
}

export default function FaceOvalGuide({
    alignment,
    currentStepState,
    progressPercentage,
}: FaceOvalGuideProps) {
    const isAligned = alignment?.isCentered && alignment?.isGoodDistance;

    // Determine oval border color based on system state
    let borderColor = "border-white/40 border-dashed";
    let glowClass = "";

    if (currentStepState === "VERIFIED") {
        borderColor = "border-emerald-500";
        glowClass = "shadow-[0_0_30px_rgba(16,185,129,0.7)]";
    } else if (currentStepState === "ERROR") {
        borderColor = "border-red-500";
        glowClass = "shadow-[0_0_20px_rgba(239,68,68,0.5)]";
    } else if (currentStepState === "ANALYZING") {
        borderColor = "border-cyan-400";
        glowClass = "shadow-[0_0_25px_rgba(6,182,212,0.6)] animate-pulse";
    } else if (currentStepState === "CHALLENGE") {
        borderColor = "border-blue-500";
        glowClass = "shadow-[0_0_20px_rgba(59,130,246,0.5)]";
    } else if (isAligned) {
        borderColor = "border-emerald-400";
    } else if (alignment?.isFaceDetected) {
        borderColor = "border-amber-400 border-dashed";
    }

    return (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
            {/* Circular Progress Ring overlay */}
            <div className="relative w-56 h-72 flex items-center justify-center">
                {/* Visual Oval Frame */}
                <div
                    className={`w-48 h-64 rounded-[50%/60%] border-4 transition-all duration-300 ${borderColor} ${glowClass} flex items-center justify-center relative`}
                >
                    {/* Corner Guides */}
                    <div className="absolute -top-1.5 -left-1.5 w-4 h-4 border-t-2 border-l-2 border-white/80" />
                    <div className="absolute -top-1.5 -right-1.5 w-4 h-4 border-t-2 border-r-2 border-white/80" />
                    <div className="absolute -bottom-1.5 -left-1.5 w-4 h-4 border-b-2 border-l-2 border-white/80" />
                    <div className="absolute -bottom-1.5 -right-1.5 w-4 h-4 border-b-2 border-r-2 border-white/80" />

                    {/* Scanning radar line when analyzing */}
                    {currentStepState === "ANALYZING" && (
                        <div className="absolute inset-x-2 h-1 bg-cyan-400/80 shadow-[0_0_12px_rgba(6,182,212,1)] rounded-full animate-bounce" />
                    )}
                </div>

                {/* Progress bar underneath oval */}
                {currentStepState === "CHALLENGE" && (
                    <div className="absolute -bottom-4 w-44 bg-black/60 backdrop-blur-sm rounded-full h-1.5 overflow-hidden border border-white/10">
                        <div
                            className="bg-blue-500 h-full transition-all duration-200"
                            style={{ width: `${Math.min(100, Math.max(0, progressPercentage))}%` }}
                        />
                    </div>
                )}
            </div>

            {/* Live Alignment Feedback Pill */}
            <div className="mt-6 px-4 py-1.5 rounded-full text-xs font-semibold backdrop-blur-md shadow-md bg-black/70 text-white border border-white/15 transition-all">
                {alignment?.feedbackText || "Position your face inside the oval"}
            </div>
        </div>
    );
}

