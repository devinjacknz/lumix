import { StructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { HeliusClient } from "@lumix/helius";

export class MonitorTool extends StructuredTool {
  name = "monitor";
  description = "Monitor transactions or token prices";
  schema = z.object({
    type: z.enum(["tx", "price"]).describe("Type of monitoring (tx/price)"),
    address: z.string().optional().describe("Address to monitor (for tx)"),
    token: z.string().optional().describe("Token to monitor (for price)")
  });

  constructor(private helius: HeliusClient) {
    super();
  }

  async _call(args: z.infer<typeof this.schema>) {
    try {
      if (args.type === "tx" && args.address) {
        return `Monitoring transactions for address ${args.address}`;
      } else if (args.type === "price" && args.token) {
        return `Monitoring price for token ${args.token}`;
      }
      throw new Error("Invalid monitoring parameters");
    } catch (error) {
      throw new Error(`Monitoring failed: ${(error as Error).message}`);
    }
  }
}
