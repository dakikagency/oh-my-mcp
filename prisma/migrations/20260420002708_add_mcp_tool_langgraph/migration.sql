-- CreateEnum
CREATE TYPE "McpToolKind" AS ENUM ('ATOMIC', 'COMPOSITE');

-- AlterTable
ALTER TABLE "mcp_tool" ADD COLUMN     "composition" JSONB,
ADD COLUMN     "kind" "McpToolKind" NOT NULL DEFAULT 'ATOMIC';
