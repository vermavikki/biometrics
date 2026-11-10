"use client";

import React from "react";
import { ArrowLeft, ArrowRight, ArrowUp, ArrowDown } from "lucide-react";
import type { FaceAlignmentStatus, LivenessChallengeType } from "@/lib/liveness/types";

interface FaceOvalGuideProps {
    alignment: FaceAlignmentStatus | null;
    currentStepState: "ALIGNING" | "CHALLENGE" | "ANALYZING" | "VERIFIED" | "ERROR";
    progressPercentage: number;
    activeChallengeType?: LivenessChallengeType | null;
}

export default function FaceOvalGuide({
    alignment,
    currentStepState,
    progressPercentage,
    activeChallengeType,
}: FaceOvalGuideProps) {
    const isAligned = alignment?.isCentered && alignment?.isGoodDistance;

    // Determine oval border color & glow effect based on state
    let borderColor = "border-white/40 border-dashed";
    let glowClass = "";

    if (currentStepState === "VERIFIED") {
        borderColor = "border-emerald-500";
        glowClass = "shadow-[0_0_35px_rgba(16,185,129,0.75)]";
    } else if (currentStepState === "ERROR") {
        borderColor = "border-destructive";
        glowClass = "shadow-[0_0_25px_rgba(239,68,68,0.6)]";
    } else if (currentStepState === "ANALYZING") {
        borderColor = "border-cyan-400";
        glowClass = "shadow-[0_0_30px_rgba(6,182,212,0.7)] animate-pulse";
    } else if (currentStepState === "CHALLENGE") {
        borderColor = isAligned ? "border-primary" : "border-amber-400";
        glowClass = "shadow-[0_0_20px_rgba(59,130,246,0.5)]";
    } else if (isAligned) {
        borderColor = "border-emerald-400";
        glowClass = "shadow-[0_0_15px_rgba(16,185,129,0.4)]";
    } else if (alignment?.isFaceDetected) {
        borderColor = "border-amber-400 border-dashed";
    }

    return (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none z-10 px-4">
            {/* Visual Oval Frame */}
            <div className="relative w-44 h-56 sm:w-52 sm:h-68 md:w-56 md:h-72 flex items-center justify-center">
                {/* Oval container with state-driven borders */}
                <div
                    className={`w-full h-full rounded-[50%/58%] border-4 transition-all duration-300 ${borderColor} ${glowClass} flex items-center justify-center relative overflow-hidden`}
                >
                    {/* Scanning radar sweep when analyzing biometric telemetry */}
                    {currentStepState === "ANALYZING" && (
                        <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_15px_rgba(6,182,212,1)] animate-bounce" />
                    )}

                    {/* Corner Target Reticles */}
                    <div className="absolute top-2 left-2 w-3.5 h-3.5 border-t-2 border-l-2 border-white/90" />
                    <div className="absolute top-2 right-2 w-3.5 h-3.5 border-t-2 border-r-2 border-white/90" />
                    <div className="absolute bottom-2 left-2 w-3.5 h-3.5 border-b-2 border-l-2 border-white/90" />
                    <div className="absolute bottom-2 right-2 w-3.5 h-3.5 border-b-2 border-r-2 border-white/90" />
                </div>

                {/* Directional Guidance Overlays (shows exactly WHERE to move) */}
                {currentStepState === "CHALLENGE" && activeChallengeType === "TURN_LEFT" && (
                    <div className="absolute -left-7 sm:-left-9 flex items-center gap-1 text-white bg-blue-600/90 px-2 py-1 rounded-full shadow-lg animate-pulse text-xs font-bold">
                        <ArrowLeft className="w-4 h-4 animate-bounce" />
                        <span className="hidden sm:inline">Turn Left</span>
                    </div>
                )}

                {currentStepState === "CHALLENGE" && activeChallengeType === "TURN_RIGHT" && (
                    <div className="absolute -right-7 sm:-right-9 flex items-center gap-1 text-white bg-blue-600/90 px-2 py-1 rounded-full shadow-lg animate-pulse text-xs font-bold">
                        <span className="hidden sm:inline">Turn Right</span>
                        <ArrowRight className="w-4 h-4 animate-bounce" />
                    </div>
                )}

                {currentStepState === "CHALLENGE" && activeChallengeType === "LOOK_UP" && (
                    <div className="absolute -top-7 sm:-top-8 flex items-center gap-1 text-white bg-blue-600/90 px-2.5 py-1 rounded-full shadow-lg animate-pulse text-xs font-bold">
                        <ArrowUp className="w-4 h-4 animate-bounce" />
                        <span>Look Up</span>
                    </div>
                )}

                {currentStepState === "CHALLENGE" && activeChallengeType === "LOOK_DOWN" && (
                    <div className="absolute -bottom-7 sm:-bottom-8 flex items-center gap-1 text-white bg-blue-600/90 px-2.5 py-1 rounded-full shadow-lg animate-pulse text-xs font-bold">
                        <ArrowDown className="w-4 h-4 animate-bounce" />
                        <span>Look Down</span>
                    </div>
                )}

                {/* Progress bar underneath oval during active challenge */}
                {currentStepState === "CHALLENGE" && (
                    <div className="absolute -bottom-4 w-36 sm:w-44 bg-black/70 backdrop-blur-sm rounded-full h-1.5 overflow-hidden border border-white/15">
                        <div
                            className="bg-primary h-full transition-all duration-150 rounded-full"
                            style={{ width: `${Math.min(100, Math.max(0, progressPercentage))}%` }}
                        />
                    </div>
                )}
            </div>

            {/* Live Contextual Feedback Pill */}
            <div className="mt-4 px-3.5 py-1.5 rounded-full text-xs font-semibold backdrop-blur-md shadow-lg bg-black/75 text-white border border-white/20 transition-all text-center max-w-[90%] truncate">
                {alignment?.feedbackText || "Position your face inside the oval frame"}
            </div>
        </div>
    );
}
