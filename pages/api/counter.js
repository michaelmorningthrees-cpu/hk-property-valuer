import Redis from 'ioredis';

// 直接使用 REDIS_URL 連線
const redis = new Redis(process.env.REDIS_URL);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    if (req.method === 'POST') {
      // ✅ 這裡必須呼叫 incr 來真正增加 Redis 裡面的數值
      const count = await redis.incr('total_visits');
      return res.status(200).json({ success: true, count });
    } else {
      // 獲取當前計數
      let count = await redis.get('total_visits');
      // 如果 redis 返回 null (第一次使用)，則返回 3277
      return res.status(200).json({ count: Number(count) || 3277 });
    }
  } catch (error) {
    console.error("Redis Error:", error);
    return res.status(500).json({ error: "Database error" });
  }
}