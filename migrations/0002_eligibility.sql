ALTER TABLE routes ADD COLUMN eligible_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN eligible_at INTEGER NOT NULL DEFAULT 0;
CREATE INDEX commutes_day ON commutes(day);
