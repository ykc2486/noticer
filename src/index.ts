import { handleVitaCheck, handlePeopoCheck } from './checker';

export interface Env {
    DB: D1Database;
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

        // Default: API Dashboard Status
        try {
            const { results } = await env.DB.prepare("SELECT * FROM monitor_status").all();
            return new Response(JSON.stringify(results, null, 2), {
                headers: { 
                    "Content-Type": "application/json;charset=utf-8",
                    "Access-Control-Allow-Origin": "*" 
                }
            });
        } catch (e) {
            return new Response("Database error or tables not initialized.");
        }
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
