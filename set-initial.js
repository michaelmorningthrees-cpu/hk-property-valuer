// set-initial.js
require('dotenv').config({ path: '.env.local' });
const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL);

async function setInit() {
  await redis.set('total_visits', 3277);
  console.log("✅ Initial count set to 3277");
  process.exit();
}
setInit();