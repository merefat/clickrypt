-- Add sort_order column to resources to match the reorder feature schema.
ALTER TABLE "resources" ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;
