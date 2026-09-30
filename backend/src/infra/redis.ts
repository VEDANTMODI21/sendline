import IORedis, { RedisOptions } from 'ioredis';
import { env } from '../config/env';

// BullMQ workers use blocking commands, which require maxRetriesPerRequest = null.
// family: 0 → resolve both IPv4 and IPv6 (needed on hosts like Railway whose private network is IPv6-only).
const base: RedisOptions = { maxRetriesPerRequest: null, enableReadyCheck: true, family: 0 };

/** Each call returns a fresh connection (BullMQ recommends separate ones for Queue vs Worker). */
export const createRedis = (name: string) => new IORedis(env.redisUrl, { ...base, connectionName: `sendline:${name}` });

/** Shared connection for app-level commands (throttle script, markers). */
export const redis = createRedis('app');
