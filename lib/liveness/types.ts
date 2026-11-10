// ==============================================================================
// Face Liveness Detection & Anti-Spoofing: Core Types
// ==============================================================================

export type LivenessChallengeType =
    | "BLINK"
    | "TURN_LEFT"
    | "TURN_RIGHT"
    | "LOOK_UP"
    | "LOOK_DOWN"
    | "SMILE"
    | "OPEN_MOUTH";

export interface ChallengeStep {
    id: string;
    type: LivenessChallengeType;
    prompt: string;
    instruction: string;
    timeoutMs: number;
}

export interface ChallengeTelemetry {
    type: LivenessChallengeType;
    startedAt: number;
    completedAt: number;
    durationMs: number;
    peakValue: number;
    baselineValue: number;
    success: boolean;
}

export interface PassiveAnalysisMetrics {
    laplacianVariance: number;
    moireEnergy: number;
    colorDistribution: {
        chrominanceScore: number;
        specularHotspotRatio: number;
        saturationMean: number;
    };
    depthParallaxScore: number;
    microMotionVariance: number;
    fpsEstimated: number;
    overallPassiveScore: number;
    suspiciousFlags: string[];
}

export interface DeviceTelemetry {
    isVirtualCameraDetected: boolean;
    virtualCameraDrivers: string[];
    videoTrackLabel: string;
    resolution: { width: number; height: number };
    frameRateSetting?: number;
    facingMode?: string;
    userAgent: string;
}

export type VerificationDecision =
    | "VERIFIED"
    | "FAILED"
    | "SPOOF_DETECTED"
    | "INCONCLUSIVE"
    | "EXPIRED"
    | "RETRY_REQUIRED";

export interface LivenessSessionResponse {
    success: boolean;
    sessionToken?: string;
    sessionId?: string;
    challenges?: ChallengeStep[];
    expiresAt?: string;
    totalTimeoutMs?: number;
    message?: string;
}

export interface LivenessVerificationRequest {
    sessionToken: string;
    mode: "enroll" | "verify";
    challengeTelemetry: ChallengeTelemetry[];
    passiveMetrics: PassiveAnalysisMetrics;
    deviceTelemetry: DeviceTelemetry;
    descriptor: number[];
    imageBase64?: string;
}

export interface LivenessVerificationResult {
    decision: VerificationDecision;
    verified: boolean;
    message: string;
    distance?: number;
    passiveScore: number;
    confidence: number;
    spoofIndicators: string[];
    rejectionReason?: string;
    auditLogId?: string;
}

export interface HeadPose {
    yaw: number;     // Negative = Left, Positive = Right (degrees)
    pitch: number;   // Negative = Up, Positive = Down (degrees)
    roll: number;    // Tilt (degrees)
}

export interface FaceAlignmentStatus {
    isFaceDetected: boolean;
    faceCount: number;
    isCentered: boolean;
    isGoodDistance: boolean; // Not too close, not too far
    boxRatio: number;        // Face width / Video width
    feedbackText: string;
}

