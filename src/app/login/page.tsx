import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/");
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-center">Project Agnus</h1>
        <p className="mt-1 mb-8 text-center text-sm text-ink-2">Annotator performance dashboard</p>
        <LoginForm />
      </div>
    </main>
  );
}
