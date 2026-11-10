"use client";

import React from "react";
import FaceLivenessScanner from "@/components/liveness/FaceLivenessScanner";
import type { UserRegistrationData, LivenessVerificationResult } from "@/lib/liveness/types";

interface FaceScannerProps {
    mode: "enroll" | "verify";
    registrationData?: UserRegistrationData;
    onSuccess?: (result: LivenessVerificationResult) => void;
    onFailure?: (result: LivenessVerificationResult) => void;
}

/**
 * FaceScanner: Modernized Face Scanner with Full Presentation Attack Detection (PAD),
 * Active Randomized Challenges, Passive Anti-Spoofing, and Server-Side Verification.
 */
export default function FaceScanner({
    mode,
    registrationData,
    onSuccess,
    onFailure,
}: FaceScannerProps) {
    return (
        <FaceLivenessScanner
            mode={mode}
            registrationData={registrationData}
            onSuccess={onSuccess}
            onFailure={onFailure}
        />
    );
}

