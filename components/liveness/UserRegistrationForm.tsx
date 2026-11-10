"use client";

import React, { useState } from "react";
import { User, Mail, Phone, Lock, Eye, EyeOff, ArrowRight, ShieldCheck, Sparkles } from "lucide-react";
import type { UserRegistrationData } from "@/lib/liveness/types";

interface UserRegistrationFormProps {
    onProceedToBiometrics: (data: UserRegistrationData) => void;
    onSwitchToVerify: () => void;
}

export default function UserRegistrationForm({
    onProceedToBiometrics,
    onSwitchToVerify,
}: UserRegistrationFormProps) {
    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [errors, setErrors] = useState<{ [key: string]: string }>({});

    const validate = (): boolean => {
        const newErrors: { [key: string]: string } = {};

        if (!fullName.trim() || fullName.trim().length < 2) {
            newErrors.fullName = "Please enter your full name (at least 2 characters).";
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email.trim() || !emailRegex.test(email.trim())) {
            newErrors.email = "Please enter a valid email address.";
        }

        const phoneDigits = phone.replace(/\D/g, "");
        if (!phone.trim() || phoneDigits.length < 7 || phoneDigits.length > 15) {
            newErrors.phone = "Please enter a valid phone number (7 to 15 digits).";
        }

        if (password && password.length < 6) {
            newErrors.password = "Password must be at least 6 characters (or leave empty for biometric-only).";
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!validate()) return;

        onProceedToBiometrics({
            fullName: fullName.trim(),
            email: email.trim().toLowerCase(),
            phone: phone.trim(),
            password: password || undefined,
        });
    };

    return (
        <div className="w-full max-w-md mx-auto p-5 sm:p-7 bg-card text-card-foreground rounded-2xl border border-border shadow-md transition-all">
            {/* Header with Step Tracker */}
            <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-primary/10 text-primary">
                        Step 1 of 2
                    </span>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5 text-primary" />
                        Biometric Onboarding
                    </span>
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Create Your Account</h2>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                    Enter your details below. You will then complete a quick face liveness scan to secure your account.
                </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
                {/* Full Name */}
                <div>
                    <label className="block text-xs font-semibold mb-1 text-foreground">
                        Full Name <span className="text-destructive">*</span>
                    </label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                            <User className="w-4 h-4" />
                        </div>
                        <input
                            type="text"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            placeholder="e.g. Alex Morgan"
                            className={`w-full pl-9 pr-3 py-2.5 text-sm rounded-xl bg-background border transition-all outline-none focus:ring-2 focus:ring-primary/30 ${
                                errors.fullName ? "border-destructive ring-1 ring-destructive" : "border-input"
                            }`}
                        />
                    </div>
                    {errors.fullName && <p className="text-[11px] text-destructive mt-1">{errors.fullName}</p>}
                </div>

                {/* Email Address */}
                <div>
                    <label className="block text-xs font-semibold mb-1 text-foreground">
                        Email Address <span className="text-destructive">*</span>
                    </label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                            <Mail className="w-4 h-4" />
                        </div>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="alex@example.com"
                            className={`w-full pl-9 pr-3 py-2.5 text-sm rounded-xl bg-background border transition-all outline-none focus:ring-2 focus:ring-primary/30 ${
                                errors.email ? "border-destructive ring-1 ring-destructive" : "border-input"
                            }`}
                        />
                    </div>
                    {errors.email && <p className="text-[11px] text-destructive mt-1">{errors.email}</p>}
                </div>

                {/* Phone Number */}
                <div>
                    <label className="block text-xs font-semibold mb-1 text-foreground">
                        Phone Number <span className="text-destructive">*</span>
                    </label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                            <Phone className="w-4 h-4" />
                        </div>
                        <input
                            type="tel"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            placeholder="+1 (555) 019-2834"
                            className={`w-full pl-9 pr-3 py-2.5 text-sm rounded-xl bg-background border transition-all outline-none focus:ring-2 focus:ring-primary/30 ${
                                errors.phone ? "border-destructive ring-1 ring-destructive" : "border-input"
                            }`}
                        />
                    </div>
                    {errors.phone && <p className="text-[11px] text-destructive mt-1">{errors.phone}</p>}
                    <p className="text-[11px] text-muted-foreground mt-0.5">Used for secure two-factor identity binding.</p>
                </div>

                {/* Optional Password */}
                <div>
                    <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-semibold text-foreground">
                            Password <span className="text-muted-foreground text-[10px] font-normal">(Optional)</span>
                        </label>
                        <span className="text-[10px] text-muted-foreground">Biometrics will allow passwordless sign-in</span>
                    </div>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                            <Lock className="w-4 h-4" />
                        </div>
                        <input
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Create a password or leave empty"
                            className={`w-full pl-9 pr-10 py-2.5 text-sm rounded-xl bg-background border transition-all outline-none focus:ring-2 focus:ring-primary/30 ${
                                errors.password ? "border-destructive ring-1 ring-destructive" : "border-input"
                            }`}
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-foreground"
                        >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>
                    {errors.password && <p className="text-[11px] text-destructive mt-1">{errors.password}</p>}
                </div>

                {/* Security Feature Highlights */}
                <div className="p-3 bg-muted/60 rounded-xl border border-border/60 text-xs space-y-1.5 text-muted-foreground">
                    <div className="flex items-center gap-2 font-medium text-foreground">
                        <ShieldCheck className="w-4 h-4 text-emerald-500" />
                        Next: Face Liveness Verification
                    </div>
                    <p className="text-[11px] leading-relaxed">
                        To protect your account against presentation attacks (photos, masks, and deepfakes), you will be asked to perform a randomized set of natural movements in front of your camera.
                    </p>
                </div>

                {/* Submit Button */}
                <button
                    type="submit"
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 active:scale-[0.99] transition shadow-sm"
                >
                    Continue to Face Scan
                    <ArrowRight className="w-4 h-4" />
                </button>
            </form>

            {/* Footer switcher */}
            <div className="mt-5 pt-4 border-t border-border text-center">
                <p className="text-xs text-muted-foreground">
                    Already registered?{" "}
                    <button
                        type="button"
                        onClick={onSwitchToVerify}
                        className="font-semibold text-primary hover:underline transition"
                    >
                        Verify Identity / Sign In
                    </button>
                </p>
            </div>
        </div>
    );
}

