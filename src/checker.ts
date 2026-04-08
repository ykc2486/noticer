import { Env } from './index';

export async function handleVitaCheck(env: Env, checkingType: number = 0) { // 0 for scheduled, 1 for manual
    const now = new Date();
    
    // Get Taiwan time parts including minutes
    const taipeiTime = new Intl.DateTimeFormat('zh-TW', {
        timeZone: 'Asia/Taipei',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).formatToParts(now);

    const timeMap = Object.fromEntries(taipeiTime.map(p => [p.type, p.value]));
    const todayStr = `${timeMap.year}-${timeMap.month}-${timeMap.day}`;
    const currentHour = parseInt(timeMap.hour);
    const currentMinute = parseInt(timeMap.minute);
    const dayOfWeek = now.getDay(); // 0: Sun, 1: Mon, ..., 5: Fri, 6: Sat

    // Calculate total minutes since start of day for precise comparison
    const currentTotalMinutes = currentHour * 60 + currentMinute;
    const deadlineMinutes = 20 * 60; // 20:00 (8 PM)

    console.log(`[Vita] Current time: ${todayStr} ${timeMap.hour}:${timeMap.minute} (Day ${dayOfWeek})`);
    
    try {
        const res = await fetch("https://vita.tw");
        if (!res.ok) throw new Error(`Fetch failed with status ${res.status}`);
        const html = await res.text();

        /**
         * Parse the article structure:
         * 1. Extract data-post-id
         * 2. Extract link and title from h3 a tag
         * 3. Extract datetime from time tag
         */
        const regex = /<article[^>]+data-post-id="(\d+)"[^>]*>[\s\S]*?<h3 class="entry-title"><a href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h3>[\s\S]*?datetime="([^"]+)"/g;

        let match;
        let count = 0;

        // Iterate through all matches and log the extracted information
        while ((match = regex.exec(html)) !== null) {
            count++;
            const [_, postId, url, title, date] = match;
            const pid = parseInt(postId);

            const dbResult = await env.DB.prepare("INSERT OR IGNORE INTO vita (post_id, title, post_date, post_url) VALUES (?, ?, ?, ?)")
                .bind(pid, title.trim(), date, url)
                .run();
            
            if (dbResult.meta.changes > 0)
                console.log("[Vita] added new post:" + title.trim() + " (" + date + ") - " + url);
        }

        if(count === 0) {
            console.warn("[Vita] CAUTION: No articles found during this check.")
        }

        // Retrieve the latest record from 'vita' table
        const latestRecord = await env.DB.prepare(
            "SELECT post_date, post_url FROM vita ORDER BY post_date DESC LIMIT 1"
        ).first<{ post_date: string, post_url: string }>();

        let finalStatus = 'success'; // Default to success unless proven otherwise
        let latestUrl = latestRecord?.post_url || "";

        if (latestRecord) {
            // Extract the date part (YYYY-MM-DD) from the post_date string
            const articleDateStr = latestRecord.post_date.split('T')[0];
            
            if (articleDateStr === todayStr) {
                // Case 1: Post for today is already present
                finalStatus = 'success';
                console.log(`[Vita] check passed: Today's article is present (${articleDateStr})`);
            } else {
                // Case 2: No post for today, check if it's past the deadline
                const isPublishingDay = [1, 3, 5].includes(dayOfWeek); // Mon, Wed, Fri
                const isPastDeadline = currentTotalMinutes >= deadlineMinutes;

                if (isPublishingDay && isPastDeadline) {
                    finalStatus = 'missing';
                    console.log(`[Vita] alert: Publishing day but no post found past 20:00. Latest is ${articleDateStr}`);
                    // TODO: email alert (if checkingType === 0)
                } else {
                    // It's either not a publishing day, or the deadline hasn't passed yet
                    finalStatus = 'success';
                    console.log(`[Vita] Status OK: Next post expected later or latest article is from ${articleDateStr}`);
                }
            }
        }

        // Update cache table with current result
        await env.DB.prepare(`
            UPDATE monitor_status 
            SET last_check_at = datetime('now', '+8 hours'), 
                checking_status = ?, 
                latest_post_url = ?,
                last_success_at = CASE WHEN ? = 'success' THEN datetime('now', '+8 hours') ELSE last_success_at END
            WHERE platform = 'vita'
        `)
        .bind(finalStatus, latestUrl, finalStatus)
        .run();

    } catch (e) {
        console.error("[Vita] Error during check:", e);
        // Mark as error in DB to notify dashboard
        await env.DB.prepare("UPDATE monitor_status SET checking_status = 'error', last_check_at = datetime('now', '+8 hours') WHERE platform = 'vita'").run();
    }
}

/**
 * Handle Peopo.org RSS check
 * Filter by dc:creator: 輔大生命力新聞
 * Deadline: 21:00
 */
export async function handlePeopoCheck(env: Env, checkingType: number = 0) {
    const now = new Date();
    
    const taipeiTime = new Intl.DateTimeFormat('zh-TW', {
        timeZone: 'Asia/Taipei',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).formatToParts(now);

    const timeMap = Object.fromEntries(taipeiTime.map(p => [p.type, p.value]));
    const todayStr = `${timeMap.year}-${timeMap.month}-${timeMap.day}`;
    const currentTotalMinutes = parseInt(timeMap.hour) * 60 + parseInt(timeMap.minute);
    const deadlineMinutes = 21 * 60; // 21:00 (9 PM)
    const dayOfWeek = now.getDay(); 

    console.log(`[Peopo] Current time: ${todayStr} ${timeMap.hour}:${timeMap.minute} (Day ${dayOfWeek})`);

    try {
        const PEOPO_RSS_URL = "https://www.peopo.org/rss-news"; // Replace with actual RSS URL
        const res = await fetch(PEOPO_RSS_URL);
        if (!res.ok) throw new Error(`Fetch failed with status ${res.status}`);
        const xml = await res.text();

        // RSS Item Regex
        const itemRegex = /<item>([\s\S]*?)<\/item>/g;
        const titleRegex = /<title>(.*?)<\/title>/;
        const linkRegex = /<link>(.*?)<\/link>/;
        const dateRegex = /<pubDate>(.*?)<\/pubDate>/;
        const creatorRegex = /<dc:creator>(.*?)<\/dc:creator>/;

        let match;
        let matchCount = 0;

        while ((match = itemRegex.exec(xml)) !== null) {
            const itemContent = match[1];
            
            const creatorMatch = itemContent.match(creatorRegex);
            const creator = creatorMatch ? creatorMatch[1].trim() : "";

            // Filter by Creator
            if (creator === "輔大生命力新聞") {
                const title = itemContent.match(titleRegex)?.[1] || "No Title";
                const url = itemContent.match(linkRegex)?.[1] || "";
                const pubDateRaw = itemContent.match(dateRegex)?.[1] || "";
                
                const isoDate = new Date(pubDateRaw).toISOString();
                const postId = parseInt(url.split('/').pop() || "0");

                const dbResult = await env.DB.prepare(
                    "INSERT OR IGNORE INTO peopo (post_id, title, post_date, post_url) VALUES (?, ?, ?, ?)"
                )
                .bind(postId, title, isoDate, url)
                .run();

                if (dbResult.meta.changes > 0) {
                    matchCount++;
                    console.log(`[Peopo] Added new post by ${creator}: ${title}`);
                }
            }
        }

        // Retrieve latest record
        const latestRecord = await env.DB.prepare(
            "SELECT post_date, post_url FROM peopo ORDER BY post_date DESC LIMIT 1"
        ).first<{ post_date: string, post_url: string }>();

        let finalStatus = 'success';
        let latestUrl = latestRecord?.post_url || "";

        if (latestRecord) {
            const articleDateStr = latestRecord.post_date.split('T')[0];
            
            if (articleDateStr === todayStr) {
                finalStatus = 'success';
            } else {
                const isPublishingDay = [1, 3, 5].includes(dayOfWeek);
                const isPastDeadline = currentTotalMinutes >= deadlineMinutes;

                if (isPublishingDay && isPastDeadline) {
                    finalStatus = 'missing';
                } else {
                    finalStatus = 'success';
                }
            }
        }

        await env.DB.prepare(`
            UPDATE monitor_status 
            SET last_check_at = datetime('now', '+8 hours'), 
                checking_status = ?, 
                latest_post_url = ?,
                last_success_at = CASE WHEN ? = 'success' THEN datetime('now', '+8 hours') ELSE last_success_at END
            WHERE platform = 'peopo'
        `)
        .bind(finalStatus, latestUrl, finalStatus)
        .run();

        console.log(`[Peopo] Final status: ${finalStatus}`);

    } catch (e) {
        console.error("[Peopo] Error:", e);
        await env.DB.prepare("UPDATE monitor_status SET checking_status = 'error', last_check_at = datetime('now', '+8 hours') WHERE platform = 'peopo'").run();
    }
}