require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

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
        const faceitId = player.player_id;
        
        const [cs2Stats, csgoStats, history] = await Promise.all([
            getGameStats(faceitId, 'cs2', FACEIT_API_KEY),
            getGameStats(faceitId, 'csgo', FACEIT_API_KEY),
            getMatchHistory(faceitId, FACEIT_API_KEY)
        ]);
        
        // ИСПРАВЛЕНИЕ ЗДЕСЬ: Добавляем проверку, что match.teams - это массив
        const recentMatches = history?.items?.map(match => {
            if (!match || !Array.isArray(match.teams) || match.teams.length === 0) {
                return 'N'; // "N" - для матчей с неизвестным результатом
            }
            const playerTeam = match.teams.find(team => team.players.some(p => p.player_id === faceitId));
            if (!playerTeam?.team_stats?.team_win) {
                return 'N';
            }
            return playerTeam.team_stats.team_win === "1" ? "W" : "L";
        }) || [];

        const faceitUrl = player.faceit_url 
            ? player.faceit_url.replace('{lang}', 'en') 
            : `https://www.faceit.com/en/players/${player.nickname}`;

        const finalResponse = {
            nickname: player.nickname,
            country: player.country,
            faceitUrl: faceitUrl,
            recentMatches: recentMatches,
            cs2: {
                elo: player.games?.cs2?.faceit_elo,
                level: player.games?.cs2?.skill_level,
                game_player_name: player.games?.cs2?.game_player_name,
                stats: cs2Stats?.lifetime 
            },
            csgo: {
                elo: player.games?.csgo?.faceit_elo,
                level: player.games?.csgo?.skill_level,
                game_player_name: player.games?.csgo?.game_player_name,
                stats: csgoStats?.lifetime
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