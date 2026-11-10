# Face Liveness Detection & Presentation Attack Detection (PAD) Specification

This document details the multi-layered **Biometric Liveness and Anti-Spoofing Architecture** implemented in this Next.js + Supabase application, conforming to ISO/IEC 30107-3 Presentation Attack Detection standards for RGB webcam environments.

---

## 1. Architectural Overview

```
                                  Client (Browser)
+------------------------------------------------------------------------------------+
| 1. WebRTC Camera Stream (Resolution, FPS, VideoTrack Inspection)                  |
| 2. Face Detection & Landmarking (SSD MobileNetV1 / 68 Landmarks / Expressions)     |
| 3. Face Alignment & Centering Gate (Box Ratio, Centering Offsets, Multi-Face Gate) |
| 4. Active Challenge State Machine (Server-issued nonce, EAR, MAR, Head Yaw/Pitch)  |
| 5. Passive Frame Analysis (Laplacian Variance, Moiré Frequency, Skin Chrominance)  |
| 6. Biometric Embedding Extraction (128-D Euclidean Vector)                         |
+------------------------------------------------------------------------------------+
                                         │
                   Encrypted HTTPS / One-Time Session Token
                                         ▼
                                Next.js Server Action
+------------------------------------------------------------------------------------+
| Centralized Verification Decision Engine                                           |
|   ├── Session Validity & Replay Check (One-time token, 60s expiration)             |
|   ├── Rate Limiting Gate (5 attempts / 15-minute lock)                             |
|   ├── Challenge Sequence & Biological Timing Gate (Min/max duration, order)        |
|   ├── Passive PAD Evaluation (Laplacian filter, screen moiré, specular flare)      |
|   ├── Virtual Camera Heuristic Gate (OBS, vMix, DroidCam, ManyCam signatures)      |
|   └── Biometric Vector Match / Enroll (pgvector Euclidean distance <= 0.45)        |
+------------------------------------------------------------------------------------+
                                         │
                                         ▼
                                 Supabase Backend
+------------------------------------------------------------------------------------+
| - public.face_verification_sessions (Short-lived challenges, expiration)           |
| - public.face_verification_logs (Security audit trail, PAD signals)                |
| - public.face_rate_limits (Brute-force lockout counters)                           |
| - public.user_face_profiles (128-D pgvector embeddings, RLS-protected)            |
+------------------------------------------------------------------------------------+
```

---

## 2. Technology Selection & Rationale

| Component | Selected Technology | Execution | Rationale |
| :--- | :--- | :--- | :--- |
| **Face Detection** | SSD MobileNetV1 (`@vladmandic/face-api`) | Client (Browser) | Highly accurate single/multi-face detection with confidence bounding boxes. |
| **68-Point Landmarks** | FaceLandmark68Net | Client (Browser) | Sub-millimeter landmark tracking for eyes, eyebrows, nose, mouth, and chin. |
| **Head Pose Estimation** | Trigonometric PnP Projection | Client (Browser) | Calculates Yaw, Pitch, Roll angles directly from facial landmark geometry without heavy 3D mesh overhead. |
| **Blink Detection** | Eye Aspect Ratio (EAR) + Temporal Curve | Client (Browser) | Measures eye opening, closing, and reopening curves within 100ms–600ms. |
| **Expression & Smile** | FaceExpressionNet + Lip Geometry | Client (Browser) | Neural network happiness classification combined with mouth width-to-eye ratio and corner elevation. |
| **Mouth Movement** | Mouth Aspect Ratio (MAR) | Client (Browser) | Inner/outer lip distance ratio detecting intentional opening/closing. |
| **Texture & Focus** | 2D Discrete Laplacian Kernel Variance | Client (Browser) | Distinguishes natural skin pore micro-texture from blurry prints or screens. |
| **Screen Moiré Detection** | 2D High-Frequency Power Analysis | Client (Browser) | Identifies Bayer sensor vs LCD/OLED display subpixel interference patterns. |
| **Skin Chrominance** | YCrCb / HSV Color Envelope | Client (Browser) | Verifies skin tone clustering and detects screen specular glare / glass flare. |
| **Replay & Session Defense**| Cryptographic Nonces + Supabase RLS | Server Action | Prevents token reuse, challenge replay, and bypass of client JavaScript. |
| **Biometric Comparison** | pgvector 128-D Euclidean Distance (`<->`) | Supabase PostgreSQL | Hardware-accelerated vector indexing (`ivfflat`) with strict 0.45 match threshold. |

---

## 3. Testing Matrix: 17 Presentation Attack & Edge Scenarios

| # | Attack / Scenario | Detection Mechanism | Decision | Mitigation Level |
| :--- | :--- | :--- | :--- | :--- |
| **1** | **Real Person Completing Challenges** | Valid EAR blink curve (100–600ms), verified Yaw/Pitch angles, natural micro-motion, natural skin texture ($\sigma^2 \in [45, 2200]$), no moiré. | `VERIFIED` | Full Support |
| **2** | **Printed Photograph Attack** | Low Laplacian variance ($\sigma^2 < 45$ due to print halftone/blur), zero involuntary micro-motion, failure to respond to randomized active challenges (e.g. smile/turn). | `SPOOF_DETECTED` | Fully Mitigated |
| **3** | **Photo Displayed on Mobile Phone** | High moiré energy ($> 0.78$), specular glass reflection hotspot ($> 25\%$), 2D planar rotation without 3D depth parallax during turn challenge. | `SPOOF_DETECTED` | Fully Mitigated |
| **4** | **Photo Displayed on Monitor** | Screen pixel grid lattice ($\sigma^2 > 2200$), moiré interference spikes, monitor backlight dynamic range compression. | `SPOOF_DETECTED` | Fully Mitigated |
| **5** | **Pre-Recorded Video Replay** | Server issues unpredictable random challenge sequence (e.g. Turn Right $\rightarrow$ Smile $\rightarrow$ Blink). Pre-recorded video cannot adapt to randomized order. Moiré and specular flare also flag screen source. | `FAILED` / `SPOOF_DETECTED` | Fully Mitigated |
| **6** | **Replayed Session Recording** | One-time session tokens with cryptographic random UUIDs. Server invalidates session immediately upon submission. Replay attempt returns `CHALLENGE_REPLAY_ATTEMPT`. | `FAILED` | Fully Mitigated (Zero Replay) |
| **7** | **AI-Generated Face Image (Midjourney, StyleGAN)** | Static image lacks micro-motion; flat 2D perspective during turn challenges; cannot complete interactive randomized prompt sequences. | `FAILED` / `SPOOF_DETECTED` | Fully Mitigated |
| **8** | **Deepfake Video / Real-time Face Swap** | Landmark displacement anomaly detector catches inter-frame splicing/warping jitter; 3D perspective distortion mismatch during yaw/pitch; unnatural blink transitions. | `SPOOF_DETECTED` / `FAILED` | Mitigated (Layered PAD) * |
| **9** | **Face Mask / Partial Obstruction** | Alignment and landmark validation fails if mouth, eyes, or nose cannot be detected with $\ge 0.60$ confidence. MAR and EAR calculation will not trigger. | `FAILED` / `INCONCLUSIVE` | Fully Mitigated |
| **10**| **Multiple Faces in Camera Frame** | `detectAllFaces` triggers when count $> 1$. Alignment overlay changes to amber with feedback: *"Multiple faces detected! Only one person permitted."* | `RETRY_REQUIRED` | Fully Mitigated |
| **11**| **No Face in Camera Frame** | `detectAllFaces` count $= 0$. Scanner pauses state machine and displays *"Position your face inside the oval guide."* | `RETRY_REQUIRED` | Fully Mitigated |
| **12**| **Incorrect Challenge Sequence** | Server verifies telemetry timestamps and challenge types against original server-issued sequence. Out-of-order execution is rejected with `CHALLENGE_SEQUENCE_VIOLATION`. | `FAILED` | Fully Mitigated |
| **13**| **Expired Challenge** | Per-challenge countdown (9s) and session timer (60s). Expired sessions cannot be redeemed on server. | `EXPIRED` | Fully Mitigated |
| **14**| **Interrupted Camera Stream** | `processFrame` detects `video.readyState !== 4` or track ended. Stream listeners clean up tracks and prompt user to reconnect. | `RETRY_REQUIRED` | Gracefully Handled |
| **15**| **Repeated Failed Attempts** | `face_rate_limits` table tracks failed attempts per user/IP. After 5 consecutive failures, user is locked out for 15 minutes. | `LOCKED_OUT` | Fully Mitigated |
| **16**| **Network Interruption During Verification** | Client displays connection error with "Try Again" action. Session expires gracefully on server. | `RETRY_REQUIRED` | Gracefully Handled |
| **17**| **Suspicious or Virtual Camera Input** | Browser inspects `MediaStreamTrack.label` and `enumerateDevices()` for known virtual drivers (OBS Virtual Camera, ManyCam, vMix, DroidCam, etc.) and flags telemetry to server. | `SPOOF_DETECTED` | Heuristically Mitigated ** |

---

### * Clarification on Physical Security Limits:
1. **RGB Camera Limitations:** Standard 2D RGB webcams do not capture active Near-Infrared (NIR) or structured 3D Time-of-Flight (ToF) depth. Extremely sophisticated silicon prosthetic masks worn by a live human or studio-grade real-time 3D CGI injection directly at the USB driver level require specialized physical depth sensors (such as Intel RealSense or Apple FaceID TrueDepth) to achieve ISO/IEC 30107-3 Level 3 certification.
2. **Virtual Camera Limitations:** If an attacker uses a custom-compiled kernel driver or physical HDMI-to-USB capture device (e.g. Elgato Cam Link) with a disguised USB product ID, browser WebRTC APIs cannot read OS kernel signatures. The primary defense against such attacks is our **unpredictable randomized challenge sequence** and **server-side timing validation**.

---

## 4. Supabase Setup Instructions

To enable all database tables, vector indexing, RPC functions, and Row-Level Security:

1. Open your Supabase Dashboard: `https://supabase.com/dashboard/project/rsbmgvdmbxnomavetcin`
2. Navigate to **SQL Editor** $\rightarrow$ **New Query**.
3. Copy and paste the contents of `supabase/migrations/20261110_face_liveness_system.sql`.
4. Click **Run**.
5. Ensure the `face-verifications` storage bucket is present in **Storage**.

