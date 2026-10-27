import { AppShell } from "@/components/layout/app-shell";
import { GuideProvider } from "@/components/guide/guide-provider";
import { GuideTour } from "@/components/guide/guide-tour";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <GuideProvider>
      <AppShell>{children}</AppShell>
      <GuideTour />
    </GuideProvider>
  );
}
