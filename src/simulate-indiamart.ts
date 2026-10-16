/**
 * Simulator to post IndiaMART leads to the local server
 */

import "dotenv/config";
import { buildIndiaMartSample, type SampleShape } from "./intake/indiamart-sample.js";

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  
  for (const arg of argv.slice(2)) {
    if (arg.startsWith("--")) {
      const withoutDashes = arg.slice(2);
      const eqIndex = withoutDashes.indexOf("=");
      
      if (eqIndex === -1) {
        args[withoutDashes] = true;
      } else {
        const key = withoutDashes.slice(0, eqIndex);
        const value = withoutDashes.slice(eqIndex + 1);
        args[key] = value;
      }
    }
  }
  
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  
  const url = typeof args.url === "string" ? args.url : `http://localhost:${process.env.PORT || 3000}`;
  
  let token: string;
  if (args["wrong-token"]) {
    token = "wrong-token";
  } else {
    if (!process.env.INDIAMART_PUSH_TOKEN) {
      console.log("INDIAMART_PUSH_TOKEN is not set");
      process.exit(1);
    }
    token = process.env.INDIAMART_PUSH_TOKEN;
  }
  
  let body: unknown;
  let uniqueId: string | undefined;
  
  if (args.bad) {
    body = { hello: "x" };
  } else {
    const shape = args.shape as string | undefined;
    if (shape && shape !== "wrapped" && shape !== "body" && shape !== "flat") {
      console.log(`Invalid shape: ${shape}. Must be wrapped, body, or flat.`);
      process.exit(1);
    }
    
    const options: Record<string, unknown> = {};
    
    if (typeof args.id === "string") {
      options.uniqueId = args.id;
    }
    
    if (args["no-name"]) {
      options.name = null;
    } else if (typeof args.name === "string") {
      options.name = args.name;
    }
    
    if (args["no-phone"]) {
      options.phone = null;
    } else if (typeof args.phone === "string") {
      options.phone = args.phone;
    }
    
    if (typeof args.email === "string") {
      options.email = args.email;
    }
    
    if (typeof args.message === "string") {
      options.message = args.message;
    }
    
    if (typeof args.type === "string") {
      options.queryType = args.type;
    }
    
    if (shape) {
      options.shape = shape as SampleShape;
    }
    
    body = buildIndiaMartSample(options);
    
    const bodyObj = body as Record<string, unknown>;
    if (bodyObj.UNIQUE_QUERY_ID) {
      uniqueId = String(bodyObj.UNIQUE_QUERY_ID);
    } else if (bodyObj.RESPONSE && typeof bodyObj.RESPONSE === "object") {
      const response = bodyObj.RESPONSE as Record<string, unknown>;
      uniqueId = String(response.UNIQUE_QUERY_ID);
    } else if (bodyObj.body && typeof bodyObj.body === "object") {
      const nestedBody = bodyObj.body as Record<string, unknown>;
      if (nestedBody.RESPONSE && typeof nestedBody.RESPONSE === "object") {
        const response = nestedBody.RESPONSE as Record<string, unknown>;
        uniqueId = String(response.UNIQUE_QUERY_ID);
      }
    }
  }
  
  const endpoint = `${url}/intake/indiamart/${token}`;
  
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    
    const responseText = await response.text();
    
    console.log(`POST ${url}/intake/indiamart/***`);
    console.log(response.status);
    console.log(responseText);
    
    if (uniqueId) {
      console.log(uniqueId);
    }
  } catch (error) {
    console.log(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
