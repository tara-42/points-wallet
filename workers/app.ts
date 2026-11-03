import { createRequestHandler } from "react-router";
import { appRouter } from "../app/trpc/router";
import { createCallerFactory, createTRPCContext } from "../app/trpc";
import { createAuth, type Auth } from "@/auth/server";

const createCaller = createCallerFactory(appRouter);

declare module "react-router" {
  export interface AppLoadContext {
    cloudflare: {
      env: Env;
      ctx: ExecutionContext;
    };
    trpc: ReturnType<typeof createCaller>;
    auth: Auth;
  }
}

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE
);

export { ExampleWorkflow } from "../workflows/example";
export { ScraperWorkflow } from "../workflows/scraper";
export { PipelineWorkflow } from "../workflows/pipeline";

export default {
  async fetch(request, env, ctx) {
    const trpcContext = await createTRPCContext({
      headers: request.headers,
      cfContext: env,
    });

    const trpcCaller = createCaller(trpcContext);

    return requestHandler(request, {
      cloudflare: { env, ctx },
      trpc: trpcCaller,
      auth: await createAuth(env.DATABASE, env.BETTER_AUTH_SECRET),
    });
  },
} satisfies ExportedHandler<Env>;
