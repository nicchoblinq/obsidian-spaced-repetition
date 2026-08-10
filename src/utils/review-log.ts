import { Vault } from "obsidian";

/**
 * Appends one JSON line per card review to a log file in the vault, so review
 * history (reviews per day, streaks, per-card trajectories) can be reconstructed
 * later. The core plugin only persists each card's latest schedule state.
 *
 * Logging is best-effort: failures are logged to the console and never
 * interrupt the review flow.
 */
export class ReviewLog {
    private static vault: Vault | null = null;
    private static logPath: string = "Spaced Repetition/review-log.jsonl";

    static get path(): string {
        return ReviewLog.logPath;
    }

    static init(vault: Vault, folder?: string): void {
        ReviewLog.vault = vault;
        if (folder && folder.trim().length > 0) {
            ReviewLog.logPath = `${folder.replace(/\/+$/, "")}/review-log.jsonl`;
        }
    }

    static async append(entry: Record<string, unknown>): Promise<void> {
        if (ReviewLog.vault === null) return;
        try {
            const adapter = ReviewLog.vault.adapter;
            const dir = ReviewLog.logPath.substring(0, ReviewLog.logPath.lastIndexOf("/"));
            if (dir.length > 0 && !(await adapter.exists(dir))) {
                await adapter.mkdir(dir);
            }
            const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n";
            await adapter.append(ReviewLog.logPath, line);
        } catch (e) {
            console.error("SR review-log append failed", e);
        }
    }
}
