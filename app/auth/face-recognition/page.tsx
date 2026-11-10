"use client";

import React, { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
    ScanFace,
    ArrowLeft,
    ShieldCheck,
    UserPlus,
    FlaskConical,
    Sparkles,
} from "lucide-react";
import type { UserRegistrationData } from "@/lib/liveness/types";
import UserRegistrationForm from "@/components/liveness/UserRegistrationForm";

// Dynamic imports with ssr: false to prevent Node.js SSR evaluation of browser face-api/canvas
const FaceScanner = dynamic(() => import("@/components/FaceScanner"), {
    ssr: false,
    loading: () => (
        <div className="flex flex-col items-center justify-center p-8 bg-card rounded-2xl border border-border w-full max-w-lg mx-auto">
            <div className="w-9 h-9 border-3 border-primary border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-xs font-semibold text-muted-foreground">Loading camera & biometric models...</p>
            <p className="text-[11px] text-muted-foreground/70 mt-1">Preparing hardware-accelerated WebGL engine</p>
        </div>
    ),
});

const AttackSimulatorPanel = dynamic(
    () => import("@/components/liveness/AttackSimulatorPanel"),
    { ssr: false }
);

type ActiveTab = "verify" | "register" | "simulator";

export default function FaceRecognitionPage() {
    const [activeTab, setActiveTab] = useState<ActiveTab>("verify");
    const [registrationData, setRegistrationData] = useState<UserRegistrationData | null>(null);
    const [registrationStep, setRegistrationStep] = useState<"form" | "scan">("form");

    const handleRegistrationFormSubmit = (data: UserRegistrationData) => {
        setRegistrationData(data);
        setRegistrationStep("scan");
    };

    const handleResetRegistration = () => {
        setRegistrationStep("form");
    };

    return (
        <main className="min-h-screen bg-background text-foreground flex flex-col items-center justify-start p-3 sm:p-6 lg:p-8">
            <section className="w-full max-w-2xl sm:max-w-3xl flex flex-col items-center text-center">
                {/* Header Icon & Title */}
                <div className="mb-3 flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-2xl border bg-card shadow-sm text-primary">
                    <ScanFace className="h-7 w-7 sm:h-8 sm:w-8" />
                </div>

                <div className="flex items-center gap-2 mb-1">
                    <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
                        Biometric Anti-Spoofing PAD System
                    </span>
                </div>

                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight">
                    Face Liveness & Biometrics
                </h1>

                <p className="mt-1 text-xs sm:text-sm text-muted-foreground max-w-md px-2">
                    ISO/IEC 30107-3 compliant presentation attack detection, randomized liveness challenges, and secure user registration.
                </p>

                {/* Mode Selector Tabs (Mobile Touch-Friendly & Desktop Centered) */}
                <div className="flex items-center gap-1 p-1 bg-muted rounded-2xl mt-5 mb-6 border border-border w-full max-w-md sm:max-w-lg shadow-sm">
                    <button
                        type="button"
                        onClick={() => setActiveTab("verify")}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                            activeTab === "verify"
                                ? "bg-background text-foreground shadow-sm font-bold"
                                : "text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        <ShieldCheck className="w-4 h-4 text-emerald-500" />
                        <span>Verify Identity</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveTab("register")}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                            activeTab === "register"
                                ? "bg-background text-foreground shadow-sm font-bold"
                                : "text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        <UserPlus className="w-4 h-4 text-primary" />
                        <span>Register User</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveTab("simulator")}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                            activeTab === "simulator"
                                ? "bg-background text-foreground shadow-sm font-bold"
                                : "text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        <FlaskConical className="w-4 h-4 text-amber-500" />
                        <span>Security Testbench</span>
                    </button>
                </div>

                {/* TAB 1: VERIFY IDENTITY */}
                {activeTab === "verify" && (
                    <div className="w-full flex flex-col items-center animate-in fade-in duration-200">
                        {/* Guidance Pill: WHEN & WHAT TO DO */}
                        <div className="w-full max-w-lg sm:max-w-xl mb-3 p-3 bg-muted/60 border border-border rounded-xl text-left flex items-start gap-3">
                            <div className="p-2 rounded-lg bg-primary/10 text-primary flex-shrink-0 mt-0.5">
                                <Sparkles className="w-4 h-4" />
                            </div>
                            <div className="text-xs">
                                <span className="font-bold text-foreground block">
                                    How Face Verification Works:
                                </span>
                                <p className="text-muted-foreground mt-0.5">
                                    1. Center your face inside the oval guide. 2. Follow the prompt (Blink, Turn Left/Right, Smile). 3. The server validates liveness and verifies your identity against registered profiles.
                                </p>
                            </div>
                        </div>

                        <FaceScanner
                            key="verify"
                            mode="verify"
                        />
                    </div>
                )}

                {/* TAB 2: REGISTER USER WITH NAME, EMAIL, AND PHONE */}
                {activeTab === "register" && (
                    <div className="w-full flex flex-col items-center animate-in fade-in duration-200">
                        {registrationStep === "form" ? (
                            <UserRegistrationForm
                                onProceedToBiometrics={handleRegistrationFormSubmit}
                                onSwitchToVerify={() => setActiveTab("verify")}
                            />
                        ) : (
                            <div className="w-full flex flex-col items-center">
                                {/* Back link to edit registration details */}
                                <div className="w-full max-w-lg sm:max-w-xl mb-3 flex items-center justify-between text-xs px-1">
                                    <button
                                        type="button"
                                        onClick={handleResetRegistration}
                                        className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline transition"
                                    >
                                        <ArrowLeft className="w-3.5 h-3.5" />
                                        Edit Details ({registrationData?.fullName})
                                    </button>
                                    <span className="text-[11px] text-muted-foreground font-mono">
                                        Step 2: Face Liveness Scan
                                    </span>
                                </div>

                                <FaceScanner
                                    key={`register-${registrationData?.email}`}
                                    mode="enroll"
                                    registrationData={registrationData || undefined}
                                />
                            </div>
                        )}
                    </div>
                )}

                {/* TAB 3: PRESENTATION ATTACK SIMULATOR & TESTBENCH */}
                {activeTab === "simulator" && (
                    <div className="w-full flex flex-col items-center animate-in fade-in duration-200">
                        <AttackSimulatorPanel />
                    </div>
                )}

                {/* Back Link to Home */}
                <Link
                    href="/"
                    className="mt-8 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition pb-6"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Back to Main Navigation
                </Link>
            </section>
        </main>
    );
}
