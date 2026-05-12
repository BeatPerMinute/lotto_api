const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const PORT = 3000;

app.get('/api/lotto/:date', async (req, res) => {
    const dateParam = req.params.date; 
    const targetUrl = `https://news.sanook.com/lotto/check/${dateParam}/`;
    
    console.log(`📲 มีคนขอข้อมูลงวด: ${dateParam}`);

    try {
        const { data } = await axios.get(targetUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' }
        });
        
        const $ = cheerio.load(data);
        const allNums = $('.lotto__number');

        if (allNums.length === 0) {
            return res.status(404).json({ status: "error", message: "ไม่พบข้อมูลรางวัล" });
        }

        // 1. ดึงรางวัลไฮไลต์ (แม่นยำด้วย Index เหมือนเดิม)
        const dateText = $('title').text().trim().split('-')[0].trim(); 
        const firstPrize = [ $('.lotto__number--first').text().trim() ]; 
        const last3f = [ allNums.eq(1).text().trim(), allNums.eq(2).text().trim() ]; 
        const last3b = [ allNums.eq(3).text().trim(), allNums.eq(4).text().trim() ]; 
        const last2 = [ allNums.eq(5).text().trim() ]; 
        
        // รางวัลข้างเคียง ซ่อนอยู่ใน allNums ลำดับที่ 6 และ 7 (เคล็ดลับจากที่คุณเทสรอบก่อน!)
        const near1 = [ allNums.eq(6).text().trim(), allNums.eq(7).text().trim() ].filter(n => n !== "");

        // 2. ท่าไม้ตาย: แปลง HTML ทั้งหน้าเป็นข้อความล้วนๆ ตัดช่องว่างทิ้งให้หมด
        const fullText = $('body').text().replace(/\s+/g, ' ');

        // ฟังก์ชันหั่นข้อความเป็นก้อน แล้วดูดเอาเฉพาะเลข 6 หลักตามจำนวนโค้วต้า
        const getPrizesFromText = (startWord, endWord, count) => {
            const startIdx = fullText.indexOf(startWord);
            if (startIdx === -1) return []; // ถ้าหาคำไม่เจอ ให้คืนค่าว่าง

            let endIdx = fullText.length;
            if (endWord) {
                // หาจุดจบของก้อนข้อความ
                const eIdx = fullText.indexOf(endWord, startIdx);
                if (eIdx !== -1) endIdx = eIdx;
            }

            // หั่นก้อนข้อความออกมา
            const chunk = fullText.substring(startIdx, endIdx);
            
            // ดูดเฉพาะเลข 6 หลัก
            const matches = chunk.match(/\b\d{6}\b/g) || [];
            
            // กรองเลขซ้ำทิ้ง (ป้องกันเว็บลงซ้ำ) และตัดเอาจำนวนเป๊ะๆ
            return [...new Set(matches)].slice(0, count);
        };

        // 3. สั่งหั่นเค้กและดูดตัวเลข!
        const second = getPrizesFromText("รางวัลที่ 2", "รางวัลที่ 3", 5);
        const third = getPrizesFromText("รางวัลที่ 3", "รางวัลที่ 4", 10);
        const fourth = getPrizesFromText("รางวัลที่ 4", "รางวัลที่ 5", 50);
        // รางวัลที่ 5 ไม่ต้องระบุคำลงท้าย ให้มันดูดจนสุดหน้าเว็บ แล้วเราหยิบแค่ 100 ตัวก็พอ
        const fifth = getPrizesFromText("รางวัลที่ 5", "", 100); 

        // จัดเรียง JSON
        const resultJSON = {
            status: "success",
            displayDate: dateText,
            first: firstPrize,
            near1: near1,
            second: second,
            third: third,
            fourth: fourth,
            fifth: fifth,
            last3f: last3f,
            last3b: last3b,
            last2: last2
        };

        res.json(resultJSON);

    } catch (error) {
        console.error("❌ Error:", error.message);
        res.status(500).json({ status: "error", message: "เว็บต้นทางมีปัญหา" });
    }
});

if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`🚀 API Server เปิดทำงานใน Local แล้ว!`);
    });
}

// บรรทัดนี้สำคัญมาก! เป็นการส่งออกแอปให้ Vercel เอาไปใช้งานต่อ
module.exports = app;