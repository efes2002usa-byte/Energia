CREATE TABLE `day_workflows` (
	`date` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'EMPTY' NOT NULL,
	`schedule_completed_at` text,
	`confirmed_at` text,
	`confirmation_comment` text DEFAULT '' NOT NULL,
	`unlocked_at` text,
	`unlock_reason` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_day_workflows_status_date` ON `day_workflows` (`status`,`date`);