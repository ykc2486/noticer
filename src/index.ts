import { handleVitaCheck, handlePeopoCheck } from './checker';
import { dashboardHtml } from './dashboard';

export interface Env {
    DB: D1Database;
	RESEND_API_KEY: string; 
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

        return new Response("Not Found", { status: 404 });
    },

    /**
     * Cron Trigger: Runs every hour (0 * * * *)
     */
    async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
        console.log(`[Cron] Triggered at UTC: ${new Date().toISOString()}`);
        
        // We push both tasks into waitUntil to ensure they complete
        ctx.waitUntil(handleVitaCheck(env, 0));
        ctx.waitUntil(handlePeopoCheck(env, 0));
    },
} satisfies ExportedHandler<Env>;
