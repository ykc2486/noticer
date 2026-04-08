/**
 * Welcome to Cloudflare Workers!
 *
 * This is a template for a Scheduled Worker: a Worker that can run on a
 * configurable interval:
 * https://developers.cloudflare.com/workers/platform/triggers/cron-triggers/
 */

import { handleVitaCheck, handlePeopoCheck } from './checker';

export interface Env {
    DB: D1Database;
}

export default {
    /**
     * HTTP Entry point for testing
     * Trigger specific check functions via URL
     */
    async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const url = new URL(req.url);

        // Test Vita: http://localhost:8787/test-vita
        if (url.pathname === '/test-vita') {
            console.log("--- Manual Trigger: Vita Check ---");
            await handleVitaCheck(env, 1); 
            return new Response("Vita check completed. Check terminal logs.");
        }

        // Test Peopo: http://localhost:8787/test-peopo
        if (url.pathname === '/test-peopo') {
            console.log("--- Manual Trigger: Peopo Check ---");
            await handlePeopoCheck(env, 1);
            return new Response("Peopo check completed. Check terminal logs.");
        }

        // Default: Show current DB status
        try {
            const { results } = await env.DB.prepare("SELECT * FROM monitor_status").all();
            return new Response(JSON.stringify(results, null, 2), {
                headers: { 
                    "Content-Type": "application/json;charset=utf-8",
                    "Access-Control-Allow-Origin": "*" 
                }
            });
        } catch (e) {
            return new Response("Database is empty or tables do not exist. Please run test routes first.");
        }
    },

    /**
     * Formal Cron Trigger Entry Point
     */
    async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
        const now = new Date();
        // Calculate Taiwan hour (UTC+8)
        const taiwanHour = (now.getUTCHours() + 8) % 24;
        
        console.log(`[Cron] Triggered: ${controller.cron}, Taiwan Hour: ${taiwanHour}`);

        // Logic based on hour
        if (taiwanHour === 20) {
            ctx.waitUntil(handleVitaCheck(env, 0));
        } else if (taiwanHour === 21) {
            ctx.waitUntil(handlePeopoCheck(env, 0));
        } else {
            // Optional: run both for other hours during testing if cron is * * * * *
            ctx.waitUntil(handleVitaCheck(env, 0));
            ctx.waitUntil(handlePeopoCheck(env, 0));
        }
    },
} satisfies ExportedHandler<Env>;
