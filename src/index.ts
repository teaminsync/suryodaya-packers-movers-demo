import "dotenv/config";
import { aiRouter } from "./ai/router.js";

/**
 * Main entry point for the application
 */
async function main() {
  try {
    // Initialize AI router at startup
    await aiRouter.initialize();

    console.log("\n✓ Application initialized successfully");
    console.log("AI router ready for requests\n");

    // Application logic will go here in future specs
  } catch (error) {
    console.error("Failed to initialize application:", error);
    process.exit(1);
  }
}

main();
