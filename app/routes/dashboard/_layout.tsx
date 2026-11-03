import { redirect, Outlet } from "react-router";
import type { Route } from "./+types/_layout";

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = await context.auth.api.getSession({
    headers: request.headers,
  });

  if (!session?.user) {
    return redirect("/sign-up");
  }

  return { user: session.user };
}

export default function DashboardLayout() {
  return <Outlet />;
}

