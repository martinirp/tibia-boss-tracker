const API_BASE = window.location.origin;

let allPredictions = [];
let currentFilter = 'all';
let currentWorld = 'Quelibra'; // será sobrescrito pelo /api/config

async function loadPredictions() {
    const grid = document.getElementById('grid');
    const updateEl = document.getElementById('lastUpdate');
    const worldBadge = document.getElementById('worldBadge');

    try {
        // Busca o world configurado no servidor antes de qualquer chamada
        const cfgRes = await fetch(`${API_BASE}/api/config`);
        if (cfgRes.ok) {
            const cfg = await cfgRes.json();
            currentWorld = cfg.defaultWorld || currentWorld;
        }

        const response = await fetch(`${API_BASE}/api/bosses/${encodeURIComponent(currentWorld)}`);
        if (!response.ok) throw new Error('Falha na conexão');
        
        const data = await response.json();
        allPredictions = data.bosses || [];
        worldBadge.innerText = data.world || currentWorld;
        updateEl.innerText = `Atualizado: ${data.last_update || 'Agora'}`;
        
        renderGrid();
    } catch (err) {
        console.error(err);
        grid.innerHTML = `<div class="col-12 text-center text-danger py-5">Erro ao carregar dados. Verifique o servidor.</div>`;
    }
}

function renderGrid() {
    const grid = document.getElementById('grid');
    if (!grid) return;
    grid.innerHTML = '';

    let filtered = allPredictions;
    if (currentFilter === 'hot') {
        filtered = allPredictions.filter(p => p.chance_percent >= 90);
    } else if (currentFilter === 'recent') {
        filtered = allPredictions.filter(p => p.kills_yesterday > 0);
    } else if (currentFilter === 'high') {
        filtered = allPredictions.filter(p => p.chance_percent >= 80 && p.chance_percent < 90);
    }

    if (filtered.length === 0) {
        grid.innerHTML = `<div class="col-12 text-center text-white-50 py-5">Nenhum boss encontrado neste filtro.</div>`;
        return;
    }

    filtered.forEach(p => {
        const cat = getCategory(p);
        const col = document.createElement('div');
        col.className = 'col';
        
        col.innerHTML = `
            <div class="boss-card ${cat}">
                <div class="img-container">
                    <img src="img/${p.name.replace(/ /g, '_')}.gif" 
                         onerror="this.onerror=null;this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 48 48%22%3E%3Crect width=%2248%22 height=%2248%22 rx=%226%22 fill=%22%23111%22/%3E%3Ctext x=%2224%22 y=%2232%22 text-anchor=%22middle%22 font-size=%2228%22 fill=%22%23555%22%3E%3F%3C/text%3E%3C/svg%3E'"
                         class="boss-img">
                </div>
                <h3 class="boss-name">${p.name}</h3>
                <div class="chance-box">
                    <span class="chance-percent">${p.chance_percent}%</span>
                </div>
                <div class="p-bar-container">
                    <div class="p-bar-fill" style="width: ${p.chance_percent}%"></div>
                </div>
                <div class="tags-container">
                    ${p.kills_yesterday > 0 ? `<span class="tag-mini tag-fire">${p.kills_yesterday} Kills</span>` : ''}
                    <span class="tag-mini">${p.status}</span>
                </div>
            </div>
        `;
        grid.appendChild(col);
    });
}

function getCategory(p) {
    if (!p.total_kills || p.last_seen === null) return 'none';
    if (p.chance_percent >= 90) return 'hot';
    if (p.chance_percent >= 50) return 'high';
    return 'wait';
}

function setFilter(filter, el) {
    currentFilter = filter;
    document.querySelectorAll('.f-pill').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
    renderGrid();
}

async function forceFetch() {
    console.log('[UI] Botão Coletar Agora pressionado.');
    const btn = document.getElementById('collectBtn');
    const label = document.getElementById('collectLabel');
    btn.disabled = true;
    label.innerText = 'Coletando...';
    
    try {
        await fetch(`${API_BASE}/api/fetch/${encodeURIComponent(currentWorld)}`, { method: 'POST' });
        await loadPredictions();
    } catch (err) {
        console.error(err);
    } finally {
        btn.disabled = false;
        label.innerText = 'Coletar Agora';
    }
}

document.addEventListener('DOMContentLoaded', loadPredictions);
setInterval(loadPredictions, 5 * 60 * 1000);
