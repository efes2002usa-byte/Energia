CREATE TABLE `device_hourly_energy` (
	`device_id` text NOT NULL,
	`date` text NOT NULL,
	`hour` integer NOT NULL,
	`consumption_version_id` text NOT NULL,
	`placement_version_id` text NOT NULL,
	`zone_id` text NOT NULL,
	`category_id` text NOT NULL,
	`energy_micros` integer NOT NULL,
	`formula` text NOT NULL,
	`calculated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`device_id`, `date`, `hour`),
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`consumption_version_id`) REFERENCES `device_consumption_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`placement_version_id`) REFERENCES `device_placement_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`zone_id`) REFERENCES `zones`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `device_categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_device_hourly_energy_date_hour` ON `device_hourly_energy` (`date`,`hour`);--> statement-breakpoint
CREATE INDEX `idx_device_hourly_energy_zone_date` ON `device_hourly_energy` (`zone_id`,`date`);--> statement-breakpoint
CREATE INDEX `idx_device_hourly_energy_category_date` ON `device_hourly_energy` (`category_id`,`date`);--> statement-breakpoint
CREATE TABLE `hourly_reconciliation` (
	`meter_id` text NOT NULL,
	`date` text NOT NULL,
	`hour` integer NOT NULL,
	`actual_micros` integer,
	`actual_quality` text NOT NULL,
	`devices_micros` integer DEFAULT 0 NOT NULL,
	`delta_micros` integer,
	`status` text NOT NULL,
	`error_message` text DEFAULT '' NOT NULL,
	`calculated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`meter_id`, `date`, `hour`),
	FOREIGN KEY (`meter_id`) REFERENCES `meters`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_hourly_reconciliation_date_status` ON `hourly_reconciliation` (`date`,`status`);--> statement-breakpoint
CREATE INDEX `idx_hourly_reconciliation_quality_date` ON `hourly_reconciliation` (`actual_quality`,`date`);--> statement-breakpoint
PRAGMA optimize;
