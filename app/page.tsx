import Link from "next/link";
import { ScanFace, Fingerprint, ArrowRight } from "lucide-react";

const authenticationMethods = [
  {
    title: "Face Recognition",
    description: "Authenticate securely using facial biometric verification.",
    href: "/auth/face-recognition",
    icon: ScanFace,
  },
  {
    title: "Fingerprint Recognition Comming Soon",
    description: "Authenticate securely using fingerprint biometric verification.",
    href: "#",
    icon: Fingerprint,
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground dark:bg-background dark:text-foreground flex items-center justify-center px-6">
      <section className="w-full max-w-4xl text-center">
        <div className="mb-10">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border bg-card shadow-sm">
            <Fingerprint className="h-8 w-8" />
          </div>

          <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
            Biometrics Authentication System
          </h1>

          <p className="mt-4 text-lg text-muted-foreground">
            Choose a biometric authentication method to continue.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {authenticationMethods.map((method) => {
            const Icon = method.icon;

            return (
              <Link
                key={method.href}
                href={method.href}
                className="group rounded-2xl border bg-card p-8 text-left shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg"
              >
                <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-muted">
                  <Icon className="h-7 w-7" />
                </div>

                <h2 className="text-2xl font-semibold">
                  {method.title}
                </h2>

                <p className="mt-3 text-muted-foreground">
                  {method.description}
                </p>

                <div className="mt-6 flex items-center gap-2 font-medium">
                  Continue
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}
