-- Custom SQL migration file, put your code below! --
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION generate_prefixed_cuid(prefix text)
RETURNS text AS $$
DECLARE
    timestamp_hex text;
    random_hex text;
BEGIN
    timestamp_hex = LOWER(TO_HEX(EXTRACT(EPOCH FROM NOW())::BIGINT));
    random_hex = encode(gen_random_bytes(8), 'hex');
    RETURN prefix || '_' || timestamp_hex || random_hex;
END;
$$ LANGUAGE plpgsql;
