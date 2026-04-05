const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const db = require('./database');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ─── Config ───────────────────────────────────────────────────────────────────
const configPath = path.join(__dirname, 'config.json');
let config = { defaultWorld: 'Quelibra', port: 3000 };
if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
}
const PORT = config.port || 3000;

// ─── Bosses monitorados ───────────────────────────────────────────────────────
const bossesPath = path.join(__dirname, 'bosses.json');
let monitoredBosses = []; // Array de strings ["Nome", "Nome2"...]
if (fs.existsSync(bossesPath)) {
    monitoredBosses = JSON.parse(fs.readFileSync(bossesPath, 'utf8'));
}

// ─── Lógica principal: buscar kill stats e detectar mortes ───────────────────
async function processWorldStats(world) {
    const tag = `[${new Date().toISOString()}][${world}]`;
    console.log(`${tag} Iniciando coleta...`);

    try {
        const res = await fetch(`https://api.tibiadata.com/v4/killstatistics/${encodeURIComponent(world)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        const entries = data?.killstatistics?.entries;
        if (!Array.isArray(entries)) {
            console.warn(`${tag} Resposta inesperada da API.`);
            return;
        }

        // Carregar mapeamento se existir
        let bossMapping = {};
        const mappingPath = path.join(__dirname, 'boss_mapping.json');
        if (fs.existsSync(mappingPath)) {
            bossMapping = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
        }

        let foundCount = 0;
        let killCount = 0;
        const foundNames = new Set();

        for (const bossName of monitoredBosses) {
            const realApiName = bossMapping[bossName];
            
            // 1. Tentar mapeamento real (maior prioridade)
            let entry = null;
            if (realApiName) {
                entry = entries.find(e => e.race.toLowerCase() === realApiName.toLowerCase());
            }
            
            // 2. Se não achou, usar isMatch (lidando com nome exato e plural)
            if (!entry) {
                entry = entries.find(e => isMatch(bossName, e.race));
            }

            if (!entry) {
                continue;
            }

            foundCount++;
            const killsYesterday = entry.last_day_killed ?? 0;

            if (killsYesterday > 0) {
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                const killDate = yesterday.toISOString().split('T')[0];

                db.logKill(world, bossName, killDate, killsYesterday);
                console.log(`${tag} ✅ KILL detectada: ${bossName} (${killsYesterday} abates em ${killDate})`);
                killCount++;
            }

            foundNames.add(bossName);
        }

        const notFound = monitoredBosses.filter(b => !foundNames.has(b));
        console.log(`${tag} Coleta finalizada: ${foundCount}/${monitoredBosses.length} bosses encontrados. (${killCount} kills detectadas)`);

        if (notFound.length > 0) {
            console.warn(`${tag} ⚠️  ${notFound.length} bosses NÃO encontrados na API:`);
            notFound.forEach(b => console.warn(`${tag}   ❌ "${b}"`));
        }

    } catch (err) {
        console.error(`${tag} Erro na coleta:`, err.message);
    }
}

// Função auxiliar para normalizar nomes
function normalizeForMatch(str) {
    if (!str) return '';
    return str
        .toLowerCase()
        .replace(/^(the|a|an)\s+/i, '')
        .replace(/[^a-z]/g, '')
        .trim();
}

// Solução: Mapeamento Automático a partir do api_dump.json
function loadRealApiNames() {
    const apiDumpPath = path.join(__dirname, 'api_dump.json');
    if (!fs.existsSync(apiDumpPath)) return {};

    console.log("[Mapper] Gerando mapeamento automático a partir do api_dump.json...");
    const apiDump = JSON.parse(fs.readFileSync(apiDumpPath, 'utf8'));
    const entries = apiDump?.killstatistics?.entries || [];

    const realNames = {};
    for (const entry of entries) {
        const apiName = entry.race;
        for (const boss of monitoredBosses) {
            const normalizedBoss = normalizeForMatch(boss);
            const normalizedApi = normalizeForMatch(apiName);

            if (isMatch(boss, apiName)) {
                realNames[boss] = apiName;
                break;
            }
        }
    }

    fs.writeFileSync(path.join(__dirname, 'boss_mapping.json'), JSON.stringify(realNames, null, 2));
    console.log(`[Mapper] Mapeamento salvo em boss_mapping.json (${Object.keys(realNames).length} bosses mapeados)`);
    return realNames;
}

function isMatch(bossName, apiName) {
    const nBoss = normalizeForMatch(bossName);
    const nApi = normalizeForMatch(apiName);
    
    if (nBoss === nApi) return true;
    
    // Regras de plural: Maw -> Maws, Boss -> Bosses, Yeti -> Yetis
    if (nApi === nBoss + "s") return true;
    if (nApi === nBoss + "es") return true;
    if (nBoss.endsWith("y") && nApi === nBoss.slice(0, -1) + "ies") return true;
    
    return false;
}

// Gera o mapeamento na inicialização se o dump existir
loadRealApiNames();

// ─── Cron: roda todo dia às 00:15 (logo após virar o dia na API) ───
cron.schedule('15 0 * * *', () => {
    processWorldStats(config.defaultWorld);
});

// ─── Rotas API ────────────────────────────────────────────────────────────────

// Config
app.get('/api/config', (req, res) => res.json(config));

// Forçar coleta manual
app.post('/api/fetch/:world', async (req, res) => {
    const world = req.params.world;
    res.json({ message: `Coleta iniciada para ${world}...` });
    await processWorldStats(world);
});

// Previsões dos bosses
app.get('/api/bosses/:world', (req, res) => {
    const world = req.params.world;
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    // Data de "ontem" para exibir no card
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = yesterdayDate.toISOString().split('T')[0];

    const predictions = monitoredBosses.map(bossName => {
        const kills = db.getKillHistory(world, bossName) || [];
        const totalKillsCount = kills.length;

        if (totalKillsCount === 0) {
            return {
                name: bossName,
                last_seen: null,
                days_since: null,
                expected_days: null,
                chance_percent: 0,
                status: 'Sem dados',
                total_kills: 0,
                kills_yesterday: 0
            };
        }

        const lastKill = kills[totalKillsCount - 1];
        const lastDate = new Date(lastKill.kill_date);
        const daysSince = Math.floor((now - lastDate) / 86400000);

        // Verifica se houve kill em "ontem" (o último ciclo coletado)
        const killYesterdayRecord = kills.find(k => k.kill_date === yesterdayStr);
        const killsYesterdayAmount = killYesterdayRecord ? (killYesterdayRecord.amount_killed || 1) : 0;

        // Cálculo dinâmico puro
        let expectedDays = 0;
        let hasDynamicAvg = false;

        if (totalKillsCount >= 2) {
            let totalInterval = 0;
            let intervals = 0;
            for (let i = 1; i < totalKillsCount; i++) {
                const prev = new Date(kills[i - 1].kill_date);
                const curr = new Date(kills[i].kill_date);
                const diff = Math.floor((curr - prev) / 86400000);
                if (diff > 0) {
                    totalInterval += diff;
                    intervals++;
                }
            }
            if (intervals > 0) {
                expectedDays = Math.round(totalInterval / intervals);
                hasDynamicAvg = true;
            }
        }

        if (!hasDynamicAvg) {
            return {
                name: bossName,
                last_seen: lastKill.kill_date,
                days_since: daysSince,
                expected_days: null,
                chance_percent: 0,
                status: 'Sincronizando média...',
                total_kills: totalKillsCount,
                kills_yesterday: killsYesterdayAmount
            };
        }

        // Cálculo de chance baseado na média real encontrada
        let chancePercent = Math.floor((daysSince / expectedDays) * 100);
        if (chancePercent > 100) chancePercent = 100;

        let status = 'Aguardando';
        if (chancePercent >= 90) {
            status = 'Pode nascer';
        } else if (chancePercent >= 80) {
            status = 'Alta chance';
        }

        return {
            name: bossName,
            last_seen: lastKill.kill_date,
            days_since: daysSince,
            expected_days: expectedDays,
            chance_percent: chancePercent,
            status: status,
            total_kills: totalKillsCount,
            kills_yesterday: killsYesterdayAmount
        };
    });

    predictions.sort((a, b) => {
        if (b.chance_percent !== a.chance_percent) return b.chance_percent - a.chance_percent;
        if (a.last_seen && b.last_seen) return 0;
        if (a.last_seen) return -1;
        return 1;
    });

    res.json({
        world,
        last_update: todayStr,
        bosses: predictions
    });
});

// Histórico
app.get('/api/history/:world/:boss', (req, res) => {
    const { world, boss } = req.params;
    const kills = db.getKillHistory(world, boss);
    res.json({ world, boss, kills });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Boss Tracker (Autônomo) rodando em: http://0.0.0.0:${PORT}`);
    console.log(`📡 Monitorando: ${config.defaultWorld} | ${monitoredBosses.length} bosses`);
});
