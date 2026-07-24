CREATE TABLE `anchors` (
	`id` text PRIMARY KEY NOT NULL,
	`tx_hash` text NOT NULL,
	`composite_hash` text NOT NULL,
	`encrypted_payload` text NOT NULL,
	`user_id` text,
	`created_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `anchors_tx_hash_unique` ON `anchors` (`tx_hash`);--> statement-breakpoint
CREATE TABLE `cloud_signatures` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`label` text NOT NULL,
	`base64_png` text NOT NULL,
	`updated_at` integer,
	`created_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `cloud_signatures_user_id` ON `cloud_signatures` (`user_id`);--> statement-breakpoint
CREATE TABLE `cloud_text_snippets` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`label` text NOT NULL,
	`text` text NOT NULL,
	`font_size` real NOT NULL,
	`updated_at` integer,
	`created_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `cloud_text_snippets_user_id` ON `cloud_text_snippets` (`user_id`);--> statement-breakpoint
CREATE TABLE `magic_links` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`code` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used` integer DEFAULT false NOT NULL,
	`created_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `magic_links_code_unique` ON `magic_links` (`code`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_unique` ON `sessions` (`token`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`auth_provider` text DEFAULT 'email' NOT NULL,
	`provider_id` text,
	`wallet_address` text,
	`anchor_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_wallet_address_unique` ON `users` (`wallet_address`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_auth_provider_provider_id` ON `users` (`auth_provider`,`provider_id`);