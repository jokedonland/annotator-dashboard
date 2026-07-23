import { requireSession } from "@/lib/auth";
import { loadCurrent } from "@/lib/data";
import { buildDashboardData, buildUserDirectory } from "@/lib/view";
import { Dashboard } from "@/components/Dashboard";

export const dynamic = "force-dynamic";

export default async function Home(props: {
  searchParams: Promise<{ as?: string }>;
}) {
  const session = await requireSession();
  const cur = await loadCurrent();

  if (!cur) {
    return (
      <main className="flex flex-1 items-center justify-center p-6 text-center">
        <div>
          <h1 className="text-xl font-semibold">No data yet</h1>
          {session.isAdmin ? (
            <p className="mt-2 text-sm text-ink-2">
              Upload the CSV dumps on the{" "}
              <a className="text-series-1 underline" href="/admin/upload">
                admin upload page
              </a>{" "}
              to get started.
            </p>
          ) : (
            <p className="mt-2 text-sm text-ink-2">
              The dashboard is still being set up. Check back soon.
            </p>
          )}
        </div>
      </main>
    );
  }

  // Non-admins are hard-limited server-side to their own data.
  const { as } = await props.searchParams;
  const targetEmail = session.isAdmin && as ? as : session.email;

  const data = buildDashboardData(cur.dataset, targetEmail);
  const directory = session.isAdmin ? buildUserDirectory(cur.dataset) : null;

  return (
    <main className="flex-1">
      {/* key resets tab/toggle state when an admin switches viewed user */}
      <Dashboard
        key={data.email}
        data={data}
        viewer={{ email: session.email, isAdmin: session.isAdmin }}
        directory={directory}
      />
    </main>
  );
}
