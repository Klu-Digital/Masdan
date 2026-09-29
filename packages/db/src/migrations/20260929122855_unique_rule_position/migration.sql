DROP INDEX "transaction_rule_organization_position_idx";--> statement-breakpoint
ALTER TABLE "transaction_rule" ADD CONSTRAINT "transaction_rule_organization_position_key" UNIQUE("organization_id","position") DEFERRABLE INITIALLY DEFERRED;
