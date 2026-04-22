import { Env } from './index';

/**
 * Utility: get Taipei time status
 */
function getTaipeiStatus(deadlineHour: number, deadlineMinute: number = 0) {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('zh-TW', {
        timeZone: 'Asia/Taipei',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(now);

    const t = Object.fromEntries(parts.map(p => [p.type, p.value]));
    // Keep month and day as two digits for consistent behavior
    const todayStr = `${t.year}-${t.month.padStart(2, '0')}-${t.day.padStart(2, '0')}`;
    const currentTotalMins = parseInt(t.hour) * 60 + parseInt(t.minute);
    const deadlineTotalMins = deadlineHour * 60 + deadlineMinute;
    
    return {
        todayStr,
        isPublishingDay: [1, 3, 5].includes(now.getDay()), // Mon, Wed, Fri
        isPastDeadline: currentTotalMins >= deadlineTotalMins,
        timeLabel: `${t.hour}:${t.minute}`
    };
}

/**
 * Utility: safely convert a UTC date string to Taipei YYYY-MM-DD
 */
function getTaipeiDateString(utcDateStr: string): string {
    const date = new Date(utcDateStr);
    return new Intl.DateTimeFormat('zh-TW', {
        timeZone: 'Asia/Taipei',
        year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(date).replace(/\//g, '-');
}

/**
 * Send alert emails to all subscribers (production version using Resend Batch API)
 */
async function sendEmailAlertToSubscribers(env: Env, platform: string, latestDate: string) {
    if (!env.RESEND_API_KEY) {
        console.error("[Alert] Missing Resend API key. Cannot send email alerts.");
        return;
    }

    try {
        const { results } = await env.DB.prepare(
            "SELECT email FROM subscribers"
        ).all<{ email: string }>();

        if (!results || results.length === 0) {
            console.log(`[Alert] no subscribers for ${platform} notifications.`);
            return;
        }

        const fromEmail = "Noticer Alert <alert@trashcode.dev>";
        console.log(`[Alert] sending ${platform} notifications to ${results.length} subscribers...`);

        // Build batch email payloads for privacy and per-request recipient limits
        // Note: Resend Batch API usually allows up to 100 emails per request
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
        console.error("[Alert] sendEmailAlertToSubscribers:", err);
    }
}

/**
 * Vita.tw check logic (deadline: 20:00)
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

        const latest = await env.DB.prepare("SELECT post_id, title, post_date, post_url FROM vita ORDER BY post_date DESC LIMIT 1").first<{ post_id: number, title: string, post_date: string, post_url: string }>();

        let status = 'success';
        const articleDate = latest?.post_date ? getTaipeiDateString(latest.post_date) : "無資料";

        if (latest && articleDate !== todayStr && isPublishingDay && isPastDeadline) {
            status = 'missing';
            // Only auto schedule (checkingType 0) sends email alerts
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
        latest_title = ?,
        last_success_at = CASE WHEN ? = 'success' THEN datetime('now', '+8 hours') ELSE last_success_at END 
    WHERE platform = ?
`).bind(status, latest?.post_id || null, latest?.post_url || "", latest?.title || "", status, "vita").run();

    } catch (e) {
        console.error("[Vita] Error:", e);
    }
}

/**
 * Peopo check logic (deadline: 21:00)
 */
export async function handlePeopoCheck(env: Env, checkingType: number = 0) {
    // Get current Taipei time status
    const { todayStr, isPublishingDay, isPastDeadline } = getTaipeiStatus(21, 0);

    // Internal helper to extract tag content and remove CDATA
    const extractContent = (xmlItem: string, tagName: string) => {
        // Match tag content (tag may include attributes like <link rel="...">)
        const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`);
        const match = xmlItem.match(regex);
        if (!match) return "";
        // Remove CDATA wrapper and trim spaces
        return match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
    };

    try {
        const res = await fetch("https://www.peopo.org/rss-news"); 
        const xml = await res.text();
        
        // Split each news item
        const itemRegex = /<item>([\s\S]*?)<\/item>/g;
        let match;

        while ((match = itemRegex.exec(xml)) !== null) {
            const item = match[1];
            
            // Extract key fields
            const creator = extractContent(item, "dc:creator"); 
            const title = extractContent(item, "title"); 
            const url = extractContent(item, "link"); 
            const dateRaw = extractContent(item, "pubDate"); 

            // Core rule: only keep posts from "輔大生命力新聞"
            if (creator === "輔大生命力新聞") {
                const date = new Date(dateRaw).toISOString();
                const pid = parseInt(url.split('/').pop() || "0");
                
                // Save to DB, ignore if post_id already exists
                await env.DB.prepare(
                    "INSERT OR IGNORE INTO peopo (post_id, title, post_date, post_url) VALUES (?, ?, ?, ?)"
                ).bind(pid, title, date, url).run();
            }
        }

        // Read latest post from DB for monitoring check
        const latest = await env.DB.prepare(
            "SELECT post_id, title, post_date, post_url FROM peopo ORDER BY post_date DESC LIMIT 1"
        ).first<{ post_id: number, title: string, post_date: string, post_url: string }>();

        let status = 'success';
        const articleDate = latest?.post_date ? getTaipeiDateString(latest.post_date) : "無資料";

        // Monitoring rule: if deadline passed and latest date is not today, mark as missing
        if (latest && articleDate !== todayStr && isPublishingDay && isPastDeadline) {
            status = 'missing';
            if (checkingType === 0) {
                await sendEmailAlertToSubscribers(env, "Peopo (輔大生命力)", articleDate);
            }
        }

        // Update monitoring status table
        await env.DB.prepare(`
            UPDATE monitor_status 
            SET last_check_at = datetime('now', '+8 hours'), 
                checking_status = ?, 
                latest_post_id = ?, 
                latest_post_url = ?, 
                latest_title = ?,
                last_success_at = CASE WHEN ? = 'success' THEN datetime('now', '+8 hours') ELSE last_success_at END 
            WHERE platform = 'peopo'
        `).bind(status, latest?.post_id || null, latest?.post_url || "", latest?.title || "", status).run();

    } catch (e) {
        console.error("[Peopo] Error:", e);
    }
}