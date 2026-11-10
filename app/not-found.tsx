import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <h2 className="text-2xl font-bold">404 - Page Not Found</h2>
      <p className="mt-2 text-sm text-muted-foreground">The requested page could not be found.</p>
      <Link href="/" className="mt-4 text-sm font-medium text-primary hover:underline">
        Return Home
      </Link>
    </main>
  );
}

