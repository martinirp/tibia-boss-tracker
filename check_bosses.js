// Script de diagnóstico: cruza bosses.json com api_dump.json
const fs = require('fs');
const path = require('path');

const bosses = JSON.parse(fs.readFileSync(path.join(__dirname, 'bosses.json'), 'utf8'));
const apiDump = JSON.parse(fs.readFileSync(path.join(__dirname, 'api_dump.json'), 'utf8'));
const entries = apiDump.killstatistics.entries;

// Normalização: remove artigos, pontuação, minúsculas
function norm(str) {
    return str.toLowerCase()
        .replace(/^(the|a|an)\s+/i, '')
        .replace(/[^a-z]/g, '')
        .trim();
}

const apiMap = new Map(); // norm -> original api name
for (const e of entries) {
    apiMap.set(norm(e.race), e.race);
    apiMap.set(e.race.toLowerCase(), e.race);
}

const found = [];
const notFound = [];

for (const boss of bosses) {
    const n = norm(boss);
    const lower = boss.toLowerCase();
    
    // Tentativa 1: normalizado
    let apiName = apiMap.get(n) || apiMap.get(lower);
    
    // Tentativa 2: busca parcial
    if (!apiName) {
        for (const e of entries) {
            const en = norm(e.race);
            if (en.includes(n) || n.includes(en)) {
                apiName = e.race;
                break;
            }
        }
    }
    
    if (apiName) {
        found.push({ boss, apiName, match: boss === apiName ? 'EXACT' : 'MAPPED' });
    } else {
        notFound.push(boss);
    }
}

console.log(`\n✅ Encontrados: ${found.length}/${bosses.length}`);
console.log(`❌ NÃO encontrados: ${notFound.length}/${bosses.length}\n`);

console.log('=== MAPEAMENTOS (nome diferente) ===');
found.filter(f => f.match === 'MAPPED').forEach(f => {
    console.log(`  "${f.boss}" → "${f.apiName}"`);
});

console.log('\n=== NÃO ENCONTRADOS NA API ===');
notFound.forEach(b => console.log(`  ❌ "${b}"`));
