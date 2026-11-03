CREATE TABLE `enhanced_recipe` (
	`id` text PRIMARY KEY NOT NULL,
	`original_recipe_id` text NOT NULL,
	`title` text NOT NULL,
	`ingredients` text,
	`instructions` text,
	`modifications_applied` text,
	`enhancement_summary` text,
	`pipeline_version` text DEFAULT '1.0.0',
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`original_recipe_id`) REFERENCES `recipe`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `recipe` (
	`id` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`ingredients` text,
	`instructions` text,
	`rating` text,
	`nutrition` text,
	`prep_time` text,
	`cook_time` text,
	`total_time` text,
	`servings` text,
	`author` text,
	`scraped_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `review` (
	`id` text PRIMARY KEY NOT NULL,
	`recipe_id` text NOT NULL,
	`text` text NOT NULL,
	`rating` integer,
	`username` text,
	`review_date` text,
	`has_modification` integer DEFAULT false,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipe`(`id`) ON UPDATE no action ON DELETE cascade
);
