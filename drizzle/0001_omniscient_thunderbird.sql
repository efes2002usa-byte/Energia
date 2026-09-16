CREATE TABLE `device_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`is_system` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_device_categories_normalized_name` ON `device_categories` (`normalized_name`);--> statement-breakpoint
CREATE INDEX `idx_device_categories_active_sort` ON `device_categories` (`is_active`,`sort_order`);--> statement-breakpoint
CREATE TABLE `device_consumption_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`valid_from_date` text NOT NULL,
	`mode` text NOT NULL,
	`consumption_per_hour_micros` integer,
	`nominal_power_micros` integer,
	`load_factor_ppm` integer,
	`quantity` integer DEFAULT 1 NOT NULL,
	`comment` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_device_consumption_versions_date` ON `device_consumption_versions` (`device_id`,`valid_from_date`);--> statement-breakpoint
CREATE INDEX `idx_device_consumption_versions_lookup` ON `device_consumption_versions` (`device_id`,`valid_from_date`);--> statement-breakpoint
CREATE TABLE `device_default_schedule` (
	`device_id` text NOT NULL,
	`weekday` integer NOT NULL,
	`hour` integer NOT NULL,
	PRIMARY KEY(`device_id`, `weekday`, `hour`),
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_device_default_schedule_device_weekday` ON `device_default_schedule` (`device_id`,`weekday`);--> statement-breakpoint
CREATE TABLE `device_on_hour` (
	`device_id` text NOT NULL,
	`date` text NOT NULL,
	`hour` integer NOT NULL,
	`source` text DEFAULT 'MANUAL' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`device_id`, `date`, `hour`),
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_device_on_hour_date_device` ON `device_on_hour` (`date`,`device_id`);--> statement-breakpoint
CREATE TABLE `device_placement_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`valid_from_date` text NOT NULL,
	`zone_id` text NOT NULL,
	`category_id` text NOT NULL,
	`comment` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`zone_id`) REFERENCES `zones`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `device_categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_device_placement_versions_date` ON `device_placement_versions` (`device_id`,`valid_from_date`);--> statement-breakpoint
CREATE INDEX `idx_device_placement_versions_lookup` ON `device_placement_versions` (`device_id`,`valid_from_date`);--> statement-breakpoint
CREATE INDEX `idx_device_placement_versions_zone_category` ON `device_placement_versions` (`zone_id`,`category_id`);--> statement-breakpoint
CREATE TABLE `device_schedule_days` (
	`device_id` text NOT NULL,
	`date` text NOT NULL,
	`source` text DEFAULT 'MANUAL' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`device_id`, `date`),
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_device_schedule_days_date` ON `device_schedule_days` (`date`);--> statement-breakpoint
CREATE TABLE `devices` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`active_from_date` text NOT NULL,
	`inactive_from_date` text,
	`is_archived` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_devices_active_dates` ON `devices` (`is_archived`,`active_from_date`,`inactive_from_date`);--> statement-breakpoint
CREATE TABLE `zones` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_zones_normalized_name` ON `zones` (`normalized_name`);--> statement-breakpoint
CREATE INDEX `idx_zones_active_sort` ON `zones` (`is_active`,`sort_order`);--> statement-breakpoint
PRAGMA optimize;
