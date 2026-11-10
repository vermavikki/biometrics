// ==============================================================================
// Face Liveness: Passive Analysis & Presentation Attack Detection (PAD)
// Analyzes texture, moiré artifacts, skin chrominance, specular glare,
// 3D perspective distortion, and involuntary micro-motion.
// ==============================================================================

import { LIVENESS_CONFIG } from "./config";
import type { PassiveAnalysisMetrics } from "./types";
import type * as faceapi from "@vladmandic/face-api";

/**
 * Extract pixel data for the detected face bounding box from a canvas or video frame
 */
export function extractFaceImageData(
    canvas: HTMLCanvasElement,
    box: { x: number; y: number; width: number; height: number }
): ImageData | null {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;

    // Constrain box within canvas dimensions
    const x = Math.max(0, Math.floor(box.x));
    const y = Math.max(0, Math.floor(box.y));
    const w = Math.min(canvas.width - x, Math.floor(box.width));
    const h = Math.min(canvas.height - y, Math.floor(box.height));

    if (w <= 10 || h <= 10) return null;

    return ctx.getImageData(x, y, w, h);
}

/**
 * 1. Compute discrete 2D Laplacian operator variance.
 * Real skin has natural micro-textures (pores, edges). Blurry printed paper or poor screens
 * display very low variance (< 45). Extreme subpixel grids display unnatural high variance (> 2200).
 */
export function computeLaplacianVariance(imageData: ImageData): number {
    const { width, height, data } = imageData;
    const gray = new Float32Array(width * height);

    // Fast RGB to grayscale conversion
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
        gray[j] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }

    let sum = 0;
    let sumSq = 0;
    let count = 0;

    // Apply 3x3 discrete Laplacian kernel: [0, 1, 0; 1, -4, 1; 0, 1, 0]
    for (let y = 1; y < height - 1; y++) {
        const row = y * width;
        const rowAbove = (y - 1) * width;
        const rowBelow = (y + 1) * width;

        for (let x = 1; x < width - 1; x++) {
            const lap =
                gray[rowAbove + x] +
                gray[rowBelow + x] +
                gray[row + (x - 1)] +
                gray[row + (x + 1)] -
                4.0 * gray[row + x];

            sum += lap;
            sumSq += lap * lap;
            count++;
        }
    }

    if (count === 0) return 0;
    const mean = sum / count;
    const variance = sumSq / count - mean * mean;

    return Math.max(0, variance);
}

/**
 * 2. Moiré Pattern & Screen Frequency Interference Detection.
 * Screen attacks exhibit high-frequency regular spatial oscillations resulting from
 * camera Bayer sensor vs display sub-pixel interference.
 */
export function computeMoireEnergy(imageData: ImageData): number {
    const { width, height, data } = imageData;
    if (width < 32 || height < 32) return 0;

    let highFreqEnergy = 0;
    let totalGrad = 0;
    let sampleCount = 0;

    // Check alternating second-order horizontal & vertical differences
    for (let y = 2; y < height - 2; y += 2) {
        for (let x = 2; x < width - 2; x += 2) {
            const idx = (y * width + x) * 4;
            const idxLeft = (y * width + (x - 2)) * 4;
            const idxRight = (y * width + (x + 2)) * 4;

            // Compute luminance difference
            const lCenter = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
            const lLeft = 0.299 * data[idxLeft] + 0.587 * data[idxLeft + 1] + 0.114 * data[idxLeft + 2];
            const lRight = 0.299 * data[idxRight] + 0.587 * data[idxRight + 1] + 0.114 * data[idxRight + 2];

            const diff = Math.abs(lLeft + lRight - 2 * lCenter);
            highFreqEnergy += diff;
            totalGrad += Math.abs(lRight - lLeft);
            sampleCount++;
        }
    }

    if (sampleCount === 0 || totalGrad === 0) return 0;

    // Ratio of high frequency resonance to overall gradient
    const ratio = highFreqEnergy / (totalGrad + 1e-5);
    return Math.min(1.0, ratio / 2.0);
}

/**
 * 3. Color Gamut & Specular Hotspot Analysis (YCrCb and HSV).
 * Skin pixels cluster within a specific chromatic envelope (Cr: 133-173, Cb: 77-127).
 * Displays or paper prints frequently violate this distribution or display sharp specular glass glare.
 */
export function analyzeColorAndReflection(imageData: ImageData): {
    chrominanceScore: number;
    specularHotspotRatio: number;
    saturationMean: number;
} {
    const { data } = imageData;
    const pixelCount = data.length / 4;
    if (pixelCount === 0) {
        return { chrominanceScore: 0, specularHotspotRatio: 0, saturationMean: 0 };
    }

    let skinPixelMatches = 0;
    let specularHotspotPixels = 0;
    let saturationSum = 0;

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // Check for blown-out specular reflection (typical screen/glass flare)
        if (r > 248 && g > 248 && b > 248) {
            specularHotspotPixels++;
        }

        // YCrCb conversion
        const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
        const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

        // Human skin tone cluster
        if (cr >= 130 && cr <= 175 && cb >= 75 && cb <= 130) {
            skinPixelMatches++;
        }

        // Saturation estimate
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const sat = max === 0 ? 0 : (max - min) / max;
        saturationSum += sat;
    }

    const chrominanceScore = skinPixelMatches / pixelCount;
    const specularHotspotRatio = specularHotspotPixels / pixelCount;
    const saturationMean = saturationSum / pixelCount;

    return {
        chrominanceScore,
        specularHotspotRatio,
        saturationMean,
    };
}

/**
 * 4. 3D Perspective Parallax Consistency.
 * A 2D flat photo held up and turned undergoes linear affine scaling.
 * A real 3D human head experiences non-linear cosine foreshortening and depth parallax.
 */
export function compute3DParallaxScore(
    landmarks: faceapi.FaceLandmarks68,
    yawAngleDeg: number
): number {
    const pts = landmarks.positions;
    const noseTip = pts[30];
    const leftEyeOuter = pts[45];
    const rightEyeOuter = pts[36];

    const leftDist = Math.hypot(leftEyeOuter.x - noseTip.x, leftEyeOuter.y - noseTip.y);
    const rightDist = Math.hypot(rightEyeOuter.x - noseTip.x, rightEyeOuter.y - noseTip.y);
    const totalDist = leftDist + rightDist;

    if (totalDist === 0) return 0.5;

    // Disparity ratio between left and right side of face
    const asymmetry = Math.abs(leftDist - rightDist) / totalDist;
    const expectedAsymmetry = Math.sin((Math.abs(yawAngleDeg) * Math.PI) / 180);

    // If head turned, check if 3D perspective distortion matches rotation
    if (Math.abs(yawAngleDeg) > 10) {
        const diff = Math.abs(asymmetry - expectedAsymmetry);
        // Score close to 1.0 when geometric projection matches natural 3D head rotation
        return Math.max(0, 1.0 - diff * 1.5);
    }

    return 0.85; // Default for frontal pose
}

/**
 * 5. Involuntary Micro-Motion Analysis.
 * Real living humans exhibit micro-tremors and natural micro-saccades.
 * A completely static photograph (held on a stick or taped) has absolute zero landmark variance.
 */
export function computeMicroMotionVariance(
    history: Array<{ x: number; y: number }[]>
): number {
    if (history.length < 5) return 0.05;

    let totalVariance = 0;
    const numPoints = history[0].length;

    // Check variance of landmark positions across recent frames
    for (let p = 0; p < numPoints; p += 4) { // Sample every 4th point for speed
        let sumX = 0;
        let sumY = 0;
        let sumX2 = 0;
        let sumY2 = 0;
        const n = history.length;

        for (let f = 0; f < n; f++) {
            const pt = history[f][p];
            sumX += pt.x;
            sumY += pt.y;
            sumX2 += pt.x * pt.x;
            sumY2 += pt.y * pt.y;
        }

        const varX = sumX2 / n - (sumX / n) * (sumX / n);
        const varY = sumY2 / n - (sumY / n) * (sumY / n);
        totalVariance += Math.sqrt(Math.max(0, varX + varY));
    }

    return totalVariance / (numPoints / 4);
}

/**
 * Complete Passive Liveness Evaluation function.
 * Evaluates all signals and returns overall score [0..1] and suspicious flags.
 */
export function evaluatePassiveSignals(
    imageData: ImageData,
    landmarks: faceapi.FaceLandmarks68,
    yawAngle: number,
    landmarkHistory: Array<{ x: number; y: number }[]>,
    fps: number
): PassiveAnalysisMetrics {
    const laplacian = computeLaplacianVariance(imageData);
    const moire = computeMoireEnergy(imageData);
    const color = analyzeColorAndReflection(imageData);
    const depthParallax = compute3DParallaxScore(landmarks, yawAngle);
    const microMotion = computeMicroMotionVariance(landmarkHistory);

    const suspiciousFlags: string[] = [];

    // 1. Texture Check
    if (laplacian < LIVENESS_CONFIG.PASSIVE.LAPLACIAN_MIN_NATURAL) {
        suspiciousFlags.push("LOW_TEXTURE_BLURRY_OR_PRINT");
    } else if (laplacian > LIVENESS_CONFIG.PASSIVE.LAPLACIAN_MAX_SCREEN_LATTICE) {
        suspiciousFlags.push("ARTIFICIAL_PIXEL_LATTICE_DETECTED");
    }

    // 2. Moiré Artifact Check
    if (moire > LIVENESS_CONFIG.PASSIVE.MOIRE_MAX_TOLERANCE) {
        suspiciousFlags.push("SCREEN_MOIRE_PATTERN_DETECTED");
    }

    // 3. Color & Reflection
    if (color.chrominanceScore < LIVENESS_CONFIG.PASSIVE.CHROMINANCE_MIN_SKIN_RATIO) {
        suspiciousFlags.push("UNNATURAL_SKIN_CHROMINANCE");
    }
    if (color.specularHotspotRatio > LIVENESS_CONFIG.PASSIVE.SPECULAR_HOTSPOT_MAX_RATIO) {
        suspiciousFlags.push("SCREEN_SPECULAR_GLARE");
    }

    // 4. Involuntary motion
    if (landmarkHistory.length >= 8 && microMotion < LIVENESS_CONFIG.PASSIVE.MIN_MICRO_MOTION_VARIANCE) {
        suspiciousFlags.push("ZERO_INVOLUNTARY_MOTION_STATIC_IMAGE");
    }

    // 5. Compute combined passive score (0.0 to 1.0)
    let textureScore = 1.0;
    if (laplacian < LIVENESS_CONFIG.PASSIVE.LAPLACIAN_MIN_NATURAL) {
        textureScore = Math.max(0.2, laplacian / LIVENESS_CONFIG.PASSIVE.LAPLACIAN_MIN_NATURAL);
    } else if (laplacian > LIVENESS_CONFIG.PASSIVE.LAPLACIAN_MAX_SCREEN_LATTICE) {
        textureScore = Math.max(0.3, 1.0 - (laplacian - LIVENESS_CONFIG.PASSIVE.LAPLACIAN_MAX_SCREEN_LATTICE) / 1000);
    }

    const moireScore = Math.max(0, 1.0 - moire * 0.9);
    const colorScore = Math.min(1.0, color.chrominanceScore * 1.5);
    const reflectionPenalty = color.specularHotspotRatio > 0.15 ? 0.7 : 1.0;

    const overallPassiveScore = Math.max(
        0,
        Math.min(
            1.0,
            (textureScore * 0.35 +
                moireScore * 0.25 +
                colorScore * 0.20 +
                depthParallax * 0.20) *
            reflectionPenalty
        )
    );

    return {
        laplacianVariance: Number(laplacian.toFixed(1)),
        moireEnergy: Number(moire.toFixed(3)),
        colorDistribution: {
            chrominanceScore: Number(color.chrominanceScore.toFixed(3)),
            specularHotspotRatio: Number(color.specularHotspotRatio.toFixed(3)),
            saturationMean: Number(color.saturationMean.toFixed(3)),
        },
        depthParallaxScore: Number(depthParallax.toFixed(3)),
        microMotionVariance: Number(microMotion.toFixed(4)),
        fpsEstimated: Number(fps.toFixed(1)),
        overallPassiveScore: Number(overallPassiveScore.toFixed(3)),
        suspiciousFlags,
    };
}
