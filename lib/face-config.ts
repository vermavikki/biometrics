// ==============================================================================
// Face API & Neural Models Configuration
// ==============================================================================

import * as faceapi from "@vladmandic/face-api";

let modelsLoaded = false;
let modelLoadingPromise: Promise<void> | null = null;
let backendInitialized = false;
let backendInitPromise: Promise<string> | null = null;

// Local public directory model URL with fallback CDN
const LOCAL_MODEL_URL = "/models";
const CDN_MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/";

interface TfEngine {
    ready: () => Promise<void>;
    setBackend: (backend: string) => Promise<boolean>;
    getBackend: () => string;
    removeBackend?: (backend: string) => void;
}

/**
 * Explicitly initialize and await the TensorFlow.js execution backend.
 * Avoids: "Backend 'undefined' has not yet been initialized" and
 * "The highest priority backend 'wasm' has not yet been initialized".
 */
export async function initTfBackend(): Promise<string> {
    const tf = faceapi.tf as unknown as TfEngine | undefined;

    if (backendInitialized && tf) {
        return tf.getBackend();
    }
    if (backendInitPromise) {
        return backendInitPromise;
    }

    backendInitPromise = (async () => {
        if (typeof window === "undefined" || !tf) {
            return "server";
        }

        // 1. Deregister uninitialized wasm backend so it never preempts webgl/cpu
        if (typeof tf.removeBackend === "function") {
            try {
                tf.removeBackend("wasm");
            } catch {
                // Ignore if wasm was not registered
            }
        }

        // 2. Explicitly select WebGL for GPU acceleration (do NOT call findBackend before setBackend)
        try {
            await tf.setBackend("webgl");
        } catch (webglErr) {
            console.warn("[FaceAPI] WebGL not available, falling back to CPU backend:", webglErr);
            try {
                await tf.setBackend("cpu");
            } catch (cpuErr) {
                console.warn("[FaceAPI] CPU backend failed to set:", cpuErr);
            }
        }

        // 3. Await tf.ready() so the selected backend is guaranteed to be fully initialized
        try {
            await tf.ready();
        } catch (readyErr) {
            console.warn("[FaceAPI] tf.ready() error:", readyErr);
        }

        backendInitialized = true;
        const currentBackend = tf.getBackend ? tf.getBackend() : "unknown";
        console.log(`[FaceAPI] Execution backend active: ${currentBackend}`);
        return currentBackend;
    })();

    return await backendInitPromise;
}

export async function loadFaceModels(): Promise<void> {
    if (modelsLoaded) return;
    if (modelLoadingPromise) return modelLoadingPromise;

    modelLoadingPromise = (async () => {
        // 1. MUST initialize and await tf backend before calling any model loaders or inference
        await initTfBackend();

        // 2. Load models from local /models first, falling back to CDN if necessary
        try {
            await Promise.all([
                faceapi.nets.ssdMobilenetv1.loadFromUri(LOCAL_MODEL_URL),
                faceapi.nets.faceLandmark68Net.loadFromUri(LOCAL_MODEL_URL),
                faceapi.nets.faceRecognitionNet.loadFromUri(LOCAL_MODEL_URL),
                faceapi.nets.faceExpressionNet.loadFromUri(LOCAL_MODEL_URL),
            ]);
            modelsLoaded = true;
        } catch (localErr) {
            console.warn("Failed loading models from local /models, falling back to CDN:", localErr);
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
    await initTfBackend();
    return await faceapi
        .detectSingleFace(
            videoElement,
            new faceapi.SsdMobilenetv1Options({ minConfidence: 0.60 })
        )
        .withFaceLandmarks();
}

// Comprehensive multi-detection check to verify EXACTLY ONE face is present
export async function detectAllFacesWithLandmarks(videoElement: HTMLVideoElement) {
    await initTfBackend();
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
    await initTfBackend();
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
