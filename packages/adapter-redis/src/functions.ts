export const REDIS_FUNCTION_LIBRARY = `#!lua name=messanga11_core_v1
redis.register_function('m11_rate_limit_v1', function(keys, args)
  local cost = tonumber(args[1])
  local limit = tonumber(args[2])
  local window = tonumber(args[3])
  local current = redis.call('INCRBY', keys[1], cost)
  if current == cost then redis.call('PEXPIRE', keys[1], window) end
  local ttl = redis.call('PTTL', keys[1])
  if current <= limit then return {1, limit - current, 0} end
  return {0, 0, ttl}
end)

redis.register_function('m11_quota_reserve_v1', function(keys, args)
  local cost = tonumber(args[1])
  local limit = tonumber(args[2])
  local ttl = tonumber(args[3])
  local current = tonumber(redis.call('GET', keys[1]) or '0')
  if current + cost > limit then return {0} end
  if not redis.call('SET', keys[2], 'pending', 'PX', ttl, 'NX') then return {0} end
  redis.call('INCRBY', keys[1], cost)
  redis.call('PEXPIRE', keys[1], ttl)
  return {1}
end)

redis.register_function('m11_quota_commit_v1', function(keys, args)
  if redis.call('GET', keys[1]) ~= 'pending' then return 0 end
  redis.call('SET', keys[1], 'committed', 'KEEPTTL')
  return 1
end)

redis.register_function('m11_quota_release_v1', function(keys, args)
  if redis.call('GET', keys[2]) ~= 'pending' then return 0 end
  redis.call('DEL', keys[2])
  local current = tonumber(redis.call('GET', keys[1]) or '0')
  local cost = tonumber(args[1])
  if current <= cost then redis.call('DEL', keys[1]) else redis.call('DECRBY', keys[1], cost) end
  return 1
end)

redis.register_function('m11_idempotency_acquire_v1', function(keys, args)
  local existing = redis.call('GET', keys[1])
  if existing then return {0, existing} end
  redis.call('SET', keys[1], 'pending:' .. args[1], 'PX', tonumber(args[2]), 'NX')
  return {1}
end)

redis.register_function('m11_idempotency_complete_v1', function(keys, args)
  if redis.call('GET', keys[1]) ~= 'pending:' .. args[1] then return 0 end
  redis.call('SET', keys[1], 'complete:' .. args[2], 'PX', tonumber(args[3]))
  return 1
end)

redis.register_function('m11_idempotency_release_v1', function(keys, args)
  if redis.call('GET', keys[1]) ~= 'pending:' .. args[1] then return 0 end
  redis.call('DEL', keys[1])
  return 1
end)`;
