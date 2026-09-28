import { Hero } from "@/components/marketing/Hero";
import { BuiltFor } from "@/components/marketing/BuiltFor";
import { HowItWorks } from "@/components/marketing/HowItWorks";
import { GetStartedCta } from "@/components/marketing/GetStartedCta";

export default function HomePage() {
  return (
    <>
      <Hero />
      <BuiltFor />
      <HowItWorks />
      <GetStartedCta />
    </>
  );
}
