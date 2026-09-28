import Link from "next/link";
import { RecoveryTracer } from "@/components/RecoveryTracer";

export default async function CaregiverPage({
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
            Enter the recovery code your patient shared with you in the URL, e.g.{" "}
            <span className="rounded bg-homeward-mint px-1.5 py-0.5 font-mono text-xs text-homeward-primary">
              /caregiver?code=AB2C4D7H
            </span>
            , or{" "}
            <Link href="/" className="text-homeward-primary underline underline-offset-2">
              start a new plan
            </Link>
            .
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-6">
        <span className="eyebrow">Homeward</span>
        <h1 className="mt-1 text-2xl font-semibold text-homeward-ink">Caregiver dashboard</h1>
      </div>
      <RecoveryTracer recoveryCode={code} role="caregiver" />
    </main>
  );
}
