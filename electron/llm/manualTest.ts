import { parseEmailWithLLM } from "./llmEngine";

async function main() {
  const subject = "Application received – Data Analyst";
  const plaintext = "Thanks for applying to Acme. We received your application for Data Analyst.";

  const result = await parseEmailWithLLM({ subject, plaintext });
  // Print strict JSON
  process.stdout.write(JSON.stringify(result));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
