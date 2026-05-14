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

// --- MongoDB Setup ---
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ Connected to MongoDB Atlas'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

const lottoSchema = new mongoose.Schema({
    date: { type: String, unique: true }, // Format: DDMMYYYY
    data: Object,
    process_status: String, // 'completed' หรือ 'partial'
    lastUpdated: { type: Date, default: Date.now }
});

const Lotto = mongoose.model('Lotto', lottoSchema);

// --- Memory Cache ---
const historicalCache = new Map();
let backfillStatus = { active: false, current: "", total: 0, completed: 0, message: "" };

// --- API Routes ---

// 1. ดึงข้อมูลหวยรายงวด (สำหรับแอป Flutter)
app.get('/api/lotto/:date', async (req, res) => {
    const { date } = req.params;

    // เช็คใน Cache ก่อน
    if (historicalCache.has(date)) {
        return res.json(historicalCache.get(date));
    }

    try {
        // เช็คใน Database
        let record = await Lotto.findOne({ date });
        
        if (record && record.process_status === 'completed') {
            historicalCache.set(date, record.data);
            return res.json(record.data);
        }

        // ถ้าไม่มีใน DB ให้ไปขูดสด
        const result = await scrapeLotto(date);
        if (result) {
            await Lotto.findOneAndUpdate(
                { date },
                { data: result, process_status: result.process_status },
                { upsert: true }
            );
            historicalCache.set(date, result);
            return res.json(result);
        }

        res.status(404).json({ message: "ไม่พบข้อมูลหวยงวดนี้" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. สั่งเริ่มขูดข้อมูลแบบ "ล้างบาง" (ย้อนหลัง 10 หน้า)
app.get('/api/admin/start-heavy-backfill', async (req, res) => {
    const adminPassword = req.query.password;
    if (adminPassword !== "MySecret123") return res.status(401).send("Unauthorized");
    if (backfillStatus.active) return res.json({ message: "บอทกำลังรันอยู่", status: backfillStatus });

    backfillStatus.active = true;
    backfillStatus.message = "กำลังกวาดรายชื่อวันที่จากหน้าสารบัญ...";
    
    try {
        let allDates = [];
        // วนลูปกวาด 10 หน้าแรก (ประมาณ 150-200 งวด)
        for (let p = 1; p <= 10; p++) {
            const archiveUrl = `https://news.sanook.com/lotto/archive/page/${p}/`;
            const { data } = await axios.get(archiveUrl, { 
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 10000 
            });
            const $ = cheerio.load(data);

            $('a[href*="/lotto/check/"]').each((i, el) => {
                const href = $(el).attr('href');
                const match = href.match(/check\/(\d{8})\//);
                if (match) allDates.push(match[1]);
            });
            console.log(`กวาดหน้าสารบัญ ${p} สำเร็จ`);
        }

        const uniqueDates = [...new Set(allDates)];
        backfillStatus.total = uniqueDates.length;
        backfillStatus.completed = 0;
        backfillStatus.message = "เริ่มขูดข้อมูลลง Database ทีละงวด...";

        const worker = setInterval(async () => {
            if (uniqueDates.length === 0) {
                clearInterval(worker);
                backfillStatus.active = false;
                backfillStatus.message = "ภารกิจเสร็จสมบูรณ์!";
                return;
            }

            const targetDate = uniqueDates.shift();
            backfillStatus.current = targetDate;

            const result = await scrapeLotto(targetDate);
            if (result) {
                await Lotto.findOneAndUpdate(
                    { date: targetDate }, 
                    { data: result, process_status: result.process_status }, 
                    { upsert: true }
                );
                backfillStatus.completed++;
            }
        }, 5000); // หน่วง 5 วินาทีต่อหน้า เพื่อความปลอดภัย

        res.json({ 
            message: "เริ่มขูดข้อมูลแบบจัดเต็ม 10 หน้าสารบัญ! ปิดคอมได้เลย", 
            total_found: uniqueDates.length 
        });

    } catch (err) {
        backfillStatus.active = false;
        res.status(500).json({ error: err.message });
    }
});

// 3. ดูสถานะบอท
app.get('/api/admin/backfill-status', (req, res) => {
    res.json(backfillStatus);
});

// 4. ดึงรายชื่อวันที่ทั้งหมดที่มีใน DB (สำหรับเมนูเลือกงวดใน Flutter)
app.get('/api/lotto-list', async (req, res) => {
    try {
        const list = await Lotto.find({}, 'date').sort({ date: -1 });
        const dates = list.map(item => item.date);
        res.json(dates);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Start Server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});