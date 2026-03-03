import { startMcpServer } from '../mcp/server.js';

export async function mcpCommand(options: { profile?: string }): Promise<void> {
  await startMcpServer({ profileDir: options.profile });
}
