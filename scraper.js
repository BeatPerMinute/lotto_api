const axios = require('axios');
const cheerio = require('cheerio');

async function scrapeLotto(dateStr) {
    const url = `https://news.sanook.com/lotto/check/${dateStr}/`;
    try {
        const { data } = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/110.0.0.0 Safari/537.36' }
        });
        const $ = cheerio.load(data);

        // --- ฟังก์ชันช่วยดึงเลขรางวัลจากข้อความหัวข้อ ---
        const findByText = (text) => {
            return $(`strong:contains("${text}")`).closest('.lotto-check__prize-item').find('strong').last().text().trim() ||
                   $(`span:contains("${text}")`).next().text().trim() ||
                   $(`strong:contains("${text}")`).parent().find('b').text().trim();
        };

        // ดึงรางวัลที่ 1
        let p1 = $('.lotto-check__number-main').eq(0).text().trim() || findByText("รางวัลที่ 1");
        
        // ดึงเลขท้าย 2 ตัว
        let s2 = $('.lotto-check__number-main').last().text().trim() || findByText("เลขท้าย 2 ตัว");

        // ดึงเลขหน้า/เลขท้าย 3 ตัว
        // สุ่มดึงจาก Class หลักก่อน ถ้าไม่ได้ให้ใส่ค่าว่าง
        const allMain = $('.lotto-check__number-main').map((i, el) => $(el).text().trim()).get();
        
        const prize1 = p1 || "รอผล";
        const isCompleted = prize1.length === 6 && prize1 !== "รอผล";

        return {
            date: dateStr,
            process_status: isCompleted ? "completed" : "partial",
            prizes: {
                prize_1: prize1,
                prefix_3: [allMain[1] || "---", allMain[2] || "---"],
                suffix_3: [allMain[3] || "---", allMain[4] || "---"],
                suffix_2: s2 || "รอผล",
            },
            lastUpdated: new Date()
        };
    } catch (error) {
        console.error("Scrape Error:", error.message);
        return null;
    }
}

module.exports = { scrapeLotto };