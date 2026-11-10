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
} from "lucide-react";
import type { ChallengeStep } from "@/lib/liveness/types";

interface ChallengePromptProps {
    challenge: ChallengeStep | null;
    stepIndex: number;
    totalSteps: number;
    timeLeftSeconds: number;
    actionProgress: number; // 0 to 1
}

export default function ChallengePrompt({
    challenge,
    stepIndex,
    totalSteps,
    timeLeftSeconds,
    actionProgress,
}: ChallengePromptProps) {
    if (!challenge) {
        return (
            <div className="flex flex-col items-center justify-center py-2 text-center">
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                    Align your face to begin
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                    Keep your head still and look directly into the camera
                </span>
            </div>
        );
    }

    // Render animated challenge icon
    const renderIcon = () => {
        const iconClass = "w-7 h-7 text-blue-600 dark:text-blue-400";
        switch (challenge.type) {
            case "BLINK":
                return (
                    <div className="relative flex items-center justify-center">
                        <Eye className={`${iconClass} animate-pulse`} />
                        <div className="absolute inset-0 rounded-full bg-blue-500/20 blur-sm animate-ping" />
                    </div>
                );
            case "TURN_LEFT":
                return <ArrowLeft className={`${iconClass} -translate-x-1 animate-bounce`} />;
            case "TURN_RIGHT":
                return <ArrowRight className={`${iconClass} translate-x-1 animate-bounce`} />;
            case "LOOK_UP":
                return <ArrowUp className={`${iconClass} -translate-y-1 animate-bounce`} />;
            case "LOOK_DOWN":
                return <ArrowDown className={`${iconClass} translate-y-1 animate-bounce`} />;
            case "SMILE":
                return <Smile className={`${iconClass} scale-110 animate-pulse`} />;
            case "OPEN_MOUTH":
                return <CircleDot className={`${iconClass} scale-125 animate-pulse`} />;
            default:
                return <Sparkles className={iconClass} />;
        }
    };

    return (
        <div className="w-full flex flex-col items-center p-3.5 bg-blue-50/80 dark:bg-blue-950/40 rounded-xl border border-blue-200/80 dark:border-blue-800/50 shadow-sm transition-all">
            {/* Step badges and countdown timer */}
            <div className="flex items-center justify-between w-full mb-1.5 px-1 text-xs">
                <div className="flex items-center gap-1.5 font-semibold text-blue-700 dark:text-blue-300">
                    <span className="flex h-2 w-2 rounded-full bg-blue-600 animate-ping" />
                    <span>
                        Challenge {stepIndex + 1} of {totalSteps}
                    </span>
                </div>
                <div className="font-mono text-xs px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200">
                    {timeLeftSeconds}s remaining
                </div>
            </div>

            {/* Icon + Instruction */}
            <div className="flex items-center gap-3 my-1">
                <div className="flex items-center justify-center w-11 h-11 rounded-full bg-white dark:bg-blue-900/60 shadow-sm border border-blue-100 dark:border-blue-800">
                    {renderIcon()}
                </div>
                <div className="text-left">
                    <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 leading-tight">
                        {challenge.prompt}
                    </h3>
                    <p className="text-xs text-gray-600 dark:text-gray-300 leading-snug">
                        {challenge.instruction}
                    </p>
                </div>
            </div>

            {/* Action metric progress bar */}
            <div className="w-full mt-2 bg-blue-100 dark:bg-blue-900/40 rounded-full h-1.5 overflow-hidden">
                <div
                    className="bg-blue-600 dark:bg-blue-400 h-full transition-all duration-150 rounded-full"
                    style={{ width: `${Math.min(100, Math.max(8, actionProgress * 100))}%` }}
                />
            </div>
        </div>
    );
}

