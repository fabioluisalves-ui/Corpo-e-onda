-- Corpo & Onda Estoque — migração inicial (0001_init)
-- Aplicável por: prisma migrate deploy

CREATE TYPE "ProductKind" AS ENUM ('SINGLE','STOCKED_KIT','VIRTUAL_KIT');
CREATE TYPE "MovementType" AS ENUM (
  'PRODUCTION_ENTRY','PURCHASE_ENTRY','MANUAL_SALE','NUVEMSHOP_SALE','CUSTOMER_RETURN',
  'ADJUSTMENT_IN','ADJUSTMENT_OUT','KIT_ASSEMBLY','KIT_DISASSEMBLY','RESERVATION','RESERVATION_RELEASE'
);
CREATE TYPE "Role" AS ENUM ('ADMIN','MANAGER','STOCK_OPERATOR','VIEWER');

CREATE TABLE "organizations" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);

CREATE TABLE "users" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "orgId" UUID NOT NULL REFERENCES "organizations"("id"),
  "email" TEXT NOT NULL UNIQUE,
  "passwordHash" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE INDEX "users_orgId_idx" ON "users"("orgId");

CREATE TABLE "memberships" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "orgId" UUID NOT NULL REFERENCES "organizations"("id"),
  "userId" UUID NOT NULL REFERENCES "users"("id"),
  "role" "Role" NOT NULL,
  UNIQUE ("orgId","userId")
);

CREATE TABLE "stock_locations" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "orgId" UUID NOT NULL REFERENCES "organizations"("id"),
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  UNIQUE ("orgId","code")
);

CREATE TABLE "products" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "orgId" UUID NOT NULL REFERENCES "organizations"("id"),
  "name" TEXT NOT NULL,
  "category" TEXT,
  "kind" "ProductKind" NOT NULL DEFAULT 'SINGLE',
  "description" TEXT,
  "photoUrl" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE INDEX "products_orgId_name_idx" ON "products"("orgId","name");

CREATE TABLE "product_variants" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "orgId" UUID NOT NULL REFERENCES "organizations"("id"),
  "productId" UUID NOT NULL REFERENCES "products"("id"),
  "sku" TEXT NOT NULL,
  "skuNormalized" TEXT NOT NULL,
  "color" TEXT,
  "size" TEXT,
  "priceCents" INTEGER,
  "gtin" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  UNIQUE ("orgId","skuNormalized")
);
CREATE INDEX "product_variants_orgId_sku_idx" ON "product_variants"("orgId","sku");
CREATE INDEX "product_variants_productId_idx" ON "product_variants"("productId");

CREATE TABLE "barcodes" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "orgId" UUID NOT NULL,
  "variantId" UUID NOT NULL REFERENCES "product_variants"("id"),
  "kind" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  UNIQUE ("orgId","value")
);
CREATE INDEX "barcodes_value_idx" ON "barcodes"("value");

CREATE TABLE "kit_components" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "orgId" UUID NOT NULL,
  "kitVariantId" UUID NOT NULL REFERENCES "product_variants"("id"),
  "componentId" UUID NOT NULL REFERENCES "product_variants"("id"),
  "quantityPerKit" INTEGER NOT NULL,
  UNIQUE ("kitVariantId","componentId")
);
CREATE INDEX "kit_components_componentId_idx" ON "kit_components"("componentId");

CREATE TABLE "stock_balances" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "orgId" UUID NOT NULL REFERENCES "organizations"("id"),
  "locationId" UUID NOT NULL,
  "variantId" UUID NOT NULL REFERENCES "product_variants"("id"),
  "onHand" INTEGER NOT NULL DEFAULT 0,
  "reserved" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  UNIQUE ("orgId","locationId","variantId")
);
CREATE INDEX "stock_balances_variantId_idx" ON "stock_balances"("variantId");

CREATE TABLE "stock_reservations" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "orgId" UUID NOT NULL,
  "locationId" UUID NOT NULL,
  "variantId" UUID NOT NULL REFERENCES "product_variants"("id"),
  "quantity" INTEGER NOT NULL,
  "externalOrderId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE INDEX "stock_reservations_externalOrderId_idx" ON "stock_reservations"("externalOrderId");

CREATE TABLE "inventory_movements" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "orgId" UUID NOT NULL REFERENCES "organizations"("id"),
  "locationId" UUID NOT NULL,
  "variantId" UUID NOT NULL REFERENCES "product_variants"("id"),
  "type" "MovementType" NOT NULL,
  "quantity" INTEGER NOT NULL,
  "previousOnHand" INTEGER NOT NULL,
  "newOnHand" INTEGER NOT NULL,
  "previousReserved" INTEGER NOT NULL DEFAULT 0,
  "newReserved" INTEGER NOT NULL DEFAULT 0,
  "userId" UUID,
  "origin" TEXT NOT NULL,
  "reason" TEXT,
  "externalOrderNumber" TEXT,
  "idempotencyKey" TEXT,
  "reversalOfMovementId" UUID,
  "groupId" UUID,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);
-- Idempotência: nulos são permitidos e não colidem entre si (semântica UNIQUE do Postgres).
CREATE UNIQUE INDEX "uq_movement_idempotency" ON "inventory_movements"("orgId","idempotencyKey");
CREATE INDEX "inventory_movements_variantId_createdAt_idx" ON "inventory_movements"("variantId","createdAt");
CREATE INDEX "inventory_movements_orgId_type_createdAt_idx" ON "inventory_movements"("orgId","type","createdAt");
CREATE INDEX "inventory_movements_externalOrderNumber_idx" ON "inventory_movements"("externalOrderNumber");
CREATE INDEX "inventory_movements_groupId_idx" ON "inventory_movements"("groupId");

CREATE TABLE "inventory_movement_items" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "movementId" UUID NOT NULL REFERENCES "inventory_movements"("id"),
  "variantId" UUID NOT NULL,
  "quantity" INTEGER NOT NULL,
  "role" TEXT NOT NULL,
  "externalItemId" TEXT
);
CREATE INDEX "inventory_movement_items_movementId_idx" ON "inventory_movement_items"("movementId");

CREATE TABLE "audit_logs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "orgId" UUID NOT NULL,
  "userId" UUID,
  "action" TEXT NOT NULL,
  "entity" TEXT,
  "entityId" TEXT,
  "ip" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE INDEX "audit_logs_orgId_createdAt_idx" ON "audit_logs"("orgId","createdAt");

CREATE TABLE "integrations" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "orgId" UUID NOT NULL REFERENCES "organizations"("id"),
  "provider" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "encryptedTokens" TEXT,
  "externalStoreId" TEXT,
  "lastSyncAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'DISCONNECTED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  UNIQUE ("orgId","provider")
);

CREATE TABLE "external_variant_mappings" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "orgId" UUID NOT NULL,
  "provider" TEXT NOT NULL,
  "variantId" UUID NOT NULL,
  "externalProductId" TEXT NOT NULL,
  "externalVariantId" TEXT NOT NULL,
  "externalLocationId" TEXT,
  "sku" TEXT NOT NULL,
  UNIQUE ("orgId","provider","externalVariantId")
);
CREATE INDEX "external_variant_mappings_variantId_idx" ON "external_variant_mappings"("variantId");
CREATE INDEX "external_variant_mappings_sku_idx" ON "external_variant_mappings"("sku");

CREATE TABLE "external_orders" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "orgId" UUID NOT NULL,
  "provider" TEXT NOT NULL,
  "externalOrderId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  UNIQUE ("orgId","provider","externalOrderId")
);
CREATE INDEX "external_orders_externalOrderId_idx" ON "external_orders"("externalOrderId");

CREATE TABLE "webhook_inbox" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "orgId" UUID,
  "provider" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "externalId" TEXT,
  "hmacValid" BOOLEAN NOT NULL DEFAULT false,
  "payload" JSONB NOT NULL,
  "processedAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'RECEIVED',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "dedupeKey" TEXT NOT NULL UNIQUE
);
CREATE INDEX "webhook_inbox_provider_event_idx" ON "webhook_inbox"("provider","event");
CREATE INDEX "webhook_inbox_status_idx" ON "webhook_inbox"("status");

CREATE TABLE "outbox_jobs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "orgId" UUID NOT NULL,
  "type" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "runAfter" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE INDEX "outbox_jobs_status_runAfter_idx" ON "outbox_jobs"("status","runAfter");
