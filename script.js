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
            <div class="boss-card ${cat}" onclick="openBossModal(${JSON.stringify(p).replace(/"/g, '&quot;')})" style="cursor:pointer;">
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

document.addEventListener('DOMContentLoaded', () => {
    loadPredictions();
    buildModal();
});
setInterval(loadPredictions, 5 * 60 * 1000);

function buildModal() {
    const overlay = document.createElement('div');
    overlay.id = 'bossModalOverlay';
    overlay.className = 'boss-modal-overlay';
    overlay.innerHTML = `
        <div class="boss-modal glass-panel" id="bossModalPanel">
            <button class="modal-close-btn" onclick="closeBossModal()"><i class="fas fa-times"></i></button>
            <div class="modal-header">
                <div class="modal-img-wrap">
                    <img id="modalImg" src="" class="modal-boss-img" onerror="this.onerror=null;this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 48 48%22%3E%3Crect width=%2248%22 height=%2248%22 rx=%226%22 fill=%22%23111%22/%3E%3Ctext x=%2224%22 y=%2232%22 text-anchor=%22middle%22 font-size=%2228%22 fill=%22%23555%22%3E%3F%3C/text%3E%3C/svg%3E'">
                </div>
                <div>
                    <h2 id="modalName" class="modal-boss-name"></h2>
                    <span id="modalStatus" class="modal-status-tag"></span>
                </div>
            </div>

            <div class="modal-stats-row">
                <div class="modal-stat-box">
                    <span class="modal-stat-label">Chance de Nascer</span>
                    <span class="modal-stat-value" id="modalChance"></span>
                </div>
                <div class="modal-stat-box">
                    <span class="modal-stat-label">Última Morte</span>
                    <span class="modal-stat-value" id="modalLastSeen"></span>
                </div>
                <div class="modal-stat-box">
                    <span class="modal-stat-label">Dias Desde</span>
                    <span class="modal-stat-value" id="modalDaysSince"></span>
                </div>
                <div class="modal-stat-box">
                    <span class="modal-stat-label">Total de Mortes</span>
                    <span class="modal-stat-value" id="modalTotalKills"></span>
                </div>
            </div>

            <div class="modal-cycle-box" id="modalCycleBox">
                <div class="modal-cycle-line" id="modalCycleLine"></div>
                <div class="modal-cycle-line" id="modalNextSpawn"></div>
            </div>

            <div class="modal-history-section">
                <h4 class="modal-section-title">Histórico de Mortes (7 dias)</h4>
                <div id="modalHistory7d" class="modal-history-grid"></div>
            </div>

            <div class="modal-history-section">
                <h4 class="modal-section-title">Histórico Completo</h4>
                <div id="modalHistoryFull" class="modal-history-list"></div>
            </div>
        </div>
    `;
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeBossModal();
    });
    document.body.appendChild(overlay);
}

async function openBossModal(p) {
    document.getElementById('bossModalOverlay').classList.add('active');
    document.body.style.overflow = 'hidden';

    const cat = getCategory(p);

    document.getElementById('modalImg').src = `img/${p.name.replace(/ /g, '_')}.gif`;
    document.getElementById('modalName').innerText = p.name;

    const statusEl = document.getElementById('modalStatus');
    statusEl.innerText = p.status;
    statusEl.className = 'modal-status-tag status-' + cat;

    document.getElementById('modalChance').innerText = p.chance_percent + '%';
    document.getElementById('modalChance').className = 'modal-stat-value color-' + cat;
    document.getElementById('modalLastSeen').innerText = p.last_seen ? formatDate(p.last_seen) : '—';
    document.getElementById('modalDaysSince').innerText = p.days_since !== null ? p.days_since + ' dias' : '—';
    document.getElementById('modalTotalKills').innerText = p.total_kills || 0;

    const cycleBox = document.getElementById('modalCycleBox');
    const cycleLine = document.getElementById('modalCycleLine');
    const nextSpawn = document.getElementById('modalNextSpawn');

    if (p.expected_days) {
        cycleBox.style.display = 'block';
        cycleLine.innerHTML = `<i class="fas fa-sync-alt me-2" style="color: var(--primary-gold)"></i> Nasce a cada <strong>${p.expected_days} dias</strong> em média`;
        const daysLeft = p.expected_days - (p.days_since || 0);
        if (daysLeft > 0) {
            nextSpawn.innerHTML = `<i class="fas fa-hourglass-half me-2" style="color: #ffa502"></i> Próximo spawn estimado daqui <strong>${daysLeft} dia${daysLeft !== 1 ? 's' : ''}</strong>`;
        } else {
            nextSpawn.innerHTML = `<i class="fas fa-exclamation-circle me-2" style="color: #ff4757"></i> <strong>Atrasado!</strong> Deveria ter nascido há ${Math.abs(daysLeft)} dia${Math.abs(daysLeft) !== 1 ? 's' : ''}`;
        }
    } else {
        cycleBox.style.display = 'none';
    }

    render7dHistory(p);

    try {
        const res = await fetch(`${API_BASE}/api/history/${encodeURIComponent(currentWorld)}/${encodeURIComponent(p.name)}`);
        const data = await res.json();
        renderFullHistory(data.kills || []);
    } catch {
        document.getElementById('modalHistoryFull').innerHTML = '<span class="text-white-50 small">Erro ao carregar histórico.</span>';
    }
}

function render7dHistory(p) {
    const grid = document.getElementById('modalHistory7d');
    grid.innerHTML = '';
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const label = i === 0 ? 'Hoje' : i === 1 ? 'Ontem' : d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' });
        const killed = p.kills_yesterday > 0 && i === 1;

        const cell = document.createElement('div');
        cell.className = 'history-day-cell' + (killed ? ' killed' : '');
        cell.innerHTML = `
            <span class="history-day-label">${label}</span>
            <span class="history-day-icon">${killed ? '<i class="fas fa-skull"></i>' : '<i class="fas fa-circle"></i>'}</span>
            <span class="history-day-count">${killed ? p.kills_yesterday + 'x' : '—'}</span>
        `;
        grid.appendChild(cell);
    }
}

function renderFullHistory(kills) {
    const list = document.getElementById('modalHistoryFull');
    if (!kills || kills.length === 0) {
        list.innerHTML = '<span class="text-white-50 small">Sem mortes registradas ainda.</span>';
        return;
    }
    const sorted = [...kills].sort((a, b) => b.kill_date.localeCompare(a.kill_date));
    list.innerHTML = sorted.map(k => `
        <div class="history-full-row">
            <i class="fas fa-skull-crossbones" style="color: var(--status-hot); font-size: 11px;"></i>
            <span>${formatDate(k.kill_date)}</span>
            <span class="history-kills-badge">${k.amount_killed || 1}x abatido</span>
        </div>
    `).join('');
}

function closeBossModal() {
    document.getElementById('bossModalOverlay').classList.remove('active');
    document.body.style.overflow = '';
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeBossModal();
});
