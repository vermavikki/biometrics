"use client";

import React from "react";
import {
    Eye,
    Smile,
    ArrowLeft,
    ArrowRight,
    ArrowUp,
    ArrowDown,
    CircleDot,
    Sparkles,
    CheckCircle2,
    Clock,
} from "lucide-react";
import type { ChallengeStep } from "@/lib/liveness/types";

interface ChallengePromptProps {
    challenge: ChallengeStep | null;
    allChallenges?: ChallengeStep[];
    stepIndex: number;
    totalSteps: number;
    timeLeftSeconds: number;
    actionProgress: number; // 0 to 1
}

export default function ChallengePrompt({
    challenge,
    allChallenges = [],
    stepIndex,
    totalSteps,
    timeLeftSeconds,
    actionProgress,
}: ChallengePromptProps) {
    if (!challenge) {
        return (
            <div className="w-full flex flex-col items-center justify-center p-3 sm:p-4 bg-muted/50 rounded-xl border border-border text-center">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                    <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-ping" />
                    Phase 1: Face Alignment
                </div>
                <h3 className="text-sm sm:text-base font-bold text-foreground">
                    Center Your Face In The Oval Guide
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5 max-w-xs">
                    Hold still at eye level. Interactive challenges will begin as soon as your face is aligned.
                </p>
            </div>
        );
    }

    // Render animated challenge icon & direction indicator
    const renderActionGraphic = () => {
        const iconSize = "w-7 h-7 sm:w-8 sm:h-8";
        switch (challenge.type) {
            case "BLINK":
                return (
                    <div className="relative flex items-center justify-center">
                        <Eye className={`${iconSize} text-blue-500 animate-pulse`} />
                        <span className="absolute -inset-1 rounded-full bg-blue-500/20 blur-sm animate-ping" />
                    </div>
                );
            case "TURN_LEFT":
                return (
                    <div className="flex items-center justify-center">
                        <ArrowLeft className={`${iconSize} text-blue-500 animate-bounce -translate-x-1`} />
                    </div>
                );
            case "TURN_RIGHT":
                return (
                    <div className="flex items-center justify-center">
                        <ArrowRight className={`${iconSize} text-blue-500 animate-bounce translate-x-1`} />
                    </div>
                );
            case "LOOK_UP":
                return (
                    <div className="flex items-center justify-center">
                        <ArrowUp className={`${iconSize} text-blue-500 animate-bounce -translate-y-1`} />
                    </div>
                );
            case "LOOK_DOWN":
                return (
                    <div className="flex items-center justify-center">
                        <ArrowDown className={`${iconSize} text-blue-500 animate-bounce translate-y-1`} />
                    </div>
                );
            case "SMILE":
                return (
                    <div className="flex items-center justify-center">
                        <Smile className={`${iconSize} text-amber-500 scale-110 animate-pulse`} />
                    </div>
                );
            case "OPEN_MOUTH":
                return (
                    <div className="flex items-center justify-center">
                        <CircleDot className={`${iconSize} text-purple-500 scale-125 animate-pulse`} />
                    </div>
                );
            default:
                return <Sparkles className={`${iconSize} text-blue-500`} />;
        }
    };

    const isNearlyComplete = actionProgress >= 0.85;
    const progressPercent = Math.min(100, Math.max(0, Math.round(actionProgress * 100)));

    return (
        <div className="w-full flex flex-col p-3.5 sm:p-4 bg-card rounded-2xl border border-primary/20 shadow-md transition-all">
            {/* Top Bar: "WHEN" Info (Sequence & Time Left) */}
            <div className="flex items-center justify-between w-full mb-2">
                <div className="flex items-center gap-1.5">
                    <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs font-bold uppercase tracking-wider text-primary">
                        Action {stepIndex + 1} of {totalSteps}
                    </span>
                    <span className="text-[10px] text-muted-foreground px-2 py-0.5 rounded-full bg-muted font-medium">
                        Active Challenge
                    </span>
                </div>

                {/* Countdown Timer */}
                <div
                    className={`flex items-center gap-1 text-xs font-mono font-semibold px-2.5 py-1 rounded-full transition-colors ${
                        timeLeftSeconds <= 3
                            ? "bg-destructive/15 text-destructive animate-pulse"
                            : "bg-muted text-muted-foreground"
                    }`}
                >
                    <Clock className="w-3.5 h-3.5" />
                    <span>{timeLeftSeconds}s</span>
                </div>
            </div>

            {/* Instruction Body: "WHAT TO DO" */}
            <div className="flex items-center gap-3 sm:gap-4 my-1">
                {/* Action Icon Badge */}
                <div className="flex-shrink-0 flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-primary/10 border border-primary/20 shadow-inner">
                    {renderActionGraphic()}
                </div>

                {/* Action Text */}
                <div className="flex-1 text-left min-w-0">
                    <div className="flex items-center gap-2">
                        <h3 className="text-base sm:text-lg font-extrabold text-foreground tracking-tight leading-tight">
                            {challenge.prompt}
                        </h3>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                        {challenge.instruction}
                    </p>
                </div>
            </div>

            {/* Real-Time Action Progress Meter */}
            <div className="mt-3 pt-2.5 border-t border-border/60">
                <div className="flex items-center justify-between text-[11px] mb-1 font-medium">
                    <span className="text-muted-foreground flex items-center gap-1">
                        Movement recognition:
                        <strong className={isNearlyComplete ? "text-emerald-500" : "text-foreground"}>
                            {isNearlyComplete ? "Target reached! Hold still..." : `${progressPercent}%`}
                        </strong>
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                        {isNearlyComplete ? "Validating..." : "Follow motion"}
                    </span>
                </div>

                <div className="w-full bg-muted rounded-full h-2 overflow-hidden relative">
                    <div
                        className={`h-full rounded-full transition-all duration-150 ${
                            isNearlyComplete
                                ? "bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.7)]"
                                : "bg-primary"
                        }`}
                        style={{ width: `${Math.max(5, progressPercent)}%` }}
                    />
                </div>
            </div>

            {/* Sequence Dots: Visual progress through all challenges */}
            {allChallenges.length > 0 && (
                <div className="flex items-center justify-center gap-1.5 mt-3 pt-2 border-t border-border/40">
                    {allChallenges.map((step, idx) => {
                        const isDone = idx < stepIndex;
                        const isCurrent = idx === stepIndex;
                        return (
                            <div
                                key={step.id || idx}
                                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-all ${
                                    isDone
                                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold"
                                        : isCurrent
                                        ? "bg-primary text-primary-foreground font-bold shadow-sm scale-105"
                                        : "bg-muted text-muted-foreground"
                                }`}
                            >
                                {isDone && <CheckCircle2 className="w-3 h-3 text-emerald-500" />}
                                <span>{step.type.replace("_", " ")}</span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
