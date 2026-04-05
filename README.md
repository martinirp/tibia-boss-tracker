# 🗡️ Tibia Boss Tracker

Rastreador inteligente de respawns — detecta mortes de bosses comparando snapshots diários da API do TibiaData e aprende os ciclos de respawn com o tempo.

---

## 📦 Instalação

```bash
npm install
node server.js
```

Acesse no browser: http://localhost:3000

---

## ⚙️ Como funciona

### 1. Detecção de Kills — A lógica correta

A API do TibiaData (`/v4/killstatistics/{world}`) retorna o **total acumulado** de kills de cada criatura desde o início do servidor — não as kills de hoje.

**Estratégia usada:**

```
Snapshot de ontem: Ferumbras = 142 kills totais
Snapshot de hoje:  Ferumbras = 143 kills totais
Diferença = +1 → Kill detectada! ✅
```

O sistema salva um snapshot por dia por boss. Se o total aumentou, registra a morte no histórico.

### 2. Cálculo da chance de respawn

Com o histórico de kills acumulado, o sistema calcula a **média real de intervalo** entre mortes:

```
Kill 1: 2024-01-01
Kill 2: 2024-01-15  → intervalo: 14 dias
Kill 3: 2024-01-28  → intervalo: 13 dias
Média real: 13,5 dias → arredonda para 14
```

A chance de respawn é calculada como:

```
chance = (dias_desde_última_morte / média_esperada) * 100
```

- Se `dias_desde < min_days` (cooldown garantido): **chance = 0%**
- Se `dias_desde >= média_esperada`: **chance = 100%** (atrasado)
- A média real é sempre limitada entre `min_days` e `max_days` do bosses.json

### 3. Cron automático

Roda todo dia às **10h** (horário do servidor), pois o TibiaData atualiza as stats de kills diariamente nesse período.

---

## 🔌 Rotas da API

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/config` | Retorna config.json |
| GET | `/api/bosses/:world` | Previsões de todos os bosses |
| GET | `/api/history/:world/:boss` | Histórico de kills de um boss |
| POST | `/api/fetch/:world` | Força coleta manual imediata |

### Exemplo de resposta `/api/bosses/Quelibra`

```json
{
  "world": "Quelibra",
  "updated_at": "2024-03-15",
  "predictions": [
    {
      "name": "Morgaroth",
      "last_seen": "2024-02-28",
      "days_since": 16,
      "expected_days": 18,
      "min_days": 13,
      "max_days": 28,
      "has_dynamic_avg": true,
      "chance_percent": 88,
      "status": "Possibilidade Alta",
      "total_kills": 5
    }
  ]
}
```

---

## 📁 Estrutura de arquivos

```
├── server.js        → Express + lógica de coleta + rotas
├── database.js      → SQLite (better-sqlite3)
├── boss_tracker.db  → Banco de dados (criado automaticamente)
├── bosses.json      → Lista de bosses monitorados (min/max days)
├── config.json      → Mundo padrão e porta
├── index.html       → Frontend
├── script.js        → Frontend JS
├── style.css        → Estilos
└── img/             → GIFs dos bosses (opcional)
```

---

## 🔧 Forçar coleta manual

```bash
curl -X POST http://localhost:3000/api/fetch/Quelibra
```

Útil para popular o banco pela primeira vez sem esperar o cron das 10h.

---

## 📊 Banco de dados (SQLite)

**Tabela `kill_snapshots`** — snapshot diário do total de kills da API:
```
world | boss_name | total_kills | snapshot_date
```

**Tabela `kill_history`** — cada morte detectada:
```
world | boss_name | kill_date
```

O sistema detecta mortes comparando o `total_kills` atual com o snapshot do dia anterior. Se aumentou, registra em `kill_history`.

---

## 💡 Primeiro uso

1. Instale: `npm install`
2. Inicie: `node server.js`
3. Force a primeira coleta: `curl -X POST http://localhost:3000/api/fetch/Quelibra`
4. **No dia seguinte**, force outra coleta — aí começará a detectar kills
5. Com ~2 kills por boss, a média real começa a se calcular automaticamente
