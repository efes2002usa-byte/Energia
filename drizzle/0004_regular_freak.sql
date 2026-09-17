CREATE TABLE `app_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`facility_name` text NOT NULL,
	`timezone` text NOT NULL,
	`currency_code` text NOT NULL,
	`percentage_tolerance_micros` integer NOT NULL,
	`absolute_tolerance_micros` integer NOT NULL,
	`closed_from_hour` integer NOT NULL,
	`closed_to_hour` integer NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
