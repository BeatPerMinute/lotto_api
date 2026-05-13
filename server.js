const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const { scrapeLotto } = require('./scraper'); // ดึงไฟล์ที่เราสร้างเมื่อกี้มาใช้

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

// --- Layer 1: RAM Cache & Locking ---
const historicalCache = new Map();
const activeLocks = new Set(); // เก็บวันที่ที่กำลังโดนขูดอยู่

// ==========================================
// API หลัก: ดึงข้อมูลหวย
// ==========================================
app.get('/api/lotto/:date', async (req, res) => {
    const dateStr = req.params.date;
    const now = Date.now();

    try {
        // 1. เช็ค RAM ก่อน (ถ้ามีและ completed ส่งทันที)
        if (historicalCache.has(dateStr)) {
            const cache = historicalCache.get(dateStr);
            if (now < cache.expiry || cache.status === 'completed') {
                return res.json({ source: 'ram', ...cache.data });
            }
        }

        // 2. เช็ค Database
        let dbLotto = await Lotto.findOne({ date: dateStr });
        
        // ถ้าใน DB สมบูรณ์แล้ว (completed) ให้เก็บลง RAM แล้วส่งเลย
        if (dbLotto && dbLotto.process_status === "completed") {
            historicalCache.set(dateStr, { data: dbLotto.data, status: 'completed', expiry: Infinity });
            return res.json({ source: 'database', ...dbLotto.data });
        }

        // 3. ระบบจัดการการรุม (Concurrency Control)
        if (activeLocks.has(dateStr)) {
            return res.json({ 
                source: 'server_busy', 
                message: 'กำลังอัปเดตข้อมูล... กรุณารอ 1 นาที',
                data: dbLotto ? dbLotto.data : null 
            });
        }

        // 4. เริ่มขูดข้อมูล (Lock ไว้ก่อน)
        activeLocks.add(dateStr);
        console.log(`🌐 [Scraping] เริ่มขูดงวดวันที่: ${dateStr}`);

        const scrapedData = await scrapeLotto(dateStr);

        if (!scrapedData) {
            activeLocks.delete(dateStr);
            return res.status(404).json({ message: "ไม่พบข้อมูล" });
        }

        // บันทึกลง DB
        const updatedDb = await Lotto.findOneAndUpdate(
            { date: dateStr },
            { process_status: scrapedData.process_status, data: scrapedData },
            { upsert: true, new: true }
        );

        // เก็บลง RAM (ถ้ายังไม่เสร็จให้อยู่ได้ 1 นาที, ถ้าเสร็จแล้วอยู่ยาว)
        const ttl = scrapedData.process_status === 'completed' ? Infinity : (now + 60000);
        historicalCache.set(dateStr, { data: scrapedData, status: scrapedData.process_status, expiry: ttl });

        // ปลด Lock หลังทำงานเสร็จ (รอ 1 นาทีค่อยให้ขูดใหม่ได้)
        setTimeout(() => activeLocks.delete(dateStr), 60000);

        return res.json({ source: 'new_scrape', ...scrapedData });

    } catch (error) {
        activeLocks.delete(dateStr);
        res.status(500).json({ message: "Internal Error" });
    }
});

app.listen(port, () => console.log(`🚀 Server on port ${port}`));