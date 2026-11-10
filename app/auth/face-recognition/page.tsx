"use client";

import React, { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ScanFace, ArrowLeft, ShieldCheck, UserCheck } from "lucide-react";

// Dynamic imports with ssr: false to prevent Node.js SSR evaluation of browser face-api/canvas
const FaceScanner = dynamic(() => import("@/components/FaceScanner"), {
    ssr: false,
    loading: () => (
        <div className="flex flex-col items-center justify-center p-8 bg-card rounded-2xl border border-border">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-xs text-muted-foreground">Loading camera & biometric models...</p>
        </div>
    ),
});

const AttackSimulatorPanel = dynamic(
    () => import("@/components/liveness/AttackSimulatorPanel"),
    { ssr: false }
);

export default function FaceRecognitionPage() {
    const [mode, setMode] = useState<"verify" | "enroll">("verify");

    return (
        <main className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-4 md:p-6">
            <section className="w-full max-w-lg text-center flex flex-col items-center">
                {/* Header Icon */}
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border bg-card shadow-sm text-primary">
                    <ScanFace className="h-8 w-8" />
                </div>

                <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
                    Biometric Face Verification
                </h1>

                <p className="mt-1.5 text-sm text-muted-foreground max-w-sm">
                    Production-grade face liveness detection with ISO-aligned Presentation Attack Detection (PAD).
                </p>

                {/* Mode Selector Tabs */}
                <div className="flex items-center gap-1.5 p-1 bg-muted rounded-xl mt-5 mb-4 border border-border">
                    <button
                        type="button"
                        onClick={() => setMode("verify")}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${mode === "verify"
                                ? "bg-background text-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                    >
                        <ShieldCheck className="w-4 h-4 text-primary" />
                        Verify Identity
                    </button>
                    <button
                        type="button"
                        onClick={() => setMode("enroll")}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${mode === "enroll"
                                ? "bg-background text-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                    >
                        <UserCheck className="w-4 h-4 text-primary" />
                        Register New Face
                    </button>
                </div>

                {/* Face Scanner with Liveness Engine */}
                <div className="w-full">
                    <FaceScanner key={mode} mode={mode} />
                </div>

                {/* Presentation Attack Simulation & Testbench Panel */}
                <AttackSimulatorPanel />

                {/* Back Link */}
                <Link
                    href="/"
                    className="mt-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Back to Home
                </Link>
            </section>
        </main>
    );
}
