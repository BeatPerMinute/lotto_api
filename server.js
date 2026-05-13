// (โค้ดส่วนบนคงเดิม... จนถึงส่วน Admin API)

let backfillStatus = { active: false, current: "", total: 0, completed: 0, message: "" };

app.get('/api/admin/start-heavy-backfill', async (req, res) => {
    const adminPassword = req.query.password;
    if (adminPassword !== "MySecret123") return res.status(401).send("Wrong Password");
    if (backfillStatus.active) return res.json({ message: "บอทกำลังรันอยู่...", status: backfillStatus });

    backfillStatus.active = true;
    backfillStatus.message = "กำลังกวาดวันที่จากทุกหน้าของ Sanook...";
    
    try {
        let allUniqueDates = [];
        // วนลูปกวาดหน้าสารบัญ 1-10 (หรือปรับเพิ่มได้ถ้าอยากย้อนไปไกลกว่า 5-6 ปี)
        for (let page = 1; page <= 10; page++) {
            const listUrl = `https://news.sanook.com/lotto/archive/page/${page}/`;
            const { data } = await axios.get(listUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            const $ = cheerio.load(data);
            
            $('a[href*="/lotto/check/"]').each((i, el) => {
                const url = $(el).attr('href');
                const match = url.match(/check\/(\d+)\//);
                if (match) allUniqueDates.push(match[1]);
            });
            console.log(`กวาดหน้า ${page} เสร็จสิ้น...`);
        }

        const uniqueDates = [...new Set(allUniqueDates)];
        backfillStatus.total = uniqueDates.length;
        backfillStatus.completed = 0;
        backfillStatus.message = "เริ่มขูดข้อมูลลง Database ทีละงวด...";

        const worker = setInterval(async () => {
            if (uniqueDates.length === 0) {
                clearInterval(worker);
                backfillStatus.active = false;
                backfillStatus.message = "ภารกิจเสร็จสิ้น! ขูดครบทุกหน้าแล้ว";
                return;
            }

            const targetDate = uniqueDates.shift();
            backfillStatus.current = targetDate;

            const result = await scrapeLotto(targetDate);
            if (result) {
                await Lotto.findOneAndUpdate({ date: targetDate }, { data: result, process_status: result.process_status }, { upsert: true });
                backfillStatus.completed++;
            }
        }, 5000); // เว้น 5 วินาที เพื่อความปลอดภัยสูงสุด (ไม่โดนแบนแน่นอน)

        res.json({ message: "บอทเริ่มงานขยายผลแล้ว ปิดคอมไปนอนได้เลย!", total_dates: uniqueDates.length });
    } catch (err) {
        backfillStatus.active = false;
        res.status(500).send("Error listing dates");
    }
});