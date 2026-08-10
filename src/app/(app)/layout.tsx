import { getCurrentProfile } from "@/lib/auth/get-current-profile";
import { AppSidebar } from "@/components/app-sidebar";
import { AppTopbar } from "@/components/app-topbar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar role={profile.role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar profile={profile} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
