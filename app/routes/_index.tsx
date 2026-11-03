import { redirect } from "react-router";
import type { Route } from "./+types/_index";

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = await context.auth.api.getSession({
    headers: request.headers,
  });

  if (session?.user) {
    return redirect("/dashboard");
  }

  return redirect("/sign-up");
}

export default function Index() {
  // This component won't render since we always redirect in the loader
  return null;
}
