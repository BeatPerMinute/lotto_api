// บังคับให้ Node.js ใช้ DNS ของ Google ในการค้นหา SRV
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

// ==========================================
// 1. นำเข้าเครื่องมือพื้นฐาน
// ==========================================
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const mongoose = require('mongoose');

const app = express();
const port = process.env.PORT || 3000;

// ==========================================
// 2. เชื่อมต่อ MongoDB Atlas
// ==========================================
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ [Database] เชื่อมต่อ MongoDB สำเร็จ!'))
    .catch((err) => console.error('❌ [Database] เชื่อมต่อล้มเหลว:', err.message));

// ==========================================
// 3. สร้างพิมพ์เขียวข้อมูล (Schema)
// ==========================================
const lottoSchema = new mongoose.Schema({
    date: { type: String, required: true, unique: true },
    process_status: { type: String, required: true },
    data: { type: Object, required: true },
    lastCheckedAt: { type: Date, default: Date.now }
}, { timestamps: true });

const Lotto = mongoose.model('Lotto', lottoSchema);

// ==========================================
// 4. ระบบความจำ RAM ชั่วคราว (กระดานไวท์บอร์ด)
// ==========================================
const historicalCache = new Map();

function saveToRamCache(dateStr, dbRecord, ttl) {
    historicalCache.set(dateStr, {
        data: dbRecord.data,
        expiry: ttl === Infinity ? Infinity : Date.now() + ttl
    });
}

// ==========================================
// 5. ฟังก์ชันดึงข้อมูลจากเว็บ Sanook (Scraping)
// ==========================================
async function fetchLottoData(dateStr) {
    const url = `https://news.sanook.com/lotto/check/${dateStr}/`;
    try {
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);
        
        // ตรวจสอบว่าหน้าเว็บนี้มีข้อมูลหรือยัง (หวยงวดนี้ออกหรือยัง)
        const checkContent = $('body').text();
        if (checkContent.includes('ไม่พบหน้าเว็บ') || checkContent.includes('ยังไม่มีผลรางวัล')) {
             return null; 
        }

        // เช็คว่าหวยออก "ครบ" หรือยัง (โดยดูจากรางวัลท้ายๆ เช่น รางวัลที่ 5)
        // (คุณอาจจะต้องปรับลอจิกนี้ตามโครงสร้างจริงของ Sanook)
        let isCompleted = true;
        const prize5Check = $('strong:contains("รางวัลที่ 5")').parent().text();
        if (!prize5Check || prize5Check.includes('รอผล')) {
            isCompleted = false;
        }

        // ดึงข้อมูลรางวัล (ตัวอย่างการดึงรางวัลที่ 1 และเลขท้าย)
        // *หมายเหตุ: Tag ข้อมูลตรงนี้ขึ้นอยู่กับ HTML ของเว็บ Sanook ปัจจุบัน
        const prize1 = $('strong:contains("รางวัลที่ 1")').next().text().trim() || "รอผล";
        const suffix2 = $('strong:contains("เลขท้าย 2 ตัว")').next().text().trim() || "รอผล";

        // จัดฟอร์แมตข้อมูล (Data Structure) เพื่อส่งให้แอปของคุณ
        const resultData = {
            process_status: isCompleted ? "completed" : "partial",
            date: dateStr,
            prizes: {
                prize_1: prize1,
                suffix_2: suffix2,
                // เพิ่มรางวัลอื่นๆ ตามต้องการ
            }
        };

        return resultData;
    } catch (error) {
        // กรณีที่ Sanook คืนค่า 404 (ไม่มีหน้านั้น) หรือ Error อื่นๆ
        console.error(`❌ ดึงข้อมูล Sanook ล้มเหลว (งวด ${dateStr}):`, error.message);
        return null;
    }
}

// ==========================================
// 6. API หลัก: ดึงข้อมูลหวย (Hybrid Caching Logic)
// ==========================================
app.get('/api/lotto/:date', async (req, res) => {
    const dateStr = req.params.date;

    try {
        // --- ด่านที่ 1: ค้นหาใน RAM (เร็วที่สุด) ---
        if (historicalCache.has(dateStr)) {
            const cacheEntry = historicalCache.get(dateStr);
            if (Date.now() < cacheEntry.expiry) {
                console.log(`⚡ [RAM] ส่งข้อมูลให้ผู้ใช้ (งวด ${dateStr})`);
                return res.json(cacheEntry.data);
            } else {
                historicalCache.delete(dateStr); // หมดอายุ ลบทิ้ง
            }
        }

        // --- ด่านที่ 2: ค้นหาใน Database (สมุดจดถาวร) ---
        let dbLotto = await Lotto.findOne({ date: dateStr });
        let needToScrape = true; // ตัวแปรตัดสินใจว่าจะวิ่งไป Sanook ไหม

        if (dbLotto) {
            const now = Date.now();
            const createdAtTime = dbLotto.createdAt.getTime();
            const lastCheckedTime = dbLotto.lastCheckedAt.getTime();
            
            const hoursSinceCreated = (now - createdAtTime) / (1000 * 60 * 60);
            const minutesSinceLastCheck = (now - lastCheckedTime) / (1000 * 60);

            if (dbLotto.process_status === "completed") {
                if (hoursSinceCreated > 24) {
                    // กรณี A: พ้นระยะเฝ้าระวัง 24 ชม. แล้ว -> ล็อกถาวร ไม่ไป Sanook
                    needToScrape = false;
                    saveToRamCache(dateStr, dbLotto, Infinity); 
                    console.log(`🗄️ [DB ถาวร] ส่งข้อมูลให้ผู้ใช้ (งวด ${dateStr})`);
                    return res.json(dbLotto.data);
                } else {
                    // กรณี B: อยู่ในช่วง 24 ชม. แรก (Grace Period)
                    if (minutesSinceLastCheck < 60) {
                        // เพิ่งเช็ค Sanook ไปไม่ถึง 1 ชม. -> เชื่อใจ DB ไปก่อน
                        needToScrape = false;
                        saveToRamCache(dateStr, dbLotto, 60 * 60 * 1000); // จำใน RAM 1 ชม.
                        console.log(`🗄️ [DB เฝ้าระวัง] ส่งข้อมูลให้ผู้ใช้ (งวด ${dateStr})`);
                        return res.json(dbLotto.data);
                    }
                    // ถ้าเกิน 1 ชม. แล้ว needToScrape จะยังเป็น true (ไปเช็ค Sanook)
                }
            }
        }

        // --- ด่านที่ 3: วิ่งไป Sanook (เมื่อจำเป็นเท่านั้น) ---
        if (needToScrape) {
            console.log(`🌐 [Sanook] กำลังดึงข้อมูลใหม่ (งวด ${dateStr})...`);
            const scrapedData = await fetchLottoData(dateStr);
            
            if (!scrapedData) {
                return res.status(404).json({ message: "ไม่พบข้อมูลจาก Sanook" });
            }

            // บันทึก/อัปเดต ลง Database ทันที
            const updatedDbLotto = await Lotto.findOneAndUpdate(
                { date: dateStr }, // หาด้วยวันที่
                { 
                    date: dateStr,
                    process_status: scrapedData.process_status,
                    data: scrapedData,
                    lastCheckedAt: Date.now() // อัปเดตนาฬิกา
                },
                { new: true, upsert: true } // ถ้ามีให้แก้ทับ, ถ้าไม่มีให้สร้างใหม่
            );

            // คำนวณอายุ RAM 
            let ramTimeToLive = 60 * 1000; // ค่าเริ่มต้น 1 นาที (สำหรับ partial)
            
            if (scrapedData.process_status === "completed") {
                const dbCreatedAt = updatedDbLotto.createdAt.getTime();
                const hoursSinceCreated = (Date.now() - dbCreatedAt) / (1000 * 60 * 60);
                
                if (hoursSinceCreated > 24) {
                    ramTimeToLive = Infinity; // จำถาวร
                } else {
                    ramTimeToLive = 60 * 60 * 1000; // จำ 1 ชม. ในช่วงเฝ้าระวัง
                }
            }

            // จำใส่ RAM และส่งให้ผู้ใช้
            saveToRamCache(dateStr, updatedDbLotto, ramTimeToLive);
            console.log(`✅ [อัปเดต] บันทึกและส่งข้อมูลให้ผู้ใช้ (งวด ${dateStr})`);
            return res.json(scrapedData);
        }

    } catch (error) {
        console.error("❌ ลอจิกทำงานผิดพลาด:", error.message);
        res.status(500).json({ message: "Internal Server Error" });
    }
});

// ==========================================
// 7. API ลับ: ล้างข้อมูลฉุกเฉิน (Admin เท่านั้น)
// ==========================================
app.delete('/api/admin/clear-cache/:date', async (req, res) => {
    const requestedDate = req.params.date;
    const adminPassword = req.headers['x-admin-key'];

    // ใส่รหัสผ่านของคุณตรงนี้
    if (adminPassword !== "MySecret123") {
        return res.status(401).json({ message: "ไม่อนุญาต!" });
    }

    try {
        historicalCache.delete(requestedDate); // ลบ RAM
        await Lotto.deleteOne({ date: requestedDate }); // ลบ DB
        res.json({ message: `ลบข้อมูล ${requestedDate} เรียบร้อยแล้ว!` });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ==========================================
// 8. เริ่มรันเซิร์ฟเวอร์
// ==========================================
app.listen(port, () => {
    console.log(`🚀 Server วิ่งอยู่ที่พอร์ต ${port}`);
});

module.exports = app;