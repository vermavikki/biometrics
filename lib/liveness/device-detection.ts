// ==============================================================================
// Face Liveness: Device & Virtual Camera Stream Detection
// Heuristic inspection of MediaStreamTrack, hardware labels, and device settings.
// ==============================================================================

import { LIVENESS_CONFIG } from "./config";
import type { DeviceTelemetry } from "./types";

/**
 * Inspect video stream, device enumerate labels, and track settings
 * to identify known virtual camera drivers and synthetic streams.
 */
export async function inspectDeviceAndCamera(stream: MediaStream): Promise<DeviceTelemetry> {
    const videoTrack = stream.getVideoTracks()[0];
    const settings = videoTrack ? videoTrack.getSettings() : {};
    const trackLabel = (videoTrack?.label || "").toLowerCase();

    let isVirtualCameraDetected = false;
    const detectedVirtualDrivers: string[] = [];

    // 1. Inspect active track label
    for (const signature of LIVENESS_CONFIG.KNOWN_VIRTUAL_CAMERAS) {
        if (trackLabel.includes(signature)) {
            isVirtualCameraDetected = true;
            detectedVirtualDrivers.push(signature);
        }
    }

    // 2. Query device enumeration (if permitted)
    if (typeof navigator !== "undefined" && navigator.mediaDevices?.enumerateDevices) {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoInputs = devices.filter((d) => d.kind === "videoinput");

            for (const input of videoInputs) {
                const label = input.label.toLowerCase();
                for (const signature of LIVENESS_CONFIG.KNOWN_VIRTUAL_CAMERAS) {
                    if (label.includes(signature) && !detectedVirtualDrivers.includes(signature)) {
                        detectedVirtualDrivers.push(signature);
                    }
                }
            }
        } catch {
            // Permission or enumeration blocked by browser policy
        }
    }

    return {
        isVirtualCameraDetected,
        virtualCameraDrivers: detectedVirtualDrivers,
        videoTrackLabel: videoTrack?.label || "Unknown Camera",
        resolution: {
            width: settings.width || 640,
            height: settings.height || 480,
        },
        frameRateSetting: settings.frameRate,
        facingMode: settings.facingMode,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "Server",
    };
}
