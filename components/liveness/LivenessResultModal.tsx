"use client";

import React from "react";
import { CheckCircle2, AlertTriangle, ShieldAlert, RotateCcw, ArrowRight } from "lucide-react";
import type { LivenessVerificationResult } from "@/lib/liveness/types";

interface LivenessResultModalProps {
    result: LivenessVerificationResult;
    onRetry: () => void;
    onContinue?: () => void;
}

export default function LivenessResultModal({
    result,
    onRetry,
    onContinue,
}: LivenessResultModalProps) {
    const isSuccess = result.decision === "VERIFIED" && result.verified;
    const isSpoof = result.decision === "SPOOF_DETECTED";

    return (
        <div className="w-full flex flex-col items-center p-5 rounded-2xl bg-white dark:bg-card border border-gray-200 dark:border-border shadow-lg animate-in fade-in zoom-in-95 duration-200">
            {/* Status Icon */}
            <div className="mb-4">
                {isSuccess ? (
                    <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/70 border border-emerald-300 dark:border-emerald-800 flex items-center justify-center text-emerald-600 shadow-sm animate-bounce">
                        <CheckCircle2 className="w-9 h-9" />
                    </div>
                ) : isSpoof ? (
                    <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-950/70 border border-red-300 dark:border-red-800 flex items-center justify-center text-red-600 shadow-sm animate-pulse">
                        <ShieldAlert className="w-9 h-9" />
                    </div>
                ) : (
                    <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-950/70 border border-amber-300 dark:border-amber-800 flex items-center justify-center text-amber-600 shadow-sm">
                        <AlertTriangle className="w-9 h-9" />
                    </div>
                )}
            </div>

            {/* Title & Decision */}
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 text-center">
                {isSuccess
                    ? "Identity & Liveness Verified"
                    : isSpoof
                        ? "Presentation Attack Detected"
                        : "Verification Unsuccessful"}
            </h3>

            <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400 text-center max-w-sm">
                {result.message}
            </p>

            {/* Metrics breakdown card */}
            <div className="w-full my-4 p-3.5 rounded-xl bg-gray-50 dark:bg-muted/40 border border-gray-200 dark:border-border text-xs space-y-2.5">
                {/* Registered or Verified User Identity Card */}
                {result.userProfile && (
                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg space-y-1 mb-2 text-left">
                        <div className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                            Bound User Profile
                        </div>
                        {result.userProfile.fullName && (
                            <div className="text-sm font-bold text-foreground">
                                {result.userProfile.fullName}
                            </div>
                        )}
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground pt-0.5">
                            {result.userProfile.email && (
                                <span>Email: <strong className="text-foreground">{result.userProfile.email}</strong></span>
                            )}
                            {result.userProfile.phone && (
                                <span>Phone: <strong className="text-foreground">{result.userProfile.phone}</strong></span>
                            )}
                        </div>
                    </div>
                )}

                <div className="flex justify-between items-center text-gray-600 dark:text-gray-300">
                    <span>Security Decision:</span>
                    <span
                        className={`font-semibold px-2 py-0.5 rounded text-[11px] ${isSuccess
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                : isSpoof
                                    ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                                    : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                            }`}
                    >
                        {result.decision}
                    </span>
                </div>

                <div className="flex justify-between items-center text-gray-600 dark:text-gray-300">
                    <span>Passive Liveness Score:</span>
                    <span className="font-mono font-bold text-gray-900 dark:text-gray-100">
                        {(result.passiveScore * 100).toFixed(0)}%
                    </span>
                </div>

                {result.distance !== undefined && (
                    <div className="flex justify-between items-center text-gray-600 dark:text-gray-300">
                        <span>Biometric Vector Distance:</span>
                        <span className="font-mono text-gray-900 dark:text-gray-100">
                            {result.distance.toFixed(4)}
                        </span>
                    </div>
                )}

                {/* Detected presentation attack indicators */}
                {result.spoofIndicators && result.spoofIndicators.length > 0 && (
                    <div className="pt-2 border-t border-gray-200 dark:border-border">
                        <span className="font-medium text-red-600 dark:text-red-400 block mb-1">
                            Flagged Security Signals:
                        </span>
                        <div className="flex flex-wrap gap-1">
                            {result.spoofIndicators.map((flag, idx) => (
                                <span
                                    key={idx}
                                    className="px-2 py-0.5 rounded bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-300 text-[10px] font-mono"
                                >
                                    {flag}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Actions */}
            <div className="w-full flex gap-3 mt-1">
                {!isSuccess && (
                    <button
                        type="button"
                        onClick={onRetry}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-primary text-primary-foreground hover:opacity-90 font-medium text-sm rounded-xl transition shadow-sm"
                    >
                        <RotateCcw className="w-4 h-4" />
                        Try Again
                    </button>
                )}

                {isSuccess && onContinue && (
                    <button
                        type="button"
                        onClick={onContinue}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm rounded-xl transition shadow-sm"
                    >
                        <span>Continue</span>
                        <ArrowRight className="w-4 h-4" />
                    </button>
                )}
            </div>
        </div>
    );
}

