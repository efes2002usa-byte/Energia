CREATE TABLE `tariff_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`valid_from_date` text NOT NULL,
	`price_micros` integer NOT NULL,
	`comment` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_tariff_versions_valid_from_date` ON `tariff_versions` (`valid_from_date`);--> statement-breakpoint
CREATE INDEX `idx_tariff_versions_effective_date` ON `tariff_versions` (`valid_from_date`);