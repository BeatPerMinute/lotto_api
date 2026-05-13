const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const cheerio = require('cheerio');
const { scrapeLotto } = require('./scraper');

const app = express();
const port = process.env.PORT || 3000;

// เชื่อมต่อ MongoDB
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ [Database] Connected!'))
    .catch((err) => console.error('❌ [Database] Error:', err.message));

const lottoSchema = new mongoose.Schema({
    date: { type: String, required: true, unique: true },
    process_status: { type: String, required: true },
    data: { type: Object, required: true },
}, { timestamps: true });

const Lotto = mongoose.model('Lotto', lottoSchema);

// หน่วยความจำชั่วคราว (RAM)
const historicalCache = new Map();
const activeLocks = new Set();
let backfillStatus = { active: false, current: "", total: 0, completed: 0 };

// --- API สำหรับผู้ใช้งานแอป Flutter ---
app.get('/api/lotto/:date', async (req, res) => {
    const dateStr = req.params.date;
    const now = Date.now();

    if (historicalCache.has(dateStr)) {
        const cache = historicalCache.get(dateStr);
        if (now < cache.expiry || cache.status === 'completed') return res.json(cache.data);
    }

    let dbLotto = await Lotto.findOne({ date: dateStr });
    if (dbLotto && dbLotto.process_status === "completed") {
        historicalCache.set(dateStr, { data: dbLotto.data, status: 'completed', expiry: Infinity });
        return res.json(dbLotto.data);
    }

    if (activeLocks.has(dateStr)) return res.json(dbLotto ? dbLotto.data : { message: "Server Busy" });

    activeLocks.add(dateStr);
    const scrapedData = await scrapeLotto(dateStr);
    if (scrapedData) {
        await Lotto.findOneAndUpdate({ date: dateStr }, { process_status: scrapedData.process_status, data: scrapedData }, { upsert: true });
        const ttl = scrapedData.process_status === 'completed' ? Infinity : (now + 60000);
        historicalCache.set(dateStr, { data: scrapedData, status: scrapedData.process_status, expiry: ttl });
    }
    setTimeout(() => activeLocks.delete(dateStr), 60000);
    res.json(scrapedData || { message: "Not Found" });
});

// --- API ลับ: สั่งเริ่มขูดล้างบาง (Background Worker) ---
app.get('/api/admin/start-heavy-backfill', async (req, res) => {
    const adminPassword = req.query.password;
    if (adminPassword !== "MySecret123") return res.status(401).send("Wrong Password");
    if (backfillStatus.active) return res.json({ message: "บอทกำลังทำงานอยู่", status: backfillStatus });

    try {
        const { data: mainPage } = await axios.get('https://news.sanook.com/lotto/', { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const $ = cheerio.load(mainPage);
        const allLinks = [];
        $('a[href*="/lotto/check/"]').each((i, el) => {
            const url = $(el).attr('href');
            const match = url.match(/check\/(\d+)\//);
            if (match) allLinks.push(match[1]);
        });

        const uniqueDates = [...new Set(allLinks)];
        backfillStatus = { active: true, current: "", total: uniqueDates.length, completed: 0 };

        const worker = setInterval(async () => {
            if (uniqueDates.length === 0) {
                clearInterval(worker);
                backfillStatus.active = false;
                return;
            }
            const targetDate = uniqueDates.shift();
            backfillStatus.current = targetDate;
            const result = await scrapeLotto(targetDate);
            if (result) {
                await Lotto.findOneAndUpdate({ date: targetDate }, { data: result, process_status: result.process_status }, { upsert: true });
                backfillStatus.completed++;
            }
        }, 4000); // เว้นระยะ 4 วินาทีต่อ 1 งวด

        res.json({ message: "บอทเริ่มทำงานในพื้นหลังแล้ว ปิดคอมได้เลย", total: uniqueDates.length });
    } catch (err) {
        res.status(500).send("Error fetching main page");
    }
});

// เช็คสถานะบอท
app.get('/api/admin/backfill-status', (req, res) => res.json(backfillStatus));

app.listen(port, () => console.log(`🚀 Server on port ${port}`));