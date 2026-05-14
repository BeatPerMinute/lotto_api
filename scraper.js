const axios = require('axios');
const cheerio = require('cheerio');

async function scrapeLotto(dateStr) {
    const url = `https://news.sanook.com/lotto/check/${dateStr}/`;
    try {
        const { data } = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' }
        });
        const $ = cheerio.load(data);

        const extractNumber = (text) => text ? text.replace(/\D/g, "") : "";

        // ฟังก์ชันดึงรางวัลกลุ่ม (2, 3, 4, 5 และข้างเคียงรางวัลที่ 1)
        const getPrizeArray = (title) => {
            return $(`h3:contains("${title}")`).next('.lotto-check__prize-list')
                   .find('.lotto-check__number').map((i, el) => extractNumber($(el).text())).get()
                   .filter(n => n.length > 0 && n !== "6000000" && n !== "100000" && n !== "4000" && n !== "2000"); 
        };

        // ดึงเลขรางวัลหลัก (1, หน้า3, ท้าย3, ท้าย2) จาก class lotto-check__number-main
        let main = $('.lotto-check__number-main').map((i, el) => extractNumber($(el).text())).get();

        const p1 = main[0] || "";
        const isCompleted = p1.length === 6;

        return {
            date: dateStr,
            process_status: isCompleted ? "completed" : "partial",
            prizes: {
                prize_1: p1 || "รอผล",
                nearby_1: getPrizeArray("รางวัลข้างเคียงรางวัลที่ 1"), 
                prefix_3: [main[1] || "", main[2] || ""],
                suffix_3: [main[3] || "", main[4] || ""],
                suffix_2: main[5] || "",
                prize_2: getPrizeArray("รางวัลที่ 2"),
                prize_3: getPrizeArray("รางวัลที่ 3"),
                prize_4: getPrizeArray("รางวัลที่ 4"),
                prize_5: getPrizeArray("รางวัลที่ 5")
            },
            lastUpdated: new Date()
        };
    } catch (error) {
        console.error(`Scrape Error (${dateStr}):`, error.message);
        return null;
    }
}

module.exports = { scrapeLotto };