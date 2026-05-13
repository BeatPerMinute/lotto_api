const axios = require('axios');
const cheerio = require('cheerio');

async function scrapeLotto(dateStr) {
    const url = `https://news.sanook.com/lotto/check/${dateStr}/`;
    try {
        const { data } = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/110.0.0.0 Safari/537.36' }
        });
        const $ = cheerio.load(data);

        // ฟังก์ชันช่วยดึงเฉพาะตัวเลขออกจากข้อความ
        const extractNumber = (text) => {
            if (!text) return "";
            return text.replace(/\D/g, ""); // ลบทุกอย่างที่ไม่ใช่ตัวเลขออก
        };

        const findByText = (text) => {
            return $(`strong:contains("${text}")`).closest('.lotto-check__prize-item').find('strong').last().text().trim() ||
                   $(`span:contains("${text}")`).next().text().trim();
        };

        // ดึงเลขรางวัลและกรองเอาเฉพาะตัวเลข
        let rawP1 = $('.lotto-check__number-main').eq(0).text().trim() || findByText("รางวัลที่ 1");
        let p1 = extractNumber(rawP1);
        
        let rawS2 = $('.lotto-check__number-main').last().text().trim() || findByText("เลขท้าย 2 ตัว");
        let s2 = extractNumber(rawS2);

        // ดึงเลข 3 ตัว
        const allMain = $('.lotto-check__number-main').map((i, el) => extractNumber($(el).text().trim())).get();
        
        // ตรวจสอบความถูกต้อง (ต้องมี 6 หลัก)
        const isCompleted = p1.length === 6;

        return {
            date: dateStr,
            process_status: isCompleted ? "completed" : "partial",
            prizes: {
                prize_1: p1 || "รอผล",
                prefix_3: [allMain[1] || "---", allMain[2] || "---"],
                suffix_3: [allMain[3] || "---", allMain[4] || "---"],
                suffix_2: s2 || "รอผล",
            },
            lastUpdated: new Date()
        };
    } catch (error) {
        return null;
    }
}

module.exports = { scrapeLotto };