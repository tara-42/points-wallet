import {
  type RouteConfig,
  index,
  route,
  prefix,
  layout,
} from "@react-router/dev/routes";

export default [
  index("routes/_index.tsx"),

  // Dashboard Routes
  ...prefix("dashboard", [
    layout("routes/dashboard/_layout.tsx", [
      route("/", "routes/dashboard/_index.tsx"),
      route("wallet", "routes/dashboard/wallet.tsx"),
      route("calculator", "routes/dashboard/calculator.tsx"),
      route("finder", "routes/dashboard/finder.tsx"),
    ]),
  ]),

  // API Routes
  route("/api/trpc/*", "routes/api/trpc.$.ts"),
  route("/api/auth/*", "routes/api/auth.$.ts"),
  route("/api/upload-file", "routes/api/upload-file.ts"),

  // Authentication Routes
  route("/login", "routes/authentication/login.tsx"),
  route("/sign-up", "routes/authentication/sign-up.tsx"),
] satisfies RouteConfig;
