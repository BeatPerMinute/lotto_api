require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const { scrapeLotto } = require('./scraper');

const app = express();
app.use(cors());
app.use(express.json());

// --- Database Connection ---
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ Connected to MongoDB Atlas'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

const lottoSchema = new mongoose.Schema({
    date: { type: String, unique: true },
    data: Object,
    process_status: String,
    lastUpdated: { type: Date, default: Date.now }
});
const Lotto = mongoose.model('Lotto', lottoSchema);

// --- State Management ---
const historicalCache = new Map();
let backfillStatus = { active: false, current: "", total: 0, completed: 0, message: "" };

// --- API Routes ---

// ดึงหวยรายงวด (สำหรับแอป Flutter)
app.get('/api/lotto/:date', async (req, res) => {
    const { date } = req.params;
    if (historicalCache.has(date)) return res.json(historicalCache.get(date));

    try {
        let record = await Lotto.findOne({ date });
        if (record && record.process_status === 'completed') {
            historicalCache.set(date, record.data);
            return res.json(record.data);
        }
        const result = await scrapeLotto(date);
        if (result) {
            await Lotto.findOneAndUpdate({ date }, { data: result, process_status: result.process_status }, { upsert: true });
            historicalCache.set(date, result);
            return res.json(result);
        }
        res.status(404).json({ message: "ไม่พบข้อมูล" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ดึงรายชื่อวันที่ทั้งหมด (สำหรับเมนูในแอป)
app.get('/api/lotto-list', async (req, res) => {
    try {
        const list = await Lotto.find({}, 'date').sort({ date: -1 });
        res.json(list.map(item => item.date));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// เช็คสถานะบอท
app.get('/api/admin/backfill-status', (req, res) => res.json(backfillStatus));

// 🚀 ภารกิจล้างบาง: ขูด 24 หน้า 462 งวด
app.get('/api/admin/start-heavy-backfill', async (req, res) => {
    const adminPassword = req.query.password;
    if (adminPassword !== "MySecret123") return res.status(401).send("Unauthorized");
    if (backfillStatus.active) return res.json({ message: "บอทกำลังรันอยู่", status: backfillStatus });

    backfillStatus.active = true;
    backfillStatus.message = "เริ่มกวาดรายชื่อวันที่จากหน้า 1 ถึง 24...";
    
    try {
        let allDates = [];
        for (let p = 1; p <= 24; p++) {
            const archiveUrl = (p === 1) 
                ? `https://news.sanook.com/lotto/archive/` 
                : `https://news.sanook.com/lotto/archive/page/${p}/`;

            const { data } = await axios.get(archiveUrl, { 
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' }
            });
            const $ = cheerio.load(data);

            $('a[href*="/lotto/check/"]').each((i, el) => {
                const match = $(el).attr('href').match(/check\/(\d{8})\//);
                if (match) allDates.push(match[1]);
            });
            console.log(`กวาดหน้า ${p} สำเร็จ`);
        }

        const uniqueDates = [...new Set(allDates)];
        backfillStatus.total = uniqueDates.length; // ควรจะได้ประมาณ 462
        backfillStatus.completed = 0;
        backfillStatus.message = `เจอ ${uniqueDates.length} งวด กำลังเริ่มขูด...`;

        const worker = setInterval(async () => {
            if (uniqueDates.length === 0) {
                clearInterval(worker);
                backfillStatus.active = false;
                backfillStatus.message = "เสร็จสมบูรณ์ 462 งวด!";
                return;
            }

            const targetDate = uniqueDates.shift();
            backfillStatus.current = targetDate;
            const result = await scrapeLotto(targetDate);
            if (result) {
                await Lotto.findOneAndUpdate({ date: targetDate }, { data: result, process_status: result.process_status }, { upsert: true });
                backfillStatus.completed++;
            }
        }, 4000); // หน่วง 4 วินาทีต่อครั้ง

        res.json({ message: "บอทเริ่มงานแล้ว", total_found: uniqueDates.length });
    } catch (err) {
        backfillStatus.active = false;
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));