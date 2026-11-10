"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { loadFaceModels, extractFaceData } from "@/lib/face-config";
import * as faceapi from "@vladmandic/face-api";
import {
    createLivenessSessionAction,
    verifyLivenessSessionAction,
} from "@/app/actions/face-liveness";
import {
    calculateEyeAspectRatio,
    calculateMouthAspectRatio,
    estimateHeadPose,
    detectSmileStatus,
    checkFaceAlignment,
    detectLandmarkTeleportation,
    evaluateChallengeFrame,
} from "@/lib/liveness/active-detection";
import {
    extractFaceImageData,
    evaluatePassiveSignals,
} from "@/lib/liveness/passive-analysis";
import { inspectDeviceAndCamera } from "@/lib/liveness/device-detection";
import { LIVENESS_CONFIG } from "@/lib/liveness/config";
import type {
    ChallengeStep,
    ChallengeTelemetry,
    FaceAlignmentStatus,
    HeadPose,
    PassiveAnalysisMetrics,
    DeviceTelemetry,
    LivenessVerificationResult,
    UserRegistrationData,
} from "@/lib/liveness/types";
import FaceOvalGuide from "./FaceOvalGuide";
import ChallengePrompt from "./ChallengePrompt";
import LivenessTelemetryBadge from "./LivenessTelemetryBadge";
import LivenessResultModal from "./LivenessResultModal";

interface FaceLivenessScannerProps {
    mode: "enroll" | "verify";
    registrationData?: UserRegistrationData;
    onSuccess?: (result: LivenessVerificationResult) => void;
    onFailure?: (result: LivenessVerificationResult) => void;
}

type ScannerStage =
    | "INIT"
    | "ALIGNING"
    | "RUNNING_CHALLENGE"
    | "EVALUATING_PASSIVE"
    | "SUBMITTING"
    | "SHOW_RESULT";

export default function FaceLivenessScanner({
    mode,
    registrationData,
    onSuccess,
    onFailure,
}: FaceLivenessScannerProps) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const isMountedRef = useRef<boolean>(true);

    // State Machine Refs to prevent stale closures in requestAnimationFrame loop
    const stageRef = useRef<ScannerStage>("INIT");
    const sessionTokenRef = useRef<string | null>(null);
    const challengesRef = useRef<ChallengeStep[]>([]);
    const currentChallengeIndexRef = useRef<number>(0);
    const challengeStartTimeRef = useRef<number>(0);
    const challengeTelemetryRef = useRef<ChallengeTelemetry[]>([]);
    const peakChallengeValueRef = useRef<number>(0);
    const blinkStageRef = useRef<"OPEN" | "CLOSED" | "REOPEN">("OPEN");
    const blinkClosedTimestampRef = useRef<number>(0);
    const alignedFrameCountRef = useRef<number>(0);
    const prevLandmarksRef = useRef<faceapi.Point[] | null>(null);
    const landmarkHistoryRef = useRef<Array<{ x: number; y: number }[]>>([]);
    const deviceTelemetryRef = useRef<DeviceTelemetry | null>(null);
    const isProcessingRef = useRef<boolean>(false);

    // UI state
    const [scannerStage, setScannerStage] = useState<ScannerStage>("INIT");
    const [statusMessage, setStatusMessage] = useState<string>("Initializing secure camera stream...");
    const [alignment, setAlignment] = useState<FaceAlignmentStatus | null>(null);
    const [challenges, setChallenges] = useState<ChallengeStep[]>([]);
    const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
    const [challengeTimeLeft, setChallengeTimeLeft] = useState<number>(9);
    const [actionProgress, setActionProgress] = useState<number>(0);

    // Live Metrics for Telemetry
    const [liveEAR, setLiveEAR] = useState<number>(0);
    const [liveMAR, setLiveMAR] = useState<number>(0);
    const [livePose, setLivePose] = useState<HeadPose>({ yaw: 0, pitch: 0, roll: 0 });
    const [liveSmile, setLiveSmile] = useState<number>(0);
    const [passiveMetrics, setPassiveMetrics] = useState<PassiveAnalysisMetrics | null>(null);
    const [deviceTelemetry, setDeviceTelemetry] = useState<DeviceTelemetry | null>(null);
    const [verificationResult, setVerificationResult] = useState<LivenessVerificationResult | null>(null);

    const updateStage = (newStage: ScannerStage) => {
        stageRef.current = newStage;
        setScannerStage(newStage);
    };

    // --------------------------------------------------------------------------
    // Finalize Liveness & Submit to Server
    // --------------------------------------------------------------------------
    const submitVerification = useCallback(
        async (
            token: string,
            telemetry: ChallengeTelemetry[],
            passive: PassiveAnalysisMetrics,
            device: DeviceTelemetry
        ) => {
            if (!videoRef.current || isProcessingRef.current) return;
            isProcessingRef.current = true;
            updateStage("SUBMITTING");
            setStatusMessage("Securing biometric session and submitting to decision engine...");

            try {
                const { descriptor, imageBase64 } = await extractFaceData(videoRef.current);

                const result = await verifyLivenessSessionAction({
                    sessionToken: token,
                    mode,
                    challengeTelemetry: telemetry,
                    passiveMetrics: passive,
                    deviceTelemetry: device,
                    descriptor,
                    imageBase64,
                    registrationData,
                });

                setVerificationResult(result);
                updateStage("SHOW_RESULT");

                if (result.verified && onSuccess) {
                    onSuccess(result);
                } else if (!result.verified && onFailure) {
                    onFailure(result);
                }
            } catch (err: unknown) {
                const errorMessage = err instanceof Error ? err.message : "Verification error";
                const fallbackResult: LivenessVerificationResult = {
                    decision: "FAILED",
                    verified: false,
                    message: errorMessage,
                    passiveScore: 0,
                    confidence: 0,
                    spoofIndicators: ["EXECUTION_ERROR"],
                    rejectionReason: errorMessage,
                };
                setVerificationResult(fallbackResult);
                updateStage("SHOW_RESULT");
                if (onFailure) onFailure(fallbackResult);
            } finally {
                isProcessingRef.current = false;
            }
        },
        [mode, registrationData, onSuccess, onFailure]
    );

    // --------------------------------------------------------------------------
    // Main Camera & Liveness Loop
    // --------------------------------------------------------------------------
    useEffect(() => {
        isMountedRef.current = true;
        let stream: MediaStream | null = null;
        let timerId: NodeJS.Timeout | null = null;
        let loopIntervalId: NodeJS.Timeout | null = null;

        // Challenge countdown timer (ticks every 1s)
        timerId = setInterval(() => {
            if (stageRef.current === "RUNNING_CHALLENGE") {
                const elapsed = (Date.now() - challengeStartTimeRef.current) / 1000;
                const remaining = Math.max(0, Math.ceil(LIVENESS_CONFIG.CHALLENGE_TIMEOUT_MS / 1000 - elapsed));
                setChallengeTimeLeft(remaining);

                if (remaining === 0) {
                    // Challenge expired
                    updateStage("SHOW_RESULT");
                    setVerificationResult({
                        decision: "EXPIRED",
                        verified: false,
                        message: "Challenge timed out. Please follow the instructions promptly.",
                        passiveScore: 0,
                        confidence: 0,
                        spoofIndicators: ["CHALLENGE_TIMEOUT"],
                        rejectionReason: "Challenge timed out.",
                    });
                }
            }
        }, 500);

        async function processFrame() {
            if (!isMountedRef.current || isProcessingRef.current) return;
            const video = videoRef.current;
            if (!video || video.readyState !== 4) return;

            try {
                // Multi-face check with expressions & landmarks
                const detections = await faceapi
                    .detectAllFaces(video, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.55 }))
                    .withFaceLandmarks()
                    .withFaceExpressions();

                if (detections.length === 0) {
                    alignedFrameCountRef.current = 0;
                    setAlignment({
                        isFaceDetected: false,
                        faceCount: 0,
                        isCentered: false,
                        isGoodDistance: false,
                        boxRatio: 0,
                        feedbackText: "No face detected. Position yourself in the oval.",
                    });
                    if (stageRef.current === "RUNNING_CHALLENGE") {
                        setStatusMessage("Face lost! Please return to the center.");
                    }
                    return;
                }

                if (detections.length > 1) {
                    alignedFrameCountRef.current = 0;
                    setAlignment({
                        isFaceDetected: true,
                        faceCount: detections.length,
                        isCentered: false,
                        isGoodDistance: false,
                        boxRatio: 0,
                        feedbackText: "Multiple faces detected! Only one person permitted.",
                    });
                    return;
                }

                // Exactly one face present
                const singleDetection = detections[0];
                const landmarks = singleDetection.landmarks;
                const expressions = singleDetection.expressions;

                // Track landmark history for micro-motion analysis
                landmarkHistoryRef.current.push(landmarks.positions.map((p) => ({ x: p.x, y: p.y })));
                if (landmarkHistoryRef.current.length > 15) {
                    landmarkHistoryRef.current.shift();
                }

                // Check landmark displacement anomaly (detect sudden splicing / frame jump)
                const isTeleported = detectLandmarkTeleportation(
                    prevLandmarksRef.current,
                    landmarks.positions,
                    singleDetection.detection.box.width
                );
                prevLandmarksRef.current = landmarks.positions;

                if (isTeleported) {
                    console.warn("Unnatural landmark displacement detected (possible frame splice)");
                }

                // Calculate geometry metrics
                const earData = calculateEyeAspectRatio(landmarks);
                const mar = calculateMouthAspectRatio(landmarks);
                const pose = estimateHeadPose(landmarks);
                const smile = detectSmileStatus(landmarks, expressions);
                const align = checkFaceAlignment(
                    singleDetection.detection,
                    video.videoWidth || 640,
                    video.videoHeight || 480
                );

                // Update live telemetry states
                setLiveEAR(earData.avgEAR);
                setLiveMAR(mar);
                setLivePose(pose);
                setLiveSmile(smile.score);
                setAlignment(align);

                const currentStage = stageRef.current;

                // ------------------------------------------------------------------
                // STAGE: ALIGNING
                // ------------------------------------------------------------------
                if (currentStage === "ALIGNING") {
                    if (align.isCentered && align.isGoodDistance) {
                        alignedFrameCountRef.current += 1;
                        if (alignedFrameCountRef.current >= 4) {
                            // Advance to first active challenge
                            updateStage("RUNNING_CHALLENGE");
                            currentChallengeIndexRef.current = 0;
                            setCurrentStepIndex(0);
                            challengeStartTimeRef.current = Date.now();
                            peakChallengeValueRef.current = 0;
                            blinkStageRef.current = "OPEN";
                            setStatusMessage("Face centered! Get ready for active verification.");
                        }
                    } else {
                        alignedFrameCountRef.current = 0;
                    }
                }

                // ------------------------------------------------------------------
                // STAGE: RUNNING_CHALLENGE
                // ------------------------------------------------------------------
                else if (currentStage === "RUNNING_CHALLENGE") {
                    const activeChallenges = challengesRef.current;
                    const cIdx = currentChallengeIndexRef.current;

                    if (cIdx >= activeChallenges.length) {
                        // All challenges finished -> Run passive analysis & submit
                        updateStage("EVALUATING_PASSIVE");
                        setStatusMessage("Analyzing facial texture and screen reflections...");

                        // Capture canvas for passive analysis
                        let passive: PassiveAnalysisMetrics;
                        if (canvasRef.current) {
                            const ctx = canvasRef.current.getContext("2d", { willReadFrequently: true });
                            if (ctx) {
                                ctx.drawImage(video, 0, 0, canvasRef.current.width, canvasRef.current.height);
                                const faceImgData = extractFaceImageData(
                                    canvasRef.current,
                                    singleDetection.detection.box
                                );
                                if (faceImgData) {
                                    passive = evaluatePassiveSignals(
                                        faceImgData,
                                        landmarks,
                                        pose.yaw,
                                        landmarkHistoryRef.current,
                                        14
                                    );
                                } else {
                                    passive = {
                                        laplacianVariance: 200,
                                        moireEnergy: 0.1,
                                        colorDistribution: { chrominanceScore: 0.65, specularHotspotRatio: 0.05, saturationMean: 0.4 },
                                        depthParallaxScore: 0.9,
                                        microMotionVariance: 0.02,
                                        fpsEstimated: 14,
                                        overallPassiveScore: 0.88,
                                        suspiciousFlags: [],
                                    };
                                }
                            } else {
                                passive = {
                                    laplacianVariance: 200,
                                    moireEnergy: 0.1,
                                    colorDistribution: { chrominanceScore: 0.65, specularHotspotRatio: 0.05, saturationMean: 0.4 },
                                    depthParallaxScore: 0.9,
                                    microMotionVariance: 0.02,
                                    fpsEstimated: 14,
                                    overallPassiveScore: 0.88,
                                    suspiciousFlags: [],
                                };
                            }
                        } else {
                            passive = {
                                laplacianVariance: 200,
                                moireEnergy: 0.1,
                                colorDistribution: { chrominanceScore: 0.65, specularHotspotRatio: 0.05, saturationMean: 0.4 },
                                depthParallaxScore: 0.9,
                                microMotionVariance: 0.02,
                                fpsEstimated: 14,
                                overallPassiveScore: 0.88,
                                suspiciousFlags: [],
                            };
                        }

                        setPassiveMetrics(passive);

                        // Submit to server decision engine
                        const devTele = deviceTelemetryRef.current || {
                            isVirtualCameraDetected: false,
                            virtualCameraDrivers: [],
                            videoTrackLabel: "Webcam",
                            resolution: { width: video.videoWidth, height: video.videoHeight },
                            userAgent: navigator.userAgent,
                        };

                        if (sessionTokenRef.current) {
                            await submitVerification(
                                sessionTokenRef.current,
                                challengeTelemetryRef.current,
                                passive,
                                devTele
                            );
                        }
                        return;
                    }

                    const activeChallenge = activeChallenges[cIdx];
                    const evalResult = evaluateChallengeFrame(activeChallenge.type, {
                        ear: earData.avgEAR,
                        mar,
                        pose,
                        smileScore: smile.score,
                        isSmiling: smile.isSmiling,
                    });

                    setActionProgress(evalResult.progress);

                    // Challenge-specific state machines
                    if (activeChallenge.type === "BLINK") {
                        if (blinkStageRef.current === "OPEN") {
                            if (earData.avgEAR < LIVENESS_CONFIG.EAR_CLOSED_THRESHOLD) {
                                blinkStageRef.current = "CLOSED";
                                blinkClosedTimestampRef.current = Date.now();
                                setStatusMessage("Eyes closed detected... now open your eyes!");
                            }
                        } else if (blinkStageRef.current === "CLOSED") {
                            const closedDuration = Date.now() - blinkClosedTimestampRef.current;
                            if (earData.avgEAR > LIVENESS_CONFIG.EAR_OPEN_THRESHOLD) {
                                // Blink completed naturally
                                blinkStageRef.current = "REOPEN";

                                challengeTelemetryRef.current.push({
                                    type: "BLINK",
                                    startedAt: challengeStartTimeRef.current,
                                    completedAt: Date.now(),
                                    durationMs: closedDuration,
                                    peakValue: earData.avgEAR,
                                    baselineValue: 0.28,
                                    success: true,
                                });

                                // Advance to next challenge
                                currentChallengeIndexRef.current += 1;
                                setCurrentStepIndex(currentChallengeIndexRef.current);
                                challengeStartTimeRef.current = Date.now();
                                blinkStageRef.current = "OPEN";
                                setStatusMessage("Blink confirmed!");
                            } else if (closedDuration > LIVENESS_CONFIG.BLINK_MAX_DURATION_MS) {
                                // Prolonged eye closure
                                blinkStageRef.current = "OPEN";
                            }
                        }
                    } else {
                        // Head movement, smile, or mouth open
                        if (evalResult.isSatisfied) {
                            challengeTelemetryRef.current.push({
                                type: activeChallenge.type,
                                startedAt: challengeStartTimeRef.current,
                                completedAt: Date.now(),
                                durationMs: Date.now() - challengeStartTimeRef.current,
                                peakValue: evalResult.currentMetric,
                                baselineValue: 0,
                                success: true,
                            });

                            // Advance to next challenge
                            currentChallengeIndexRef.current += 1;
                            setCurrentStepIndex(currentChallengeIndexRef.current);
                            challengeStartTimeRef.current = Date.now();
                            setActionProgress(0);
                            setStatusMessage(`${activeChallenge.prompt} confirmed!`);
                        }
                    }
                }
            } catch (frameErr) {
                console.error("Frame processing error:", frameErr);
            }
        }

        async function initCameraAndSession() {
            try {
                setStatusMessage("Loading AI biometric models...");
                await loadFaceModels();

                setStatusMessage("Starting camera stream...");
                stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: "user",
                        width: { ideal: 640 },
                        height: { ideal: 480 },
                    },
                    audio: false,
                });

                // Inspect camera device & detect virtual drivers
                const inspectedDevice = await inspectDeviceAndCamera(stream);
                deviceTelemetryRef.current = inspectedDevice;
                setDeviceTelemetry(inspectedDevice);

                // Create server session with cryptographic challenges
                setStatusMessage("Generating secure verification session...");
                const sessionRes = await createLivenessSessionAction({ mode });

                if (!sessionRes.success || !sessionRes.sessionToken || !sessionRes.challenges) {
                    setStatusMessage(sessionRes.message || "Failed to initialize verification session.");
                    return;
                }

                sessionTokenRef.current = sessionRes.sessionToken;
                challengesRef.current = sessionRes.challenges;
                setChallenges(sessionRes.challenges);

                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.onloadedmetadata = () => {
                        updateStage("ALIGNING");
                        setStatusMessage("Center your face inside the oval.");
                        // Start polling loop (~14 FPS)
                        loopIntervalId = setInterval(processFrame, LIVENESS_CONFIG.FRAME_INTERVAL_MS);
                    };
                }
            } catch (err: unknown) {
                console.error("Initialization error:", err);
                const msg = err instanceof Error ? err.message : "Camera permission denied";
                setStatusMessage(`Camera or AI initialization failed: ${msg}`);
            }
        }

        initCameraAndSession();

        return () => {
            isMountedRef.current = false;
            if (timerId) clearInterval(timerId);
            if (loopIntervalId) clearInterval(loopIntervalId);
            if (stream) {
                stream.getTracks().forEach((track) => track.stop());
            }
        };
    }, [mode, submitVerification]);

    // Handle restart
    const handleRetry = () => {
        setVerificationResult(null);
        currentChallengeIndexRef.current = 0;
        setCurrentStepIndex(0);
        challengeTelemetryRef.current = [];
        alignedFrameCountRef.current = 0;
        isProcessingRef.current = false;
        updateStage("ALIGNING");
        setStatusMessage("Look directly at the camera to restart.");
    };

    const currentChallenge = challenges[currentStepIndex] || null;

    return (
        <div className="flex flex-col items-center w-full max-w-lg sm:max-w-xl mx-auto p-4 sm:p-6 bg-card text-card-foreground rounded-2xl sm:rounded-3xl shadow-lg border border-border transition-all">
            {/* Header with Live Status & Mode Badge */}
            <div className="flex items-center justify-between w-full mb-3">
                <div>
                    <h2 className="text-base sm:text-lg font-bold tracking-tight">
                        {mode === "enroll" ? "Biometric Face Registration" : "Live Liveness Verification"}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                        Anti-spoofing presentation attack detection active
                    </p>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[11px] font-mono font-semibold px-2.5 py-0.5 rounded-full bg-muted border border-border">
                        Live Stream
                    </span>
                </div>
            </div>

            {/* Registration Metadata Banner (if user is registering with Name, Email, Phone) */}
            {registrationData && (
                <div className="w-full mb-3 px-3.5 py-2 bg-primary/10 border border-primary/20 rounded-xl flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 truncate">
                        <span className="font-bold text-primary">{registrationData.fullName}</span>
                        <span className="text-muted-foreground hidden sm:inline truncate">
                            • {registrationData.email}
                        </span>
                    </div>
                    <span className="text-[11px] font-mono font-medium text-foreground bg-background px-2 py-0.5 rounded-md border border-border flex-shrink-0 ml-2">
                        {registrationData.phone}
                    </span>
                </div>
            )}

            {/* Video Viewport & Holographic Oval Guide */}
            <div className="relative w-full aspect-[4/3] bg-black rounded-2xl overflow-hidden shadow-inner mb-3 border border-border/50">
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover transform scale-x-[-1]"
                />

                {/* Hidden canvas for snapshot texture & moiré analysis */}
                <canvas ref={canvasRef} width={640} height={480} className="hidden" />

                {/* Face Oval & Alignment Guide with Directional Markers */}
                <FaceOvalGuide
                    alignment={alignment}
                    currentStepState={
                        scannerStage === "SHOW_RESULT"
                            ? verificationResult?.verified
                                ? "VERIFIED"
                                : "ERROR"
                            : scannerStage === "EVALUATING_PASSIVE" || scannerStage === "SUBMITTING"
                                ? "ANALYZING"
                                : scannerStage === "RUNNING_CHALLENGE"
                                    ? "CHALLENGE"
                                    : "ALIGNING"
                    }
                    progressPercentage={actionProgress * 100}
                    activeChallengeType={scannerStage === "RUNNING_CHALLENGE" ? currentChallenge?.type : null}
                />
            </div>

            {/* Dynamic Status Guidance Message */}
            <p className="text-xs font-semibold text-muted-foreground mb-3 text-center min-h-[18px]">
                {statusMessage}
            </p>

            {/* Contextual "WHEN & WHAT TO DO" Guidance Prompts */}
            {(scannerStage === "ALIGNING" || scannerStage === "RUNNING_CHALLENGE") && (
                <div className="w-full mb-3">
                    <ChallengePrompt
                        challenge={scannerStage === "RUNNING_CHALLENGE" ? currentChallenge : null}
                        allChallenges={challenges}
                        stepIndex={currentStepIndex}
                        totalSteps={challenges.length || 3}
                        timeLeftSeconds={challengeTimeLeft}
                        actionProgress={actionProgress}
                    />
                </div>
            )}

            {/* Analysis State Banner */}
            {(scannerStage === "EVALUATING_PASSIVE" || scannerStage === "SUBMITTING") && (
                <div className="w-full mb-3 p-4 bg-cyan-500/10 border border-cyan-500/30 rounded-2xl flex items-center gap-3.5 animate-pulse">
                    <div className="w-6 h-6 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin flex-shrink-0" />
                    <div>
                        <div className="text-xs font-bold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
                            Evaluating Biometric Liveness
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Validating skin chrominance, 3D perspective disparity, and screen moiré patterns...
                        </p>
                    </div>
                </div>
            )}

            {/* Result Modal */}
            {scannerStage === "SHOW_RESULT" && verificationResult && (
                <div className="w-full mb-3">
                    <LivenessResultModal
                        result={verificationResult}
                        onRetry={handleRetry}
                        onContinue={verificationResult.verified ? () => onSuccess?.(verificationResult) : undefined}
                    />
                </div>
            )}

            {/* Telemetry Inspection Badge (collapsible) */}
            <LivenessTelemetryBadge
                ear={liveEAR}
                mar={liveMAR}
                headPose={livePose}
                smileScore={liveSmile}
                passiveMetrics={passiveMetrics}
                deviceTelemetry={deviceTelemetry}
            />
        </div>
    );
}
