import { handleVitaCheck, handlePeopoCheck } from './checker';
import { dashboardHtml } from './dashboard';

export interface Env {
    DB: D1Database;
    RESEND_API_KEY: string;
    MY_BUCKET: R2Bucket;
    SECRET_DATE: string;
}

function getTaipeiDateString(): string {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Taipei',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const parts = formatter.formatToParts(new Date());
    const year = parts.find(p => p.type === 'year')?.value;
    const month = parts.find(p => p.type === 'month')?.value;
    const day = parts.find(p => p.type === 'day')?.value;
    return `${year}-${month}-${day}`;
}

function generateDailyToken(secretDate: string): string {
    const today = getTaipeiDateString();
    const lenA = today.length;
    const lenB = secretDate.length;
    const maxLen = Math.max(lenA, lenB);
    
    let result = '';
    for (let i = 0; i < maxLen; i++) {
        const charA = today.charCodeAt(i % lenA);
        const charB = secretDate.charCodeAt(i % lenB);
        result += String.fromCharCode(charA ^ charB);
    }
    
    return btoa(result);
}

export default {
    /**
     * HTTP Entry point for testing & dashboard
     */
    async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const url = new URL(req.url);

        // Manual Test Routes
        if (url.pathname === '/test-vita') {
            await handleVitaCheck(env, 1); 
            return new Response("Vita check manual trigger completed.");
        }

        if (url.pathname === '/test-peopo') {
            await handlePeopoCheck(env, 1);
            return new Response("Peopo check manual trigger completed.");
        }

        // Return HTML dashboard on root
        if (url.pathname === '/') {
            return new Response(dashboardHtml, {
                headers: { 
                    "Content-Type": "text/html;charset=utf-8" 
                }
            });
        }

        // API Status endpoint for dashboard
        if (url.pathname === '/api/status') {
            try {
                const { results } = await env.DB.prepare("SELECT * FROM monitor_status").all();
                return new Response(JSON.stringify(results, null, 2), {
                    headers: { 
                        "Content-Type": "application/json;charset=utf-8",
                        "Access-Control-Allow-Origin": "*" 
                    }
                });
            } catch (e) {
                return new Response(JSON.stringify({ error: "Database error or tables not initialized." }), { 
                    status: 500,
                    headers: { "Content-Type": "application/json;charset=utf-8" }
                });
            }
        }

        // Secret Image endpoint
        if (url.pathname === '/api/easter-egg') {
            const token = url.searchParams.get('token');
            if (!token || !env.SECRET_DATE) {
                return new Response("Not Found", { status: 404 });
            }

            try {
                const expectedToken = generateDailyToken(env.SECRET_DATE);
                if (token !== expectedToken) {
                    return new Response("Not Found", { status: 404 });
                }

                const object = await env.MY_BUCKET.get('hidden.jpg');
                if (!object) {
                    return new Response("Not Found", { status: 404 });
                }

                return new Response(object.body, {
                    headers: {
                        "Content-Type": "image/jpeg",
                        "Cache-Control": "private, no-cache"
                    }
                });
            } catch (error) {
                return new Response("Not Found", { status: 404 });
            }
        }

        return new Response("Not Found", { status: 404 });
    },

    /**
     * Cron Trigger: Runs every hour (5 * * * *)
     */
    async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
        console.log(`[Cron] Triggered at UTC: ${new Date().toISOString()}`);
        
        // We push both tasks into waitUntil to ensure they complete
        ctx.waitUntil(handleVitaCheck(env, 0));
        ctx.waitUntil(handlePeopoCheck(env, 0));
    },
} satisfies ExportedHandler<Env>;
