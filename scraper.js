const axios = require('axios');
const cheerio = require('cheerio');

async function scrapeSmartLotto(dateUrl) {
    try {
        console.log(`กำลังวิ่งไปขูดข้อมูลที่: ${dateUrl}...`);
        
        const { data } = await axios.get(dateUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' }
        });
        
        const $ = cheerio.load(data);
        
        // ดึงวันที่ (เอาเฉพาะข้อความก่อนเครื่องหมาย -)
        const dateText = $('title').text().trim().split('-')[0].trim(); 

        // ดึงกล่องตัวเลขทั้งหมดในโซน Highlight มาเก็บไว้ใน Array
        const allNums = $('.lotto__number');

        // หยิบแยกตามลำดับ (Index) ที่เราถอดรหัสมาได้
        const firstPrize = [ $('.lotto__number--first').text().trim() ]; // รางวัลที่ 1 มีคลาสเฉพาะตัว
        const last3f = [ allNums.eq(1).text().trim(), allNums.eq(2).text().trim() ]; // หน้า 3
        const last3b = [ allNums.eq(3).text().trim(), allNums.eq(4).text().trim() ]; // ท้าย 3
        const last2 = [ allNums.eq(5).text().trim() ]; // ท้าย 2

        const resultJSON = {
            date: dateText,
            prizes: [
                { name: "รางวัลที่ 1", reward: "6000000", number: firstPrize },
                { name: "รางวัลเลขหน้า 3 ตัว", reward: "4000", number: last3f },
                { name: "รางวัลเลขท้าย 3 ตัว", reward: "4000", number: last3b },
                { name: "รางวัลเลขท้าย 2 ตัว", reward: "2000", number: last2 }
            ]
        };

        console.log("🎉 ดูดข้อมูลสำเร็จเป๊ะๆ! นี่คือผลลัพธ์:");
        console.log(JSON.stringify(resultJSON, null, 2));

    } catch (error) {
        console.error("❌ เกิดข้อผิดพลาด:", error.message);
    }
}

// ทดสอบงวด 1 เมษายน 2567
scrapeSmartLotto('https://news.sanook.com/lotto/check/01042567/');