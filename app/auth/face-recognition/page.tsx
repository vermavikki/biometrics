
import Link from "next/link";
import { ScanFace, ArrowLeft } from "lucide-react";
import FaceScanner from "@/components/FaceScanner";

export default function FaceRecognitionPage() {
    return (
        <main className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
            <section className="w-full max-w-md text-center">
                <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border bg-card">
                    <ScanFace className="h-10 w-10" />
                </div>

                <h1 className="text-3xl font-bold">
                    Face Recognition
                </h1>

                <p className="mt-3 text-muted-foreground">
                    Verify your identity using facial recognition.
                </p>

                <div className="mt-8 w-full">
                    <FaceScanner mode={"verify"} />
                </div>

                <Link
                    href="/"
                    className="mt-5 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Back
                </Link>
            </section>
        </main>
    );
}
