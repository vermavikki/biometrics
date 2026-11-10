"use client";

import React from "react";
import FaceLivenessScanner from "@/components/liveness/FaceLivenessScanner";

interface FaceScannerProps {
    mode: "enroll" | "verify";
    onSuccess?: () => void;
}

/**
 * FaceScanner: Modernized Face Scanner with Full Presentation Attack Detection (PAD),
 * Active Randomized Challenges, Passive Anti-Spoofing, and Server-Side Verification.
 */
export default function FaceScanner({ mode, onSuccess }: FaceScannerProps) {
    return (
        <FaceLivenessScanner
            mode={mode}
            onSuccess={() => {
                if (onSuccess) onSuccess();
            }}
        />
    );
}
