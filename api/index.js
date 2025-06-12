// Финальная рабочая версия, готовая к использованию.
require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const app = express();

app.use(cors());

// --- ФИНАЛЬНАЯ РАБОЧАЯ ВЕРСИЯ: Использует правильную пагинацию ---
async function calculateEloChange(playerId, currentElo, apiKey) {
    try {
        // Запрашиваем 20 матчей, чтобы безопасно получить 20-й
        const historyRes = await fetch(`https://open.faceit.com/data/v4/players/${playerId}/history?game=cs2&offset=0&limit=20`, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });

        // Если запрос не прошел (например, у игрока вообще нет матчей)
        if (!historyRes.ok) {
            return null;
        }

        const historyData = await historyRes.json();
        
        // Если API вернуло меньше 20 матчей, значит, игрок еще не сыграл столько
        if (!historyData.items || historyData.items.length < 20) {
            return null;
        }

        // 20-й матч - это последний элемент в массиве (индекс 19)
        const twentiethMatch = historyData.items[19];
        const pastElo = twentiethMatch.elo;

        if (pastElo === undefined || pastElo === null) {
            return null; // У 20-го матча нет данных по ELO
        }
        
        const eloChange = currentElo - pastElo;
        return eloChange;

    } catch (error) {
        console.error("Критическая ошибка при расчете изменения ELO:", error);
        return null;
    }
}


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

async function calculateLast20Stats(playerId, apiKey) {
    try {
        const historyRes = await fetch(`https://open.faceit.com/data/v4/players/${playerId}/history?game=cs2&offset=0&limit=20`, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        if (!historyRes.ok) return null;

        const historyData = await historyRes.json();
        if (!historyData.items || historyData.items.length === 0) return null;

        const matchStatsPromises = historyData.items.map(match =>
            fetch(`https://open.faceit.com/data/v4/matches/${match.match_id}/stats`, {
                headers: { 'Authorization': `Bearer ${apiKey}` }
            }).then(res => res.json())
        );

        const detailedMatches = await Promise.all(matchStatsPromises);
        
        let totalKills = 0, totalDeaths = 0, totalRounds = 0, totalHeadshots = 0, wins = 0, totalADR = 0;
        let validMatchesCount = 0;

        for (const match of detailedMatches) {
            const roundStats = match?.rounds?.[0];
            if (!roundStats) continue;

            const playerInMatch = roundStats.teams?.flatMap(team => team.players).find(p => p.player_id === playerId);
            if (playerInMatch && playerInMatch.player_stats) {
                totalADR += parseFloat(playerInMatch.player_stats.ADR) || 0;
                totalKills += parseInt(playerInMatch.player_stats.Kills, 10) || 0;
                totalDeaths += parseInt(playerInMatch.player_stats.Deaths, 10) || 0;
                totalHeadshots += parseInt(playerInMatch.player_stats.Headshots, 10) || 0;
                totalRounds += parseInt(roundStats.round_stats['Rounds'], 10) || 0;
                validMatchesCount++;
                if (playerInMatch.player_stats.Result === "1") wins++;
            }
        }

        if (validMatchesCount === 0) return null;

        const losses = validMatchesCount - wins;
        const averageADR = (validMatchesCount > 0) ? (totalADR / validMatchesCount).toFixed(0) : "0";

        return {
            avg: (totalKills / validMatchesCount).toFixed(2),
            adr: averageADR,
            kd: (totalDeaths === 0) ? totalKills.toFixed(2) : (totalKills / totalDeaths).toFixed(2),
            kr: (totalRounds === 0) ? "0.00" : (totalKills / totalRounds).toFixed(2),
            hs: (totalKills === 0) ? "0" : (totalHeadshots / totalKills * 100).toFixed(0),
            wins: wins,
            losses: losses
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
        const currentCs2Elo = player.games?.cs2?.faceit_elo;
        
        // Сначала получаем основную статистику
        const [cs2Stats, csgoStats, last20Stats] = await Promise.all([
            getGameStats(faceitId, 'cs2', FACEIT_API_KEY),
            getGameStats(faceitId, 'csgo', FACEIT_API_KEY),
            calculateLast20Stats(faceitId, FACEIT_API_KEY)
        ]);

        // Затем, отдельно и безопасно, рассчитываем изменение ELO
        const eloChange = currentCs2Elo ? await calculateEloChange(faceitId, currentCs2Elo, FACEIT_API_KEY) : null;
        
        const faceitUrl = player.faceit_url 
            ? player.faceit_url.replace('{lang}', 'en') 
            : `https://www.faceit.com/en/players/${player.nickname}`;

        const finalResponse = {
            nickname: player.nickname,
            country: player.country,
            faceitUrl: faceitUrl,
            last20: last20Stats ? { ...last20Stats, elo_change: eloChange } : null,
            cs2: {
                elo: currentCs2Elo,
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
