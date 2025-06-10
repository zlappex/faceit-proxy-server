require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const app = express();
const PORT = 3000;

app.use(cors());

// Вспомогательная функция для получения статистики, чтобы не дублировать код
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

app.get('/getStats/:steam_id', async (req, res) => {
    const steamId = req.params.steam_id;
    const FACEIT_API_KEY = process.env.FACEIT_API_KEY;

    if (!FACEIT_API_KEY) {
        return res.status(500).json({ error: 'API ключ не найден на сервере' });
    }
    
    try {
        // --- Единственный метод: строгий поиск по SteamID64 ---
        console.log(`Выполняется строгий поиск по SteamID64: ${steamId}`);
        const idSearchResponse = await fetch(`https://open.faceit.com/data/v4/players?game=cs2&game_player_id=${steamId}`, {
            headers: { 'Authorization': `Bearer ${FACEIT_API_KEY}` }
        });

        // Если ответ НЕ успешный (например, 404 Not Found), значит профиль не привязан
        if (!idSearchResponse.ok) {
            console.log(`Поиск по SteamID64 не удался. Статус: ${idSearchResponse.status}`);
            return res.status(404).json({ error: 'Профиль Faceit не привязан к этому Steam ID' });
        }
        
        console.log("Успех! Игрок найден по SteamID64.");
        const player = await idSearchResponse.json();
        
        // --- Получаем статистику для CS2 и CS:GO ---
        const [cs2Stats, csgoStats] = await Promise.all([
            getGameStats(player.player_id, 'cs2', FACEIT_API_KEY),
            getGameStats(player.player_id, 'csgo', FACEIT_API_KEY)
        ]);

        const faceitUrl = player.faceit_url 
            ? player.faceit_url.replace('{lang}', 'en') 
            : `https://www.faceit.com/en/players/${player.nickname}`;

        // --- Собираем финальный ответ ---
        const finalResponse = {
            nickname: player.nickname,
            faceitUrl: faceitUrl,
            country: player.country,
            cs2: {
                elo: player.games?.cs2?.faceit_elo,
                level: player.games?.cs2?.skill_level,
                game_player_name: player.games?.cs2?.game_player_name,
                stats: cs2Stats?.lifetime 
            },
            csgo: {
                elo: player.games?.csgo?.faceit_elo,
                level: player.games?.csgo?.skill_level,
                game_player_name: player.games?.csgo?.game_player_name
            }
        };

        return res.json(finalResponse);

    } catch (error) {
        console.error('Внутренняя ошибка сервера:', error);
        return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});