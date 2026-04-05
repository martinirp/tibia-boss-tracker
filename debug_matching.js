const fs = require('fs');

const monitored = JSON.parse(fs.readFileSync('bosses.json', 'utf8'));
const apiData = JSON.parse(fs.readFileSync('api_dump.json', 'utf8')); // Salvei o output anterior aqui mentalmente
const entries = apiData.killstatistics.entries;

const normalize = (name) => name.toLowerCase().replace(/^the\s+/, "").trim();

const found = [];
const missed = [];

for (const bossName of monitored) {
    const myBoss = normalize(bossName);
    
    const entry = entries.find(e => {
        const apiRace = normalize(e.race);
        
        // Match Exato
        if (apiRace === myBoss) return true;
        
        // Plural Comum (s/es)
        if (apiRace === myBoss + 's' || apiRace === myBoss + 'es') return true;
        
        // Latin Plurals (ex: Draptors -> Draptor)
        if (myBoss.endsWith('s') && apiRace === myBoss.slice(0, -1)) return true;
        
        return false;
    });

    if (entry) found.push(bossName);
    else missed.push(bossName);
}

console.log(`Encontrados: ${found.length}`);
console.log(`Não encontrados: ${missed.length}`);
console.log('--- EXEMPLOS DE MISSES ---');
console.log(missed.slice(0, 20).join(', '));
