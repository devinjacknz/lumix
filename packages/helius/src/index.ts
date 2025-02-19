import { HeliusConfig } from "@lumix/core";
import { HeliusClient } from "./client";

export function createHeliusClient(config: HeliusConfig): HeliusClient {
  return new HeliusClient(config);
}

export { HeliusClient };
