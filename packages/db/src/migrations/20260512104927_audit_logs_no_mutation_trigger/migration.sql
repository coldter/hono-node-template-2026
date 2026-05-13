-- Custom SQL migration file, put your code below! --
CREATE OR REPLACE FUNCTION audit_logs_no_mutation_fn() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'audit_logs is append-only'; END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_logs_no_mutation_trigger
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION audit_logs_no_mutation_fn();
