/**
 * database.js — SQLite para o Boss Tracker
 *
 * Tabelas:
 *  - kill_snapshots : guarda o total de kills da API por dia (para detectar diff)
 *  - kill_history   : registra cada vez que um boss foi morto (detectado pela diff)
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'boss_tracker.db');
const db = new Database(DB_PATH);

// WAL mode para melhor performance
db.pragma('journal_mode = WAL');

// ─── Criação das tabelas ──────────────────────────────────────────────────────

db.exec(`
    CREATE TABLE IF NOT EXISTS kill_snapshots (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        world        TEXT    NOT NULL,
        boss_name    TEXT    NOT NULL,
        total_kills  INTEGER NOT NULL DEFAULT 0,
        snapshot_date TEXT   NOT NULL,
        created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
        UNIQUE(world, boss_name, snapshot_date)
    );

    CREATE TABLE IF NOT EXISTS kill_history (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        world         TEXT NOT NULL,
        boss_name     TEXT NOT NULL,
        kill_date     TEXT NOT NULL,  -- YYYY-MM-DD
        amount_killed INTEGER NOT NULL DEFAULT 1,
        created_at    TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(world, boss_name, kill_date)
    );

    CREATE INDEX IF NOT EXISTS idx_snapshots_world_boss ON kill_snapshots(world, boss_name);
    CREATE INDEX IF NOT EXISTS idx_history_world_boss   ON kill_history(world, boss_name);
`);

// ─── Prepared statements ──────────────────────────────────────────────────────

const stmts = {
    getLastSnapshot: db.prepare(`
        SELECT * FROM kill_snapshots
        WHERE world = ? AND boss_name = ?
        ORDER BY snapshot_date DESC
        LIMIT 1
    `),

    saveSnapshot: db.prepare(`
        INSERT INTO kill_snapshots (world, boss_name, total_kills, snapshot_date)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(world, boss_name, snapshot_date)
        DO UPDATE SET total_kills = excluded.total_kills
    `),

    logKill: db.prepare(`
        INSERT INTO kill_history (world, boss_name, kill_date, amount_killed)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(world, boss_name, kill_date)
        DO UPDATE SET amount_killed = excluded.amount_killed
    `),

    getKillHistory: db.prepare(`
        SELECT kill_date, amount_killed FROM kill_history
        WHERE world = ? AND boss_name = ?
        ORDER BY kill_date ASC
    `),

    getAllHistory: db.prepare(`
        SELECT boss_name, kill_date, amount_killed FROM kill_history
        WHERE world = ?
        ORDER BY boss_name, kill_date ASC
    `),

    deleteKill: db.prepare(`
        DELETE FROM kill_history
        WHERE world = ? AND boss_name = ? AND kill_date = ?
    `)
};

// ─── Funções exportadas ───────────────────────────────────────────────────────

/**
 * Retorna o snapshot mais recente de um boss
 * @returns {Object|null} { total_kills, snapshot_date } ou null
 */
function getLastSnapshot(world, bossName) {
    return stmts.getLastSnapshot.get(world, bossName) ?? null;
}

/**
 * Salva (ou atualiza) o snapshot de kills totais de hoje
 */
function saveSnapshot(world, bossName, totalKills, date) {
    stmts.saveSnapshot.run(world, bossName, totalKills, date);
}

/**
 * Registra uma kill no histórico (ou atualiza se já existir no mesmo dia)
 */
function logKill(world, bossName, date, amount) {
    stmts.logKill.run(world, bossName, date, amount);
}

/**
 * Retorna o histórico de kills de um boss ordenado por data ASC
 * @returns {Array} [{ kill_date }]
 */
function getKillHistory(world, bossName) {
    return stmts.getKillHistory.all(world, bossName);
}

/**
 * Retorna todo histórico de um mundo
 * @returns {Array} [{ boss_name, kill_date }]
 */
function getAllHistory(world) {
    return stmts.getAllHistory.all(world);
}

/**
 * Remove uma kill específica (para correção manual)
 */
function deleteKill(world, bossName, date) {
    stmts.deleteKill.run(world, bossName, date);
}

module.exports = {
    getLastSnapshot,
    saveSnapshot,
    logKill,
    getKillHistory,
    getAllHistory,
    deleteKill
};
