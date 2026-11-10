"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import {
    loadFaceModels,
    detectLandmarksOnly,
    extractFaceData,
    getAverageEAR,
} from "@/lib/face-config";
import { enrollFaceAction, verifyFaceAction } from "@/app/actions/face-auth";

interface FaceScannerProps {
    mode: "enroll" | "verify";
    onSuccess?: () => void;
}

type LivenessStage =
    | "INIT"
    | "WAIT_FOR_OPEN_EYES"
    | "READY_FOR_BLINK"
    | "EYES_CLOSED"
    | "LIVENESS_CONFIRMED";

// Thresholds tuned for typical webcam lighting
const EAR_OPEN_THRESHOLD = 0.255;
const EAR_CLOSED_THRESHOLD = 0.205;
const REQUIRED_OPEN_FRAMES = 3;

export default function FaceScanner({ mode, onSuccess }: FaceScannerProps) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const isMountedRef = useRef<boolean>(true);

    // Use refs for real-time loop variables to avoid stale closures
    const stageRef = useRef<LivenessStage>("INIT");
    const openFrameCountRef = useRef<number>(0);
    const isCapturingRef = useRef<boolean>(false);

    // UI state for user feedback
    const [stageUI, setStageUI] = useState<LivenessStage>("INIT");
    const [status, setStatus] = useState<string>("Loading AI models...");
    const [liveEAR, setLiveEAR] = useState<number>(0);
    const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

    const updateStage = (newStage: LivenessStage) => {
        stageRef.current = newStage;
        setStageUI(newStage);
    };

    // Triggered automatically once Open -> Closed -> Open finishes
    const triggerCaptureAndSubmit = useCallback(async () => {
        if (!videoRef.current || isCapturingRef.current) return;
        isCapturingRef.current = true;
        updateStage("LIVENESS_CONFIRMED");
        setStatus("Liveness confirmed! Extracting facial geometry...");

        try {
            const { descriptor, imageBase64 } = await extractFaceData(videoRef.current);

            if (mode === "enroll") {
                setStatus("Encrypting and storing biometric profile...");
                const res = await enrollFaceAction(descriptor, imageBase64);
                setResult({ ok: res.success, text: res.message });
                if (res.success && onSuccess) onSuccess();
            } else {
                setStatus("Matching against stored vector...");
                const res = await verifyFaceAction(descriptor);
                setResult({ ok: res.verified, text: res.message });
                if (res.verified && onSuccess) onSuccess();
            }
        } catch (err: any) {
            setResult({
                ok: false,
                text: err.message || "Failed to capture face after blink.",
            });
        }
    }, [mode, onSuccess]);

    useEffect(() => {
        isMountedRef.current = true;
        let stream: MediaStream | null = null;
        let loopTimeoutId: NodeJS.Timeout | null = null;

        async function runLivenessLoop() {
            if (!isMountedRef.current || isCapturingRef.current) return;

            const video = videoRef.current;
            if (video && video.readyState === 4) {
                try {
                    const detection = await detectLandmarksOnly(video);

                    if (!detection) {
                        // Reset state machine if the user leaves the camera frame
                        openFrameCountRef.current = 0;
                        updateStage("WAIT_FOR_OPEN_EYES");
                        setStatus("Position your face inside the oval guide.");
                        setLiveEAR(0);
                    } else {
                        const ear = getAverageEAR(detection.landmarks);
                        setLiveEAR(Number(ear.toFixed(3)));

                        const currentStage = stageRef.current;

                        if (currentStage === "INIT" || currentStage === "WAIT_FOR_OPEN_EYES") {
                            if (ear > EAR_OPEN_THRESHOLD) {
                                openFrameCountRef.current += 1;
                                if (openFrameCountRef.current >= REQUIRED_OPEN_FRAMES) {
                                    updateStage("READY_FOR_BLINK");
                                    setStatus("Face detected! Please blink naturally to verify.");
                                }
                            } else {
                                openFrameCountRef.current = 0;
                                setStatus("Open your eyes wide and look at the camera.");
                            }
                        } else if (currentStage === "READY_FOR_BLINK") {
                            if (ear < EAR_CLOSED_THRESHOLD) {
                                updateStage("EYES_CLOSED");
                                setStatus("Blink detected... open your eyes!");
                            }
                        } else if (currentStage === "EYES_CLOSED") {
                            // As soon as the eyes re-open above the threshold, capture immediately
                            if (ear > EAR_OPEN_THRESHOLD) {
                                await triggerCaptureAndSubmit();
                                return; // Exit detection loop after capture
                            }
                        }
                    }
                } catch (err) {
                    console.error("Frame detection error:", err);
                }
            }

            // Poll every 80ms (~12.5 FPS) for smooth blink detection without blocking the UI
            if (isMountedRef.current && !isCapturingRef.current) {
                loopTimeoutId = setTimeout(runLivenessLoop, 80);
            }
        }

        async function initCameraAndModels() {
            try {
                await loadFaceModels();
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: "user", width: 640, height: 480 },
                    audio: false,
                });

                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.onloadedmetadata = () => {
                        updateStage("WAIT_FOR_OPEN_EYES");
                        setStatus("Look directly at the camera.");
                        runLivenessLoop();
                    };
                }
            } catch (err) {
                setStatus("Camera access denied or AI models failed to load.");
            }
        }

        initCameraAndModels();

        return () => {
            isMountedRef.current = false;
            if (loopTimeoutId) clearTimeout(loopTimeoutId);
            if (stream) {
                stream.getTracks().forEach((track) => track.stop());
            }
        };
    }, [triggerCaptureAndSubmit]);

    const handleRetry = () => {
        setResult(null);
        openFrameCountRef.current = 0;
        isCapturingRef.current = false;
        updateStage("WAIT_FOR_OPEN_EYES");
        setStatus("Look directly at the camera to restart.");
        // Trigger the loop again by dispatching loadedmetadata handler
        if (videoRef.current?.onloadedmetadata) {
            videoRef.current.onloadedmetadata(new Event("loadedmetadata"));
        }
    };

    return (
        <div className="flex flex-col items-center max-w-md mx-auto p-6 bg-white rounded-2xl shadow-md border border-gray-200">
            <div className="flex items-center justify-between w-full mb-2">
                <h2 className="text-xl font-bold text-gray-900">
                    {mode === "enroll" ? "Register Your Face" : "Live Identity Check"}
                </h2>
                <span className="text-xs font-mono px-2.5 py-1 rounded bg-gray-100 text-gray-700">
                    EAR: {liveEAR.toFixed(2)}
                </span>
            </div>

            <p className="text-sm font-medium text-gray-600 mb-4 text-center min-h-[20px]">
                {status}
            </p>

            <div className="relative w-full aspect-[4/3] bg-black rounded-xl overflow-hidden mb-4">
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover transform scale-x-[-1]"
                />

                {/* Dynamic oval border that changes color with liveness progress */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div
                        className={`w-48 h-60 rounded-full border-4 transition-colors duration-200 ${stageUI === "LIVENESS_CONFIRMED"
                                ? "border-emerald-500 shadow-[0_0_25px_rgba(16,185,129,0.6)]"
                                : stageUI === "EYES_CLOSED"
                                    ? "border-amber-400"
                                    : stageUI === "READY_FOR_BLINK"
                                        ? "border-blue-400 border-dashed"
                                        : "border-white/50 border-dashed"
                            }`}
                    />
                </div>
            </div>

            {/* Step progress pills */}
            <div className="grid grid-cols-3 gap-2 w-full mb-4 text-center text-xs font-medium">
                <div
                    className={`py-1.5 rounded ${stageUI !== "INIT" && stageUI !== "WAIT_FOR_OPEN_EYES"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-gray-100 text-gray-500"
                        }`}
                >
                    1. Face Centered
                </div>
                <div
                    className={`py-1.5 rounded ${stageUI === "EYES_CLOSED" || stageUI === "LIVENESS_CONFIRMED"
                            ? "bg-emerald-100 text-emerald-800"
                            : stageUI === "READY_FOR_BLINK"
                                ? "bg-blue-100 text-blue-800 animate-pulse"
                                : "bg-gray-100 text-gray-500"
                        }`}
                >
                    2. Blink Eyes
                </div>
                <div
                    className={`py-1.5 rounded ${stageUI === "LIVENESS_CONFIRMED"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-gray-100 text-gray-500"
                        }`}
                >
                    3. Verified
                </div>
            </div>

            {result && (
                <div className="w-full flex flex-col gap-3">
                    <div
                        className={`w-full p-3 rounded-lg text-sm font-medium text-center ${result.ok
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-red-50 text-red-700 border border-red-200"
                            }`}
                    >
                        {result.text}
                    </div>

                    {!result.ok && (
                        <button
                            onClick={handleRetry}
                            className="w-full py-2.5 px-4 bg-black hover:bg-gray-800 text-white text-sm font-medium rounded-lg transition"
                        >
                            Try Again
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}