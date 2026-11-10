// ==============================================================================
// Face Liveness Detection & Anti-Spoofing: Configurable Thresholds & Settings
// ==============================================================================

export const LIVENESS_CONFIG = {
    // Session & Timing
    SESSION_LIFETIME_MS: 60 * 1000,          // 60 seconds total session validity
    CHALLENGE_TIMEOUT_MS: 9 * 1000,          // 9 seconds max per individual challenge
    REQUIRED_CHALLENGE_COUNT: 3,             // 3 random challenges per verification session
    FRAME_INTERVAL_MS: 70,                   // ~14 FPS client detection loop (smooth without CPU burn)

    // Eye Aspect Ratio (EAR) Blink Detection
    EAR_OPEN_THRESHOLD: 0.25,                // Normal open eye EAR
    EAR_CLOSED_THRESHOLD: 0.19,              // Closed eye EAR during blink
    BLINK_MIN_DURATION_MS: 100,              // Faster than 100ms is an anomaly/glitch
    BLINK_MAX_DURATION_MS: 600,              // Longer than 600ms is a prolonged squint or sleep
    BLINK_CONSECUTIVE_FRAMES: 1,

    // Mouth Aspect Ratio (MAR) Open Mouth Detection
    MAR_CLOSED_THRESHOLD: 0.22,
    MAR_OPEN_THRESHOLD: 0.44,                // Noticeable mouth opening
    MAR_MIN_DURATION_MS: 300,

    // Head Pose Estimation (Yaw & Pitch in Degrees)
    HEAD_YAW_THRESHOLD_DEG: 16,              // Minimum turn angle left/right
    HEAD_PITCH_UP_THRESHOLD_DEG: -10,        // Look up angle
    HEAD_PITCH_DOWN_THRESHOLD_DEG: 12,       // Look down angle
    HEAD_CENTER_TOLERANCE_DEG: 8,            // Center pose tolerance

    // Smile Detection
    SMILE_EXPRESSION_THRESHOLD: 0.60,        // Neural network happy confidence
    SMILE_WIDTH_EXPANSION_RATIO: 1.14,       // 14% mouth width increase

    // Alignment and Positioning
    ALIGNMENT: {
        MIN_FACE_WIDTH_RATIO: 0.22,          // Too far if < 22% of frame width
        MAX_FACE_WIDTH_RATIO: 0.72,          // Too close if > 72% of frame width
        CENTER_TOLERANCE_X: 0.18,            // Normalized center offset tolerance
        CENTER_TOLERANCE_Y: 0.20,
    },

    // Passive Anti-Spoofing & Texture Thresholds
    PASSIVE: {
        // Laplacian Variance (Focus & Micro-Texture)
        LAPLACIAN_MIN_NATURAL: 45,           // Below 45 is usually blurry paper print or out-of-focus replay
        LAPLACIAN_MAX_SCREEN_LATTICE: 2200,  // Above 2200 often indicates extreme pixel grid lattice
        // Moiré Pattern Energy
        MOIRE_MAX_TOLERANCE: 0.78,           // Above 0.78 indicates strong screen interference
        // Color & Skin Tone Clustering
        CHROMINANCE_MIN_SKIN_RATIO: 0.45,    // At least 45% of face pixels must fall in YCrCb skin envelope
        SPECULAR_HOTSPOT_MAX_RATIO: 0.25,    // More than 25% pure white specular points suggests glass screen reflection
        // 3D Perspective Parallax
        MIN_3D_PARALLAX_DEFORMATION: 0.12,   // 2D flat photo gives near 0.0 parallax change during yaw
        // Involuntary Micro-Motion
        MIN_MICRO_MOTION_VARIANCE: 0.008,    // 0.0 variance indicates a totally static, taped photo
        // Overall minimum passive threshold to pass
        MIN_ACCEPTABLE_PASSIVE_SCORE: 0.65,
    },

    // Biometric Matching (pgvector L2 Distance)
    MATCH_DISTANCE_THRESHOLD: 0.45,          // vladmandic/face-api 128D Euclidean distance threshold

    // Rate Limiting
    RATE_LIMIT: {
        MAX_FAILED_ATTEMPTS: 5,
        LOCKOUT_DURATION_MS: 15 * 60 * 1000, // 15 minutes lockout
    },

    // Known Virtual Camera driver signatures (case-insensitive substring match)
    KNOWN_VIRTUAL_CAMERAS: [
        "obs",
        "virtual",
        "manycam",
        "vmix",
        "fake",
        "droidcam",
        "splitcam",
        "camo",
        "e2esoft",
        "streamlabs",
        "ndi",
        "sparkocam",
        "ip webcam",
        "iriun",
    ],
} as const;

