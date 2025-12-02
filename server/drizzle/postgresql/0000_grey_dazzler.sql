CREATE TABLE "logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"level" varchar(10) NOT NULL,
	"message" text NOT NULL,
	"app_name" varchar(255) NOT NULL,
	"session_id" varchar(255) NOT NULL,
	"environment" text NOT NULL,
	"metadata" text,
	"stack_trace" text,
	"context" text,
	"error_group_id" uuid,
	"trace_id" varchar(255),
	"span_id" varchar(255),
	"parent_span_id" varchar(255),
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "traces" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"app_name" varchar(255) NOT NULL,
	"session_id" varchar(255) NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone,
	"duration_ms" integer,
	"status" varchar(20) DEFAULT 'running',
	"span_count" integer DEFAULT 0,
	"error_count" integer DEFAULT 0,
	"metadata" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "spans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"trace_id" uuid NOT NULL,
	"parent_span_id" uuid,
	"name" varchar(255) NOT NULL,
	"operation_type" varchar(100),
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone,
	"duration_ms" integer,
	"status" varchar(20) DEFAULT 'running',
	"metadata" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "error_groups" (
	"id" uuid PRIMARY KEY NOT NULL,
	"fingerprint" varchar(255) NOT NULL,
	"message" text NOT NULL,
	"app_name" varchar(255) NOT NULL,
	"first_seen" timestamp with time zone NOT NULL,
	"last_seen" timestamp with time zone NOT NULL,
	"occurrence_count" integer DEFAULT 1,
	"status" varchar(20) DEFAULT 'unreviewed',
	"stack_trace_preview" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" varchar(255) PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "spans" ADD CONSTRAINT "spans_trace_id_traces_id_fk" FOREIGN KEY ("trace_id") REFERENCES "public"."traces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_pg_logs_timestamp" ON "logs" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_pg_logs_level" ON "logs" USING btree ("level");--> statement-breakpoint
CREATE INDEX "idx_pg_logs_app_name" ON "logs" USING btree ("app_name");--> statement-breakpoint
CREATE INDEX "idx_pg_logs_session_id" ON "logs" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_pg_logs_error_group_id" ON "logs" USING btree ("error_group_id");--> statement-breakpoint
CREATE INDEX "idx_pg_logs_trace_id" ON "logs" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "idx_pg_traces_app_name" ON "traces" USING btree ("app_name");--> statement-breakpoint
CREATE INDEX "idx_pg_traces_session_id" ON "traces" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_pg_traces_start_time" ON "traces" USING btree ("start_time");--> statement-breakpoint
CREATE INDEX "idx_pg_traces_status" ON "traces" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_pg_spans_trace_id" ON "spans" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "idx_pg_spans_parent_span_id" ON "spans" USING btree ("parent_span_id");--> statement-breakpoint
CREATE INDEX "idx_pg_spans_start_time" ON "spans" USING btree ("start_time");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_pg_error_groups_fingerprint" ON "error_groups" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "idx_pg_error_groups_status" ON "error_groups" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_pg_error_groups_app_name" ON "error_groups" USING btree ("app_name");--> statement-breakpoint
CREATE INDEX "idx_pg_error_groups_last_seen" ON "error_groups" USING btree ("last_seen");--> statement-breakpoint
CREATE INDEX "idx_pg_error_groups_occurrence_count" ON "error_groups" USING btree ("occurrence_count");