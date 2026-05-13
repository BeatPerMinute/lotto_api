const axios = require('axios');
const cheerio = require('cheerio');

async function scrapeLotto(dateStr) {
    const url = `https://news.sanook.com/lotto/check/${dateStr}/`;
    try {
        const { data } = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0.4472.124 Safari/537.36' }
        });
        const $ = cheerio.load(data);
        const checkContent = $('body').text();

        if (checkContent.includes('ไม่พบหน้าเว็บ') || checkContent.includes('ยังไม่มีผลรางวัล')) return null;

        // ฟังก์ชันช่วยดึงเลขรางวัลตามลำดับ
        const getNumbers = (selector) => {
            return $(selector).map((i, el) => $(el).text().trim()).get().filter(n => n !== "");
        };

        // ดึงรางวัลหลัก (รางวัลที่ 1, เลขหน้า, เลขท้าย)
        const mainNumbers = getNumbers('.lotto-check__number-main'); 
        
        // วิเคราะห์สถานะ (ถ้ามีเลขครบ 6 หลักในรางวัลที่ 1 แสดงว่าเริ่มออกแล้ว)
        const prize1 = mainNumbers[0] || "รอผล";
        const isCompleted = mainNumbers.length >= 6 && !mainNumbers.includes("รอผล");

        const resultData = {
            date: dateStr,
            process_status: isCompleted ? "completed" : "partial",
            prizes: {
                prize_1: prize1,
                prefix_3: [mainNumbers[1], mainNumbers[2]],
                suffix_3: [mainNumbers[3], mainNumbers[4]],
                suffix_2: mainNumbers[5] || "รอผล",
                // รางวัลที่ 2-5 (ถ้าต้องการเพิ่ม สามารถเขียน selector ดึงต่อได้ที่นี่)
                all_prizes_raw: mainNumbers 
            },
            lastUpdated: new Date()
        };

        return resultData;
    } catch (error) {
        console.error(`❌ Scraper Error (${dateStr}):`, error.message);
        return null;
    }
}

module.exports = { scrapeLotto };