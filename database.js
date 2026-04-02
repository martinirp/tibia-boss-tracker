const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'bossTracker.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS kills (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            world TEXT,
            boss_name TEXT,
            kill_date DATE DEFAULT (date('now')),
            UNIQUE(world, boss_name, kill_date)
        )
    `);
});

function logKills(world, creatures) {
    const today = new Date().toISOString().split('T')[0];
    db.serialize(() => {
        const stmt = db.prepare(`INSERT OR IGNORE INTO kills (world, boss_name, kill_date) VALUES (?, ?, ?)`);
        creatures.forEach(boss => {
            stmt.run(world, boss, today);
        });
        stmt.finalize();
    });
}

function getBossHistory(world, callback) {
    // Return ALL kills per boss to calculate the true average dynamically
    db.all(`SELECT boss_name, kill_date 
            FROM kills 
            WHERE world = ? COLLATE NOCASE
            ORDER BY boss_name, kill_date ASC`, [world], (err, rows) => {
        if (err) return callback(err);
        callback(null, rows);
    });
}

module.exports = {
    db, logKills, getBossHistory
};
