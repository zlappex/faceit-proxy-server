require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const app = express();

app.use(cors());

// Ваша существующая функция, без изменений
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

// ИЗМЕНЕНИЕ №1: Новая функция для расчета статистики за последние 20 матчей
async function calculateLast20Stats(playerId, apiKey) {
    try {
        // Запрос истории последних 20 матчей
        const historyRes = await fetch(`https://open.faceit.com/data/v4/players/${playerId}/history?game=cs2&offset=0&limit=20`, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        if (!historyRes.ok) return null;

        const historyData = await historyRes.json();
        if (!historyData.items || historyData.items.length === 0) return null;
        
        // Получаем детальную статистику по каждому матчу
        const matchStatsPromises = historyData.items.map(match =>
            fetch(`https://open.faceit.com/data/v4/matches/${match.match_id}/stats`, {
                headers: { 'Authorization': `Bearer ${apiKey}` }
            }).then(res => res.json())
        );
        
        const detailedMatches = await Promise.all(matchStatsPromises);

        let totalKills = 0, totalDeaths = 0, totalRounds = 0, totalHeadshots = 0;
        let validMatchesCount = 0;

        // Считаем общую статистику
        for (const match of detailedMatches) {
            const roundStats = match?.rounds?.[0];
            if (!roundStats) continue;

            const playerInMatch = roundStats.teams?.flatMap(team => team.players).find(p => p.player_id === playerId);
            if (playerInMatch) {
                totalKills += parseInt(playerInMatch.player_stats.Kills, 10);
                totalDeaths += parseInt(playerInMatch.player_stats.Deaths, 10);
                totalHeadshots += parseInt(playerInMatch.player_stats.Headshots, 10);
                totalRounds += parseInt(roundStats.round_stats['Rounds'], 10);
                validMatchesCount++;
            }
        }
        
        if (validMatchesCount === 0) return null;

        // Возвращаем посчитанные значения
        return {
            avg: (totalKills / validMatchesCount).toFixed(2),
            kd: (totalDeaths === 0) ? totalKills.toFixed(2) : (totalKills / totalDeaths).toFixed(2),
            kr: (totalRounds === 0) ? 0 : (totalKills / totalRounds).toFixed(2),
            hs: (totalKills === 0) ? 0 : (totalHeadshots / totalKills * 100).toFixed(0)
        };

    } catch (error) {
        console.error("Ошибка при расчете статистики за 20 матчей:", error);
        return null;
    }
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
        
        // ИЗМЕНЕНИЕ №2: Добавляем вызов новой функции в Promise.all
        const [cs2Stats, csgoStats, last20Stats] = await Promise.all([
            getGameStats(faceitId, 'cs2', FACEIT_API_KEY),
            getGameStats(faceitId, 'csgo', FACEIT_API_KEY),
            calculateLast20Stats(faceitId, FACEIT_API_KEY) // Запрашиваем новую статистику
        ]);
        
        const faceitUrl = player.faceit_url 
            ? player.faceit_url.replace('{lang}', 'en') 
            : `https://www.faceit.com/en/players/${player.nickname}`;

        // ИЗМЕНЕНИЕ №3: Добавляем last20Stats в финальный ответ
        const finalResponse = {
            nickname: player.nickname,
            country: player.country,
            faceitUrl: faceitUrl,
            last20: last20Stats, // Поле со статистикой за 20 игр
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

module.exports = app;