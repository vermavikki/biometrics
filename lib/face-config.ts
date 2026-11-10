// ==============================================================================
// Face API & Neural Models Configuration
// ==============================================================================

import * as faceapi from "@vladmandic/face-api";

let modelsLoaded = false;
let modelLoadingPromise: Promise<void> | null = null;

// Local public directory model URL with fallback CDN
const LOCAL_MODEL_URL = "/models";
const CDN_MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/";

export async function loadFaceModels(): Promise<void> {
    if (modelsLoaded) return;
    if (modelLoadingPromise) return modelLoadingPromise;

    modelLoadingPromise = (async () => {
        try {
            // Attempt loading from local public directory first (fast & offline)
            await Promise.all([
                faceapi.nets.ssdMobilenetv1.loadFromUri(LOCAL_MODEL_URL),
                faceapi.nets.faceLandmark68Net.loadFromUri(LOCAL_MODEL_URL),
                faceapi.nets.faceRecognitionNet.loadFromUri(LOCAL_MODEL_URL),
                faceapi.nets.faceExpressionNet.loadFromUri(LOCAL_MODEL_URL),
            ]);
            modelsLoaded = true;
        } catch (localErr) {
            console.warn("Failed loading models from local /models, falling back to CDN:", localErr);
            // Fallback to CDN
            await Promise.all([
                faceapi.nets.ssdMobilenetv1.loadFromUri(CDN_MODEL_URL),
                faceapi.nets.faceLandmark68Net.loadFromUri(CDN_MODEL_URL),
                faceapi.nets.faceRecognitionNet.loadFromUri(CDN_MODEL_URL),
                faceapi.nets.faceExpressionNet.loadFromUri(CDN_MODEL_URL),
            ]);
            modelsLoaded = true;
        }
    })();

    await modelLoadingPromise;
}

// Calculate 2D Euclidean distance between two facial landmark points
export function pointDistance(p1: faceapi.Point, p2: faceapi.Point): number {
    return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

// Compute Eye Aspect Ratio (EAR) for a single 6-point eye array
export function calculateSingleEyeEAR(eye: faceapi.Point[]): number {
    const vertical1 = pointDistance(eye[1], eye[5]);
    const vertical2 = pointDistance(eye[2], eye[4]);
    const horizontal = pointDistance(eye[0], eye[3]);

    if (horizontal === 0) return 0;
    return (vertical1 + vertical2) / (2.0 * horizontal);
}

// Average EAR across both left and right eyes
export function getAverageEAR(landmarks: faceapi.FaceLandmarks68): number {
    const leftEye = landmarks.getLeftEye();
    const rightEye = landmarks.getRightEye();

    const leftEAR = calculateSingleEyeEAR(leftEye);
    const rightEAR = calculateSingleEyeEAR(rightEye);

    return (leftEAR + rightEAR) / 2.0;
}

// Lightweight frame check used inside the real-time liveness loop
export async function detectLandmarksOnly(videoElement: HTMLVideoElement) {
    return await faceapi
        .detectSingleFace(
            videoElement,
            new faceapi.SsdMobilenetv1Options({ minConfidence: 0.60 })
        )
        .withFaceLandmarks();
}

// Comprehensive multi-detection check to verify EXACTLY ONE face is present
export async function detectAllFacesWithLandmarks(videoElement: HTMLVideoElement) {
    return await faceapi
        .detectAllFaces(
            videoElement,
            new faceapi.SsdMobilenetv1Options({ minConfidence: 0.55 })
        )
        .withFaceLandmarks()
        .withFaceExpressions();
}

// Full extraction called upon verification completion
export async function extractFaceData(videoElement: HTMLVideoElement) {
    const detection = await faceapi
        .detectSingleFace(
            videoElement,
            new faceapi.SsdMobilenetv1Options({ minConfidence: 0.70 })
        )
        .withFaceLandmarks()
        .withFaceExpressions()
        .withFaceDescriptor();

    if (!detection) {
        throw new Error("Face lost during capture. Please stay still and try again.");
    }

    const canvas = document.createElement("canvas");
    canvas.width = videoElement.videoWidth || 640;
    canvas.height = videoElement.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (ctx) {
        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    }
    const imageBase64 = canvas.toDataURL("image/jpeg", 0.85);

    return {
        detection,
        descriptor: Array.from(detection.descriptor),
        imageBase64,
        canvas,
    };
}
