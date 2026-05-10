process.env.NODE_ENV = "production";

try {
  const { productionConfigIssues } = await import("../dist/server/server/config.js");
  const issues = productionConfigIssues();
  if (issues.length > 0) {
    console.error("Production configuration is not safe:");
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    process.exit(1);
  }
  console.log("Production configuration check passed.");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
