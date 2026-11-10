// ==============================================================================
// Face Liveness: Active Challenge Detection & Geometry Math
// Computes EAR, MAR, Head Pose (Yaw, Pitch, Roll), Smile, and Alignment.
// ==============================================================================

import type * as faceapi from "@vladmandic/face-api";
import { LIVENESS_CONFIG } from "./config";
import type {
    HeadPose,
    FaceAlignmentStatus,
    LivenessChallengeType,
} from "./types";

/**
 * 2D Euclidean distance between two landmark points
 */
export function pointDistance(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
    return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

/**
 * Calculate Eye Aspect Ratio (EAR) for a single eye (6 points).
 * eye[0]=outer corner, eye[1]=top-outer, eye[2]=top-inner, eye[3]=inner corner, eye[4]=bottom-inner, eye[5]=bottom-outer
 */
export function calculateSingleEyeEAR(eye: faceapi.Point[]): number {
    if (eye.length < 6) return 0;
    const vertical1 = pointDistance(eye[1], eye[5]);
    const vertical2 = pointDistance(eye[2], eye[4]);
    const horizontal = pointDistance(eye[0], eye[3]);

    if (horizontal === 0) return 0;
    return (vertical1 + vertical2) / (2.0 * horizontal);
}

/**
 * Calculate average EAR across both left and right eyes
 */
export function calculateEyeAspectRatio(landmarks: faceapi.FaceLandmarks68): {
    leftEAR: number;
    rightEAR: number;
    avgEAR: number;
} {
    const leftEye = landmarks.getLeftEye();
    const rightEye = landmarks.getRightEye();

    const leftEAR = calculateSingleEyeEAR(leftEye);
    const rightEAR = calculateSingleEyeEAR(rightEye);
    const avgEAR = (leftEAR + rightEAR) / 2.0;

    return {
        leftEAR: Number(leftEAR.toFixed(3)),
        rightEAR: Number(rightEAR.toFixed(3)),
        avgEAR: Number(avgEAR.toFixed(3)),
    };
}

/**
 * Calculate Mouth Aspect Ratio (MAR) for mouth opening detection.
 * Outer lips: p48 (left corner), p54 (right corner), p51 (upper center), p57 (lower center)
 * Inner lips: p62 (top), p66 (bottom)
 */
export function calculateMouthAspectRatio(landmarks: faceapi.FaceLandmarks68): number {
    const pts = landmarks.positions;
    // Outer lip vertical points: (50, 58), (51, 57), (52, 56)
    const v1 = pointDistance(pts[50], pts[58]);
    const v2 = pointDistance(pts[51], pts[57]);
    const v3 = pointDistance(pts[52], pts[56]);
    // Horizontal width: corners (48, 54)
    const h = pointDistance(pts[48], pts[54]);

    if (h === 0) return 0;
    const mar = (v1 + v2 + v3) / (3.0 * h);
    return Number(mar.toFixed(3));
}

/**
 * Head Pose Estimation (Yaw, Pitch, Roll) in degrees using 68 2D landmarks.
 * Canonical geometry references:
 * - Nose tip: pt 30
 * - Chin: pt 8
 * - Outer eye corners: pt 36 (right), pt 45 (left)
 * - Inner eye corners: pt 39 (right), pt 42 (left)
 * - Mouth corners: pt 48, pt 54
 */
export function estimateHeadPose(landmarks: faceapi.FaceLandmarks68): HeadPose {
    const pts = landmarks.positions;

    const noseTip = pts[30];
    const chin = pts[8];
    const leftEyeOuter = pts[45];
    const rightEyeOuter = pts[36];

    // Midpoint between eye corners
    const midEyeX = (leftEyeOuter.x + rightEyeOuter.x) / 2;
    const midEyeY = (leftEyeOuter.y + rightEyeOuter.y) / 2;
    const eyeSpan = Math.hypot(leftEyeOuter.x - rightEyeOuter.x, leftEyeOuter.y - rightEyeOuter.y);

    if (eyeSpan === 0) {
        return { yaw: 0, pitch: 0, roll: 0 };
    }

    // 1. Yaw (Left / Right turn):
    // In frontal face, nose tip is centered between eyes.
    // As head turns, nose tip shifts towards the turned side with trigonometric foreshortening.
    // Note: Video is mirrored in webcam selfie view, so negative indicates user's left.
    const yawOffset = (noseTip.x - midEyeX) / (eyeSpan * 0.5);
    const yawDeg = Math.asin(Math.max(-1, Math.min(1, yawOffset))) * (180 / Math.PI);

    // 2. Pitch (Up / Down tilt):
    // Compare distance from mid-eye to nose tip vs distance from nose tip to chin.
    const eyeToNose = noseTip.y - midEyeY;
    const noseToChin = chin.y - noseTip.y;
    const pitchRatio = eyeToNose / (noseToChin + 1e-4);
    // Baseline frontal ratio is roughly 0.70 - 0.85
    const pitchDeg = (pitchRatio - 0.75) * 45;

    // 3. Roll (Head tilt left/right ear toward shoulder):
    const rollRad = Math.atan2(leftEyeOuter.y - rightEyeOuter.y, leftEyeOuter.x - rightEyeOuter.x);
    const rollDeg = rollRad * (180 / Math.PI);

    return {
        yaw: Number(yawDeg.toFixed(1)),
        pitch: Number(pitchDeg.toFixed(1)),
        roll: Number(rollDeg.toFixed(1)),
    };
}

/**
 * Detect Smile using facial landmarks geometry and expression confidence
 */
export function detectSmileStatus(
    landmarks: faceapi.FaceLandmarks68,
    expressions?: faceapi.FaceExpressions
): { isSmiling: boolean; score: number } {
    const pts = landmarks.positions;
    const leftCorner = pts[48];
    const rightCorner = pts[54];
    const upperLipCenter = pts[51];

    const leftEyeOuter = pts[45];
    const rightEyeOuter = pts[36];
    const eyeSpan = Math.hypot(leftEyeOuter.x - rightEyeOuter.x, leftEyeOuter.y - rightEyeOuter.y);

    // Mouth width relative to inter-eye distance
    const mouthWidth = Math.hypot(leftCorner.x - rightCorner.x, leftCorner.y - rightCorner.y);
    const widthRatio = mouthWidth / (eyeSpan + 1e-5);

    // Mouth corners elevation relative to upper lip center
    const avgCornerY = (leftCorner.y + rightCorner.y) / 2;
    const elevation = (upperLipCenter.y - avgCornerY) / (eyeSpan + 1e-5);

    // Neural net happiness score if available
    const happyProb = expressions?.happy ?? 0;

    // Geometric smile score combining width and elevation
    const geometricScore = Math.max(0, (widthRatio - 0.70) * 2.0 + elevation * 3.0);
    const combinedScore = happyProb > 0 ? (happyProb * 0.65 + geometricScore * 0.35) : geometricScore;

    const isSmiling =
        happyProb > LIVENESS_CONFIG.SMILE_EXPRESSION_THRESHOLD ||
        (widthRatio > LIVENESS_CONFIG.SMILE_WIDTH_EXPANSION_RATIO && elevation > -0.05);

    return {
        isSmiling,
        score: Number(Math.min(1.0, Math.max(0, combinedScore)).toFixed(3)),
    };
}

/**
 * Check Face Alignment & Positioning inside the capture frame.
 * Enforces single face, optimal distance, and centering.
 */
export function checkFaceAlignment(
    detection: faceapi.FaceDetection,
    videoWidth: number,
    videoHeight: number
): FaceAlignmentStatus {
    const box = detection.box;
    const boxRatio = box.width / videoWidth;

    const faceCenterX = box.x + box.width / 2;
    const faceCenterY = box.y + box.height / 2;

    const frameCenterX = videoWidth / 2;
    const frameCenterY = videoHeight / 2;

    const offsetX = Math.abs(faceCenterX - frameCenterX) / videoWidth;
    const offsetY = Math.abs(faceCenterY - frameCenterY) / videoHeight;

    const isCentered =
        offsetX <= LIVENESS_CONFIG.ALIGNMENT.CENTER_TOLERANCE_X &&
        offsetY <= LIVENESS_CONFIG.ALIGNMENT.CENTER_TOLERANCE_Y;

    const isGoodDistance =
        boxRatio >= LIVENESS_CONFIG.ALIGNMENT.MIN_FACE_WIDTH_RATIO &&
        boxRatio <= LIVENESS_CONFIG.ALIGNMENT.MAX_FACE_WIDTH_RATIO;

    let feedbackText = "Face centered";

    if (boxRatio < LIVENESS_CONFIG.ALIGNMENT.MIN_FACE_WIDTH_RATIO) {
        feedbackText = "Move closer to camera";
    } else if (boxRatio > LIVENESS_CONFIG.ALIGNMENT.MAX_FACE_WIDTH_RATIO) {
        feedbackText = "Move slightly further back";
    } else if (!isCentered) {
        feedbackText = "Center your face in the oval";
    }

    return {
        isFaceDetected: true,
        faceCount: 1,
        isCentered,
        isGoodDistance,
        boxRatio: Number(boxRatio.toFixed(3)),
        feedbackText,
    };
}

/**
 * Detect unnatural landmark displacement / teleportation between frames.
 * Signals splicing, frame cuts, or virtual media switching.
 */
export function detectLandmarkTeleportation(
    prev: faceapi.Point[] | null,
    curr: faceapi.Point[],
    faceWidth: number
): boolean {
    if (!prev || prev.length !== curr.length || faceWidth <= 0) return false;

    let maxDisplacement = 0;
    for (let i = 0; i < curr.length; i += 4) {
        const d = Math.hypot(curr[i].x - prev[i].x, curr[i].y - prev[i].y);
        if (d > maxDisplacement) maxDisplacement = d;
    }

    // If any key landmark jumped > 40% of the face bounding box in one frame, flag as anomaly
    return maxDisplacement / faceWidth > 0.40;
}

/**
 * Check whether a specific active challenge criteria is met in current frame
 */
export function evaluateChallengeFrame(
    challengeType: LivenessChallengeType,
    metrics: {
        ear: number;
        mar: number;
        pose: HeadPose;
        smileScore: number;
        isSmiling: boolean;
    }
): { isSatisfied: boolean; progress: number; currentMetric: number } {
    switch (challengeType) {
        case "BLINK": {
            // Evaluated via temporal state machine (eyes open -> closed -> open)
            const isClosed = metrics.ear < LIVENESS_CONFIG.EAR_CLOSED_THRESHOLD;
            const progress = isClosed ? 0.75 : metrics.ear < LIVENESS_CONFIG.EAR_OPEN_THRESHOLD ? 0.4 : 0.1;
            return { isSatisfied: isClosed, progress, currentMetric: metrics.ear };
        }

        case "TURN_LEFT": {
            // User turns to their left (yaw negative)
            const progress = Math.min(1.0, Math.max(0, -metrics.pose.yaw / LIVENESS_CONFIG.HEAD_YAW_THRESHOLD_DEG));
            const isSatisfied = metrics.pose.yaw <= -LIVENESS_CONFIG.HEAD_YAW_THRESHOLD_DEG;
            return { isSatisfied, progress, currentMetric: metrics.pose.yaw };
        }

        case "TURN_RIGHT": {
            // User turns to their right (yaw positive)
            const progress = Math.min(1.0, Math.max(0, metrics.pose.yaw / LIVENESS_CONFIG.HEAD_YAW_THRESHOLD_DEG));
            const isSatisfied = metrics.pose.yaw >= LIVENESS_CONFIG.HEAD_YAW_THRESHOLD_DEG;
            return { isSatisfied, progress, currentMetric: metrics.pose.yaw };
        }

        case "LOOK_UP": {
            const progress = Math.min(1.0, Math.max(0, -metrics.pose.pitch / Math.abs(LIVENESS_CONFIG.HEAD_PITCH_UP_THRESHOLD_DEG)));
            const isSatisfied = metrics.pose.pitch <= LIVENESS_CONFIG.HEAD_PITCH_UP_THRESHOLD_DEG;
            return { isSatisfied, progress, currentMetric: metrics.pose.pitch };
        }

        case "LOOK_DOWN": {
            const progress = Math.min(1.0, Math.max(0, metrics.pose.pitch / LIVENESS_CONFIG.HEAD_PITCH_DOWN_THRESHOLD_DEG));
            const isSatisfied = metrics.pose.pitch >= LIVENESS_CONFIG.HEAD_PITCH_DOWN_THRESHOLD_DEG;
            return { isSatisfied, progress, currentMetric: metrics.pose.pitch };
        }

        case "SMILE": {
            const progress = Math.min(1.0, metrics.smileScore / LIVENESS_CONFIG.SMILE_EXPRESSION_THRESHOLD);
            const isSatisfied = metrics.isSmiling || metrics.smileScore >= LIVENESS_CONFIG.SMILE_EXPRESSION_THRESHOLD;
            return { isSatisfied, progress, currentMetric: metrics.smileScore };
        }

        case "OPEN_MOUTH": {
            const progress = Math.min(1.0, metrics.mar / LIVENESS_CONFIG.MAR_OPEN_THRESHOLD);
            const isSatisfied = metrics.mar >= LIVENESS_CONFIG.MAR_OPEN_THRESHOLD;
            return { isSatisfied, progress, currentMetric: metrics.mar };
        }

        default:
            return { isSatisfied: false, progress: 0, currentMetric: 0 };
    }
}
