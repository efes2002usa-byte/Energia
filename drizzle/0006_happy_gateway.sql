CREATE TABLE `recalculation_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`from_date` text NOT NULL,
	`from_hour` integer NOT NULL,
	`to_date` text NOT NULL,
	`to_hour` integer NOT NULL,
	`reason` text NOT NULL,
	`comment` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`total_hours` integer NOT NULL,
	`processed_hours` integer DEFAULT 0 NOT NULL,
	`error_message` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`started_at` text,
	`completed_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_recalculation_jobs_status_created` ON `recalculation_jobs` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_recalculation_jobs_range` ON `recalculation_jobs` (`from_date`,`to_date`);