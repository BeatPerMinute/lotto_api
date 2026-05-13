const axios = require('axios');
const cheerio = require('cheerio');

async function scrapeLotto(dateStr) {
    const url = `https://news.sanook.com/lotto/check/${dateStr}/`;
    try {
        const { data } = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/110.0.0.0 Safari/537.36' }
        });
        const $ = cheerio.load(data);
        
        // 1. ลองดึงเลขรางวัลจาก Class หลักของ Sanook
        let mainNumbers = $('.lotto-check__number-main').map((i, el) => $(el).text().trim()).get();

        // 2. ถ้าดึงไม่ได้ (งวดเก่ามาก) ให้ลองดึงจากโครงสร้างตารางหรือ Strong
        if (mainNumbers.length === 0) {
            // ดึงเลข 6 หลักจากรางวัลที่ 1 (กรณีโครงสร้างเก่า)
            const p1 = $('.lotto-check__prize-item--prize1 strong').text().trim() || 
                       $('strong:contains("รางวัลที่ 1")').next().text().trim();
            const s2 = $('.lotto-check__prize-item--two strong').text().trim() ||
                       $('strong:contains("เลขท้าย 2 ตัว")').next().text().trim();
            
            if (p1) mainNumbers = [p1, "", "", "", "", s2]; // เติมโครงสร้างหลอกไว้ก่อน
        }

        const prize1 = mainNumbers[0] || "รอผล";
        
        // ตรวจสอบความถูกต้อง: รางวัลที่ 1 ต้องมี 6 หลัก และไม่ใช่คำว่า "รอผล"
        const isCompleted = prize1.length === 6 && prize1 !== "รอผล";

        return {
            date: dateStr,
            process_status: isCompleted ? "completed" : "partial",
            prizes: {
                prize_1: prize1,
                prefix_3: [mainNumbers[1] || "---", mainNumbers[2] || "---"],
                suffix_3: [mainNumbers[3] || "---", mainNumbers[4] || "---"],
                suffix_2: mainNumbers[5] || "รอผล",
            },
            lastUpdated: new Date()
        };
    } catch (error) {
        return null;
    }
}

module.exports = { scrapeLotto };