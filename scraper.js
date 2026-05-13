const axios = require('axios');
const cheerio = require('cheerio');

async function scrapeLotto(dateStr) {
    const url = `https://news.sanook.com/lotto/check/${dateStr}/`;
    try {
        const { data } = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/110.0.0.0 Safari/537.36' }
        });
        const $ = cheerio.load(data);

        const extractNumber = (text) => text ? text.replace(/\D/g, "") : "";

        // ดึงเลขรางวัลหลัก (1, หน้า3, ท้าย3, ท้าย2)
        let main = $('.lotto-check__number-main').map((i, el) => extractNumber($(el).text())).get();

        // ฟังก์ชันดึงรางวัลที่ 2-5
        const getPrizeList = (prizeTitle) => {
            return $(`h3:contains("${prizeTitle}")`).next('.lotto-check__prize-list')
                   .find('.lotto-check__number').map((i, el) => extractNumber($(el).text())).get();
        };

        const p1 = main[0] || "";
        const isCompleted = p1.length === 6 && p1 !== "6000000";

        return {
            date: dateStr,
            process_status: isCompleted ? "completed" : "partial",
            prizes: {
                prize_1: isCompleted ? p1 : "รอผล",
                prefix_3: [main[1] || "", main[2] || ""],
                suffix_3: [main[3] || "", main[4] || ""],
                suffix_2: main[5] || "",
                prize_2: getPrizeList("รางวัลที่ 2"),
                prize_3: getPrizeList("รางวัลที่ 3"),
                prize_4: getPrizeList("รางวัลที่ 4"),
                prize_5: getPrizeList("รางวัลที่ 5"),
                nearby_1: getPrizeList("รางวัลข้างเคียงรางวัลที่ 1")
            },
            lastUpdated: new Date()
        };
    } catch (error) {
        return null;
    }
}

module.exports = { scrapeLotto };