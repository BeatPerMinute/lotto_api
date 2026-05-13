const axios = require('axios');
const cheerio = require('cheerio');

async function scrapeLotto(dateStr) {
    const url = `https://news.sanook.com/lotto/check/${dateStr}/`;
    try {
        const { data } = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/110.0.0.0 Safari/537.36' }
        });
        const $ = cheerio.load(data);

        const extractNumber = (text) => {
            if (!text) return "";
            return text.replace(/\D/g, ""); 
        };

        // --- หัวใจสำคัญ: ดึงเลขจาก class lotto-check__number-main ---
        // ปกติจะมี 6 ตำแหน่ง: [0]รางวัลที่ 1, [1-2]เลขหน้า 3, [3-4]เลขท้าย 3, [5]เลขท้าย 2
        let numbers = $('.lotto-check__number-main').map((i, el) => extractNumber($(el).text())).get();

        // ถ้าหา class ข้างบนไม่เจอ (กรณีงวดเก่ามาก) ให้หาจาก <strong> ที่มีตัวเลข 2-6 หลัก
        if (numbers.length === 0) {
            $('strong').each((i, el) => {
                const txt = extractNumber($(el).text());
                if (txt.length >= 2 && txt.length <= 6 && txt !== "6000000" && txt !== "4000" && txt !== "2000") {
                    numbers.push(txt);
                }
            });
        }

        const p1 = numbers[0] || "";
        const s2 = numbers[5] || numbers[numbers.length - 1] || ""; // เลขท้าย 2 ตัวมักอยู่ท้ายสุด

        // ตรวจสอบ: รางวัลที่ 1 ต้องมี 6 หลัก และไม่ใช่ตัวเลขเงินรางวัล
        const isCompleted = p1.length === 6 && p1 !== "6000000";

        return {
            date: dateStr,
            process_status: isCompleted ? "completed" : "partial",
            prizes: {
                prize_1: isCompleted ? p1 : "รอผล",
                prefix_3: [numbers[1] || "---", numbers[2] || "---"],
                suffix_3: [numbers[3] || "---", numbers[4] || "---"],
                suffix_2: s2.length === 2 ? s2 : "รอผล",
            },
            lastUpdated: new Date()
        };
    } catch (error) {
        return null;
    }
}

module.exports = { scrapeLotto };