import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { api } from "@/trpc/client";
import { LogoutButton } from "@/components/logout-button";

export default function RecipesWorkflowPage() {
  const [scraperUrl, setScraperUrl] = useState(
    "https://www.allrecipes.com/recipe/10813/best-chocolate-chip-cookies/"
  );
  const [recipeId, setRecipeId] = useState("");
  const [scraperInstanceId, setScraperInstanceId] = useState<string | null>(
    null
  );
  const [pipelineInstanceId, setPipelineInstanceId] = useState<string | null>(
    null
  );

  const scrapeRecipeMutation = api.workflows.scrapeRecipe.useMutation({
    onSuccess: (data) => {
      setScraperInstanceId(data.instanceId);
    },
  });

  const runPipelineMutation = api.workflows.runPipeline.useMutation({
    onSuccess: (data) => {
      setPipelineInstanceId(data.instanceId);
    },
  });

  const scraperStatusQuery = api.workflows.getWorkflowStatus.useQuery(
    { workflowType: "scraper", instanceId: scraperInstanceId ?? "" },
    { enabled: !!scraperInstanceId, refetchInterval: 2000 }
  );

  const pipelineStatusQuery = api.workflows.getWorkflowStatus.useQuery(
    { workflowType: "pipeline", instanceId: pipelineInstanceId ?? "" },
    { enabled: !!pipelineInstanceId, refetchInterval: 2000 }
  );

  return (
    <div className="p-4 space-y-6 max-w-2xl mx-auto">
      <div className="flex justify-end">
        <LogoutButton />
      </div>

      <Separator />

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>How to Use</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <ol className="list-decimal list-inside space-y-2">
            <li>
              Make sure you&apos;re running in preview mode:{" "}
              <code className="bg-muted px-1 rounded">bun run preview</code>
            </li>
            <li>
              Add the following to your <code className="bg-muted px-1 rounded">.dev.vars</code> file:
              <pre className="mt-1 p-2 bg-muted rounded text-xs">
                CLOUDFLARE_API_TOKEN=your_api_token{"\n"}
                CLOUDFLARE_ACCOUNT_ID=your_account_id
              </pre>
            </li>
            <li>
              Update the worker secrets for production:
              <pre className="mt-1 p-2 bg-muted rounded text-xs">
                wrangler secret put CLOUDFLARE_API_TOKEN{"\n"}
                wrangler secret put CLOUDFLARE_ACCOUNT_ID
              </pre>
            </li>
            <li>Enter an AllRecipes URL and click &quot;Start Scraper Workflow&quot;</li>
            <li>Wait for the scraper to complete and copy the Recipe ID</li>
            <li>
              Paste the Recipe ID and click &quot;Start Pipeline Workflow&quot;
            </li>
            <li>
              The pipeline will extract modifications from reviews and create
              an enhanced recipe
            </li>
          </ol>
        </CardContent>
      </Card>

      <Separator />


      {/* Scraper Workflow */}
      <Card>
        <CardHeader>
          <CardTitle>1. Scraper Workflow</CardTitle>
          <CardDescription>
            Scrape recipe data from an AllRecipes URL using Cloudflare Browser
            Rendering API
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="scraper-url">Recipe URL</Label>
            <Input
              id="scraper-url"
              type="url"
              value={scraperUrl}
              onChange={(e) => setScraperUrl(e.target.value)}
              placeholder="https://www.allrecipes.com/recipe/..."
            />
          </div>

          <Button
            onClick={() => scrapeRecipeMutation.mutate({ url: scraperUrl })}
            disabled={scrapeRecipeMutation.isPending || !scraperUrl}
          >
            {scrapeRecipeMutation.isPending
              ? "Starting Scraper..."
              : "Start Scraper Workflow"}
          </Button>

          {scrapeRecipeMutation.isError && (
            <div className="text-red-500 text-sm">
              Error: {scrapeRecipeMutation.error.message}
            </div>
          )}

          {scraperInstanceId && (
            <div className="mt-4 p-4 bg-muted rounded-lg space-y-2">
              <div className="text-sm">
                <strong>Instance ID:</strong>{" "}
                <code className="bg-background px-1 rounded">
                  {scraperInstanceId}
                </code>
              </div>

              {scraperStatusQuery.data && (
                <div className="text-sm space-y-1">
                  <div>
                    <strong>Status:</strong>{" "}
                    <span
                      className={
                        scraperStatusQuery.data.status === "complete"
                          ? "text-green-600"
                          : scraperStatusQuery.data.status === "running"
                            ? "text-blue-600"
                            : "text-yellow-600"
                      }
                    >
                      {scraperStatusQuery.data.status}
                    </span>
                  </div>
                  {scraperStatusQuery.data.output && (
                    <div>
                      <strong>Output:</strong>
                      <pre className="mt-1 p-2 bg-background rounded text-xs overflow-auto max-h-40">
                        {JSON.stringify(
                          scraperStatusQuery.data.output,
                          null,
                          2
                        )}
                      </pre>
                    </div>
                  )}
                  {scraperStatusQuery.data.error && (
                    <div className="text-red-500">
                      <strong>Error:</strong>{" "}
                      {JSON.stringify(scraperStatusQuery.data.error)}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* Pipeline Workflow */}
      <Card>
        <CardHeader>
          <CardTitle>2. Pipeline Workflow</CardTitle>
          <CardDescription>
            Run the LLM analysis pipeline on a scraped recipe to extract and
            apply modifications
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="recipe-id">Recipe ID</Label>
            <Input
              id="recipe-id"
              value={recipeId}
              onChange={(e) => setRecipeId(e.target.value)}
              placeholder="Enter recipe ID from scraper output"
            />
            <p className="text-xs text-muted-foreground">
              Get the recipe ID from the scraper workflow output above
            </p>
          </div>

          <Button
            onClick={() => runPipelineMutation.mutate({ recipeId })}
            disabled={runPipelineMutation.isPending || !recipeId}
          >
            {runPipelineMutation.isPending
              ? "Starting Pipeline..."
              : "Start Pipeline Workflow"}
          </Button>

          {runPipelineMutation.isError && (
            <div className="text-red-500 text-sm">
              Error: {runPipelineMutation.error.message}
            </div>
          )}

          {pipelineInstanceId && (
            <div className="mt-4 p-4 bg-muted rounded-lg space-y-2">
              <div className="text-sm">
                <strong>Instance ID:</strong>{" "}
                <code className="bg-background px-1 rounded">
                  {pipelineInstanceId}
                </code>
              </div>

              {pipelineStatusQuery.data && (
                <div className="text-sm space-y-1">
                  <div>
                    <strong>Status:</strong>{" "}
                    <span
                      className={
                        pipelineStatusQuery.data.status === "complete"
                          ? "text-green-600"
                          : pipelineStatusQuery.data.status === "running"
                            ? "text-blue-600"
                            : "text-yellow-600"
                      }
                    >
                      {pipelineStatusQuery.data.status}
                    </span>
                  </div>
                  {pipelineStatusQuery.data.output && (
                    <div>
                      <strong>Output:</strong>
                      <pre className="mt-1 p-2 bg-background rounded text-xs overflow-auto max-h-40">
                        {JSON.stringify(
                          pipelineStatusQuery.data.output,
                          null,
                          2
                        )}
                      </pre>
                    </div>
                  )}
                  {pipelineStatusQuery.data.error && (
                    <div className="text-red-500">
                      <strong>Error:</strong>{" "}
                      {JSON.stringify(pipelineStatusQuery.data.error)}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
