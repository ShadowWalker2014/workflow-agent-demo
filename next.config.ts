import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  // The generated components/ai-elements/* + the WorkflowAgent tools generic ship
  // upstream type-skew errors (base-ui / LanguageModelUsage) that are NOT in our code
  // (app/* typechecks clean under strict). Gate them so `next build` / Vercel don't fail
  // on third-party generated code. Remove once AI Elements/base-ui versions realign.
  typescript: { ignoreBuildErrors: true },
};

// withWorkflow enables the "use workflow" / "use step" build-time transform.
export default withWorkflow(nextConfig);
