import PricingTiers from "@/components/PricingTiers";

export const metadata = { title: "Pricing" };

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-surface-muted px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <a href="/" className="mb-4 inline-block text-sm text-neutral-500 hover:text-neutral-900">
          ← Back to app
        </a>
        <PricingTiers />
      </div>
    </main>
  );
}
