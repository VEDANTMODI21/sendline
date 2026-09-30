-- Sendline schema. Every campaign and email is recorded here first; the Redis side (BullMQ timers,
-- throttle counters) is disposable and can be rebuilt from these tables by the boot reconciler.

CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  google_sub     text NOT NULL UNIQUE,
  email          text NOT NULL,
  name           text NOT NULL DEFAULT '',
  avatar_url     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_login_at  timestamptz NOT NULL DEFAULT now()
);

-- Shared pool of Ethereal SMTP identities. Password is sealed (AES-GCM) at rest.
CREATE TABLE senders (
  id            serial PRIMARY KEY,
  email         text NOT NULL UNIQUE,
  display_name  text NOT NULL,
  smtp_host     text NOT NULL DEFAULT 'smtp.ethereal.email',
  smtp_port     int  NOT NULL DEFAULT 587,
  smtp_user     text NOT NULL,
  smtp_pass_enc text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE slack_connections (
  user_id       uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  team_id       text NOT NULL,
  team_name     text NOT NULL,
  channel_name  text NOT NULL,
  webhook_enc   text NOT NULL,
  connected_at  timestamptz NOT NULL DEFAULT now()
);

-- One "compose" = one campaign. Subject/body are stored once, not per recipient.
CREATE TABLE campaigns (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_id       int  NOT NULL REFERENCES senders(id),
  subject         text NOT NULL,
  body_html       text NOT NULL,
  body_text       text NOT NULL,
  start_at        timestamptz NOT NULL,
  delay_seconds   int  NOT NULL CHECK (delay_seconds >= 0),
  hourly_limit    int  NOT NULL CHECK (hourly_limit > 0),
  recipient_count int  NOT NULL,
  client_key      text,                      -- Idempotency-Key from the client
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, client_key)
);

CREATE TABLE emails (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_id     int  NOT NULL REFERENCES senders(id),
  seq           int  NOT NULL,             -- position inside the campaign (ordering tiebreak)
  recipient     text NOT NULL,
  status        text NOT NULL DEFAULT 'scheduled'
                CHECK (status IN ('scheduled','deferred','sending','sent','failed','cancelled')),
  scheduled_at  timestamptz NOT NULL,      -- original plan, or the reserved slot after throttling
  sent_at       timestamptz,
  attempts      int  NOT NULL DEFAULT 0,
  last_error    text,
  message_id    text,
  preview_url   text,
  claimed_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, recipient)          -- same address twice in one upload is sent once
);

CREATE INDEX emails_outbox_idx ON emails (user_id, scheduled_at, seq)
  WHERE status IN ('scheduled','deferred','sending');
CREATE INDEX emails_sentbox_idx ON emails (user_id, sent_at DESC)
  WHERE status IN ('sent','failed');
CREATE INDEX emails_recovery_idx ON emails (scheduled_at, seq, id) WHERE status IN ('scheduled','deferred','sending');
