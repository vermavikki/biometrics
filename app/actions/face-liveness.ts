"use server";

import crypto from "crypto";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { LIVENESS_CONFIG } from "@/lib/liveness/config";
import type {
    ChallengeStep,
    LivenessChallengeType,
    LivenessSessionResponse,
    LivenessVerificationRequest,
    LivenessVerificationResult,
    VerificationDecision,
    UserRegistrationData,
    UserProfileSummary,
} from "@/lib/liveness/types";

// In-memory fallback session store for development or environments where migration is pending
const memorySessions = new Map<
    string,
    {
        sessionId: string;
        sessionToken: string;
        mode: "enroll" | "verify";
        userId: string | null;
        challenges: ChallengeStep[];
        expiresAt: number;
        status: string;
        used: boolean;
    }
>();

// In-memory registered user face profiles store (ensures 100% reliable local testbench & offline demo)
interface EnrolledUserRecord {
    userId: string;
    fullName: string;
    email: string;
    phone: string;
    embedding: number[];
    imagePath?: string;
    createdAt: number;
}
const memoryRegisteredUsers = new Map<string, EnrolledUserRecord>();

function calculateEuclideanDistance(vecA: number[], vecB: number[]): number {
    let sum = 0;
    const len = Math.min(vecA.length, vecB.length);
    for (let i = 0; i < len; i++) {
        const diff = vecA[i] - vecB[i];
        sum += diff * diff;
    }
    return Math.sqrt(sum);
}

// In-memory rate limiting tracker fallback
const memoryRateLimits = new Map<string, { attempts: number; lockedUntil: number }>();

const ALL_CHALLENGES: Array<{
    type: LivenessChallengeType;
    prompt: string;
    instruction: string;
}> = [
    {
        type: "BLINK",
        prompt: "Blink your eyes",
        instruction: "Please blink naturally once or twice.",
    },
    {
        type: "TURN_LEFT",
        prompt: "Turn head left",
        instruction: "Slowly turn your head to your left.",
    },
    {
        type: "TURN_RIGHT",
        prompt: "Turn head right",
        instruction: "Slowly turn your head to your right.",
    },
    {
        type: "LOOK_UP",
        prompt: "Look upward",
        instruction: "Tilt your head slightly upward.",
    },
    {
        type: "LOOK_DOWN",
        prompt: "Look downward",
        instruction: "Tilt your head slightly downward.",
    },
    {
        type: "SMILE",
        prompt: "Smile naturally",
        instruction: "Give a natural smile to the camera.",
    },
    {
        type: "OPEN_MOUTH",
        prompt: "Open your mouth",
        instruction: "Open your mouth slightly, then close it.",
    },
];

/**
 * Generate cryptographically random challenges for a verification session
 */
function generateRandomChallenges(count: number = 3): ChallengeStep[] {
    // Cryptographically shuffle challenges
    const pool = [...ALL_CHALLENGES];
    const selected: ChallengeStep[] = [];

    while (selected.length < count && pool.length > 0) {
        const randomIndex = crypto.randomInt(0, pool.length);
        const item = pool.splice(randomIndex, 1)[0];
        selected.push({
            id: crypto.randomUUID(),
            type: item.type,
            prompt: item.prompt,
            instruction: item.instruction,
            timeoutMs: LIVENESS_CONFIG.CHALLENGE_TIMEOUT_MS,
        });
    }

    return selected;
}

/**
 * Server Action: Initiate a new Face Liveness Verification Session
 */
export async function createLivenessSessionAction(options: {
    mode: "enroll" | "verify";
}): Promise<LivenessSessionResponse> {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    const userId = user?.id ?? null;
    const rateLimitKey = userId || "anonymous-ip";

    // 1. Rate limiting check
    const now = Date.now();
    const memLimit = memoryRateLimits.get(rateLimitKey);
    if (memLimit && memLimit.lockedUntil > now) {
        const waitMinutes = Math.ceil((memLimit.lockedUntil - now) / 60000);
        return {
            success: false,
            message: `Account temporarily locked due to repeated failed attempts. Please retry in ${waitMinutes} minutes.`,
        };
    }

    // 2. Generate random challenge sequence and session tokens
    const sessionId = crypto.randomUUID();
    const sessionToken = crypto.randomBytes(32).toString("hex");
    const challenges = generateRandomChallenges(LIVENESS_CONFIG.REQUIRED_CHALLENGE_COUNT);
    const expiresAtMs = now + LIVENESS_CONFIG.SESSION_LIFETIME_MS;
    const expiresAtIso = new Date(expiresAtMs).toISOString();

    // 3. Persist session in Supabase (with in-memory backup)
    try {
        await supabase.from("face_verification_sessions").insert({
            id: sessionId,
            user_id: userId,
            session_token: sessionToken,
            mode: options.mode,
            challenges,
            current_step: 0,
            status: "PENDING",
            expires_at: expiresAtIso,
        });
    } catch (dbErr) {
        console.warn("Could not write session to Supabase database (migration may be pending):", dbErr);
    }

    // Always maintain memory fallback for zero-downtime reliability
    memorySessions.set(sessionToken, {
        sessionId,
        sessionToken,
        mode: options.mode,
        userId,
        challenges,
        expiresAt: expiresAtMs,
        status: "PENDING",
        used: false,
    });

    return {
        success: true,
        sessionId,
        sessionToken,
        challenges,
        expiresAt: expiresAtIso,
        totalTimeoutMs: LIVENESS_CONFIG.SESSION_LIFETIME_MS,
        message: "Liveness verification session initialized.",
    };
}

/**
 * Server Action: Finalize and verify the Liveness Session
 * Centralized Verification Decision Engine
 */
export async function verifyLivenessSessionAction(
    request: LivenessVerificationRequest
): Promise<LivenessVerificationResult> {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    const {
        sessionToken,
        mode,
        challengeTelemetry,
        passiveMetrics,
        deviceTelemetry,
        descriptor,
        imageBase64,
    } = request;

    const spoofIndicators: string[] = [];
    const now = Date.now();

    // --------------------------------------------------------------------------
    // 1. Session Validation & Replay Prevention
    // --------------------------------------------------------------------------
    let session = memorySessions.get(sessionToken);

    // Also check Supabase DB for session
    if (!session) {
        const { data: dbSession } = await supabase
            .from("face_verification_sessions")
            .select("*")
            .eq("session_token", sessionToken)
            .maybeSingle();

        if (dbSession) {
            session = {
                sessionId: dbSession.id,
                sessionToken: dbSession.session_token,
                mode: dbSession.mode,
                userId: dbSession.user_id,
                challenges: dbSession.challenges,
                expiresAt: new Date(dbSession.expires_at).getTime(),
                status: dbSession.status,
                used: dbSession.status !== "PENDING" && dbSession.status !== "IN_PROGRESS",
            };
        }
    }

    if (!session) {
        return {
            decision: "FAILED",
            verified: false,
            message: "Invalid session token. Please start a new verification.",
            passiveScore: 0,
            confidence: 0,
            spoofIndicators: ["UNKNOWN_SESSION_TOKEN"],
            rejectionReason: "Session does not exist or has been invalidated.",
        };
    }

    if (session.used || session.status === "COMPLETED") {
        return {
            decision: "FAILED",
            verified: false,
            message: "Replay attack detected: This challenge session has already been used.",
            passiveScore: 0,
            confidence: 0,
            spoofIndicators: ["CHALLENGE_REPLAY_ATTEMPT"],
            rejectionReason: "One-time session token has already been consumed.",
        };
    }

    // Check expiration
    if (now > session.expiresAt) {
        session.status = "EXPIRED";
        session.used = true;
        return {
            decision: "EXPIRED",
            verified: false,
            message: "Liveness verification session expired. Please retry.",
            passiveScore: passiveMetrics?.overallPassiveScore || 0,
            confidence: 0,
            spoofIndicators: ["SESSION_EXPIRED"],
            rejectionReason: "Verification was not completed within the time limit.",
        };
    }

    // Invalidate session immediately to prevent parallel reuse
    session.used = true;

    // --------------------------------------------------------------------------
    // 2. Active Challenge Sequence Validation
    // --------------------------------------------------------------------------
    const expectedChallenges = session.challenges;

    if (!challengeTelemetry || challengeTelemetry.length < expectedChallenges.length) {
        return {
            decision: "FAILED",
            verified: false,
            message: "Incomplete challenge sequence. All requested actions must be performed.",
            passiveScore: passiveMetrics?.overallPassiveScore || 0,
            confidence: 0,
            spoofIndicators: ["INCOMPLETE_CHALLENGES"],
            rejectionReason: "User failed to complete all active challenges.",
        };
    }

    // Verify challenges were executed in exact requested order
    for (let i = 0; i < expectedChallenges.length; i++) {
        const expected = expectedChallenges[i];
        const performed = challengeTelemetry[i];

        if (performed.type !== expected.type) {
            return {
                decision: "FAILED",
                verified: false,
                message: `Challenge sequence violation. Expected ${expected.type} but got ${performed.type}.`,
                passiveScore: passiveMetrics?.overallPassiveScore || 0,
                confidence: 0,
                spoofIndicators: ["CHALLENGE_SEQUENCE_VIOLATION"],
                rejectionReason: "The active challenges were not executed in the correct sequence.",
            };
        }

        if (!performed.success) {
            return {
                decision: "FAILED",
                verified: false,
                message: `Challenge '${expected.prompt}' was not completed successfully.`,
                passiveScore: passiveMetrics?.overallPassiveScore || 0,
                confidence: 0,
                spoofIndicators: ["CHALLENGE_UNSATISFIED"],
                rejectionReason: `Action ${expected.type} was not confirmed.`,
            };
        }

        // Validate biological duration realism
        if (expected.type === "BLINK") {
            if (
                performed.durationMs < LIVENESS_CONFIG.BLINK_MIN_DURATION_MS ||
                performed.durationMs > LIVENESS_CONFIG.BLINK_MAX_DURATION_MS
            ) {
                spoofIndicators.push("UNNATURAL_BLINK_DURATION");
            }
        }
    }

    // --------------------------------------------------------------------------
    // 3. Passive Anti-Spoofing & Presentation Attack Detection (PAD)
    // --------------------------------------------------------------------------
    if (passiveMetrics) {
        if (passiveMetrics.suspiciousFlags && passiveMetrics.suspiciousFlags.length > 0) {
            spoofIndicators.push(...passiveMetrics.suspiciousFlags);
        }

        // Texture / Laplacian check
        if (passiveMetrics.laplacianVariance < LIVENESS_CONFIG.PASSIVE.LAPLACIAN_MIN_NATURAL) {
            spoofIndicators.push("SUSPICIOUS_LOW_TEXTURE_PRINT");
        } else if (passiveMetrics.laplacianVariance > LIVENESS_CONFIG.PASSIVE.LAPLACIAN_MAX_SCREEN_LATTICE) {
            spoofIndicators.push("SCREEN_PIXEL_GRID_LATTICE");
        }

        // Moiré display artifacts
        if (passiveMetrics.moireEnergy > LIVENESS_CONFIG.PASSIVE.MOIRE_MAX_TOLERANCE) {
            spoofIndicators.push("HIGH_FREQUENCY_DISPLAY_MOIRE");
        }

        // Glass screen reflection
        if (
            passiveMetrics.colorDistribution.specularHotspotRatio >
            LIVENESS_CONFIG.PASSIVE.SPECULAR_HOTSPOT_MAX_RATIO
        ) {
            spoofIndicators.push("UNNATURAL_SPECULAR_SCREEN_GLARE");
        }
    }

    // --------------------------------------------------------------------------
    // 4. Virtual Camera & Stream Integrity Inspection
    // --------------------------------------------------------------------------
    if (deviceTelemetry?.isVirtualCameraDetected) {
        spoofIndicators.push(
            `VIRTUAL_CAMERA_DRIVER_FLAGGED: ${deviceTelemetry.virtualCameraDrivers.join(", ")}`
        );
    }

    // --------------------------------------------------------------------------
    // 5. Verification Decision Engine Gate
    // --------------------------------------------------------------------------
    const passiveScore = passiveMetrics?.overallPassiveScore ?? 0.8;
    const hasCriticalSpoof =
        spoofIndicators.includes("HIGH_FREQUENCY_DISPLAY_MOIRE") ||
        spoofIndicators.includes("SCREEN_PIXEL_GRID_LATTICE") ||
        spoofIndicators.includes("ZERO_INVOLUNTARY_MOTION_STATIC_IMAGE") ||
        spoofIndicators.includes("CHALLENGE_SEQUENCE_VIOLATION");

    let decision: VerificationDecision = "VERIFIED";
    let rejectionReason: string | undefined;

    if (hasCriticalSpoof || spoofIndicators.length >= 2) {
        decision = "SPOOF_DETECTED";
        rejectionReason = `Presentation attack indicators detected: ${spoofIndicators.join(", ")}`;
    } else if (passiveScore < LIVENESS_CONFIG.PASSIVE.MIN_ACCEPTABLE_PASSIVE_SCORE) {
        decision = "INCONCLUSIVE";
        rejectionReason = "Passive liveness confidence below acceptable security threshold. Check lighting and camera quality.";
    }

    // --------------------------------------------------------------------------
    // 6. Identity Matching or Enrollment (if not spoofed)
    // --------------------------------------------------------------------------
    let matchDistance: number | undefined;
    let userProfileSummary: UserProfileSummary | undefined;

    if (decision === "VERIFIED") {
        if (!descriptor || descriptor.length !== 128) {
            return {
                decision: "FAILED",
                verified: false,
                message: "Invalid facial embedding vector format.",
                passiveScore,
                confidence: 0,
                spoofIndicators,
                rejectionReason: "Descriptor length mismatch (expected 128-D).",
            };
        }

        if (mode === "verify") {
            const vectorString = `[${descriptor.join(",")}]`;
            let matchFound = false;

            // 1. Try Supabase verify_user_face RPC (pgvector cosine/euclidean distance)
            try {
                const { data: matchData, error: matchError } = await supabase.rpc(
                    "verify_user_face",
                    {
                        candidate_embedding: vectorString,
                        match_threshold: LIVENESS_CONFIG.MATCH_DISTANCE_THRESHOLD,
                    }
                );

                if (!matchError && matchData && matchData.length > 0) {
                    const matchRow = matchData[0];
                    matchDistance = Number(matchRow.distance.toFixed(4));
                    if (matchRow.is_match) {
                        matchFound = true;
                        userProfileSummary = {
                            userId: matchRow.user_id,
                            fullName: matchRow.full_name || "Verified User",
                            email: matchRow.email,
                            phone: matchRow.phone,
                        };
                    }
                }
            } catch (rpcErr) {
                console.warn("[FaceLiveness] verify_user_face RPC error, checking memory fallback:", rpcErr);
            }

            // 2. Memory fallback for local development or pending Supabase migration
            if (!matchFound && memoryRegisteredUsers.size > 0) {
                let bestDistance = Infinity;
                let bestUser: EnrolledUserRecord | null = null;

                for (const record of memoryRegisteredUsers.values()) {
                    const dist = calculateEuclideanDistance(record.embedding, descriptor);
                    if (dist < bestDistance) {
                        bestDistance = dist;
                        bestUser = record;
                    }
                }

                if (bestUser && bestDistance <= LIVENESS_CONFIG.MATCH_DISTANCE_THRESHOLD) {
                    matchFound = true;
                    matchDistance = Number(bestDistance.toFixed(4));
                    userProfileSummary = {
                        userId: bestUser.userId,
                        fullName: bestUser.fullName,
                        email: bestUser.email,
                        phone: bestUser.phone,
                    };
                }
            }

            if (!matchFound) {
                decision = "FAILED";
                rejectionReason = "Biometric identification failed: Face does not match any registered profile.";
            }
        } else if (mode === "enroll") {
            // Check if user is registering new profile with name, email, and phone
            if (request.registrationData) {
                const reg = request.registrationData;
                const fullName = reg.fullName?.trim() || "";
                const email = reg.email?.trim().toLowerCase() || "";
                const phone = reg.phone?.trim() || "";

                if (!fullName || fullName.length < 2) {
                    return {
                        decision: "FAILED",
                        verified: false,
                        message: "Registration failed: Please enter a valid full name (at least 2 characters).",
                        passiveScore,
                        confidence: 0,
                        spoofIndicators: ["INVALID_REGISTRATION_DATA"],
                        rejectionReason: "Full name must be at least 2 characters.",
                    };
                }

                if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                    return {
                        decision: "FAILED",
                        verified: false,
                        message: "Registration failed: Please enter a valid email address.",
                        passiveScore,
                        confidence: 0,
                        spoofIndicators: ["INVALID_REGISTRATION_DATA"],
                        rejectionReason: "Invalid email format.",
                    };
                }

                if (!phone || phone.replace(/\D/g, "").length < 7) {
                    return {
                        decision: "FAILED",
                        verified: false,
                        message: "Registration failed: Please enter a valid phone number (at least 7 digits).",
                        passiveScore,
                        confidence: 0,
                        spoofIndicators: ["INVALID_REGISTRATION_DATA"],
                        rejectionReason: "Invalid phone number format.",
                    };
                }

                let registeredUserId = user?.id || crypto.randomUUID();

                // 1. Create or register user in Supabase Auth if admin credentials present
                try {
                    const adminClient = createAdminClient();
                    if (adminClient) {
                        const { data: createdUser, error: createError } = await adminClient.auth.admin.createUser({
                            email,
                            phone: phone.startsWith("+") ? phone : undefined,
                            password: reg.password || `BioAuth_${crypto.randomBytes(8).toString("hex")}!`,
                            email_confirm: true,
                            user_metadata: {
                                full_name: fullName,
                                phone: phone,
                            },
                        });
                        if (createdUser?.user) {
                            registeredUserId = createdUser.user.id;
                        } else if (createError && !createError.message.includes("already registered")) {
                            console.warn("[FaceLiveness] Supabase admin createUser notice:", createError.message);
                        }
                    }
                } catch (authErr) {
                    console.warn("[FaceLiveness] Supabase admin registration bypassed/offline:", authErr);
                }

                // 2. Upload reference image to Supabase Storage
                let filePath = `${registeredUserId}/reference-${Date.now()}.jpg`;
                if (imageBase64) {
                    try {
                        const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
                        const buffer = Buffer.from(base64Data, "base64");
                        await supabase.storage.from("face-verifications").upload(filePath, buffer, {
                            contentType: "image/jpeg",
                            upsert: true,
                        });
                    } catch {
                        filePath = `${registeredUserId}/reference.jpg`;
                    }
                }

                // 3. Upsert into Supabase public.user_face_profiles
                const vectorString = `[${descriptor.join(",")}]`;
                try {
                    await supabase.from("user_face_profiles").upsert(
                        {
                            user_id: registeredUserId,
                            full_name: fullName,
                            email: email,
                            phone: phone,
                            image_path: filePath,
                            embedding: vectorString,
                            updated_at: new Date().toISOString(),
                        },
                        { onConflict: "user_id" }
                    );
                } catch (dbErr) {
                    console.warn("[FaceLiveness] Could not write user_face_profiles to database:", dbErr);
                }

                // 4. Save to in-memory registered profile store
                memoryRegisteredUsers.set(registeredUserId, {
                    userId: registeredUserId,
                    fullName,
                    email,
                    phone,
                    embedding: descriptor,
                    imagePath: filePath,
                    createdAt: Date.now(),
                });

                userProfileSummary = {
                    userId: registeredUserId,
                    fullName,
                    email,
                    phone,
                };
            } else if (user) {
                // Existing authenticated user enrolling face
                const registeredUserId = user.id;
                let filePath = `${registeredUserId}/reference-${Date.now()}.jpg`;
                if (imageBase64) {
                    try {
                        const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
                        const buffer = Buffer.from(base64Data, "base64");
                        await supabase.storage.from("face-verifications").upload(filePath, buffer, {
                            contentType: "image/jpeg",
                            upsert: true,
                        });
                    } catch {
                        filePath = `${registeredUserId}/reference.jpg`;
                    }
                }

                const vectorString = `[${descriptor.join(",")}]`;
                const fullName = user.user_metadata?.full_name || user.email?.split("@")[0] || "User";
                const email = user.email || "";
                const phone = user.phone || user.user_metadata?.phone || "";

                try {
                    await supabase.from("user_face_profiles").upsert(
                        {
                            user_id: registeredUserId,
                            full_name: fullName,
                            email: email,
                            phone: phone,
                            image_path: filePath,
                            embedding: vectorString,
                            updated_at: new Date().toISOString(),
                        },
                        { onConflict: "user_id" }
                    );
                } catch (dbErr) {
                    console.warn("[FaceLiveness] Could not write user_face_profiles to database:", dbErr);
                }

                memoryRegisteredUsers.set(registeredUserId, {
                    userId: registeredUserId,
                    fullName,
                    email,
                    phone,
                    embedding: descriptor,
                    imagePath: filePath,
                    createdAt: Date.now(),
                });

                userProfileSummary = {
                    userId: registeredUserId,
                    fullName,
                    email,
                    phone,
                };
            } else {
                return {
                    decision: "FAILED",
                    verified: false,
                    message: "Registration required. Please provide your Name, Email, and Phone to enroll.",
                    passiveScore,
                    confidence: 0,
                    spoofIndicators: ["UNAUTHENTICATED_ENROLLMENT"],
                    rejectionReason: "User registration details (name, email, phone) required.",
                };
            }
        }
    }

    // --------------------------------------------------------------------------
    // 7. Audit Logging & Rate Limiting Update
    // --------------------------------------------------------------------------
    const rateLimitKey = session.userId || userProfileSummary?.userId || "anonymous-ip";
    if (decision === "VERIFIED") {
        memoryRateLimits.delete(rateLimitKey);
        session.status = "COMPLETED";
    } else {
        // Track failed attempt
        const current = memoryRateLimits.get(rateLimitKey) || { attempts: 0, lockedUntil: 0 };
        current.attempts += 1;
        if (current.attempts >= LIVENESS_CONFIG.RATE_LIMIT.MAX_FAILED_ATTEMPTS) {
            current.lockedUntil = now + LIVENESS_CONFIG.RATE_LIMIT.LOCKOUT_DURATION_MS;
        }
        memoryRateLimits.set(rateLimitKey, current);
        session.status = decision;
    }

    // Log to Supabase audit trail
    try {
        await supabase.from("face_verification_logs").insert({
            session_id: session.sessionId,
            user_id: session.userId || userProfileSummary?.userId,
            mode,
            decision,
            rejection_reason: rejectionReason,
            passive_metrics: passiveMetrics,
            active_metrics: challengeTelemetry,
            device_info: deviceTelemetry,
        });
    } catch (logErr) {
        console.warn("Could not write audit log to Supabase:", logErr);
    }

    const verified = decision === "VERIFIED";
    let message = "Identity and liveness successfully verified!";

    if (decision === "SPOOF_DETECTED") {
        message = "Verification rejected: Potential presentation attack or spoofing detected.";
    } else if (decision === "INCONCLUSIVE") {
        message = "Liveness check inconclusive. Please ensure good lighting and try again.";
    } else if (decision === "FAILED") {
        message = rejectionReason || "Verification failed.";
    } else if (decision === "VERIFIED") {
        if (mode === "enroll" && userProfileSummary) {
            message = `Account created and face registered successfully for ${userProfileSummary.fullName}!`;
        } else if (mode === "verify" && userProfileSummary) {
            message = `Welcome back, ${userProfileSummary.fullName}! Identity verified.`;
        }
    }

    return {
        decision,
        verified,
        message,
        distance: matchDistance,
        passiveScore,
        confidence: Number((passiveScore * 0.95).toFixed(2)),
        spoofIndicators,
        rejectionReason,
        auditLogId: session.sessionId,
        userProfile: userProfileSummary,
    };
}

/**
 * Server Action: Register a new user with Name, Email, Phone, and Face Biometric Liveness
 */
export async function registerUserWithFaceAction(
    request: LivenessVerificationRequest & { registrationData: UserRegistrationData }
): Promise<LivenessVerificationResult> {
    return verifyLivenessSessionAction({
        ...request,
        mode: "enroll",
    });
}

