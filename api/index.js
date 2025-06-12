// Этот файл предназначен только для одного теста.
// Он всегда будет возвращать тестовую ошибку.

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());

app.get('/getStats/:steam_id', async (req, res) => {
    // ================================================================
    // ТЕСТ: Немедленно возвращаем специальное сообщение
    // ================================================================
    return res.json({ error: "Тест обновления прошел успешно! Сервер обновлен." });
    // ================================================================


    // Весь остальной код ниже будет проигнорирован
    const steamId = req.params.steam_id;
    const FACEIT_API_KEY = process.env.FACEIT_API_KEY;

    if (!FACEIT_API_KEY) {
        return res.status(500).json({ error: 'API ключ не найден на сервере' });
    }
    // ... и так далее
});

module.exports = app;
