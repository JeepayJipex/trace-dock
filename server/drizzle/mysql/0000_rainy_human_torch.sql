CREATE TABLE `logs` (
	`id` varchar(36) NOT NULL,
	`timestamp` datetime(3) NOT NULL,
	`level` varchar(10) NOT NULL,
	`message` text NOT NULL,
	`app_name` varchar(255) NOT NULL,
	`session_id` varchar(255) NOT NULL,
	`environment` text NOT NULL,
	`metadata` text,
	`stack_trace` text,
	`context` text,
	`error_group_id` varchar(36),
	`trace_id` varchar(255),
	`span_id` varchar(255),
	`parent_span_id` varchar(255),
	`created_at` datetime(3),
	CONSTRAINT `logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `traces` (
	`id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`app_name` varchar(255) NOT NULL,
	`session_id` varchar(255) NOT NULL,
	`start_time` datetime(3) NOT NULL,
	`end_time` datetime(3),
	`duration_ms` int,
	`status` varchar(20) DEFAULT 'running',
	`span_count` int DEFAULT 0,
	`error_count` int DEFAULT 0,
	`metadata` text,
	`created_at` datetime(3),
	CONSTRAINT `traces_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `spans` (
	`id` varchar(36) NOT NULL,
	`trace_id` varchar(36) NOT NULL,
	`parent_span_id` varchar(36),
	`name` varchar(255) NOT NULL,
	`operation_type` varchar(100),
	`start_time` datetime(3) NOT NULL,
	`end_time` datetime(3),
	`duration_ms` int,
	`status` varchar(20) DEFAULT 'running',
	`metadata` text,
	`created_at` datetime(3),
	CONSTRAINT `spans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `error_groups` (
	`id` varchar(36) NOT NULL,
	`fingerprint` varchar(255) NOT NULL,
	`message` text NOT NULL,
	`app_name` varchar(255) NOT NULL,
	`first_seen` datetime(3) NOT NULL,
	`last_seen` datetime(3) NOT NULL,
	`occurrence_count` int DEFAULT 1,
	`status` varchar(20) DEFAULT 'unreviewed',
	`stack_trace_preview` text,
	`created_at` datetime(3),
	`updated_at` datetime(3),
	CONSTRAINT `error_groups_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_mysql_error_groups_fingerprint` UNIQUE(`fingerprint`)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` varchar(255) NOT NULL,
	`value` text NOT NULL,
	`updated_at` datetime(3),
	CONSTRAINT `settings_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
ALTER TABLE `spans` ADD CONSTRAINT `spans_trace_id_traces_id_fk` FOREIGN KEY (`trace_id`) REFERENCES `traces`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_mysql_logs_timestamp` ON `logs` (`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_mysql_logs_level` ON `logs` (`level`);--> statement-breakpoint
CREATE INDEX `idx_mysql_logs_app_name` ON `logs` (`app_name`);--> statement-breakpoint
CREATE INDEX `idx_mysql_logs_session_id` ON `logs` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_mysql_logs_error_group_id` ON `logs` (`error_group_id`);--> statement-breakpoint
CREATE INDEX `idx_mysql_logs_trace_id` ON `logs` (`trace_id`);--> statement-breakpoint
CREATE INDEX `idx_mysql_traces_app_name` ON `traces` (`app_name`);--> statement-breakpoint
CREATE INDEX `idx_mysql_traces_session_id` ON `traces` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_mysql_traces_start_time` ON `traces` (`start_time`);--> statement-breakpoint
CREATE INDEX `idx_mysql_traces_status` ON `traces` (`status`);--> statement-breakpoint
CREATE INDEX `idx_mysql_spans_trace_id` ON `spans` (`trace_id`);--> statement-breakpoint
CREATE INDEX `idx_mysql_spans_parent_span_id` ON `spans` (`parent_span_id`);--> statement-breakpoint
CREATE INDEX `idx_mysql_spans_start_time` ON `spans` (`start_time`);--> statement-breakpoint
CREATE INDEX `idx_mysql_error_groups_status` ON `error_groups` (`status`);--> statement-breakpoint
CREATE INDEX `idx_mysql_error_groups_app_name` ON `error_groups` (`app_name`);--> statement-breakpoint
CREATE INDEX `idx_mysql_error_groups_last_seen` ON `error_groups` (`last_seen`);--> statement-breakpoint
CREATE INDEX `idx_mysql_error_groups_occurrence_count` ON `error_groups` (`occurrence_count`);