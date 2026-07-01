/**
 * database.js — SQLite para o Boss Tracker integrado ao BossBot
 */

const Database = require('better-sqlite3');
const path = require('path');

// Caminho para o banco de dados do BossBot
const DB_PATH = path.join(__dirname, '..', 'BossBot', 'bossbot.db');
const db = new Database(DB_PATH);

// WAL mode para melhor performance
db.pragma('journal_mode = WAL');

const MULTI_CITY_BOSSES = {
  "rotworm queen": ["Ab'Dendriel", "Darashia", "Edron", "Liberty Bay"],
  "the voice of ruin": ["Esquerda", "Direita"],
  "flamecaller zazrak": ["Surface", "North"],
  "tyrn": ["Liberty Bay", "Drefia"],
  "dreadmaw": ["West", "East"],
  "white pale": ["Edron", "Darashia", "Liberty Bay"],
  "hirintror": ["Mines", "Nibelor"],
  "battlemaster zunzu": ["West", "East"],
  "fleabringer": ["Surface", "North", "Sul"],
  "albino dragon": ["Farmine", "Fenrock", "Goroma", "POI", "Ank"]
};

// prepared statements
const stmts = {
    getBossLastSeen: db.prepare(`
        SELECT confirmed_by, seen_at, city FROM boss_last_seen
        WHERE world = ? AND boss_name = ?
        LIMIT 1
    `),

    getBossCheck: db.prepare(`
        SELECT checked_by, checked_at, city FROM boss_check
        WHERE world = ? AND boss_name = ?
        LIMIT 1
    `),

    getUserName: db.prepare(`
        SELECT name FROM users WHERE jid = ?
    `),

    getKillHistory: db.prepare(`
        SELECT boss_name, reported_by_jid, extra_text, created_at FROM boss_reports
        WHERE world = ? AND (boss_name = ? OR boss_name = ?)
        ORDER BY created_at ASC
    `),

    getKillHistorySimple: db.prepare(`
        SELECT boss_name, reported_by_jid, extra_text, created_at FROM boss_reports
        WHERE world = ? AND boss_name = ?
        ORDER BY created_at ASC
    `),

    logKillInsertLastSeen: db.prepare(`
        INSERT INTO boss_last_seen (world, boss_name, confirmed_by, seen_at, city)
        VALUES (?, ?, 'TibiaData_API', ?, ?)
        ON CONFLICT(world, boss_name) DO UPDATE SET
            confirmed_by = excluded.confirmed_by,
            seen_at = excluded.seen_at,
            city = excluded.city
    `),

    logKillCheckReportExists: db.prepare(`
        SELECT created_at FROM boss_reports
        WHERE world = ? AND boss_name = ? AND reported_by_jid = 'TibiaData_API'
    `),

    logKillInsertReport: db.prepare(`
        INSERT INTO boss_reports (boss_name, extra_text, reported_by_jid, notified_count, world, created_at)
        VALUES (?, 'Detectado via TibiaData API', 'TibiaData_API', 0, ?, datetime('now'))
    `)
};

/**
 * Retorna o último avistamento de um boss
 */
function getBossLastSeen(world, bossName) {
    try {
        return stmts.getBossLastSeen.get(world, bossName) ?? null;
    } catch (err) {
        console.error(`[DB] Erro em getBossLastSeen (${bossName}):`, err);
        return null;
    }
}

/**
 * Retorna o último check (não encontrado) de um boss
 */
function getBossCheck(world, bossName) {
    try {
        return stmts.getBossCheck.get(world, bossName) ?? null;
    } catch (err) {
        console.error(`[DB] Erro em getBossCheck (${bossName}):`, err);
        return null;
    }
}

/**
 * Converte JID de usuário para nome ou formato legível
 */
function getUserName(jid) {
    if (!jid) return 'Desconhecido';
    if (jid === 'TibiaData_API') return 'TibiaData API';
    if (jid === 'system_adjust') return 'Sistema';
    if (jid === 'flop') return 'Flop';

    try {
        const row = stmts.getUserName.get(jid);
        if (row && row.name) {
            return row.name;
        }
    } catch (err) {
        console.error(`[DB] Erro em getUserName (${jid}):`, err);
    }

    if (jid.includes('@')) {
        return `@${jid.split('@')[0]}`;
    }
    return jid;
}

/**
 * Retorna o histórico de kills de um boss ordenado por data ASC
 * Mapeado para o formato esperado pelo frontend.
 */
function getKillHistory(world, bossName) {
    try {
        // Se bossName tiver cidade, ex: "Rotworm Queen (Edron)", buscar tanto pela cidade quanto pelo nome base "Rotworm Queen"
        const cityMatch = bossName.match(/^(.+?)\s*\((.+?)\)$/);
        let rows;
        if (cityMatch) {
            const baseName = cityMatch[1].trim();
            rows = stmts.getKillHistory.all(world, bossName, baseName);
        } else {
            rows = stmts.getKillHistorySimple.all(world, bossName);
        }

        return rows.map(row => {
            // Converter UTC para BRT
            const utcDate = new Date(row.created_at.replace(' ', 'T') + 'Z');
            const brtDate = new Date(utcDate.getTime() - 3 * 60 * 60 * 1000);
            const kill_date = brtDate.toISOString().split('T')[0];

            return {
                kill_date,
                amount_killed: 1,
                confirmed_by: getUserName(row.reported_by_jid),
                extra_text: row.extra_text,
                created_at: row.created_at
            };
        });
    } catch (err) {
        console.error(`[DB] Erro em getKillHistory (${bossName}):`, err);
        return [];
    }
}

/**
 * Auxiliar para registrar kill de um boss específico
 */
function logSingleKill(world, bossName, killDate, city = null) {
    const lastSeen = getBossLastSeen(world, bossName);
    const seenAtDate = lastSeen ? lastSeen.seen_at.split(' ')[0] : null;
    const isHuman = lastSeen && lastSeen.confirmed_by !== 'TibiaData_API' && 
                              lastSeen.confirmed_by !== 'system_adjust' && 
                              lastSeen.confirmed_by !== 'flop';

    const fallbackDate = `${killDate} 00:00`;

    if (isHuman && seenAtDate === killDate) {
        console.log(`[DB] logKill: ${bossName} já confirmado por humano (${lastSeen.confirmed_by}), ignorando API.`);
        return;
    }

    // Atualizar last seen
    stmts.logKillInsertLastSeen.run(world, bossName, fallbackDate, city);
}

/**
 * Registra uma kill no histórico e atualiza o last seen
 */
function logKill(world, bossName, killDate, amount) {
    try {
        const key = bossName.toLowerCase();
        const cities = MULTI_CITY_BOSSES[key];

        // 1. Atualizar o last seen (se for multi-cidade, atualizar para cada cidade)
        if (cities) {
            for (const city of cities) {
                logSingleKill(world, `${bossName} (${city})`, killDate, city);
            }
        } else {
            logSingleKill(world, bossName, killDate, null);
        }

        // 2. Inserir no histórico de reports do banco de dados (apenas para o bossName base, evitando duplicados)
        const reports = stmts.logKillCheckReportExists.all(world, bossName);
        const alreadyReported = reports.some(r => {
            const utcDate = new Date(r.created_at.replace(' ', 'T') + 'Z');
            const brtDate = new Date(utcDate.getTime() - 3 * 60 * 60 * 1000);
            return brtDate.toISOString().split('T')[0] === killDate;
        });

        if (!alreadyReported) {
            stmts.logKillInsertReport.run(bossName, world);
            console.log(`[DB] Kill registrada no histórico (API): ${bossName} em ${killDate}`);
        }
    } catch (err) {
        console.error(`[DB] Erro em logKill (${bossName}):`, err);
    }
}

// Para manter compatibilidade com rotas antigas se necessário
function getAllHistory(world) {
    return [];
}
function deleteKill(world, bossName, date) {}

module.exports = {
    getBossLastSeen,
    getBossCheck,
    getUserName,
    getKillHistory,
    getAllHistory,
    logKill,
    deleteKill
};
