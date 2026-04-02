const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const { logKills, getBossHistory } = require('./database');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Load Config
const configPath = path.join(__dirname, 'config.json');
let config = { defaultWorld: "Quelibra", port: 3000 };
if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

const PORT = config.port || 3000;

// Load monitored bosses
const bossesPath = path.join(__dirname, 'bosses.json');
let monitoredBosses = [];
if (fs.existsSync(bossesPath)) {
    monitoredBosses = JSON.parse(fs.readFileSync(bossesPath, 'utf8'));
}

async function processWorldStats(world) {
    try {
        console.log(`[${new Date().toISOString()}] Fetching stats for ${world}...`);
        
        const response = await fetch(`https://api.tibiadata.com/v4/killstatistics/${encodeURIComponent(world)}`);
        const data = await response.json();
        
        if (!data.killstatistics || !data.killstatistics.entries) return;
        
        const bossNames = monitoredBosses.map(b => b.name.toLowerCase());
        const killedBosses = [];
        
        for (const entry of data.killstatistics.entries) {
            if (entry.last_day_killed > 0 && bossNames.includes(entry.race.toLowerCase())) {
                killedBosses.push(entry.race);
            }
        }
        
        if (killedBosses.length > 0) {
            logKills(world, killedBosses);
            console.log(`Logged ${world}: ${killedBosses.join(', ')}`);
        } else {
            console.log(`Nenhum boss pág ${world} últimas 24h.`);
        }
    } catch (err) {
        console.error(`Error fetching:`, err.message);
    }
}

// Cron horário
cron.schedule('0 * * * *', () => {
    processWorldStats(config.defaultWorld);
});

// APIs
app.get('/api/config', (req, res) => res.json(config));

app.get('/api/bosses/:world', (req, res) => {
    const world = req.params.world;
    getBossHistory(world, (err, history) => {
        if (err) return res.status(500).json({error: 'DB error'});
        
        const now = new Date();
        const predictions = monitoredBosses.map(boss => {
            const kills = history.filter(h => h.boss_name.toLowerCase() === boss.name.toLowerCase());
            
            let last_seen_date = null;
            let days_since = null;
            let status = "Sem dados vitais";
            let chance_percent = 0;
            // Provide a static fallback based on config if DB empty
            let expected_days = Math.round((boss.min_days + boss.max_days) / 2);
            let has_dynamic_avg = false;

            if (kills.length > 0) {
                last_seen_date = new Date(kills[kills.length - 1].kill_date); // get latest
                days_since = Math.floor((now - last_seen_date) / (86400000));
                
                if (kills.length >= 2) {
                    let totalDays = 0;
                    for (let i = 1; i < kills.length; i++) {
                        const prev = new Date(kills[i-1].kill_date);
                        const curr = new Date(kills[i].kill_date);
                        totalDays += Math.floor((curr - prev) / (86400000));
                    }
                    expected_days = Math.round(totalDays / (kills.length - 1));
                    if (expected_days < 1) expected_days = 1;
                    has_dynamic_avg = true;
                }
                
                // Calculate Chance towards full expectation
                chance_percent = Math.floor((days_since / expected_days) * 100);
                if (chance_percent > 100) chance_percent = 100;
                
                if (chance_percent < 80) {
                    status = "Aguardando";
                } else if (chance_percent < 100) {
                    status = "Possibilidade Alta";
                } else {
                    status = "Atrasado/Pode nascer";
                }
            }
            
            return {
                name: boss.name,
                last_seen: last_seen_date ? last_seen_date.toISOString().split('T')[0] : null,
                days_since: days_since,
                expected_days: expected_days,
                has_dynamic_avg: has_dynamic_avg,
                chance_percent: chance_percent,
                status: status
            };
        });
        
        predictions.sort((a, b) => b.chance_percent - a.chance_percent);
        res.json({ world, predictions });
    });
});

app.listen(PORT, () => {
    console.log(`[ON] Tracking: ${config.defaultWorld} no port ${PORT}`);
});
