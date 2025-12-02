CREATE TABLE `logs` (
	`id` text PRIMARY KEY NOT NULL,
	`timestamp` text NOT NULL,
	`level` text NOT NULL,
	`message` text NOT NULL,
	`app_name` text NOT NULL,
	`session_id` text NOT NULL,
	`environment` text NOT NULL,
	`metadata` text,
	`stack_trace` text,
	`context` text,
	`error_group_id` text,
	`trace_id` text,
	`span_id` text,
	`parent_span_id` text,
	`created_at` text DEFAULT '(datetime(''now''))'
);
--> statement-breakpoint
CREATE INDEX `idx_logs_timestamp` ON `logs` (`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_logs_level` ON `logs` (`level`);--> statement-breakpoint
CREATE INDEX `idx_logs_app_name` ON `logs` (`app_name`);--> statement-breakpoint
CREATE INDEX `idx_logs_session_id` ON `logs` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_logs_error_group_id` ON `logs` (`error_group_id`);--> statement-breakpoint
CREATE INDEX `idx_logs_trace_id` ON `logs` (`trace_id`);--> statement-breakpoint
CREATE INDEX `idx_logs_span_id` ON `logs` (`span_id`);--> statement-breakpoint
CREATE TABLE `traces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`app_name` text NOT NULL,
	`session_id` text NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text,
	`duration_ms` integer,
	`status` text DEFAULT 'running',
	`span_count` integer DEFAULT 0,
	`error_count` integer DEFAULT 0,
	`metadata` text,
	`created_at` text DEFAULT '(datetime(''now''))'
);
--> statement-breakpoint
CREATE INDEX `idx_traces_app_name` ON `traces` (`app_name`);--> statement-breakpoint
CREATE INDEX `idx_traces_session_id` ON `traces` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_traces_start_time` ON `traces` (`start_time`);--> statement-breakpoint
CREATE INDEX `idx_traces_status` ON `traces` (`status`);--> statement-breakpoint
CREATE TABLE `spans` (
	`id` text PRIMARY KEY NOT NULL,
	`trace_id` text NOT NULL,
	`parent_span_id` text,
	`name` text NOT NULL,
	`operation_type` text,
	`start_time` text NOT NULL,
	`end_time` text,
	`duration_ms` integer,
	`status` text DEFAULT 'running',
	`metadata` text,
	`created_at` text DEFAULT '(datetime(''now''))',
	FOREIGN KEY (`trace_id`) REFERENCES `traces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_spans_trace_id` ON `spans` (`trace_id`);--> statement-breakpoint
CREATE INDEX `idx_spans_parent_span_id` ON `spans` (`parent_span_id`);--> statement-breakpoint
CREATE INDEX `idx_spans_start_time` ON `spans` (`start_time`);--> statement-breakpoint
CREATE TABLE `error_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`fingerprint` text NOT NULL,
	`message` text NOT NULL,
	`app_name` text NOT NULL,
	`first_seen` text NOT NULL,
	`last_seen` text NOT NULL,
	`occurrence_count` integer DEFAULT 1,
	`status` text DEFAULT 'unreviewed',
	`stack_trace_preview` text,
	`created_at` text DEFAULT '(datetime(''now''))',
	`updated_at` text DEFAULT '(datetime(''now''))'
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_error_groups_fingerprint` ON `error_groups` (`fingerprint`);--> statement-breakpoint
CREATE INDEX `idx_error_groups_status` ON `error_groups` (`status`);--> statement-breakpoint
CREATE INDEX `idx_error_groups_app_name` ON `error_groups` (`app_name`);--> statement-breakpoint
CREATE INDEX `idx_error_groups_last_seen` ON `error_groups` (`last_seen`);--> statement-breakpoint
CREATE INDEX `idx_error_groups_occurrence_count` ON `error_groups` (`occurrence_count`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT '(datetime(''now''))'
);
