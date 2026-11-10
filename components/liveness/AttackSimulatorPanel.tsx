"use client";

import React, { useState } from "react";
import {
    ShieldAlert,
    Clock,
    CopyCheck,
    Smartphone,
    FileText,
    Camera,
    Shuffle,
    ChevronDown,
    ChevronUp,
} from "lucide-react";
import {
    createLivenessSessionAction,
    verifyLivenessSessionAction,
} from "@/app/actions/face-liveness";
import type { LivenessVerificationResult } from "@/lib/liveness/types";

export default function AttackSimulatorPanel() {
    const [isOpen, setIsOpen] = useState(false);
    const [runningScenario, setRunningScenario] = useState<string | null>(null);
    const [testResult, setTestResult] = useState<{
        scenario: string;
        expected: string;
        actual: LivenessVerificationResult;
    } | null>(null);

    // Dummy 128D descriptor for simulation
    const dummyDescriptor = Array(128).fill(0.05);

    const runSimulation = async (scenario: string) => {
        setRunningScenario(scenario);
        setTestResult(null);

        try {
            // 1. Create a fresh session
            const session = await createLivenessSessionAction({ mode: "verify" });
            if (!session.success || !session.sessionToken || !session.challenges) {
                throw new Error(session.message || "Session initialization failed");
            }

            const token = session.sessionToken;
            const challenges = session.challenges;

            let result: LivenessVerificationResult;

            switch (scenario) {
                // -------------------------------------------------------------
                // Scenario 6: Replay Attack (Resending same session token)
                // -------------------------------------------------------------
                case "REPLAY_ATTACK": {
                    // Valid first submission
                    await verifyLivenessSessionAction({
                        sessionToken: token,
                        mode: "verify",
                        challengeTelemetry: challenges.map((c) => ({
                            type: c.type,
                            startedAt: Date.now() - 2000,
                            completedAt: Date.now() - 1000,
                            durationMs: 250,
                            peakValue: 0.22,
                            baselineValue: 0.28,
                            success: true,
                        })),
                        passiveMetrics: {
                            laplacianVariance: 240,
                            moireEnergy: 0.08,
                            colorDistribution: { chrominanceScore: 0.65, specularHotspotRatio: 0.02, saturationMean: 0.4 },
                            depthParallaxScore: 0.88,
                            microMotionVariance: 0.03,
                            fpsEstimated: 14,
                            overallPassiveScore: 0.85,
                            suspiciousFlags: [],
                        },
                        deviceTelemetry: {
                            isVirtualCameraDetected: false,
                            virtualCameraDrivers: [],
                            videoTrackLabel: "Webcam",
                            resolution: { width: 640, height: 480 },
                            userAgent: navigator.userAgent,
                        },
                        descriptor: dummyDescriptor,
                    });

                    // Second submission with identical consumed token
                    result = await verifyLivenessSessionAction({
                        sessionToken: token,
                        mode: "verify",
                        challengeTelemetry: challenges.map((c) => ({
                            type: c.type,
                            startedAt: Date.now() - 2000,
                            completedAt: Date.now() - 1000,
                            durationMs: 250,
                            peakValue: 0.22,
                            baselineValue: 0.28,
                            success: true,
                        })),
                        passiveMetrics: {
                            laplacianVariance: 240,
                            moireEnergy: 0.08,
                            colorDistribution: { chrominanceScore: 0.65, specularHotspotRatio: 0.02, saturationMean: 0.4 },
                            depthParallaxScore: 0.88,
                            microMotionVariance: 0.03,
                            fpsEstimated: 14,
                            overallPassiveScore: 0.85,
                            suspiciousFlags: [],
                        },
                        deviceTelemetry: {
                            isVirtualCameraDetected: false,
                            virtualCameraDrivers: [],
                            videoTrackLabel: "Webcam",
                            resolution: { width: 640, height: 480 },
                            userAgent: navigator.userAgent,
                        },
                        descriptor: dummyDescriptor,
                    });

                    setTestResult({
                        scenario: "Scenario 6: Replayed Verification Session",
                        expected: "FAILED (CHALLENGE_REPLAY_ATTEMPT)",
                        actual: result,
                    });
                    break;
                }

                // -------------------------------------------------------------
                // Scenario 2: Printed Photograph (Low Laplacian variance & 0 motion)
                // -------------------------------------------------------------
                case "PRINTED_PHOTO": {
                    result = await verifyLivenessSessionAction({
                        sessionToken: token,
                        mode: "verify",
                        challengeTelemetry: challenges.map((c) => ({
                            type: c.type,
                            startedAt: Date.now() - 2000,
                            completedAt: Date.now() - 1000,
                            durationMs: 200,
                            peakValue: 0.2,
                            baselineValue: 0.2,
                            success: true,
                        })),
                        passiveMetrics: {
                            laplacianVariance: 18.5, // Well below 45 threshold
                            moireEnergy: 0.12,
                            colorDistribution: { chrominanceScore: 0.35, specularHotspotRatio: 0.01, saturationMean: 0.25 },
                            depthParallaxScore: 0.02, // 2D flat paper
                            microMotionVariance: 0.001, // Zero involuntary motion
                            fpsEstimated: 14,
                            overallPassiveScore: 0.28,
                            suspiciousFlags: ["LOW_TEXTURE_BLURRY_OR_PRINT", "ZERO_INVOLUNTARY_MOTION_STATIC_IMAGE"],
                        },
                        deviceTelemetry: {
                            isVirtualCameraDetected: false,
                            virtualCameraDrivers: [],
                            videoTrackLabel: "Webcam",
                            resolution: { width: 640, height: 480 },
                            userAgent: navigator.userAgent,
                        },
                        descriptor: dummyDescriptor,
                    });

                    setTestResult({
                        scenario: "Scenario 2: Printed Paper Photograph Attack",
                        expected: "SPOOF_DETECTED (LOW_TEXTURE_BLURRY_OR_PRINT)",
                        actual: result,
                    });
                    break;
                }

                // -------------------------------------------------------------
                // Scenario 3 & 4: Mobile Screen / Monitor Attack (High Moiré)
                // -------------------------------------------------------------
                case "SCREEN_MOIRE": {
                    result = await verifyLivenessSessionAction({
                        sessionToken: token,
                        mode: "verify",
                        challengeTelemetry: challenges.map((c) => ({
                            type: c.type,
                            startedAt: Date.now() - 2000,
                            completedAt: Date.now() - 1000,
                            durationMs: 250,
                            peakValue: 0.22,
                            baselineValue: 0.28,
                            success: true,
                        })),
                        passiveMetrics: {
                            laplacianVariance: 2800, // Extreme subpixel lattice
                            moireEnergy: 0.92, // Strong screen moiré pattern
                            colorDistribution: { chrominanceScore: 0.48, specularHotspotRatio: 0.32, saturationMean: 0.55 },
                            depthParallaxScore: 0.15,
                            microMotionVariance: 0.02,
                            fpsEstimated: 14,
                            overallPassiveScore: 0.31,
                            suspiciousFlags: [
                                "SCREEN_MOIRE_PATTERN_DETECTED",
                                "ARTIFICIAL_PIXEL_LATTICE_DETECTED",
                                "SCREEN_SPECULAR_GLARE",
                            ],
                        },
                        deviceTelemetry: {
                            isVirtualCameraDetected: false,
                            virtualCameraDrivers: [],
                            videoTrackLabel: "Webcam",
                            resolution: { width: 640, height: 480 },
                            userAgent: navigator.userAgent,
                        },
                        descriptor: dummyDescriptor,
                    });

                    setTestResult({
                        scenario: "Scenario 3 & 4: Screen Replay Attack (Moiré & Glass Flare)",
                        expected: "SPOOF_DETECTED (HIGH_FREQUENCY_DISPLAY_MOIRE)",
                        actual: result,
                    });
                    break;
                }

                // -------------------------------------------------------------
                // Scenario 12: Sequence Violation (Swapped challenge order)
                // -------------------------------------------------------------
                case "SEQUENCE_VIOLATION": {
                    const swapped = [...challenges].reverse(); // Intentionally out of order

                    result = await verifyLivenessSessionAction({
                        sessionToken: token,
                        mode: "verify",
                        challengeTelemetry: swapped.map((c) => ({
                            type: c.type,
                            startedAt: Date.now() - 2000,
                            completedAt: Date.now() - 1000,
                            durationMs: 250,
                            peakValue: 0.22,
                            baselineValue: 0.28,
                            success: true,
                        })),
                        passiveMetrics: {
                            laplacianVariance: 240,
                            moireEnergy: 0.08,
                            colorDistribution: { chrominanceScore: 0.65, specularHotspotRatio: 0.02, saturationMean: 0.4 },
                            depthParallaxScore: 0.88,
                            microMotionVariance: 0.03,
                            fpsEstimated: 14,
                            overallPassiveScore: 0.85,
                            suspiciousFlags: [],
                        },
                        deviceTelemetry: {
                            isVirtualCameraDetected: false,
                            virtualCameraDrivers: [],
                            videoTrackLabel: "Webcam",
                            resolution: { width: 640, height: 480 },
                            userAgent: navigator.userAgent,
                        },
                        descriptor: dummyDescriptor,
                    });

                    setTestResult({
                        scenario: "Scenario 12: Challenge Sequence Violation",
                        expected: "FAILED (CHALLENGE_SEQUENCE_VIOLATION)",
                        actual: result,
                    });
                    break;
                }

                // -------------------------------------------------------------
                // Scenario 17: Virtual Camera Driver Flagged
                // -------------------------------------------------------------
                case "VIRTUAL_CAMERA": {
                    result = await verifyLivenessSessionAction({
                        sessionToken: token,
                        mode: "verify",
                        challengeTelemetry: challenges.map((c) => ({
                            type: c.type,
                            startedAt: Date.now() - 2000,
                            completedAt: Date.now() - 1000,
                            durationMs: 250,
                            peakValue: 0.22,
                            baselineValue: 0.28,
                            success: true,
                        })),
                        passiveMetrics: {
                            laplacianVariance: 240,
                            moireEnergy: 0.08,
                            colorDistribution: { chrominanceScore: 0.65, specularHotspotRatio: 0.02, saturationMean: 0.4 },
                            depthParallaxScore: 0.88,
                            microMotionVariance: 0.03,
                            fpsEstimated: 14,
                            overallPassiveScore: 0.85,
                            suspiciousFlags: [],
                        },
                        deviceTelemetry: {
                            isVirtualCameraDetected: true,
                            virtualCameraDrivers: ["obs virtual camera", "manycam"],
                            videoTrackLabel: "OBS Virtual Camera",
                            resolution: { width: 1280, height: 720 },
                            userAgent: navigator.userAgent,
                        },
                        descriptor: dummyDescriptor,
                    });

                    setTestResult({
                        scenario: "Scenario 17: Virtual Camera Driver Detection",
                        expected: "SPOOF_DETECTED (VIRTUAL_CAMERA_DRIVER_FLAGGED)",
                        actual: result,
                    });
                    break;
                }

                default:
                    break;
            }
        } catch (err: unknown) {
            console.error("Simulation failed:", err);
        } finally {
            setRunningScenario(null);
        }
    };

    return (
        <div className="w-full mt-6 border border-border rounded-2xl bg-card shadow-sm overflow-hidden text-left">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-4 bg-muted/30 hover:bg-muted/60 transition"
            >
                <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                        <ShieldAlert className="w-5 h-5" />
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-foreground">
                            Attack Simulation & Verification Testbench
                        </h4>
                        <p className="text-xs text-muted-foreground">
                            Simulate presentation attacks against the server decision engine
                        </p>
                    </div>
                </div>
                {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {isOpen && (
                <div className="p-4 border-t border-border space-y-4">
                    <p className="text-xs text-muted-foreground">
                        Click any scenario below to dispatch a simulated biometric payload and test the
                        server-side Verification Decision Engine in real time.
                    </p>

                    {/* Simulation Buttons Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        <button
                            type="button"
                            disabled={runningScenario !== null}
                            onClick={() => runSimulation("PRINTED_PHOTO")}
                            className="flex items-center gap-2 p-2.5 rounded-xl border border-border bg-background hover:bg-muted font-medium transition text-left disabled:opacity-50"
                        >
                            <FileText className="w-4 h-4 text-amber-500 shrink-0" />
                            <div>
                                <span className="font-semibold block">Printed Photo Attack</span>
                                <span className="text-[11px] text-muted-foreground">
                                    Simulate paper texture & 0 micro-motion
                                </span>
                            </div>
                        </button>

                        <button
                            type="button"
                            disabled={runningScenario !== null}
                            onClick={() => runSimulation("SCREEN_MOIRE")}
                            className="flex items-center gap-2 p-2.5 rounded-xl border border-border bg-background hover:bg-muted font-medium transition text-left disabled:opacity-50"
                        >
                            <Smartphone className="w-4 h-4 text-blue-500 shrink-0" />
                            <div>
                                <span className="font-semibold block">Screen Replay (Moiré)</span>
                                <span className="text-[11px] text-muted-foreground">
                                    Simulate display subpixels & glass flare
                                </span>
                            </div>
                        </button>

                        <button
                            type="button"
                            disabled={runningScenario !== null}
                            onClick={() => runSimulation("REPLAY_ATTACK")}
                            className="flex items-center gap-2 p-2.5 rounded-xl border border-border bg-background hover:bg-muted font-medium transition text-left disabled:opacity-50"
                        >
                            <CopyCheck className="w-4 h-4 text-red-500 shrink-0" />
                            <div>
                                <span className="font-semibold block">Replay Session Token</span>
                                <span className="text-[11px] text-muted-foreground">
                                    Submit previously consumed token
                                </span>
                            </div>
                        </button>

                        <button
                            type="button"
                            disabled={runningScenario !== null}
                            onClick={() => runSimulation("SEQUENCE_VIOLATION")}
                            className="flex items-center gap-2 p-2.5 rounded-xl border border-border bg-background hover:bg-muted font-medium transition text-left disabled:opacity-50"
                        >
                            <Shuffle className="w-4 h-4 text-purple-500 shrink-0" />
                            <div>
                                <span className="font-semibold block">Sequence Violation</span>
                                <span className="text-[11px] text-muted-foreground">
                                    Execute challenges out of server order
                                </span>
                            </div>
                        </button>

                        <button
                            type="button"
                            disabled={runningScenario !== null}
                            onClick={() => runSimulation("VIRTUAL_CAMERA")}
                            className="flex items-center gap-2 p-2.5 rounded-xl border border-border bg-background hover:bg-muted font-medium transition text-left disabled:opacity-50 sm:col-span-2"
                        >
                            <Camera className="w-4 h-4 text-emerald-500 shrink-0" />
                            <div>
                                <span className="font-semibold block">Virtual Camera Stream</span>
                                <span className="text-[11px] text-muted-foreground">
                                    Simulate OBS / ManyCam video injection signature
                                </span>
                            </div>
                        </button>
                    </div>

                    {/* Simulation Result Output */}
                    {runningScenario && (
                        <div className="flex items-center gap-2 p-3 rounded-xl bg-muted text-xs text-muted-foreground font-mono animate-pulse">
                            <Clock className="w-4 h-4 animate-spin text-primary" />
                            <span>Dispatching simulation payload to server action...</span>
                        </div>
                    )}

                    {testResult && (
                        <div className="p-3.5 rounded-xl border border-border bg-muted/40 space-y-2 text-xs font-mono">
                            <div className="flex items-center justify-between">
                                <span className="font-bold text-foreground font-sans">
                                    {testResult.scenario}
                                </span>
                                <span
                                    className={`px-2 py-0.5 rounded font-bold text-[11px] ${testResult.actual.decision === "SPOOF_DETECTED"
                                            ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                                            : testResult.actual.decision === "FAILED"
                                                ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                                                : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                        }`}
                                >
                                    Decision: {testResult.actual.decision}
                                </span>
                            </div>

                            <div className="text-muted-foreground space-y-1">
                                <div>
                                    <span className="text-gray-400">Expected:</span> {testResult.expected}
                                </div>
                                <div>
                                    <span className="text-gray-400">Server Message:</span>{" "}
                                    <span className="text-foreground">{testResult.actual.message}</span>
                                </div>
                                {testResult.actual.spoofIndicators.length > 0 && (
                                    <div>
                                        <span className="text-gray-400">Security Flags:</span>{" "}
                                        <span className="text-red-600 dark:text-red-400 font-semibold">
                                            {testResult.actual.spoofIndicators.join(", ")}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
