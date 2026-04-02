const API_BASE = 'http://localhost:3000'; // Se for hospedar em um servidor remoto, mude este endereço para o seu IP.

async function fetchKillStats() {
    const worldInput = document.getElementById('worldInput');
    const world = worldInput.value.trim();

    if (!world) {
        showError('Por favor, digite o nome de um mundo!');
        return;
    }

    document.getElementById('worldBadge').textContent = world;
    document.getElementById('worldBadge').style.background = '#4caf50';

    await loadBossPredictions(world);
}

async function loadBossPredictions(world) {
    const dashboard = document.getElementById('dashboard');
    dashboard.innerHTML = '<div class="loading">🔄 Carregando IA preditiva para ' + world + '...</div>';

    try {
        const response = await fetch(`${API_BASE}/api/bosses/${encodeURIComponent(world)}`);
        
        if (!response.ok) {
            throw new Error("Backend offline ou servidor retornou erro");
        }

        const data = await response.json();
        
        if (!data.predictions || data.predictions.length === 0) {
            dashboard.innerHTML = '<div class="error">❌ Nenhuma previsão encontrada. Pressione buscar ou aguarde.</div>';
            return;
        }

        displayBossPredictions(data.predictions);

    } catch (error) {
        console.error('Erro:', error);
        dashboard.innerHTML = `<div class="error">❌ Erro ao conectar com a API preditiva local (porta 3000). Certifique-se de iniciar o servidor.<br><br>Detalhes: ${error.message}</div>`;
    }
}

function displayBossPredictions(predictions) {
    const cardsHtml = predictions.map((p) => {
        let statusClass = '';
        if (p.chance_percent === 0 && p.last_seen === null) {
             statusClass = 'status-unknown';
        } else if (p.chance_percent < 80) {
             statusClass = 'status-cooldown';
        } else if (p.chance_percent < 100) {
             statusClass = 'status-high';
        } else {
             statusClass = 'status-delayed';
        }

        let timeText;
        if (p.last_seen === null) {
            timeText = 'Sem Histórico Guardado';
        } else {
            const daysLeft = p.expected_days - p.days_since;
            if (daysLeft > 0) {
                timeText = `Previsto em aprox. ${daysLeft} dia(s)`;
            } else {
                timeText = `Atrasado na média (${Math.abs(daysLeft)} dias)`;
            }
        }

        const avgInfo = p.has_dynamic_avg 
            ? "Média Real (Cálculo do BD)" 
            : "Média Padrão (Bosses.json)";

        const imgSrc = `images/${p.name}.gif`;

        return \`
            <div class="boss-card \${statusClass}">
                <div class="boss-image">
                    <img src="\${imgSrc}" alt="\${p.name}" onerror="this.onerror=null; this.src='data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='; this.alt='Sem imagem';">
                </div>
                <div class="boss-details">
                    <h3 class="boss-name">\${p.name}</h3>
                    <div class="boss-chance">
                        <span class="chance-value">\${p.chance_percent}%</span>
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: \${p.chance_percent}%"></div>
                        </div>
                    </div>
                    <div class="boss-time">\${timeText}</div>
                    <div class="boss-meta">
                        <small>Último: \${p.last_seen ? new Date(p.last_seen).toLocaleDateString('pt-BR') : 'Desconhecido'}</small><br>
                        <small style="color: \${p.has_dynamic_avg ? '#ae9ce5' : '#888'}">\${avgInfo}: \${p.expected_days} dias</small>
                    </div>
                </div>
            </div>
        \`;
    }).join('');

    const html = \`
        <div class="predictions-header">
            <h2 style="color: #ffd700; margin-bottom: 10px; font-size: 22px;">🔮 Inteligência de Respawn (${predictions.length} Bosses)</h2>
            <p style="color: #aaa; font-size: 14px; margin-bottom: 20px;">
               Os cards ordenam quem está mais perto de nascer. O backend aprende as médias dinamicamente 
               comparando o tempo entre todas as mortes já registradas no banco de dados.
            </p>
        </div>
        <div class="boss-cards-container">
            \${cardsHtml}
        </div>
    \`;

    document.getElementById('dashboard').innerHTML = html;
}

document.getElementById('worldInput').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        fetchKillStats();
    }
});

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const res = await fetch(\`\${API_BASE}/api/config\`);
        if (res.ok) {
            const config = await res.json();
            document.getElementById('worldInput').value = config.defaultWorld;
            fetchKillStats();
        }
    } catch(err) {
        document.getElementById('worldInput').value = 'Quelibra';
        fetchKillStats();
    }
});
