"use client";

import React, { useState } from "react";
import { ChevronDown, ChevronUp, ShieldCheck, ShieldAlert, Cpu } from "lucide-react";
import type { HeadPose, PassiveAnalysisMetrics, DeviceTelemetry } from "@/lib/liveness/types";

interface LivenessTelemetryBadgeProps {
    ear: number;
    mar: number;
    headPose: HeadPose;
    smileScore: number;
    passiveMetrics: PassiveAnalysisMetrics | null;
    deviceTelemetry: DeviceTelemetry | null;
}

export default function LivenessTelemetryBadge({
    ear,
    mar,
    headPose,
    smileScore,
    passiveMetrics,
    deviceTelemetry,
}: LivenessTelemetryBadgeProps) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="w-full mt-3 border border-gray-200 dark:border-gray-800 rounded-xl bg-gray-50/70 dark:bg-gray-900/60 overflow-hidden text-xs">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between px-3 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100/60 dark:hover:bg-gray-800/40 transition font-medium"
            >
                <div className="flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-primary" />
                    <span>Live Biometric & Anti-Spoofing Telemetry</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                        EAR: {ear.toFixed(2)} | Yaw: {headPose.yaw.toFixed(0)}°
                    </span>
                    {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
            </button>

            {isOpen && (
                <div className="p-3 border-t border-gray-200 dark:border-gray-800 space-y-2.5 font-mono text-[11px] text-gray-600 dark:text-gray-400">
                    {/* Active Landmarks Metrics */}
                    <div className="grid grid-cols-2 gap-2 pb-2 border-b border-gray-200 dark:border-gray-800">
                        <div>
                            <span className="text-gray-400">EAR (Blink):</span>{" "}
                            <span className="text-gray-900 dark:text-gray-100 font-bold">{ear.toFixed(3)}</span>
                        </div>
                        <div>
                            <span className="text-gray-400">MAR (Mouth):</span>{" "}
                            <span className="text-gray-900 dark:text-gray-100 font-bold">{mar.toFixed(3)}</span>
                        </div>
                        <div>
                            <span className="text-gray-400">Yaw / Pitch / Roll:</span>{" "}
                            <span className="text-gray-900 dark:text-gray-100">
                                {headPose.yaw}° / {headPose.pitch}° / {headPose.roll}°
                            </span>
                        </div>
                        <div>
                            <span className="text-gray-400">Smile Score:</span>{" "}
                            <span className="text-gray-900 dark:text-gray-100 font-bold">{smileScore.toFixed(2)}</span>
                        </div>
                    </div>

                    {/* Passive Anti-Spoofing Metrics */}
                    <div className="grid grid-cols-2 gap-2 pb-2 border-b border-gray-200 dark:border-gray-800">
                        <div>
                            <span className="text-gray-400">Laplacian Variance:</span>{" "}
                            <span className="text-gray-900 dark:text-gray-100 font-bold">
                                {passiveMetrics?.laplacianVariance ?? "--"}
                            </span>
                        </div>
                        <div>
                            <span className="text-gray-400">Moiré Energy:</span>{" "}
                            <span className="text-gray-900 dark:text-gray-100 font-bold">
                                {passiveMetrics?.moireEnergy ?? "--"}
                            </span>
                        </div>
                        <div>
                            <span className="text-gray-400">Skin Chrominance:</span>{" "}
                            <span className="text-gray-900 dark:text-gray-100">
                                {passiveMetrics ? `${(passiveMetrics.colorDistribution.chrominanceScore * 100).toFixed(0)}%` : "--"}
                            </span>
                        </div>
                        <div>
                            <span className="text-gray-400">3D Depth Parallax:</span>{" "}
                            <span className="text-gray-900 dark:text-gray-100">
                                {passiveMetrics?.depthParallaxScore ?? "--"}
                            </span>
                        </div>
                    </div>

                    {/* Device & Virtual Camera Status */}
                    <div className="flex items-center justify-between pt-1">
                        <div className="truncate max-w-[240px]">
                            <span className="text-gray-400">Camera Source:</span>{" "}
                            <span className="text-gray-800 dark:text-gray-200 truncate">
                                {deviceTelemetry?.videoTrackLabel || "Webcam"}
                            </span>
                        </div>
                        <div className="flex items-center gap-1 font-sans">
                            {deviceTelemetry?.isVirtualCameraDetected ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-100 text-red-800 dark:bg-red-950/80 dark:text-red-300 font-semibold">
                                    <ShieldAlert className="w-3.5 h-3.5 text-red-600" />
                                    Virtual Driver Flagged
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 font-medium">
                                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                                    Physical Camera
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

