require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// Вспомогательная функция для получения статистики по игре
async function getGameStats(playerId, game, apiKey) {
    try {
        const statsResponse = await fetch(`https://open.faceit.com/data/v4/players/${playerId}/stats/${game}`, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        return statsResponse.ok ? statsResponse.json() : null;
    } catch (e) {
        return null;
    }
}

// Вспомогательная функция для получения истории матчей
async function getMatchHistory(playerId, apiKey) {
    try {
        const res = await fetch(`https://open.faceit.com/data/v4/players/${playerId}/history?game=cs2&offset=0&limit=5`, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        return res.ok ? res.json() : null;
    } catch (e) { return null; }
}


app.get('/getStats/:steam_id', async (req, res) => {
    const steamId = req.params.steam_id;
    const FACEIT_API_KEY = process.env.FACEIT_API_KEY;

    if (!FACEIT_API_KEY) {
        return res.status(500).json({ error: 'API ключ не найден на сервере' });
    }
    
    try {
        const idSearchResponse = await fetch(`https://open.faceit.com/data/v4/players?game=cs2&game_player_id=${steamId}`, {
            headers: { 'Authorization': `Bearer ${FACEIT_API_KEY}` }
        });

        if (!idSearchResponse.ok) {
            return res.status(404).json({ error: 'Профиль Faceit не привязан к этому Steam ID' });
        }
        
        const player = await idSearchResponse.json();
        
        // Получаем ВСЕ необходимые данные параллельно
        const [cs2Stats, csgoStats, history] = await Promise.all([
            getGameStats(player.player_id, 'cs2', FACEIT_API_KEY),
            getGameStats(player.player_id, 'csgo', FACEIT_API_KEY),
            getMatchHistory(player.player_id, FACEIT_API_KEY)
        ]);

        // Обрабатываем историю матчей
        const recentMatches = history?.items.map(match => {
            const playerTeam = match.teams.find(team => team.players.some(p => p.player_id === player.player_id));
            return playerTeam?.team_stats?.team_win === "1" ? "W" : "L";
        }) || [];

        const faceitUrl = player.faceit_url 
            ? player.faceit_url.replace('{lang}', 'en') 
            : `https://www.faceit.com/en/players/${player.nickname}`;

        // ИСПРАВЛЕНИЕ ЗДЕСЬ: Возвращаем все данные в ответ
        const finalResponse = {
            nickname: player.nickname,
            faceitUrl: faceitUrl,
            country: player.country,
            recentMatches: recentMatches, // Возвращаем историю матчей
            cs2: {
                elo: player.games?.cs2?.faceit_elo,
                level: player.games?.cs2?.skill_level,
                game_player_name: player.games?.cs2?.game_player_name,
                stats: cs2Stats?.lifetime // Возвращаем lifetime статистику для CS2
            },
            csgo: {
                elo: player.games?.csgo?.faceit_elo,
                level: player.games?.csgo?.skill_level,
                game_player_name: player.games?.csgo?.game_player_name,
                stats: csgoStats?.lifetime // Возвращаем lifetime статистику для CSGO
            }
        };

        return res.json(finalResponse);

    } catch (error) {
        console.error('Внутренняя ошибка сервера:', error);
        return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});