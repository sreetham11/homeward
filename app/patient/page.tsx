import Link from "next/link";
import { RecoveryTracer } from "@/components/RecoveryTracer";

export default async function PatientPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;

  if (!code) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10">
        <div className="card">
          <p className="text-sm text-homeward-ink">
            No recovery code provided.{" "}
            <Link href="/" className="text-homeward-primary underline underline-offset-2">
              Start by uploading a discharge summary
            </Link>
            .
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="eyebrow">Homeward</span>
          <h1 className="mt-1 text-2xl font-semibold text-homeward-ink">Your recovery plan</h1>
        </div>
        <Link
          href={`/caregiver?code=${code}`}
          className="btn-secondary py-2 text-xs"
        >
          View as caregiver
        </Link>
      </div>
      <RecoveryTracer recoveryCode={code} role="patient" />
    </main>
  );
}
