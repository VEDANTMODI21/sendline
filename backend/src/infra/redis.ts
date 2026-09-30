import IORedis, { RedisOptions } from 'ioredis';
import { env } from '../config/env';

// BullMQ workers use blocking commands, which require maxRetriesPerRequest = null.
const base: RedisOptions = { maxRetriesPerRequest: null, enableReadyCheck: true };

/** Each call returns a fresh connection (BullMQ recommends separate ones for Queue vs Worker). */
export const createRedis = (name: string) => new IORedis(env.redisUrl, { ...base, connectionName: `sendline:${name}` });

/** Shared connection for app-level commands (throttle script, markers). */
export const redis = createRedis('app');
