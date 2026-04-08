import { Env } from './index';

/**
 * 工具函數：獲取台灣時間狀態
 */
function getTaipeiStatus(deadlineHour: number, deadlineMinute: number = 0) {
    const now = new Date();
    // 使用 hourCycle: 'h23' 避免產生 '24' 點的問題
    const parts = new Intl.DateTimeFormat('zh-TW', {
        timeZone: 'Asia/Taipei',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(now);

    const t = Object.fromEntries(parts.map(p => [p.type, p.value]));
    // 確保月份和日期為雙位數，避免不同環境行為不一致
    const todayStr = `${t.year}-${t.month.padStart(2, '0')}-${t.day.padStart(2, '0')}`;
    const currentTotalMins = parseInt(t.hour) * 60 + parseInt(t.minute);
    const deadlineTotalMins = deadlineHour * 60 + deadlineMinute;
    
    return {
        todayStr,
        isPublishingDay: [1, 3, 5].includes(now.getDay()), // 週一、三、五
        isPastDeadline: currentTotalMins >= deadlineTotalMins,
        timeLabel: `${t.hour}:${t.minute}`
    };
}

/**
 * 工具函數：將 UTC 日期字串安全地轉換為台灣時間的 YYYY-MM-DD 格式
 */
function getTaipeiDateString(utcDateStr: string): string {
    const date = new Date(utcDateStr);
    return new Intl.DateTimeFormat('zh-TW', {
        timeZone: 'Asia/Taipei',
        year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(date).replace(/\//g, '-');
}

/**
 * 發送電子郵件報警給所有訂閱者 (生產環境版 - 使用 Resend Batch API)
 */
async function sendEmailAlertToSubscribers(env: Env, platform: string, latestDate: string) {
    if (!env.RESEND_API_KEY) {
        console.error("[Alert] 錯誤: 缺少 RESEND_API_KEY 環境變數。");
        return;
    }

    try {
        const { results } = await env.DB.prepare(
            "SELECT email FROM subscribers"
        ).all<{ email: string }>();

        if (!results || results.length === 0) {
            console.log(`[Alert] 資料庫中無任何訂閱者，取消發送 ${platform} 通知。`);
            return;
        }

        const fromEmail = "Noticer Alert <alert@trashcode.dev>";
        console.log(`[Alert] 準備向 ${results.length} 位訂閱者發送 ${platform} 通知...`);

        // 構建批次發送陣列，解決隱私問題 (收件者彼此看不到) 以及單次收件人數限制
        // 注意：Resend Batch API 單次請求上限通常為 100 封，若超過 100 位訂閱者，需另行撰寫分批 (Chunking) 邏輯
        const emailPayloads = results.map(r => ({
            from: fromEmail,
            to: [r.email], 
            subject: `🚨 [重要通知] ${platform} 平台疑似缺稿`,
            html: `
                <div style="font-family: sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 8px; max-width: 600px;">
                    <h2 style="color: #d93025; border-bottom: 2px solid #d93025; padding-bottom: 10px;">${platform} 監控報警</h2>
                    <p>系統偵測到該平台可能未準時上稿，請相關人員前往確認。</p>
                    <div style="background: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
                        <ul style="list-style: none; padding: 0; margin: 0;">
                            <li><strong>監控平台：</strong> ${platform}</li>
                            <li><strong>最新文章日期：</strong> ${latestDate}</li>
                            <li><strong>檢查結果：</strong> 疑似缺稿 (Missing)</li>
                            <li><strong>系統檢查時間：</strong> ${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}</li>
                        </ul>
                    </div>
                    <p style="font-size: 12px; color: #888;">這是一封自動產生的系統郵件，發送自 trashcode.dev 監控服務。</p>
                </div>
            `
        }));

        const res = await fetch('https://api.resend.com/emails/batch', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${env.RESEND_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(emailPayloads),
        });

        if (res.ok) {
            console.log(`[Alert] ${platform} 郵件已批次寄送給所有訂閱者。`);
        } else {
            console.error(`[Alert] Resend API 報錯: ${await res.text()}`);
        }
    } catch (err) {
        console.error("[Alert] 執行 sendEmailAlertToSubscribers 時發生錯誤:", err);
    }
}

/**
 * Vita.tw 檢查邏輯 (20:00 死線)
 */
export async function handleVitaCheck(env: Env, checkingType: number = 0) {
    const { todayStr, isPublishingDay, isPastDeadline } = getTaipeiStatus(20, 0);

    try {
        const res = await fetch("https://vita.tw");
        const html = await res.text();
        const regex = /<article[^>]+data-post-id="(\d+)"[^>]*>[\s\S]*?<h3 class="entry-title"><a href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h3>[\s\S]*?datetime="([^"]+)"/g;

        let match;
        while ((match = regex.exec(html)) !== null) {
            const [_, postId, url, title, date] = match;
            await env.DB.prepare("INSERT OR IGNORE INTO vita (post_id, title, post_date, post_url) VALUES (?, ?, ?, ?)")
                .bind(parseInt(postId), title.trim(), date, url).run();
        }

        const latest = await env.DB.prepare("SELECT post_id, post_date, post_url FROM vita ORDER BY post_date DESC LIMIT 1").first<{ post_id: number, post_date: string, post_url: string }>();

        let status = 'success';
        const articleDate = latest?.post_date ? getTaipeiDateString(latest.post_date) : "無資料";

        if (latest && articleDate !== todayStr && isPublishingDay && isPastDeadline) {
            status = 'missing';
            // 只有自動排程 (checkingType 0) 才觸發發信
            if (checkingType === 0) {
                await sendEmailAlertToSubscribers(env, "Vita.tw", articleDate);
            }
        }

        await env.DB.prepare(`
    UPDATE monitor_status 
    SET last_check_at = datetime('now', '+8 hours'), 
        checking_status = ?, 
        latest_post_id = ?, 
        latest_post_url = ?, 
        last_success_at = CASE WHEN ? = 'success' THEN datetime('now', '+8 hours') ELSE last_success_at END 
    WHERE platform = ?
`).bind(status, latest?.post_id || null, latest?.post_url || "", status, "vita").run();

    } catch (e) {
        console.error("[Vita] Error:", e);
    }
}

/**
 * Peopo 檢查邏輯 (21:00 死線)
 */
export async function handlePeopoCheck(env: Env, checkingType: number = 0) {
    // 取得台北當前時間狀態
    const { todayStr, isPublishingDay, isPastDeadline } = getTaipeiStatus(21, 0);

    // 定義一個內部輔助函數來提取標籤內容並過濾 CDATA
    const extractContent = (xmlItem: string, tagName: string) => {
        // 匹配標籤內容，考慮到標籤可能帶有屬性如 <link rel="...">
        const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`);
        const match = xmlItem.match(regex);
        if (!match) return "";
        // 移除 CDATA 包裹層並修剪空白 [cite: 1, 2]
        return match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
    };

    try {
        const res = await fetch("https://www.peopo.org/rss-news"); 
        const xml = await res.text();
        
        // 分割每一個新聞項目 [cite: 1, 2, 3, 4]
        const itemRegex = /<item>([\s\S]*?)<\/item>/g;
        let match;

        while ((match = itemRegex.exec(xml)) !== null) {
            const item = match[1];
            
            // 提取關鍵欄位
            const creator = extractContent(item, "dc:creator"); // [cite: 1, 2]
            const title = extractContent(item, "title"); // [cite: 1, 2]
            const url = extractContent(item, "link"); // [cite: 1, 2]
            const dateRaw = extractContent(item, "pubDate"); // [cite: 1, 2]

            // 核心判斷：過濾特定作者「輔大生命力新聞」 
            if (creator === "輔大生命力新聞") {
                const date = new Date(dateRaw).toISOString();
                const pid = parseInt(url.split('/').pop() || "0");
                
                // 寫入資料庫，若 post_id 已存在則忽略
                await env.DB.prepare(
                    "INSERT OR IGNORE INTO peopo (post_id, title, post_date, post_url) VALUES (?, ?, ?, ?)"
                ).bind(pid, title, date, url).run();
            }
        }

        // 讀取資料庫中最新的文章記錄進行監控判斷
        const latest = await env.DB.prepare(
            "SELECT post_id, post_date, post_url FROM peopo ORDER BY post_date DESC LIMIT 1"
        ).first<{ post_id: number, post_date: string, post_url: string }>();

        let status = 'success';
        const articleDate = latest?.post_date ? getTaipeiDateString(latest.post_date) : "無資料";

        // 監控邏輯：若應發稿日過期且最新文章日期不符，則標記為 missing
        if (latest && articleDate !== todayStr && isPublishingDay && isPastDeadline) {
            status = 'missing';
            if (checkingType === 0) {
                await sendEmailAlertToSubscribers(env, "Peopo (輔大生命力)", articleDate);
            }
        }

        // 更新監控狀態表
        await env.DB.prepare(`
            UPDATE monitor_status 
            SET last_check_at = datetime('now', '+8 hours'), 
                checking_status = ?, 
                latest_post_id = ?, 
                latest_post_url = ?, 
                last_success_at = CASE WHEN ? = 'success' THEN datetime('now', '+8 hours') ELSE last_success_at END 
            WHERE platform = 'peopo'
        `).bind(status, latest?.post_id || null, latest?.post_url || "", status).run();

    } catch (e) {
        console.error("[Peopo] Error:", e);
    }
}